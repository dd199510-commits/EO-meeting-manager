import { formatDate, addWeeks, addYears } from './date'
import { getMeetingFrequencyType, normalizeMeeting } from '../data/meetingData'

export function parseDateInput(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  if (!value) {
    return null
  }

  const [year, month, day] = String(value).split('-').map(Number)
  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

export function getLastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export function setWeekday(date, weekday) {
  const result = parseDateInput(date)
  const currentDay = result.getDay()
  const diff = weekday - currentDay
  result.setDate(result.getDate() + diff)
  return result
}

export function setSafeDayOfMonth(date, targetDay) {
  const result = parseDateInput(date)
  const year = result.getFullYear()
  const month = result.getMonth()
  const lastDay = getLastDayOfMonth(year, month)
  result.setDate(Math.min(targetDay, lastDay))
  return result
}

export function isBefore(date1, date2) {
  return parseDateInput(date1) < parseDateInput(date2)
}

export function isAfter(date1, date2) {
  return parseDateInput(date1) > parseDateInput(date2)
}

function buildYearlyCandidate(year, month, daySpec) {
  const candidate = new Date(year, month - 1, 1)
  candidate.setDate(Math.min(daySpec, getLastDayOfMonth(year, month - 1)))
  return candidate
}

function getYearlyMonths(frequency) {
  return [...new Set(Array.isArray(frequency.monthSpec) ? frequency.monthSpec : [frequency.monthSpec || 1])]
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
    .sort((a, b) => a - b)
}

function getYearlyOccurrences(frequency, rangeStart, rangeEnd, anchorDate) {
  const months = getYearlyMonths(frequency)

  const anchor = parseDateInput(anchorDate)
  const start = parseDateInput(rangeStart)
  const end = parseDateInput(rangeEnd)
  const instances = []
  const interval = Math.max(1, Number(frequency.interval) || 1)

  if (!anchor || !start || !end || months.length === 0) {
    return instances
  }

  let year = anchor.getFullYear()
  let guard = 0

  while (year <= end.getFullYear() && guard < 500) {
    guard += 1

    months.forEach((month) => {
      const candidate = buildYearlyCandidate(year, month, frequency.daySpec)
      if (candidate < anchor || candidate < start || candidate > end) {
        return
      }

      instances.push(formatDate(candidate))
    })

    year += interval
  }

  return instances
}

function resolveYearlyOccurrencePeriod(frequency, occurrenceDate) {
  const occurrence = parseDateInput(occurrenceDate)
  const months = getYearlyMonths(frequency)
  if (!occurrence || months.length === 0) return null

  const occurrenceMonth = occurrence.getMonth() + 1
  if (months.includes(occurrenceMonth)) {
    return buildYearlyCandidate(occurrence.getFullYear(), occurrenceMonth, frequency.daySpec)
  }

  const candidates = []
  for (let yearOffset = -1; yearOffset <= 1; yearOffset += 1) {
    months.forEach((month) => {
      candidates.push(buildYearlyCandidate(occurrence.getFullYear() + yearOffset, month, frequency.daySpec))
    })
  }

  const nearestCandidate = candidates.sort((left, right) => {
    const distanceDiff = Math.abs(left - occurrence) - Math.abs(right - occurrence)
    if (distanceDiff !== 0) return distanceDiff

    const leftIsFuture = left >= occurrence
    const rightIsFuture = right >= occurrence
    if (leftIsFuture !== rightIsFuture) return leftIsFuture ? -1 : 1
    return left - right
  })[0] ?? null

  const maximumAttributionDistance = 31 * 24 * 60 * 60 * 1000
  return nearestCandidate && Math.abs(nearestCandidate - occurrence) <= maximumAttributionDistance
    ? nearestCandidate
    : null
}

function getYearlyOccurrencesAfterCompletion(frequency, occurrenceDate, rangeStart, rangeEnd) {
  const completedPeriod = resolveYearlyOccurrencePeriod(frequency, occurrenceDate)
  const months = getYearlyMonths(frequency)
  const start = parseDateInput(rangeStart)
  const end = parseDateInput(rangeEnd)
  const interval = Math.max(1, Number(frequency.interval) || 1)
  const instances = []

  if (!completedPeriod) return null
  if (!start || !end || months.length === 0) return instances

  let year = completedPeriod.getFullYear()
  let guard = 0

  while (year <= end.getFullYear() && guard < 500) {
    guard += 1
    months.forEach((month) => {
      const candidate = buildYearlyCandidate(year, month, frequency.daySpec)
      if (candidate <= completedPeriod || candidate < start || candidate > end) return
      instances.push(formatDate(candidate))
    })
    year += interval
  }

  return instances
}

function resolveOccurrencePeriod(frequency, occurrenceDate) {
  const occurrence = parseDateInput(occurrenceDate)
  if (!occurrence) return null

  if (frequency.type === 'weekly') {
    // 最近一次实际日期归属于它所在的自然周（周一至周日）。
    // 即使周三的会提前到周二，本周也视为已经完成。
    return setWeekday(occurrence, frequency.daySpec)
  }

  if (frequency.type === 'monthly') {
    // 最近一次实际日期归属于它所在的自然月。
    // 即使每月 7 日的会提前到 4 日，本月也视为已经完成。
    const monthStart = new Date(occurrence.getFullYear(), occurrence.getMonth(), 1)
    return setSafeDayOfMonth(monthStart, frequency.daySpec)
  }

  return occurrence
}

function addCadencePeriods(date, frequency, count) {
  const interval = Math.max(1, Number(frequency.interval) || 1) * count
  if (frequency.type === 'weekly') return addWeeks(date, interval)
  if (frequency.type === 'monthly') {
    const targetMonth = new Date(date.getFullYear(), date.getMonth() + interval, 1)
    return setSafeDayOfMonth(targetMonth, frequency.daySpec)
  }
  return addYears(date, interval)
}

function getLatestDate(values) {
  return values
    .map(parseDateInput)
    .filter(Boolean)
    .sort((left, right) => right - left)[0] ?? null
}

function getFollowingCadenceOccurrences(frequency, occurrenceDate, throughDate) {
  const completedPeriod = resolveOccurrencePeriod(frequency, occurrenceDate)
  const end = parseDateInput(throughDate)
  if (!completedPeriod || !end) return []

  const occurrences = []
  let candidate = addCadencePeriods(completedPeriod, frequency, 1)
  let guard = 0

  while (candidate <= end && guard < 500) {
    occurrences.push(formatDate(candidate))
    candidate = addCadencePeriods(candidate, frequency, 1)
    guard += 1
  }

  return occurrences
}

function getInitialCadenceOccurrences(frequency, anchorDate, throughDate) {
  const anchor = parseDateInput(anchorDate)
  const end = parseDateInput(throughDate)
  let candidate = resolveOccurrencePeriod(frequency, anchor)
  if (!anchor || !end || !candidate) return []

  const occurrences = []
  let guard = 0

  while (candidate < anchor && guard < 500) {
    candidate = addCadencePeriods(candidate, frequency, 1)
    guard += 1
  }

  while (candidate <= end && guard < 500) {
    occurrences.push(formatDate(candidate))
    candidate = addCadencePeriods(candidate, frequency, 1)
    guard += 1
  }

  return occurrences
}

function getLatestHistoryDate(meeting, cutoffDate) {
  const cutoff = parseDateInput(cutoffDate)
  const history = Array.isArray(meeting.history) ? meeting.history : []
  return getLatestDate(history.filter((value) => {
    const date = parseDateInput(value)
    return date && (!cutoff || date <= cutoff)
  }))
}

export function syncMeetingAnchorDate(meeting) {
  const normalized = normalizeMeeting(meeting)
  const history = [...(normalized.history ?? [])].filter((value) => parseDateInput(value)).sort()
  const firstHistoryDate = history[0] ?? null

  if (getMeetingFrequencyType(normalized) === 'adhoc') {
    return normalized
  }

  // 兼容旧数据：频率计算有历史记录时只使用最近一次实际日期；
  // anchorDate 仅在没有历史记录时作为起始参考日。
  if (!normalized.frequency.anchorDate && firstHistoryDate) {
    return {
      ...normalized,
      frequency: {
        ...normalized.frequency,
        anchorDate: firstHistoryDate,
      },
    }
  }

  return normalized
}

export function calculateNextOccurrence(meeting, referenceDate = new Date()) {
  const normalized = syncMeetingAnchorDate(meeting)
  const frequency = normalized.frequency
  const { type, interval, monthSpec, daySpec, anchorDate } = frequency
  const today = formatDate(parseDateInput(referenceDate))

  if (type === 'adhoc' || !anchorDate) {
    return normalized.nextDate || null
  }

  const todayDate = parseDateInput(today)
  const latestHistoryDate = getLatestHistoryDate(normalized, todayDate)

  if (type === 'yearly') {
    const searchEnd = addYears(todayDate, Math.max(interval, 1) * 5)
    const initialOccurrences = () => getYearlyOccurrences(
      { interval, monthSpec, daySpec },
      today,
      formatDate(searchEnd),
      anchorDate,
    )
    const candidates = latestHistoryDate
      ? getYearlyOccurrencesAfterCompletion(frequency, latestHistoryDate, today, formatDate(searchEnd))
        ?? initialOccurrences()
      : initialOccurrences()

    return candidates[0] ?? null
  }

  const cadenceReference = latestHistoryDate ?? parseDateInput(anchorDate)
  if (!cadenceReference) return normalized.nextDate || null

  const searchEnd = addCadencePeriods(getLatestDate([todayDate, cadenceReference]), frequency, 8)
  const occurrences = latestHistoryDate
    ? getFollowingCadenceOccurrences(frequency, latestHistoryDate, searchEnd)
    : getInitialCadenceOccurrences(frequency, anchorDate, searchEnd)

  return occurrences.find((candidate) => candidate >= today) ?? null
}

export function formatNextDateInfo(dateValue, referenceDate = new Date()) {
  if (!dateValue) {
    return { prefix: null, date: '待定' }
  }

  const date = parseDateInput(dateValue)
  const now = parseDateInput(referenceDate)
  const currentYear = now.getFullYear()
  const dateYear = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const weekday = weekdays[date.getDay()]

  if (dateYear === currentYear) {
    return {
      prefix: null,
      date: `${month}-${day} 周${weekday}`,
    }
  }

  if (dateYear === currentYear + 1) {
    return {
      prefix: '明年',
      date: `${month}-${day} 周${weekday}`,
    }
  }

  return {
    prefix: `${dateYear}年`,
    date: `${month}-${day} 周${weekday}`,
  }
}

export function generateOccurrencesInRange(meeting, startDate, endDate, referenceDate = new Date()) {
  const normalized = syncMeetingAnchorDate(meeting)
  const frequency = normalized.frequency
  const type = frequency.type

  if (normalized.status !== 'active' || type === 'adhoc' || !frequency.anchorDate) {
    return []
  }

  const start = parseDateInput(startDate)
  const end = parseDateInput(endDate)
  const latestHistoryDate = getLatestHistoryDate(normalized, referenceDate)

  if (type === 'yearly') {
    const initialOccurrences = () => getYearlyOccurrences(frequency, start, end, frequency.anchorDate)
    const occurrences = latestHistoryDate
      ? getYearlyOccurrencesAfterCompletion(frequency, latestHistoryDate, start, end)
        ?? initialOccurrences()
      : initialOccurrences()
    return [...new Set(occurrences)].sort()
  }

  const cadenceReference = latestHistoryDate ?? parseDateInput(frequency.anchorDate)
  if (!cadenceReference) return []

  const searchEnd = addCadencePeriods(end, frequency, 2)
  const occurrences = latestHistoryDate
    ? getFollowingCadenceOccurrences(frequency, latestHistoryDate, searchEnd)
    : getInitialCadenceOccurrences(frequency, frequency.anchorDate, searchEnd)

  return occurrences.filter(
    (candidate) =>
      !isBefore(candidate, start) &&
      !isAfter(candidate, end),
  )
}
