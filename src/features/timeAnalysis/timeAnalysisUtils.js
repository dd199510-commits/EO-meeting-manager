import { SAMPLE_MEETING_TSV, TIME_ANALYSIS_COLUMNS } from './timeAnalysisData.js'
import { HISTORICAL_MEETING_TSV } from './historicalMeetingData.js'

export const STATUS_RULES = [
  { key: 'veryEarly', label: '过早结束', tone: 'danger', test: (value) => value < -30 },
  { key: 'mediumEarly', label: '中度早结束', tone: 'warning', test: (value) => value >= -30 && value < -15 },
  { key: 'lightEarly', label: '轻度早结束', tone: 'notice', test: (value) => value >= -15 && value < -5 },
  { key: 'onTime', label: '准时/基本准时', tone: 'success', test: (value) => value >= -5 && value <= 5 },
  { key: 'lightOver', label: '轻度超时', tone: 'info', test: (value) => value > 5 && value <= 15 },
  { key: 'mediumOver', label: '中度超时', tone: 'warning', test: (value) => value > 15 && value <= 30 },
  { key: 'seriousOver', label: '严重超时', tone: 'danger', test: (value) => value > 30 },
]

export const WEEKDAY_OPTIONS = [
  { key: '1', label: '周一' },
  { key: '2', label: '周二' },
  { key: '3', label: '周三' },
  { key: '4', label: '周四' },
  { key: '5', label: '周五' },
  { key: '6', label: '周六' },
  { key: '0', label: '周日' },
]

export const HOUR_BUCKETS = [
  { key: 'early', label: '早间', range: '09:00前', start: 0, end: 9 * 60 },
  { key: 'morning', label: '上午', range: '09:00-12:00', start: 9 * 60, end: 12 * 60 },
  { key: 'noon', label: '午间', range: '12:00-14:00', start: 12 * 60, end: 14 * 60 },
  { key: 'afternoon', label: '下午', range: '14:00-18:00', start: 14 * 60, end: 18 * 60 },
  { key: 'evening', label: '晚间', range: '18:00后', start: 18 * 60, end: 24 * 60 },
]

const COLUMN_ALIASES = {
  date: 'date',
  日期: 'date',
  '开始日期**': 'date',
  开始日期: 'date',
  Date: 'date',
  meetingType: 'meetingType',
  会议类型: 'meetingType',
  会议类别: 'meetingType',
  类型: 'meetingType',
  title: 'title',
  会议主题: 'title',
  日程名称: 'title',
  会议名称: 'title',
  meeting_title: 'title',
  locationType: 'locationType',
  公司线上: 'locationType',
  '公司/线上': 'locationType',
  地点: 'locationType',
  会议地点: 'locationType',
  plannedStart: 'plannedStart',
  预计开始: 'plannedStart',
  预计开始时间: 'plannedStart',
  plannedEnd: 'plannedEnd',
  预计结束: 'plannedEnd',
  预计结束时间: 'plannedEnd',
  plannedMinutes: 'plannedMinutes',
  预计用时: 'plannedMinutes',
  '预计用时（min）': 'plannedMinutes',
  '预计用时（min）优化': 'plannedMinutes',
  actualStart: 'actualStart',
  实际开始: 'actualStart',
  实际开始时间: 'actualStart',
  actualEnd: 'actualEnd',
  实际结束: 'actualEnd',
  实际结束时间: 'actualEnd',
  actualMinutes: 'actualMinutes',
  实际用时: 'actualMinutes',
  '实际用时（min）': 'actualMinutes',
  '实际用时（min）优化': 'actualMinutes',
  diffMinutes: 'diffMinutes',
  实际与预计差异: 'diffMinutes',
  '实际与预计差异（min）': 'diffMinutes',
  status: 'status',
  会议状态: 'status',
  remark: 'remark',
  备注: 'remark',
}

export function parseSampleRecords() {
  return parsePastedMeetings(HISTORICAL_MEETING_TSV || SAMPLE_MEETING_TSV)
}

export function parsePastedMeetings(text) {
  const rows = String(text || '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean))

  if (rows.length === 0) return []

  return parseSpreadsheetRows(rows)
}

export function parseSpreadsheetRows(rows) {
  const normalizedRows = rows
    .map((row) => row.map((cell) => normalizeCellValue(cell)))
    .filter((row) => row.some(Boolean))

  if (normalizedRows.length === 0) return []

  const headerIndex = findHeaderIndex(normalizedRows)
  const firstRow = normalizedRows[headerIndex] || normalizedRows[0]
  const hasHeader = firstRow.some((cell) => resolveColumnKey(cell))
  const headers = hasHeader ? firstRow.map(resolveColumnKey) : TIME_ANALYSIS_COLUMNS.map((column) => column.key)
  const dataRows = hasHeader ? normalizedRows.slice(headerIndex + 1) : normalizedRows

  return dataRows
    .map((row, index) => {
      const draft = {}
      headers.forEach((key, columnIndex) => {
        if (key) draft[key] = row[columnIndex] ?? ''
      })
      return normalizeMeetingRecord(draft, index)
    })
    .filter((record) => record.date && record.title)
}

export function pickMeetingRowsFromSheets(sheets) {
  const scoredSheets = sheets
    .map((sheet) => ({
      ...sheet,
      score: scoreSheetRows(sheet.rows || []),
    }))
    .filter((sheet) => sheet.score > 0)
    .sort((left, right) => right.score - left.score)

  for (const sheet of scoredSheets) {
    const records = parseSpreadsheetRows(sheet.rows)
    if (records.length > 0) {
      return {
        sheetName: sheet.name,
        records,
      }
    }
  }

  return {
    sheetName: '',
    records: [],
  }
}

export function normalizeMeetingRecord(record, index = 0) {
  const date = normalizeDate(record.date)
  const plannedStart = normalizeTime(record.plannedStart)
  const plannedEnd = normalizeTime(record.plannedEnd)
  const actualStart = normalizeTime(record.actualStart)
  const actualEnd = normalizeTime(record.actualEnd)
  const calculatedPlannedMinutes = calculateMinutes(plannedStart, plannedEnd)
  const calculatedActualMinutes = calculateMinutes(actualStart, actualEnd)
  const importedPlannedMinutes = parseNumber(record.plannedMinutes)
  const importedActualMinutes = parseNumber(record.actualMinutes)
  const plannedMinutes = Number.isFinite(importedPlannedMinutes) ? importedPlannedMinutes : calculatedPlannedMinutes
  const actualMinutes = Number.isFinite(importedActualMinutes) ? importedActualMinutes : calculatedActualMinutes
  const calculatedDiffMinutes = Number.isFinite(plannedMinutes) && Number.isFinite(actualMinutes)
    ? Math.round(actualMinutes - plannedMinutes)
    : 0
  const diffMinutes = Number.isFinite(parseNumber(record.diffMinutes)) ? Math.round(parseNumber(record.diffMinutes)) : calculatedDiffMinutes
  const importedStatus = String(record.status || '').trim()
  const status = STATUS_RULES.some((rule) => rule.label === importedStatus) ? importedStatus : getStatusLabel(diffMinutes)

  return {
    id: record.id || `time-record-${index}-${date || 'empty'}-${String(record.title || '').slice(0, 12)}`,
    date,
    quarter: getQuarter(date),
    month: date ? date.slice(0, 7) : '',
    meetingType: String(record.meetingType || '常规会议').trim(),
    title: normalizeTitle(record.title),
    seriesName: normalizeSeriesName(record.seriesName || record.title),
    locationType: String(record.locationType || '公司').trim(),
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    plannedMinutes: Number.isFinite(plannedMinutes) ? plannedMinutes : 0,
    actualMinutes: Number.isFinite(actualMinutes) ? actualMinutes : 0,
    diffMinutes,
    absDiffMinutes: Math.abs(diffMinutes),
    status,
    statusKey: STATUS_RULES.find((rule) => rule.label === status)?.key || 'onTime',
    remark: String(record.remark || '').trim(),
  }
}

export function updateRecordCell(records, rowId, key, value) {
  return records.map((record, index) =>
    record.id === rowId ? normalizeMeetingRecord(clearDerivedForEdit({ ...record, [key]: value }, key), index) : record,
  )
}

export function createBlankRecord(index = 0, defaults = {}) {
  return normalizeMeetingRecord({
    date: '',
    meetingType: '常规会议',
    title: '',
    locationType: '公司',
    plannedStart: '09:00',
    plannedEnd: '10:00',
    actualStart: '09:00',
    actualEnd: '10:00',
    remark: '',
    ...defaults,
  }, index)
}

export function getUniqueOptions(records, key) {
  return Array.from(new Set(records.map((record) => record[key]).filter(Boolean))).sort((left, right) =>
    String(left).localeCompare(String(right), 'zh-Hans-CN'),
  )
}

export function filterRecords(records, filters) {
  return records.filter((record) => {
    if (filters.quarter !== 'all' && record.quarter !== filters.quarter) return false
    if (filters.month && filters.month !== 'all' && record.month !== filters.month) return false
    if (filters.date && filters.date !== 'all' && record.date !== filters.date) return false
    if (filters.dateStart && record.date < filters.dateStart) return false
    if (filters.dateEnd && record.date > filters.dateEnd) return false
    if (filters.meetingType !== 'all' && record.meetingType !== filters.meetingType) return false
    if (filters.locationType !== 'all' && record.locationType !== filters.locationType) return false
    if (filters.status !== 'all' && record.status !== filters.status) return false
    if (filters.weekday && filters.weekday !== 'all' && getRecordWeekdayKey(record) !== filters.weekday) return false
    if (filters.hourBucket && filters.hourBucket !== 'all' && getRecordHourBucketKey(record) !== filters.hourBucket) return false

    const keyword = String(filters.keyword || '').trim().toLowerCase()
    if (keyword) {
      const haystack = `${record.title} ${record.seriesName} ${record.meetingType} ${record.locationType} ${record.remark}`.toLowerCase()
      return haystack.includes(keyword)
    }

    return true
  })
}

export function getRecordWeekdayKey(record) {
  const parts = String(record?.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return ''
  const [, year, month, day] = parts
  return String(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay())
}

export function getRecordHourBucketKey(record) {
  const minutes = timeToMinutes(record?.plannedStart || record?.actualStart)
  if (!Number.isFinite(minutes)) return ''
  return HOUR_BUCKETS.find((bucket) => minutes >= bucket.start && minutes < bucket.end)?.key || ''
}

export function calculateOverview(records) {
  const count = records.length
  const plannedMinutes = sumBy(records, 'plannedMinutes')
  const actualMinutes = sumBy(records, 'actualMinutes')
  const diffMinutes = actualMinutes - plannedMinutes
  const absDiffMinutes = sumBy(records, 'absDiffMinutes')
  const onTimeCount = records.filter((record) => record.status === '准时/基本准时').length
  const overCount = records.filter((record) => record.diffMinutes > 5).length
  const earlyCount = records.filter((record) => record.diffMinutes < -5).length

  return {
    count,
    plannedMinutes,
    actualMinutes,
    diffMinutes,
    diffPercent: plannedMinutes > 0 ? (diffMinutes / plannedMinutes) * 100 : 0,
    absDiffMinutes,
    avgAbsDiffMinutes: count > 0 ? absDiffMinutes / count : 0,
    onTimeRate: count > 0 ? (onTimeCount / count) * 100 : 0,
    overRate: count > 0 ? (overCount / count) * 100 : 0,
    earlyRate: count > 0 ? (earlyCount / count) * 100 : 0,
  }
}

export function groupSummary(records, key, valueKey = 'actualMinutes') {
  const map = new Map()
  records.forEach((record) => {
    const label = record[key] || '未分类'
    const current = map.get(label) || { label, count: 0, plannedMinutes: 0, actualMinutes: 0, absDiffMinutes: 0 }
    current.count += 1
    current.plannedMinutes += record.plannedMinutes
    current.actualMinutes += record.actualMinutes
    current.absDiffMinutes += record.absDiffMinutes
    map.set(label, current)
  })

  return Array.from(map.values())
    .map((item) => ({ ...item, value: item[valueKey] ?? item.count }))
    .sort((left, right) => right.value - left.value)
}

export function statusSummary(records) {
  return STATUS_RULES.map((rule) => {
    const items = records.filter((record) => record.status === rule.label)
    return {
      ...rule,
      count: items.length,
      percent: records.length > 0 ? (items.length / records.length) * 100 : 0,
      minutes: sumBy(items, 'actualMinutes'),
    }
  })
}

export function quarterTrend(records) {
  const quarters = getUniqueOptions(records, 'quarter')
  return quarters.map((quarter) => {
    const items = records.filter((record) => record.quarter === quarter)
    const overview = calculateOverview(items)
    return {
      quarter,
      ...overview,
    }
  })
}

export function buildSeriesAnalysis(records) {
  const groups = groupRecords(records, 'seriesName')
  return Array.from(groups.entries())
    .map(([label, items]) => {
      const count = items.length
      const actualMinutes = sumBy(items, 'actualMinutes')
      const plannedMinutes = sumBy(items, 'plannedMinutes')
      const diffTotal = sumBy(items, 'diffMinutes')
      const avgActual = count > 0 ? actualMinutes / count : 0
      const avgDiff = count > 0 ? diffTotal / count : 0
      const stdDev = standardDeviation(items.map((item) => item.actualMinutes))
      const cv = avgActual > 0 ? stdDev / avgActual : 0
      const overCount = items.filter((item) => item.diffMinutes > 5).length
      const earlyCount = items.filter((item) => item.diffMinutes < -5).length
      const recommendation = buildRecommendation(avgDiff, cv, count)

      return {
        label,
        count,
        plannedMinutes,
        actualMinutes,
        avgActual,
        avgDiff,
        absDiffMinutes: sumBy(items, 'absDiffMinutes'),
        stdDev,
        cv,
        overCount,
        earlyCount,
        recommendation,
      }
    })
    .filter((item) => item.label)
}

export function buildReportNarratives(records, selectedQuarter) {
  const trends = quarterTrend(records)
  const current = trends.find((item) => item.quarter === selectedQuarter) || trends.at(-1)
  const previous = trends[trends.findIndex((item) => item.quarter === current?.quarter) - 1]
  const series = buildSeriesAnalysis(records.filter((record) => record.quarter === current?.quarter))
  const unstable = [...series].sort((left, right) => right.cv - left.cv)[0]
  const over = [...series].sort((left, right) => right.avgDiff - left.avgDiff)[0]
  const heavy = [...series].sort((left, right) => right.actualMinutes - left.actualMinutes)[0]

  if (!current) return []

  const narratives = [
    `${current.quarter} 共记录 ${current.count} 场日程，实际时长 ${formatMinutes(current.actualMinutes)}。`,
  ]

  if (previous) {
    narratives.push(
      `较 ${previous.quarter}，日程数量${formatDelta(current.count - previous.count, '场')}，实际时长${formatDelta(current.actualMinutes - previous.actualMinutes, '分钟')}。`,
    )
  }

  narratives.push(`准时/基本准时率为 ${formatPercent(current.onTimeRate)}，平均每场累计偏差 ${formatNumber(current.avgAbsDiffMinutes)} 分钟。`)

  if (over) {
    narratives.push(`${over.label} 平均偏差 ${formatNumber(over.avgDiff)} 分钟，是本季度最需要排期关注的会议之一。`)
  }

  if (unstable && unstable.cv > 0.2) {
    narratives.push(`${unstable.label} 离散系数 ${formatPercent(unstable.cv * 100)}，时长波动较高，建议先观察议题范围和参会方。`)
  }

  if (heavy) {
    narratives.push(`${heavy.label} 本季度累计占用 ${formatMinutes(heavy.actualMinutes)}，适合作为下季度精简或分层汇报的优先对象。`)
  }

  return narratives
}

export function formatMinutes(value) {
  return `${Math.round(value || 0)} 分钟`
}

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < 10 ? digits : 0,
  })
}

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return '0%'
  return `${formatNumber(value, digits)}%`
}

function buildRecommendation(avgDiff, cv, count) {
  const volatility = cv < 0.1 ? '稳定' : cv < 0.2 ? '中等波动' : cv < 0.3 ? '高波动' : '极高波动'
  if (count < 2) return `样本较少，先积累数据；当前波动为${volatility}`
  if (avgDiff > 30) return `建议增加 30 分钟 buffer，或拆分议题；当前波动为${volatility}`
  if (avgDiff > 15) return `建议预留 15-30 分钟 buffer，并尽量排在半天最后；当前波动为${volatility}`
  if (avgDiff > 5) return `建议预留 15 分钟 buffer，持续观察是否常态化超时；当前波动为${volatility}`
  if (avgDiff < -30) return `计划时长明显偏长，可考虑缩短 30 分钟或保留机动空档；当前波动为${volatility}`
  if (avgDiff < -15) return `可考虑缩短 15-30 分钟，或将释放时间作为缓冲；当前波动为${volatility}`
  if (avgDiff < -5) return `可考虑缩短 5-15 分钟，优先观察高频场景；当前波动为${volatility}`
  return cv >= 0.2 ? `平均时长合适，但波动偏高，建议控制议题边界；当前波动为${volatility}` : '无需调整，保持当前计划时长'
}

function getStatusLabel(diffMinutes) {
  return STATUS_RULES.find((rule) => rule.test(diffMinutes))?.label || '准时/基本准时'
}

function clearDerivedForEdit(record, key) {
  const nextRecord = { ...record }
  if (['plannedStart', 'plannedEnd'].includes(key)) {
    delete nextRecord.plannedMinutes
    delete nextRecord.diffMinutes
    delete nextRecord.status
  }
  if (['actualStart', 'actualEnd'].includes(key)) {
    delete nextRecord.actualMinutes
    delete nextRecord.diffMinutes
    delete nextRecord.status
  }
  return nextRecord
}

function resolveColumnKey(label) {
  const rawValue = normalizeCellValue(label)
  const raw = rawValue instanceof Date ? '' : String(rawValue).trim()
  const cleaned = raw.replace(/\s/g, '')
  return COLUMN_ALIASES[raw] || COLUMN_ALIASES[cleaned] || TIME_ANALYSIS_COLUMNS.find((column) => column.key === raw)?.key || ''
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatDate(excelSerialToDate(value))
  }
  const raw = String(value || '').trim()
  if (!raw) return ''
  const normalized = raw.replace(/\//g, '-')
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    const [, year, month, day] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const shortMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/)
  if (shortMatch) {
    const [, month, day, yearPart] = shortMatch
    const year = yearPart.length === 2 ? `20${yearPart}` : yearPart
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return raw
}

function normalizeTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 24 * 60)
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
  }
  const raw = String(value || '').trim()
  if (!raw) return ''
  const match = raw.match(/(\d{1,2}):(\d{1,2})/)
  if (!match) return raw
  const [, hour, minute] = match
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

function normalizeTitle(value) {
  return String(value || '').trim() || '未命名日程'
}

function normalizeSeriesName(value) {
  return normalizeTitle(value)
    .replace(/\s+/g, ' ')
    .replace(/monthly meeting/i, 'Monthly Meeting')
    .trim()
}

function calculateMinutes(start, end) {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return NaN
  const adjustedEnd = endMinutes < startMinutes ? endMinutes + 24 * 60 : endMinutes
  return adjustedEnd - startMinutes
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return NaN
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour * 60 + minute
}

function parseNumber(value) {
  if (typeof value === 'number') return value
  if (value == null) return NaN
  const raw = String(value).trim()
  if (!raw) return NaN
  const normalized = raw.replace(/[^\d.-]/g, '')
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return NaN
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

function normalizeCellValue(value) {
  if (value == null) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  return String(value).trim()
}

function findHeaderIndex(rows) {
  let bestIndex = 0
  let bestScore = -1
  rows.slice(0, 12).forEach((row, index) => {
    const score = row.reduce((total, cell) => total + (resolveColumnKey(cell) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

function scoreSheetRows(rows) {
  const headerIndex = findHeaderIndex(rows)
  const header = rows[headerIndex] || []
  const mappedKeys = new Set(header.map(resolveColumnKey).filter(Boolean))
  const dataRows = Math.max(0, rows.length - headerIndex - 1)
  const requiredScore = ['date', 'title'].reduce((total, key) => total + (mappedKeys.has(key) ? 6 : 0), 0)
  const timeScore = ['plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'plannedMinutes', 'actualMinutes'].reduce(
    (total, key) => total + (mappedKeys.has(key) ? 2 : 0),
    0,
  )
  return requiredScore + timeScore + Math.min(dataRows, 100) / 10
}

function excelSerialToDate(serial) {
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const date = new Date(utcValue * 1000)
  const fractionalDay = serial - Math.floor(serial)
  const totalSeconds = Math.round(86400 * fractionalDay)
  date.setSeconds(date.getSeconds() + totalSeconds)
  return date
}

function formatDate(date) {
  const adjusted = new Date(date)
  if (adjusted.getHours() === 23 && adjusted.getMinutes() >= 50) {
    adjusted.setDate(adjusted.getDate() + 1)
  }
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}-${String(adjusted.getDate()).padStart(2, '0')}`
}

function getQuarter(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})/)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  return `${String(year).slice(2)}Q${Math.ceil(month / 3)}`
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0)
}

function groupRecords(records, key) {
  return records.reduce((map, record) => {
    const label = record[key] || '未分类'
    const next = map.get(label) || []
    next.push(record)
    map.set(label, next)
    return map
  }, new Map())
}

function standardDeviation(values) {
  const validValues = values.filter(Number.isFinite)
  if (validValues.length < 2) return 0
  const average = validValues.reduce((total, value) => total + value, 0) / validValues.length
  const variance = validValues.reduce((total, value) => total + (value - average) ** 2, 0) / (validValues.length - 1)
  return Math.sqrt(variance)
}

function formatDelta(value, unit) {
  const sign = value > 0 ? '增加' : value < 0 ? '减少' : '持平'
  if (value === 0) return '持平'
  return `${sign} ${Math.abs(Math.round(value))} ${unit}`
}
