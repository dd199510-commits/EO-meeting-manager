function fingerprint(value) {
  const text = JSON.stringify(value)
  let first = 2166136261
  let second = 5381
  for (let index = 0; index < text.length; index += 1) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619)
    second = Math.imul(second, 33) ^ text.charCodeAt(index)
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`
}

export function buildNoticeSnapshot({ rowId = '', subject = '', occurrences = [], text = '', templateKey = '' } = {}) {
  const snapshot = {
    rowId: String(rowId),
    subject: String(subject),
    occurrences: occurrences.map((item) => ({
      date: String(item.date || ''),
      startTime: String(item.startTime || ''),
      endTime: String(item.endTime || ''),
    })).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
    text: String(text),
    templateKey: String(templateKey),
  }
  const { templateKey: templateIdentity, ...contentSnapshot } = snapshot
  return { ...contentSnapshot, templateKey: templateIdentity, fingerprint: fingerprint(contentSnapshot) }
}

export function createNoticeSentRecord(snapshot, sentAt = new Date().toISOString()) {
  return { sent: true, sentAt, fingerprint: snapshot.fingerprint, snapshot }
}

export function isNoticeSent(record) {
  return record === true || Boolean(record && typeof record === 'object' && record.sent === true)
}

export function getNoticeDeliveryState(record, currentSnapshot) {
  if (!isNoticeSent(record)) return { status: 'unsent', sent: false, stale: false, changes: [] }
  if (record === true || !record.snapshot || !record.fingerprint) {
    return { status: 'legacy', sent: true, stale: false, changes: [], needsVerification: true }
  }
  const previous = record.snapshot
  const changes = []
  const oldDates = (previous.occurrences || []).map((item) => `${item.date} ${item.startTime}–${item.endTime}`).join('；')
  const newDates = currentSnapshot.occurrences.map((item) => `${item.date} ${item.startTime}–${item.endTime}`).join('；')
  if (oldDates !== newDates) changes.push({ field: 'occurrences', label: '会议安排', before: oldDates, after: newDates })
  if (previous.subject !== currentSnapshot.subject) changes.push({ field: 'subject', label: '会议名称', before: previous.subject, after: currentSnapshot.subject })
  if (previous.text !== currentSnapshot.text) changes.push({ field: 'text', label: '通知正文', before: previous.text, after: currentSnapshot.text })
  const stale = record.fingerprint !== currentSnapshot.fingerprint
  return { status: stale ? 'stale' : 'sent', sent: true, stale, changes, sentAt: record.sentAt || '' }
}
