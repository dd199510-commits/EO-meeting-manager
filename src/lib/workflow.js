export function scheduleSignature(meetings = []) {
  return JSON.stringify(meetings.map(meeting => [meeting.id, meeting.meetingId, meeting.name,
    meeting.date, meeting.endDate || '', meeting.startTime, meeting.endTime,
    meeting.attendees || '', meeting.location || '']).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}

export function updateSchedulePreservingNotices(previous, nextMeetings) {
  const oldById = new Map(previous.scheduledMeetings.map(meeting => [meeting.id, meeting]))
  const changedGroups = new Set()
  const changedIds = new Set()
  for (const meeting of nextMeetings) {
    const old = oldById.get(meeting.id)
    if (!old || scheduleSignature([old]) !== scheduleSignature([meeting])) {
      changedIds.add(meeting.id)
      if (meeting.meetingId) changedGroups.add(meeting.meetingId)
    }
  }
  for (const old of previous.scheduledMeetings) {
    if (!nextMeetings.some(meeting => meeting.id === old.id) && old.meetingId) changedGroups.add(old.meetingId)
  }
  const checks = { ...previous.finalCheckStatus }
  changedGroups.forEach(id => { delete checks[id] })
  return {
    ...previous,
    finalCheckStatus: checks,
    scheduledMeetings: nextMeetings.map(meeting => changedIds.has(meeting.id) || changedGroups.has(meeting.meetingId)
      ? { ...meeting, reserved: false, locked: false }
      : meeting),
  }
}
