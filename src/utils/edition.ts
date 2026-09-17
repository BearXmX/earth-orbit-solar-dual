export type AppEdition = 'standard' | 'sundial' | 'city'

const configuredEdition = String(import.meta.env.VITE_APP_EDITION ?? 'advanced')

export const appEdition: AppEdition = configuredEdition === 'standard'
  ? 'standard'
  : configuredEdition === 'city'
    ? 'city'
    : 'sundial'

export const isAdvancedEdition = appEdition !== 'standard'
export const solarSceneObject = appEdition === 'city' ? 'city' : 'city'
export const editionLabel = appEdition === 'standard'
  ? '标准版'
  : appEdition === 'city'
    ? '进阶城市版'
    : '进阶日晷版'
