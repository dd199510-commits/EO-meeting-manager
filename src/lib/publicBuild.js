import demoDatabase from '../data/demoDatabase.json'

export const IS_PUBLIC_EMPTY_BUILD = import.meta.env.VITE_PUBLIC_EMPTY_DATA === 'true'
export const IS_PUBLIC_DEMO_BUILD = import.meta.env.VITE_PUBLIC_DEMO_DATA === 'true'

const PUBLIC_EMPTY_MARKER_KEY = 'meeting-manager:public-data-reset:v3.5-demo-20260609-145558'

const PUBLIC_DATA_KEYS = [
  'meeting-manager:optimized-demo:v1',
  'meeting-manager:ai-scheduler:v1',
  'meeting-manager:review:v1',
  'meeting-manager:logs:v1',
  'meeting-manager:planning-tasks:v1',
  'meeting-manager:reserve-notice-scheme-status:v1',
  'meeting-manager-browser-ai-jobs',
]

export function resetPublicBuildDataOnce() {
  if ((!IS_PUBLIC_EMPTY_BUILD && !IS_PUBLIC_DEMO_BUILD) || typeof window === 'undefined') return

  if (window.localStorage.getItem(PUBLIC_EMPTY_MARKER_KEY) === 'done') return

  PUBLIC_DATA_KEYS.forEach((key) => {
    window.localStorage.removeItem(key)
  })

  if (IS_PUBLIC_DEMO_BUILD) {
    window.localStorage.setItem('meeting-manager:optimized-demo:v1', JSON.stringify({
      meetings: Array.isArray(demoDatabase.meetings) ? demoDatabase.meetings : [],
      scheduled: Array.isArray(demoDatabase.scheduled) ? demoDatabase.scheduled : [],
      contacts: Array.isArray(demoDatabase.contacts) ? demoDatabase.contacts : [],
      noticeTemplates: Array.isArray(demoDatabase.noticeTemplates) ? demoDatabase.noticeTemplates : [],
      disabledNoticeTemplateKeys: Array.isArray(demoDatabase.disabledNoticeTemplateKeys)
        ? demoDatabase.disabledNoticeTemplateKeys
        : [],
    }))
    if (demoDatabase.aiState) {
      window.localStorage.setItem('meeting-manager:ai-scheduler:v1', JSON.stringify(demoDatabase.aiState))
    }
    if (demoDatabase.reviewState) {
      window.localStorage.setItem('meeting-manager:review:v1', JSON.stringify(demoDatabase.reviewState))
    }
    if (Array.isArray(demoDatabase.logs)) {
      window.localStorage.setItem('meeting-manager:logs:v1', JSON.stringify(demoDatabase.logs))
    }
    if (Array.isArray(demoDatabase.planningTasks)) {
      window.localStorage.setItem('meeting-manager:planning-tasks:v1', JSON.stringify(demoDatabase.planningTasks))
    }
    if (demoDatabase.reserveNoticeSchemeStatus) {
      window.localStorage.setItem(
        'meeting-manager:reserve-notice-scheme-status:v1',
        JSON.stringify(demoDatabase.reserveNoticeSchemeStatus),
      )
    }
  }

  window.localStorage.setItem(PUBLIC_EMPTY_MARKER_KEY, 'done')
}
