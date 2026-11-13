import { parseDelimitedText } from '../../lib/delimitedText.js'
import { parseCalendarDate } from '../../lib/calendarDate.js'

function normalizeMeetingName(name) {
  return name.replace(/【.*?】|\[.*?\]|\(.*?\)|^\s*常规会议\s*[:：]?\s*/g, '').trim()
}

function findMeetingCandidates(name, meetings) {
  const normalized = normalizeMeetingName(name)
  const active = meetings.filter((meeting) => meeting.status === 'active')
  const exact = active.filter((meeting) => meeting.name === name || meeting.name === normalized)
  if (exact.length) return exact
  if (!normalized) return []
  return active.filter((meeting) => meeting.name.includes(normalized) || normalized.includes(meeting.name))
}

export function parseBatchImportText(text, meetings) {
  const lines = parseDelimitedText(text)
  if (lines.length < 2) throw new Error('至少需要表头和一行数据')
  const headers = lines[0]
  const nameIndex = headers.findIndex((header) => ['主题', '名称', '标题', 'subject'].some((keyword) => header.toLowerCase().includes(keyword)))
  const dateIndex = headers.findIndex((header) => ['开始日期', '日期', 'start date'].some((keyword) => header.toLowerCase().includes(keyword)))
  if (nameIndex === -1 || dateIndex === -1) throw new Error('未找到“主题/名称”和“日期”列')
  return lines.slice(1).map((columns, index) => {
    const originalName = columns[nameIndex]?.trim() || ''
    const date = parseCalendarDate(columns[dateIndex])
    const candidates = originalName ? findMeetingCandidates(originalName, meetings) : []
    const matchedMeeting = date && candidates.length === 1 ? candidates[0] : null
    const error = !date ? `日期无效：${columns[dateIndex] || '空白'}`
      : !originalName ? '会议主题为空'
        : candidates.length > 1 ? '存在多个候选会议，请确认对应会议'
          : candidates.length === 0 ? '未找到对应会议，请手动指定' : ''
    return { id: `row-${index}`, originalName: originalName || '(空)', date, candidates, matchedMeeting,
      valid: Boolean(matchedMeeting), error, isDuplicate: Boolean(matchedMeeting?.history?.includes(date)) }
  })
}
