import packageMetadata from '../../package.json'

export const APP_VERSION = packageMetadata.version
export const APP_VERSION_LABEL = `V${APP_VERSION.split('.').slice(0, 2).join('.')}`
export const BACKUP_SCHEMA_VERSION = 2
