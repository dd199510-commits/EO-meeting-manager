export function normalizeNoticeRowSettings(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}

  return {
    templateKey: typeof source.templateKey === 'string' ? source.templateKey : '',
    executiveName: typeof source.executiveName === 'string' ? source.executiveName : '',
    secretaryName: typeof source.secretaryName === 'string' ? source.secretaryName : '',
  }
}

export function normalizeNoticeSettingsStore(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  return Object.fromEntries(
    Object.entries(input)
      .filter(([, schemeSettings]) => schemeSettings && typeof schemeSettings === 'object' && !Array.isArray(schemeSettings))
      .map(([schemeId, schemeSettings]) => [
        schemeId,
        Object.fromEntries(
          Object.entries(schemeSettings)
            .filter(([, rowSettings]) => rowSettings && typeof rowSettings === 'object' && !Array.isArray(rowSettings))
            .map(([rowId, rowSettings]) => [rowId, normalizeNoticeRowSettings(rowSettings)]),
        ),
      ]),
  )
}

export function getNoticeRowId(scheduledMeeting) {
  return scheduledMeeting?.meetingId && scheduledMeeting?.frequency !== 'adhoc'
    ? `meeting:${scheduledMeeting.meetingId}`
    : `adhoc:${scheduledMeeting?.id ?? ''}`
}

export function resolveNoticeRowSource(scheduledMeeting, meetingMap, schemeSettings = {}) {
  const rowId = getNoticeRowId(scheduledMeeting)
  const sourceMeeting = scheduledMeeting?.meetingId
    ? meetingMap.get(scheduledMeeting.meetingId) ?? null
    : null
  const isIndependent = scheduledMeeting?.frequency === 'adhoc' || !sourceMeeting
  const settings = !isIndependent
    ? normalizeNoticeRowSettings({
        templateKey: sourceMeeting.notificationTemplateKey,
        executiveName: sourceMeeting.notificationConfig?.executiveName,
        secretaryName: sourceMeeting.notificationConfig?.secretaryName,
    })
    : normalizeNoticeRowSettings(schemeSettings[rowId])

  return { rowId, sourceMeeting, settings, isIndependent }
}

export function buildNoticeContextMeeting(sourceMeeting, scheduledMeeting, settings) {
  const normalizedSettings = normalizeNoticeRowSettings(settings)

  return {
    ...(sourceMeeting ?? {}),
    name: sourceMeeting?.name ?? scheduledMeeting?.name ?? '',
    attendees: sourceMeeting?.attendees ?? scheduledMeeting?.attendees ?? '',
    notes: sourceMeeting?.notes ?? scheduledMeeting?.notes ?? '',
    notificationTemplateKey: normalizedSettings.templateKey,
    notificationConfig: {
      ...(sourceMeeting?.notificationConfig ?? {}),
      executiveName: normalizedSettings.executiveName,
      secretaryName: normalizedSettings.secretaryName,
    },
  }
}
