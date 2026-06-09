import demoLibrary from './demoDatabase.json'

export const INITIAL_CONTACTS = Array.isArray(demoLibrary.contacts) ? demoLibrary.contacts : []
export const INITIAL_MEETINGS = Array.isArray(demoLibrary.meetings) ? demoLibrary.meetings : []
export const INITIAL_SCHEDULED = Array.isArray(demoLibrary.scheduled) ? demoLibrary.scheduled : []
