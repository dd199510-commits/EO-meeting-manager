// The preview never reads unprefixed production keys, including when no build env is supplied.
const DEFAULT_NAMESPACE = 'eo-v47-preview'
const configuredNamespace = String(import.meta.env?.VITE_STORAGE_NAMESPACE || '').trim()
export const STORAGE_NAMESPACE = configuredNamespace || DEFAULT_NAMESPACE
export const STORAGE_PREFIX = `eo-storage:${encodeURIComponent(STORAGE_NAMESPACE)}:`

function storageFor(kind) {
  // Resolve on each operation so browser permission errors and test windows stay observable.
  return window[kind]
}

function scopedKey(key) {
  return STORAGE_PREFIX + String(key)
}

function ownRawKeys(kind) {
  const storage = storageFor(kind)
  const keys = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (typeof key === 'string' && key.startsWith(STORAGE_PREFIX)) keys.push(key)
  }
  return keys
}

function createScopedStorage(kind) {
  return Object.freeze({
    getItem(key) { return storageFor(kind).getItem(scopedKey(key)) },
    setItem(key, value) { storageFor(kind).setItem(scopedKey(key), String(value)) },
    removeItem(key) { storageFor(kind).removeItem(scopedKey(key)) },
    key(index) {
      const rawKey = ownRawKeys(kind)[Number(index) >>> 0]
      return rawKey === undefined ? null : rawKey.slice(STORAGE_PREFIX.length)
    },
    get length() { return ownRawKeys(kind).length },
    clear() {
      const storage = storageFor(kind)
      for (const key of ownRawKeys(kind)) storage.removeItem(key)
    },
  })
}

export const scopedLocalStorage = createScopedStorage('localStorage')
export const scopedSessionStorage = createScopedStorage('sessionStorage')

// A native clear event has no key and cannot be attributed to a namespace, so ignore it.
// When supplied, storageArea also excludes session-only events from business change detection.
export function decodeStorageEventKey(key, storageArea) {
  if (typeof key !== 'string' || !key.startsWith(STORAGE_PREFIX)) return null
  if (storageArea && storageArea !== storageFor('localStorage')) return null
  return key.slice(STORAGE_PREFIX.length)
}
