import { TIME_ANALYSIS_COLUMNS } from './timeAnalysisData.js'
import { findHeaderIndex, normalizeMeetingRecord, resolveColumnKey } from './timeAnalysisUtils.js'

export const IMPORT_FIELDS = [...TIME_ANALYSIS_COLUMNS,
  { key: 'plannedMinutes', label: '预计用时（分钟）' },
  { key: 'actualMinutes', label: '实际用时（分钟）' },
  { key: 'diffMinutes', label: '差值（分钟）' },
  { key: 'status', label: '会议状态' },
]

export function inferImportLayout(rows) {
  const headerRow = findHeaderIndex(rows)
  const mapping = {}
  ;(rows[headerRow] || []).forEach((label, index) => {
    const key = resolveColumnKey(label)
    if (key && mapping[key] === undefined) mapping[key] = index
  })
  return { headerRow, mapping }
}

export function timeRecordFingerprint(record) {
  return JSON.stringify(['date', 'title', 'meetingType', 'locationType', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'plannedMinutes', 'actualMinutes'].map((key) => record[key] ?? ''))
}

export function buildTimeImportPreview(rows, layout, currentRecords) {
  const existing = new Set(currentRecords.map(timeRecordFingerprint))
  const seen = new Set()
  return rows.slice(layout.headerRow + 1).filter((row) => row.some((value) => String(value ?? '').trim())).map((row, index) => {
    const draft = {}
    for (const [key, column] of Object.entries(layout.mapping)) {
      if (column !== '' && column !== undefined) draft[key] = row[Number(column)] ?? ''
    }
    const record = normalizeMeetingRecord(draft, index)
    const errors = []
    if (!record.date) errors.push('日期无效或为空')
    if (!String(draft.title || '').trim()) errors.push('会议主题为空')
    for (const key of ['plannedStart', 'plannedEnd', 'actualStart', 'actualEnd']) {
      if (String(draft[key] ?? '').trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(record[key])) errors.push(`${IMPORT_FIELDS.find((field) => field.key === key).label}无效`)
    }
    const fingerprint = timeRecordFingerprint(record)
    const duplicateInFile = seen.has(fingerprint)
    if (errors.length === 0) seen.add(fingerprint)
    return { rowNumber: layout.headerRow + index + 2, record, errors, duplicateInFile, duplicateExisting: existing.has(fingerprint) }
  })
}

export function resolveTimeImport(preview, currentRecords, mode) {
  const additions = preview.filter((row) => row.errors.length === 0 && !row.duplicateInFile && (mode === 'replace' || !row.duplicateExisting))
    .map((row) => ({ ...row.record, id: `time-import-${crypto.randomUUID()}` }))
  return { records: mode === 'replace' ? additions : [...currentRecords, ...additions], addedCount: additions.length }
}
