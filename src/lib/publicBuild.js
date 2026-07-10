export const IS_PUBLIC_EMPTY_BUILD = import.meta.env.VITE_PUBLIC_EMPTY_DATA === 'true'

const PUBLIC_EMPTY_MARKER_KEY = 'meeting-manager:public-data-reset:v4.0-private-blank'

const PUBLIC_DATA_KEYS = [
  'meeting-manager:optimized-demo:v1',
  'meeting-manager:ai-scheduler:v1',
  'meeting-manager:review:v1',
  'meeting-manager:logs:v1',
  'meeting-manager:planning-tasks:v1',
  'meeting-manager:reserve-notice-scheme-status:v1',
  'meeting-manager:time-analysis-records:v2',
  'meeting-manager:time-analysis-filters:v1',
  'meeting-manager:time-analysis-saved-views:v1',
  'meeting-manager:time-analysis-tracked-groups:v4',
  'meeting-manager-browser-ai-jobs',
]

export function resetPublicBuildDataOnce() {
  if (!IS_PUBLIC_EMPTY_BUILD || typeof window === 'undefined') return

  if (window.localStorage.getItem(PUBLIC_EMPTY_MARKER_KEY) === 'done') return

  PUBLIC_DATA_KEYS.forEach((key) => {
    window.localStorage.removeItem(key)
  })

  window.localStorage.setItem(PUBLIC_EMPTY_MARKER_KEY, 'done')
}
