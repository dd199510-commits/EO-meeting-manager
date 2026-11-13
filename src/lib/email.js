export function isValidEmail(value) {
  const text = String(value ?? '').trim()
  return /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(text)
}
