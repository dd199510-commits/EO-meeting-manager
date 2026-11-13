import assert from 'node:assert/strict'
import { parseDelimitedText, serializeDelimitedRows } from '../src/lib/delimitedText.js'
import { parseCalendarDate } from '../src/lib/calendarDate.js'
import { isValidEmail } from '../src/lib/email.js'
import { parseBatchImportText } from '../src/features/batchImport/batchImportUtils.js'
import { parsePastedMeetings } from '../src/features/timeAnalysis/timeAnalysisUtils.js'
import { buildTimeImportPreview, inferImportLayout, resolveTimeImport } from '../src/features/timeAnalysis/timeImportUtils.js'

const quoted = '日期,会议主题,预计开始,预计结束,实际开始,实际结束,备注\r\n2026-11-13,"预算,经营复盘",09:00,10:00,09:00,10:00,"包含""引号""\n多行备注"'
const rows = parseDelimitedText(quoted)
assert.equal(rows.length, 2)
assert.equal(rows[1][1], '预算,经营复盘')
assert.equal(rows[1][6], '包含"引号"\n多行备注')
assert.deepEqual(parseDelimitedText(serializeDelimitedRows(rows), '\t'), rows)
assert.throws(() => parseDelimitedText('日期,主题\n2026-11-13,"未闭合'))
assert.equal(parseCalendarDate('2026/2/30'), '')
assert.equal(parseCalendarDate('2026-13-01'), '')
assert.equal(parseCalendarDate('2024-02-29'), '2024-02-29')
assert.equal(parseCalendarDate('20260312'), '2026-03-12')
assert.equal(parseCalendarDate('3/12/26'), '2026-03-12')
assert(isValidEmail(' person@example.com '))
assert(!isValidEmail('a@b.com;c@d.com'))

const records = parsePastedMeetings(quoted)
assert.equal(records[0].title, '预算,经营复盘')
assert.equal(records[0].actualMinutes, 60)
const layout = inferImportLayout(rows)
const preview = buildTimeImportPreview([...rows, rows[1], ['2026-02-30', '无效日期']], layout, records)
assert(preview[0].duplicateExisting)
assert(preview[1].duplicateInFile)
assert(preview[2].errors.length)
assert.equal(resolveTimeImport(preview, records, 'append').addedCount, 0)
const replaced = resolveTimeImport(preview, records, 'replace')
assert.equal(replaced.records.length, 1)
assert.notEqual(replaced.records[0].id, records[0].id)
const meetings = [{ id: 'a', status: 'active', name: '经营周会', history: [] }, { id: 'b', status: 'active', name: '经营月会', history: [] }]
const history = parseBatchImportText('主题\t日期\n经营\t2026-11-13\n经营周会\t2026-02-30\n经营周会\t2026-11-13', meetings)
assert.equal(history[0].valid, false)
assert.equal(history[0].candidates.length, 2)
assert.equal(history[1].date, '')
assert.equal(history[2].matchedMeeting.id, 'a')
console.log('PASS · CSV/TSV 引号换行、日期、邮箱、导入预览/去重/追加覆盖与历史多候选')
