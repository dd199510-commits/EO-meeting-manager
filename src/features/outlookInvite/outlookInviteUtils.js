import { splitAttendees } from '../../lib/contacts'
import { isValidEmail } from '../../lib/email'
import { buildIdempotentOutlookScript } from './outlookScript'

import { DEFAULT_MEETING_PREFIX } from '../../data/meetingData'

function unique(values) {
  const seen = new Set()
  return values.filter((value) => {
    const key = String(value || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractEmails(value) {
  return unique(String(value || '').match(/[^\s<>;,，；]+@[^\s<>;,，；]+/g) ?? [])
}

function uniquePeople(people) {
  const seen = new Set()
  return people.filter((person) => {
    const key = String(person.email || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildBody(sourceMeeting, scheduledMeeting) {
  const attendees = splitAttendees(sourceMeeting?.attendees || scheduledMeeting.attendees || '').join('、')
  return `参会人：${attendees}`
}

function buildMeetingSubject(sourceMeeting, scheduledMeeting) {
  const prefix = String(
    sourceMeeting?.meetingPrefix ?? scheduledMeeting?.meetingPrefix ?? DEFAULT_MEETING_PREFIX,
  ).trim()
  const name = String(
    sourceMeeting?.name ||
      scheduledMeeting?.name ||
      scheduledMeeting?.meetingName ||
      scheduledMeeting?.subject ||
      scheduledMeeting?.title ||
      scheduledMeeting?.taskId ||
      '未命名会议',
  ).trim()

  if (!prefix || name.startsWith(prefix)) return name
  return `${prefix}${name}`
}

export function validateInvitePeople(attendees, refs = []) {
  const names = splitAttendees(attendees)
  const sourceRefs = Array.isArray(refs) ? refs : []
  const people = [], issues = []
  const length = Math.max(names.length, sourceRefs.length)
  for (let index = 0; index < length; index += 1) {
    const ref = sourceRefs[index]
    const name = String(ref?.displayName || names[index] || ref?.emailSnapshot || '未命名收件人').trim()
    const raw = String(names[index] || '').trim()
    const email = String(ref?.emailSnapshot || '').trim()
    if (email) {
      if (isValidEmail(email)) people.push({ name, email, label: `${name}<${email}>` })
      else issues.push({ name, email, reason: 'invalid' })
    } else {
      const extracted = extractEmails(raw)
      if (extracted.length && extracted.every(isValidEmail)) people.push(...extracted.map((address) => ({ name, email: address, label: `${name}<${address}>` })))
      else issues.push({ name, email: raw.includes('@') ? raw : '', reason: raw.includes('@') ? 'invalid' : 'missing' })
    }
  }
  const uniqueRecipients = uniquePeople(people)
  return { people: uniqueRecipients, emails: uniqueRecipients.map((person) => person.email), issues }
}

export function getOutlookTimeErrors(row) {
  const errors = []
  const dateText = String(row.date || '')
  const date = new Date(`${dateText}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) errors.push('日期无效')
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (!timePattern.test(row.startTime || '') || !timePattern.test(row.endTime || '') || row.endTime <= row.startTime) errors.push('开始结束时间无效')
  return errors
}

export function buildOutlookInviteRows({ meetings = [], scheduledMeetings = [], taskId = '' }) {
  const meetingMap = new Map(meetings.map((meeting) => [meeting.id, meeting]))
  const meetingNameMap = new Map(
    meetings
      .filter((meeting) => meeting.name?.trim())
      .map((meeting) => [meeting.name.trim(), meeting]),
  )

  return scheduledMeetings
    .slice()
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')) || String(left.startTime || '').localeCompare(String(right.startTime || '')))
    .map((scheduledMeeting) => {
      const scheduledName = String(scheduledMeeting.name || scheduledMeeting.meetingName || '').trim()
      const sourceMeeting = scheduledMeeting.meetingId
        ? meetingMap.get(scheduledMeeting.meetingId) ?? meetingNameMap.get(scheduledName) ?? null
        : meetingNameMap.get(scheduledName) ?? null
      const required = validateInvitePeople(
        sourceMeeting?.attendees || scheduledMeeting.attendees,
        sourceMeeting?.attendeeRefs,
      )
      const optional = validateInvitePeople(sourceMeeting?.extraInvitees, sourceMeeting?.extraInviteeRefs)
      const requiredEmails = required.emails
      const optionalEmails = optional.emails.filter((email) => !requiredEmails.some((requiredEmail) => requiredEmail.toLowerCase() === email.toLowerCase()))
      const requiredPeople = required.people
      const optionalPeople = optional.people.filter((person) => optionalEmails.includes(person.email))
      const missingRequired = required.issues.map((issue) => `${issue.name}${issue.reason === 'invalid' ? '（邮箱格式错误）' : '（缺邮箱）'}`)
      const missingOptional = optional.issues.map((issue) => `${issue.name}${issue.reason === 'invalid' ? '（邮箱格式错误）' : '（缺邮箱）'}`)

      return {
        id: scheduledMeeting.id,
        externalId: `MM2|${taskId || 'default'}|${scheduledMeeting.meetingId || 'adhoc'}|${scheduledMeeting.instanceId || scheduledMeeting.id || scheduledMeeting.taskId}`,
        legacyDraftId: `${scheduledMeeting.meetingId || 'adhoc'}-${scheduledMeeting.id}`,
        scheduledMeeting,
        sourceMeeting,
        subject: buildMeetingSubject(sourceMeeting, scheduledMeeting),
        date: scheduledMeeting.date,
        startTime: scheduledMeeting.startTime,
        endTime: scheduledMeeting.endTime,
        duration: scheduledMeeting.duration,
        requiredEmails,
        optionalEmails,
        requiredPeople,
        optionalPeople,
        missingRequired,
        missingOptional,
        recipientIssues: [...required.issues, ...optional.issues],
        timeErrors: getOutlookTimeErrors(scheduledMeeting),
        location: sourceMeeting?.outlookLocation || '',
        body: buildBody(sourceMeeting, scheduledMeeting),
      }
    })
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function buildOutlookVbaScript({ rows = [], taskName = '排程任务', senderEmail = '' }) {
  return buildIdempotentOutlookScript({ rows, taskName, senderEmail, scriptKind: 'vba' })
}

export function buildOutlookVbsScript({ rows = [], taskName = '排程任务', senderEmail = '' }) {
  return buildIdempotentOutlookScript({ rows, taskName, senderEmail, scriptKind: 'vbs' })
}

export function downloadOutlookVbaScript({ rows, taskName, senderEmail }) {
  const script = buildOutlookVbaScript({ rows, taskName, senderEmail })
  const blob = new Blob([script], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `outlook-meeting-drafts-fixed-ascii-${formatTimestamp()}.bas`
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadOutlookVbsScript({ rows, taskName, senderEmail }) {
  const script = buildOutlookVbsScript({ rows, taskName, senderEmail })
  const blob = new Blob([script], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `outlook-meeting-drafts-one-click-${formatTimestamp()}.vbs`
  link.click()
  URL.revokeObjectURL(url)
}
