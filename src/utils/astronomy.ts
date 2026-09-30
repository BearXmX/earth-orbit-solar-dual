/** 编译时选择教学口径；无 Vite 环境的计算测试仍使用默认度分版。 */
export const ANGLE_FORMAT = import.meta.env?.VITE_ANGLE_FORMAT === 'decimal' ? 'decimal' : 'dms'
export const IS_DECIMAL_ANGLE = ANGLE_FORMAT === 'decimal'
/** 控件内部仍使用角分，默认值和计算上限随教学版本一起切换。 */
export const MAX_OBLIQUITY_MINUTES = 23 * 60 + (IS_DECIMAL_ANGLE ? 30 : 26)
export const AXIAL_TILT = MAX_OBLIQUITY_MINUTES / 60
export const AXIAL_TILT_LABEL = formatDegreesMinutes(AXIAL_TILT)
export const POLAR_CIRCLE = 90 - AXIAL_TILT
export const POLAR_CIRCLE_LABEL = formatDegreesMinutes(POLAR_CIRCLE)

export function formatDegreesMinutes(degrees: number) {
  if (!Number.isFinite(degrees)) return '—'
  if (IS_DECIMAL_ANGLE) {
    const tenths = Math.round(Math.abs(degrees) * 10)
    return `${degrees < 0 && tenths ? '−' : ''}${(tenths / 10).toFixed(1)}°`
  }
  const minutes = Math.round(Math.abs(degrees) * 60)
  return `${degrees < 0 && minutes ? '−' : ''}${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, '0')}′`
}

/** Signed angular readout in the selected precision, without positive or negative rounded zero. */
export function formatSignedDegreesMinutes(degrees: number) {
  const formatted = formatDegreesMinutes(degrees)
  return degrees > 0 && formatted !== formatDegreesMinutes(0) && Number.isFinite(degrees) ? `+${formatted}` : formatted
}

export function latitudeMagnitudeLabel(value: number) {
  const magnitude = Math.abs(value)
  if (IS_DECIMAL_ANGLE) return formatDegreesMinutes(magnitude)
  if (Math.abs(magnitude - AXIAL_TILT) < 1e-6) return AXIAL_TILT_LABEL
  if (Math.abs(magnitude - POLAR_CIRCLE) < 1e-6) return POLAR_CIRCLE_LABEL
  return `${magnitude.toFixed(2)}°`
}
