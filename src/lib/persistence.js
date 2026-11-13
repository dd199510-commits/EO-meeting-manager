import { scopedLocalStorage } from './scopedStorage.js'
const failures = new Map()
const blocked = new Set()
let lastSavedAt = ''
let externalChange = false
export const PERSISTENCE_EVENT = 'meeting-manager:persistence'

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PERSISTENCE_EVENT))
}

export function getPersistenceStatus() {
  return { failed: failures.size > 0, failures: [...failures.entries()], lastSavedAt, externalChange }
}

export function inspectStoredJson(keys) {
  for (const key of keys) {
    try {
      const raw = scopedLocalStorage.getItem(key)
      if (raw !== null) JSON.parse(raw)
    } catch {
      blocked.add(key)
      failures.set(key, '存档读取失败，原始内容已保留，请恢复备份或先导出当前数据。')
    }
  }
  return getPersistenceStatus()
}

export function blockStorageKey(key) {
  blocked.add(key)
  failures.set(key, '原存档无法解析，已暂停覆盖，请恢复备份。')
}

export function persistJson(key, value) {
  if (externalChange) return false
  if (blocked.has(key)) { announce(); return false }
  try {
    scopedLocalStorage.setItem(key, JSON.stringify(value))
    failures.delete(key)
    lastSavedAt = new Date().toISOString()
    announce()
    return true
  } catch {
    failures.set(key, '本地空间不足或浏览器限制了存储。请立即导出备份。')
    announce()
    return false
  }
}

export function pauseForExternalChange() {
  externalChange = true
  announce()
}

// A synchronous write group rolls back on failure before React state is replaced.
export function commitStorageTransaction(entries) {
  if (externalChange) throw new Error('其他窗口修改了数据，请先导出当前工作并重新打开应用。')
  const previous = new Map(entries.map(([key]) => [key, scopedLocalStorage.getItem(key)]))
  try {
    for (const [key, value] of entries) {
      if (value === null) scopedLocalStorage.removeItem(key)
      else scopedLocalStorage.setItem(key, JSON.stringify(value))
    }
  } catch (error) {
    let rollbackFailed = false
    // Release the replacement values before restoring larger previous values.
    for (const [key] of previous) {
      try { scopedLocalStorage.removeItem(key) } catch { rollbackFailed = true }
    }
    for (const [key, value] of previous) {
      try {
        if (value === null) scopedLocalStorage.removeItem(key)
        else scopedLocalStorage.setItem(key, value)
      } catch { rollbackFailed = true }
    }
    throw new Error(rollbackFailed
      ? '存储写入失败，部分回滚未完成，请保留恢复前快照并导出当前工作。'
      : '存储空间不足，恢复已取消并回滚，请先导出当前数据、清理空间后重试。', { cause: error })
  }
  for (const [key] of entries) { blocked.delete(key); failures.delete(key) }
  lastSavedAt = new Date().toISOString()
  announce()
}
