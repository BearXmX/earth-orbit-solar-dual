/** 黄赤交角的默认值与教学调节上限（角分精度）。 */
export const MAX_OBLIQUITY_MINUTES = 23 * 60 + 26
export const AXIAL_TILT = 23 + 26 / 60
export const AXIAL_TILT_LABEL = '23°26′'
export const POLAR_CIRCLE = 90 - AXIAL_TILT
export const POLAR_CIRCLE_LABEL = '66°34′'

export function formatDegreesMinutes(degrees: number) {
  if (!Number.isFinite(degrees)) return '—'
  const minutes = Math.round(Math.abs(degrees) * 60)
  return `${degrees < 0 && minutes ? '−' : ''}${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, '0')}′`
}

/** Signed angular readout, rounded once to the nearest arcminute (including degree carries). */
export function formatSignedDegreesMinutes(degrees: number) {
  const formatted = formatDegreesMinutes(degrees)
  return degrees > 0 && formatted !== '0°00′' && Number.isFinite(degrees) ? `+${formatted}` : formatted
}

export function latitudeMagnitudeLabel(value: number) {
  const magnitude = Math.abs(value)
  if (Math.abs(magnitude - AXIAL_TILT) < 1e-6) return AXIAL_TILT_LABEL
  if (Math.abs(magnitude - POLAR_CIRCLE) < 1e-6) return POLAR_CIRCLE_LABEL
  return `${magnitude.toFixed(2)}°`
}
