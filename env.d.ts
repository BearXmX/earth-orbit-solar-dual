/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_EDITION?: 'standard' | 'advanced' | 'city'
  readonly VITE_ANGLE_FORMAT?: 'dms' | 'decimal'
}
