import assert from 'node:assert/strict'
import {
  buildNoticeContextMeeting,
  normalizeNoticeSettingsStore,
  resolveNoticeRowSource,
} from '../src/features/reserveNotice/noticeSettings.js'

const libraryMeeting = {
  id: 'library-meeting-1',
  name: '重名的不定期会议',
  notificationTemplateKey: 'general',
  notificationConfig: {
    executiveName: '会议库高管',
    secretaryName: '会议库秘书',
  },
}
const meetingMap = new Map([[libraryMeeting.id, libraryMeeting]])
const adhocMeeting = {
  id: 'adhoc-meeting-1',
  meetingId: '',
  name: libraryMeeting.name,
  attendees: '临时参会人',
  notes: '本次排程备注',
}
const settingsStore = normalizeNoticeSettingsStore({
  'scheme-1': {
    'adhoc:adhoc-meeting-1': {
      templateKey: 'one_on_one_exec',
      executiveName: '本次排程高管',
      secretaryName: '本次排程秘书',
    },
  },
})

const adhocResolution = resolveNoticeRowSource(
  adhocMeeting,
  meetingMap,
  settingsStore['scheme-1'],
)
assert.equal(adhocResolution.rowId, 'adhoc:adhoc-meeting-1')
assert.equal(adhocResolution.sourceMeeting, null, '不应按会议名称关联会议库')
assert.equal(adhocResolution.isIndependent, true)
assert.equal(adhocResolution.settings.templateKey, 'one_on_one_exec')

const adhocContext = buildNoticeContextMeeting(
  adhocResolution.sourceMeeting,
  adhocMeeting,
  adhocResolution.settings,
)
assert.equal(adhocContext.name, libraryMeeting.name)
assert.equal(adhocContext.notificationConfig.executiveName, '本次排程高管')
assert.equal(libraryMeeting.notificationConfig.executiveName, '会议库高管')
assert.equal(libraryMeeting.notificationTemplateKey, 'general')

const linkedResolution = resolveNoticeRowSource(
  { ...adhocMeeting, id: 'linked-occurrence-1', meetingId: libraryMeeting.id, frequency: 'monthly' },
  meetingMap,
  {
    'meeting:library-meeting-1': {
      templateKey: 'monthly_general',
      executiveName: '不应覆盖会议库',
      secretaryName: '不应覆盖会议库',
    },
  },
)
assert.equal(linkedResolution.sourceMeeting, libraryMeeting)
assert.equal(linkedResolution.isIndependent, false)
assert.equal(linkedResolution.settings.templateKey, 'general')
assert.equal(linkedResolution.settings.executiveName, '会议库高管')

const linkedAdhocResolution = resolveNoticeRowSource(
  { ...adhocMeeting, id: 'linked-adhoc-1', meetingId: libraryMeeting.id, frequency: 'adhoc' },
  meetingMap,
  {
    'adhoc:linked-adhoc-1': {
      templateKey: 'monthly_general',
      executiveName: '关联不定期独立高管',
      secretaryName: '关联不定期独立秘书',
    },
  },
)
assert.equal(linkedAdhocResolution.rowId, 'adhoc:linked-adhoc-1')
assert.equal(linkedAdhocResolution.sourceMeeting, libraryMeeting, '可读取关联会议资料')
assert.equal(linkedAdhocResolution.isIndependent, true, '不定期排程不应回写会议库')
assert.equal(linkedAdhocResolution.settings.templateKey, 'monthly_general')
assert.equal(libraryMeeting.notificationTemplateKey, 'general')

console.log('预留通知独立配置验证通过：重名不定期排程不会关联或修改会议库。')
