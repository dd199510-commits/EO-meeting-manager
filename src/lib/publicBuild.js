export const IS_PUBLIC_EMPTY_BUILD = import.meta.env.VITE_PUBLIC_EMPTY_DATA === 'true'

export function resetPublicBuildDataOnce() {
  // Empty builds change the seed, never delete existing device-local work.
}
