import fs from 'node:fs'
import readExcelFile from 'read-excel-file/node'
import {
  HOUR_BUCKETS,
  WEEKDAY_OPTIONS,
  calculateOverview,
  filterRecords,
  getRecordHourBucketKey,
  getRecordWeekdayKey,
  groupSummary,
  parsePastedMeetings,
  pickMeetingRowsFromSheets,
  statusSummary,
} from '../src/features/timeAnalysis/timeAnalysisUtils.js'

const excelPath = process.env.TIME_ANALYSIS_EXCEL || ''
const FIXTURE_TSV = `日期\t会议类型\t会议主题\t公司/线上\t预计开始\t预计结束\t实际开始\t实际结束\t备注
2026-01-05\t常规会议\t季度复盘\t公司\t09:00\t10:00\t09:00\t10:05\t
2026-01-06\t专题会议\t预算评审\t线上\t14:00\t15:30\t14:05\t15:50\t
2026-04-03\t外部交流\t合作沟通\t外部\t11:00\t12:00\t11:00\t11:45\t`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function loadWorkbookRecords(filePath) {
  const workbookSheets = await readExcelFile(filePath)
  const sheets = workbookSheets.map((worksheet) => ({
    name: worksheet.sheet,
    rows: worksheet.data,
  }))
  return pickMeetingRowsFromSheets(sheets)
}

function baseFilters(quarter) {
  return {
    quarter,
    month: 'all',
    date: 'all',
    meetingType: 'all',
    locationType: 'all',
    status: 'all',
    weekday: 'all',
    hourBucket: 'all',
    keyword: '',
  }
}

function peakByDate(records) {
  const map = new Map()
  records.forEach((record) => {
    const item = map.get(record.date) || { date: record.date, count: 0, actualMinutes: 0 }
    item.count += 1
    item.actualMinutes += record.actualMinutes
    map.set(record.date, item)
  })
  return [...map.values()].sort((left, right) => right.actualMinutes - left.actualMinutes)[0]
}

function peakSlot(records) {
  const slots = []
  WEEKDAY_OPTIONS.forEach((weekday) => {
    HOUR_BUCKETS.forEach((bucket) => {
      const items = records.filter((record) =>
        getRecordWeekdayKey(record) === weekday.key && getRecordHourBucketKey(record) === bucket.key)
      if (items.length === 0) return
      slots.push({
        weekday,
        bucket,
        count: items.length,
        actualMinutes: items.reduce((total, record) => total + record.actualMinutes, 0),
      })
    })
  })
  return slots.sort((left, right) => right.actualMinutes - left.actualMinutes)[0]
}

function verifyFixtureRecords() {
  const records = parsePastedMeetings(FIXTURE_TSV)
  assert(records.length === 3, `fixture should contain 3 parsed rows, got ${records.length}`)
  const q26 = filterRecords(records, baseFilters('26Q1'))
  const overview = calculateOverview(q26)
  assert(q26.length === 2, `fixture 26Q1 should contain 2 rows, got ${q26.length}`)
  assert(overview.plannedMinutes === 150, `fixture planned minutes should be 150, got ${overview.plannedMinutes}`)
  assert(overview.actualMinutes === 170, `fixture actual minutes should be 170, got ${overview.actualMinutes}`)
  assert(overview.diffMinutes === 20, `fixture diff minutes should be 20, got ${overview.diffMinutes}`)
  assert(groupSummary(q26, 'meetingType').length === 2, 'fixture type summary should contain two groups')
  return {
    records: records.length,
    q26Count: q26.length,
    actualMinutes: overview.actualMinutes,
  }
}

async function verifyExcelWorkbook(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { skipped: true, reason: 'Set TIME_ANALYSIS_EXCEL to verify a real workbook import.' }
  }

  const { sheetName, records } = await loadWorkbookRecords(filePath)
  const quarters = Array.from(new Set(records.map((record) => record.quarter).filter(Boolean))).sort()
  const quarter = quarters.at(-1)
  const scopedRecords = quarter ? filterRecords(records, baseFilters(quarter)) : records
  const overview = calculateOverview(scopedRecords)
  const day = peakByDate(scopedRecords)
  const slot = peakSlot(scopedRecords)
  const topType = groupSummary(scopedRecords, 'meetingType')[0]
  const overStatus = statusSummary(scopedRecords)
    .filter((item) => ['lightOver', 'mediumOver', 'seriousOver'].includes(item.key) && item.count > 0)
    .sort((left, right) => right.minutes - left.minutes)[0]

  assert(sheetName, 'expected a recognized worksheet')
  assert(records.length > 0, 'expected imported workbook records')
  assert(scopedRecords.length > 0, 'expected scoped quarter records')
  assert(Number.isFinite(overview.plannedMinutes), 'expected planned minutes to be numeric')
  assert(Number.isFinite(overview.actualMinutes), 'expected actual minutes to be numeric')

  return {
    skipped: false,
    sheetName,
    quarter,
    records: records.length,
    scopedCount: scopedRecords.length,
    plannedMinutes: overview.plannedMinutes,
    actualMinutes: overview.actualMinutes,
    diffMinutes: overview.diffMinutes,
    onTimeRate: overview.onTimeRate,
    peakDay: day,
    peakSlot: {
      weekday: slot.weekday.label,
      bucket: slot.bucket.label,
      count: slot.count,
      actualMinutes: slot.actualMinutes,
    },
    topType: topType ? {
      label: topType.label,
      count: topType.count,
      actualMinutes: topType.actualMinutes,
    } : null,
    overStatus: overStatus ? {
      label: overStatus.label,
      count: overStatus.count,
      minutes: overStatus.minutes,
    } : null,
  }
}

const result = {
  fixture: verifyFixtureRecords(),
  excel: await verifyExcelWorkbook(excelPath),
}

console.log(JSON.stringify(result, null, 2))
