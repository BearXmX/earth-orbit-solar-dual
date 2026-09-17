import { AXIAL_TILT } from './astronomy'

const DEG = Math.PI / 180
const TERM_DAYS = [79, 172, 266, 356, 444]

/** 教学年以四个分至日为四分之一圈的边界，跨年保持连续。 */
export function orbitAngleAtDay(day: number) {
  const wrapped = 1 + ((day - 1) % 365 + 365) % 365
  const position = wrapped < TERM_DAYS[0]! ? wrapped + 365 : wrapped
  let quarter = 0
  while (quarter < 3 && position >= TERM_DAYS[quarter + 1]!) quarter++
  const fraction = (position - TERM_DAYS[quarter]!) / (TERM_DAYS[quarter + 1]! - TERM_DAYS[quarter]!)
  return -Math.PI / 2 - (quarter + fraction) * Math.PI / 2
}

/** 与 Rz(-倾角) 的 Three.js 地轴及指向原点的平行太阳光完全一致。 */
export function declinationAtDay(day: number, axialTilt = AXIAL_TILT) {
  const sine = -Math.cos(orbitAngleAtDay(day)) * Math.sin(axialTilt * DEG)
  return Math.asin(Math.max(-1, Math.min(1, sine))) / DEG
}

export function solarLongitudeAtDay(day: number, axialTilt = AXIAL_TILT) {
  const theta = orbitAngleAtDay(day)
  return Math.atan2(Math.sin(theta), -Math.cos(theta) * Math.cos(axialTilt * DEG))
}
