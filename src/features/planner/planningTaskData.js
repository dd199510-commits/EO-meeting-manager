const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function normalizePlanningRange(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const start = normalizeText(value.start).trim()
  const end = normalizeText(value.end).trim()
  if (!start && !end) return null

  return { start, end }
}

export function normalizePlanningInstances(value) {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []

    const date = normalizeText(item.date).trim()
    if (!DATE_PATTERN.test(date)) return []

    const parsedDuration = Number(item.duration)
    const name = normalizeText(item.name).trim() || '未命名会议'

    return [{
      ...item,
      id: normalizeText(item.id).trim() || `planning-instance-${index + 1}`,
      meetingId: normalizeText(item.meetingId),
      sourceMeetingId: normalizeText(item.sourceMeetingId),
      name,
      date,
      duration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 30,
      attendees: normalizeText(item.attendees),
      notes: normalizeText(item.notes),
      noteMentions: Array.isArray(item.noteMentions) ? item.noteMentions.filter(Boolean) : [],
      frequency: normalizeText(item.frequency, 'adhoc') || 'adhoc',
      sourceAnchorDate: normalizeText(item.sourceAnchorDate),
    }]
  })
}

export function normalizePlanningInputMeetings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const timeRange = normalizePlanningRange(value.timeRange)
  if (!timeRange) return null

  const meetings = normalizePlanningInstances(value.meetings)
  const metadata = value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
    ? value.metadata
    : {}

  return {
    ...value,
    timeRange,
    meetings,
    metadata: {
      ...metadata,
      totalCount: meetings.length,
      sourceSignature: normalizeText(metadata.sourceSignature),
    },
  }
}
