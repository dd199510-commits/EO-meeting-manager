const RECOVERY_STORAGE_KEY = 'meeting-manager:recovery-point:v1'

export const MODULE_STORAGE_KEYS = {
  timeAnalysisRecords: 'meeting-manager:time-analysis-records:v2',
  timeAnalysisFilters: 'meeting-manager:time-analysis-filters:v1',
  timeAnalysisSavedViews: 'meeting-manager:time-analysis-saved-views:v1',
  timeAnalysisTrackedGroups: 'meeting-manager:time-analysis-tracked-groups:v4',
  browserAiJobs: 'meeting-manager-browser-ai-jobs',
}

function parseStoredValue(rawValue) {
  if (rawValue == null) return null

  try {
    return JSON.parse(rawValue)
  } catch {
    return rawValue
  }
}

export function readModuleBackupData() {
  return Object.fromEntries(
    Object.entries(MODULE_STORAGE_KEYS).map(([name, storageKey]) => [
      name,
      parseStoredValue(window.localStorage.getItem(storageKey)),
    ]),
  )
}

export function restoreModuleBackupData(moduleData) {
  if (!moduleData || typeof moduleData !== 'object') return

  Object.entries(MODULE_STORAGE_KEYS).forEach(([name, storageKey]) => {
    if (!Object.prototype.hasOwnProperty.call(moduleData, name)) return

    const value = moduleData[name]
    if (value == null) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(value))
  })
}

export function saveRecoveryPoint(payload) {
  try {
    window.localStorage.setItem(
      RECOVERY_STORAGE_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), payload }),
    )
    return true
  } catch {
    return false
  }
}
