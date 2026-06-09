export const IS_PUBLIC_EMPTY_BUILD = import.meta.env.VITE_PUBLIC_EMPTY_DATA === 'true'
export const IS_PUBLIC_DEMO_BUILD = import.meta.env.VITE_PUBLIC_DEMO_DATA === 'true'

const PUBLIC_EMPTY_MARKER_KEY = 'meeting-manager:public-data-reset:v3.5-demo'

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
  window.localStorage.setItem(PUBLIC_EMPTY_MARKER_KEY, 'done')
}
