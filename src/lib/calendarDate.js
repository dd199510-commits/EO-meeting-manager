export function parseCalendarDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return formatCalendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return formatCalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }
  const text = String(value ?? '').trim()
  const yearFirst = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?:[T\s].*)?$/)
    || text.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (yearFirst) return formatCalendarDate(...yearFirst.slice(1).map(Number))
  const monthFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (monthFirst) return formatCalendarDate(Number(monthFirst[3]) + (monthFirst[3].length === 2 ? 2000 : 0), Number(monthFirst[1]), Number(monthFirst[2]))
  return ''
}

function formatCalendarDate(year, month, day) {
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
