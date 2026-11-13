import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { STORAGE_NAMESPACE, STORAGE_PREFIX, scopedLocalStorage, scopedSessionStorage, decodeStorageEventKey } from '../src/lib/scopedStorage.js'
import { persistJson, inspectStoredJson, commitStorageTransaction } from '../src/lib/persistence.js'
import { MODULE_STORAGE_KEYS, readModuleBackupData, restoreModuleBackupData, getModuleStorageEntries, saveRecoveryPoint, readRecoveryPoint, recordBackupTime, readBackupTime } from '../src/lib/backupData.js'
import installBrowserAiScheduler from '../src/lib/browserAiScheduler.js'

class MemoryStorage {
  values = new Map()
  get length() { return this.values.size }
  key(index) { return [...this.values.keys()][index] ?? null }
  getItem(key) { return this.values.get(String(key)) ?? null }
  setItem(key, value) { this.values.set(String(key), String(value)) }
  removeItem(key) { this.values.delete(String(key)) }
  clear() { this.values.clear() }
}

const local = new MemoryStorage()
const session = new MemoryStorage()
globalThis.window = { localStorage: local, sessionStorage: session, dispatchEvent() {} }
assert.equal(STORAGE_NAMESPACE, 'eo-v47-preview')
const businessKey = 'meeting-manager:optimized-demo:v1'
const configKey = 'meeting-manager-browser-ai-config'
const jobsKey = 'meeting-manager-browser-ai-jobs'
const recoveryKey = 'meeting-manager:recovery-point:v1'
const backupTimeKey = 'meeting-manager:ui:last-backup-at:v1'
const accessKey = 'meeting-manager:access-unlocked:v1'
const scrollKey = 'meeting-manager:ui:scroll:home:'
const productionValues = new Map([
  [businessKey, JSON.stringify({ meetings: [{ id: 'production-meeting' }], contacts: [] })],
  [configKey, JSON.stringify({ providers: { openai: { apiKey: 'production-test-marker' } } })],
  [jobsKey, JSON.stringify([{ id: 'production-job', status: 'completed' }])],
  [recoveryKey, JSON.stringify({ savedAt: '2026-11-01', payload: { meetings: [] } })],
  [backupTimeKey, '2026-11-01'],
  [MODULE_STORAGE_KEYS.timeAnalysisRecords, JSON.stringify([{ id: 'production-record' }])],
  ['meeting-manager:time-analysis-tracked-groups:v4', JSON.stringify(['production-group'])],
])
for (const [key, value] of productionValues) local.setItem(key, value)
session.setItem(accessKey, 'unlocked')
session.setItem(scrollKey, '200')
const foreignKey = 'eo-storage:another-preview:' + businessKey
local.setItem(foreignKey, 'foreign-value')

// No raw production state, configuration, recovery point, or session is inherited.
for (const key of productionValues.keys()) assert.equal(scopedLocalStorage.getItem(key), null)
assert.equal(scopedLocalStorage.length, 0)
assert.equal(scopedSessionStorage.getItem(accessKey), null)
assert.equal(scopedSessionStorage.getItem(scrollKey), null)
assert.equal(readRecoveryPoint(), null)
assert.equal(readBackupTime(), '')
assert(Object.values(readModuleBackupData()).every(value => value === null))
assert.equal(inspectStoredJson([businessKey]).failed, false)
assert.equal(persistJson(businessKey, { meetings: [{ id: 'preview-meeting' }] }), true)
assert.deepEqual(JSON.parse(local.getItem(STORAGE_PREFIX + businessKey)).meetings, [{ id: 'preview-meeting' }])

// The actual browser scheduler also starts with its own empty queue and configuration.
installBrowserAiScheduler()
assert.deepEqual(await window.aiScheduler.listJobs(), [])
assert.equal((await window.aiScheduler.getConfig()).providers.openai.hasApiKey, false)
await window.aiScheduler.saveApiKey({ provider: 'openai', apiKey: 'preview-test-marker' })
assert.equal((await window.aiScheduler.getConfig()).providers.openai.hasApiKey, true)
await window.aiScheduler.registerImportedJob({ id: 'preview-job', provider: 'imported', result: { scheduledMeetings: [] } })
assert.deepEqual((await window.aiScheduler.listJobs()).map(job => job.id), ['preview-job'])
assert.equal(await window.aiScheduler.getJob('production-job'), null)
await window.aiScheduler.deleteJob('preview-job')
assert.deepEqual(await window.aiScheduler.listJobs(), [])
await window.aiScheduler.clearApiKey('openai')
assert.equal((await window.aiScheduler.getConfig()).providers.openai.hasApiKey, false)

// Existing backup field names are portable: explicit manual import writes preview keys only.
const manualBackup = JSON.parse(JSON.stringify({
  version: 'v4.5', schemaVersion: 1,
  meetings: [{ id: 'manually-imported-meeting' }], contacts: [], scheduled: [],
  moduleData: {
    timeAnalysisRecords: [{ id: 'manually-imported-record' }],
    timeAnalysisFilters: { query: '经营' },
    timeAnalysisSavedViews: [], timeAnalysisTrackedGroups: ['manual-group'],
    browserAiJobs: [{ id: 'manually-imported-job', status: 'completed' }],
  },
}))
const entries = getModuleStorageEntries(manualBackup.moduleData)
assert(entries.every(([key]) => !key.startsWith(STORAGE_PREFIX)))
commitStorageTransaction([
  [businessKey, { meetings: manualBackup.meetings, contacts: manualBackup.contacts, scheduled: manualBackup.scheduled }],
  ...entries,
])
assert.deepEqual(readModuleBackupData(), manualBackup.moduleData)
assert.deepEqual(JSON.parse(scopedLocalStorage.getItem(businessKey)).meetings, manualBackup.meetings)
assert(!JSON.stringify(readModuleBackupData()).includes(STORAGE_PREFIX))
assert.equal(saveRecoveryPoint(manualBackup), true)
assert.deepEqual(readRecoveryPoint().payload, manualBackup)
const backupTime = recordBackupTime()
assert.equal(readBackupTime(), backupTime)
restoreModuleBackupData({ timeAnalysisRecords: null })
assert.equal(scopedLocalStorage.getItem(MODULE_STORAGE_KEYS.timeAnalysisRecords), null)

// Legacy fallback stays within the preview namespace; it never migrates original keys.
scopedLocalStorage.removeItem(MODULE_STORAGE_KEYS.timeAnalysisTrackedGroups)
assert.equal(readModuleBackupData().timeAnalysisTrackedGroups, null)
scopedLocalStorage.setItem('meeting-manager:time-analysis-tracked-groups:v4', JSON.stringify(['preview-v4-group']))
assert.deepEqual(readModuleBackupData().timeAnalysisTrackedGroups, ['preview-v4-group'])

// Storage events identify only the matching namespace and local backend, including hyphen keys.
for (const key of [businessKey, configKey, jobsKey]) {
  assert.equal(decodeStorageEventKey(STORAGE_PREFIX + key, local), key)
  assert.equal(decodeStorageEventKey(key, local), null)
}
assert.equal(decodeStorageEventKey(foreignKey, local), null)
assert.equal(decodeStorageEventKey(null, local), null)
assert.equal(decodeStorageEventKey(STORAGE_PREFIX + businessKey, session), null)

// Session values, enumeration, removal, and clear are all scoped independently.
scopedSessionStorage.setItem(accessKey, 'unlocked')
scopedSessionStorage.setItem(scrollKey, 400)
assert.equal(session.getItem(STORAGE_PREFIX + scrollKey), '400')
assert.equal(scopedSessionStorage.length, 2)
assert.equal(scopedSessionStorage.key(0), accessKey)
assert.equal(scopedSessionStorage.key(1), scrollKey)
assert.equal(scopedSessionStorage.key(2), null)
scopedSessionStorage.removeItem(scrollKey)
assert.equal(scopedSessionStorage.length, 1)
scopedSessionStorage.clear()
assert.equal(scopedSessionStorage.length, 0)
assert.equal(session.getItem(accessKey), 'unlocked')
assert.equal(session.getItem(scrollKey), '200')
scopedLocalStorage.clear()
assert.equal(scopedLocalStorage.length, 0)
assert.equal(scopedLocalStorage.key(0), null)
assert.equal(local.getItem(foreignKey), 'foreign-value')
for (const [key, value] of productionValues) assert.equal(local.getItem(key), value)

// Wrappers resolve the current window backend instead of capturing an obsolete Storage object.
const replacement = new MemoryStorage()
window.localStorage = replacement
scopedLocalStorage.setItem('dynamic', 'current-window')
assert.equal(replacement.getItem(STORAGE_PREFIX + 'dynamic'), 'current-window')
assert.equal(local.getItem(STORAGE_PREFIX + 'dynamic'), null)
window.localStorage = local

// Emulate Vite's env substitution to verify custom and blank namespace build branches.
const source = await readFile(new URL('../src/lib/scopedStorage.js', import.meta.url), 'utf8')
async function configuredModule(namespace) {
  const configuredSource = source.replace('import.meta.env?.VITE_STORAGE_NAMESPACE', JSON.stringify(namespace))
  return import('data:text/javascript;base64,' + Buffer.from(configuredSource).toString('base64'))
}
const custom = await configuredModule('other preview/中文')
assert.equal(custom.STORAGE_NAMESPACE, 'other preview/中文')
custom.scopedLocalStorage.setItem(businessKey, 'custom-only')
assert.equal(local.getItem(custom.STORAGE_PREFIX + businessKey), 'custom-only')
assert.equal(scopedLocalStorage.getItem(businessKey), null)
assert.equal(decodeStorageEventKey(custom.STORAGE_PREFIX + businessKey, local), null)
assert.equal((await configuredModule('  ')).STORAGE_NAMESPACE, 'eo-v47-preview')
for (const [key, value] of productionValues) assert.equal(local.getItem(key), value)
console.log('PASS · 默认/自定义空间、业务/队列/配置/备份/会话隔离、手动导入、动态后端、枚举与清理及跨窗口事件')
