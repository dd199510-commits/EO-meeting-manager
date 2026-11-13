export const IS_PUBLIC_EMPTY_BUILD = import.meta.env.VITE_PUBLIC_EMPTY_DATA === 'true'

export function resetPublicBuildDataOnce() {
  // A version rollback must never erase device-local meetings or schedules.
  // Public builds select empty seeds for new workspaces without resetting saved data.
}
