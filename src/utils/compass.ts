import { formatDegreesMinutes } from './astronomy'

export const COMPASS_DIRECTIONS = [
  { key: 'N', label: '北', bearing: 0 },
  { key: 'NE', label: '东北', bearing: 45 },
  { key: 'E', label: '东', bearing: 90 },
  { key: 'SE', label: '东南', bearing: 135 },
  { key: 'S', label: '南', bearing: 180 },
  { key: 'SW', label: '西南', bearing: 225 },
  { key: 'W', label: '西', bearing: 270 },
  { key: 'NW', label: '西北', bearing: 315 },
] as const

/** 方位角由北起算，顺时针为正。无效输入仅用于未定状态的北向占位。 */
export function normalizeCompassHeading(heading: number) {
  return Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0
}

/** heading 对应屏幕上方；方位文字只移动位置，不随圆盘旋转。 */
export function compassPoint(bearing: number, heading: number, radius: number, center = 110) {
  const angle = (normalizeCompassHeading(bearing) - normalizeCompassHeading(heading)) * Math.PI / 180
  return {
    x: center + Math.sin(angle) * radius,
    y: center - Math.cos(angle) * radius,
  }
}

export function compassDirection(heading: number) {
  return COMPASS_DIRECTIONS[Math.round(normalizeCompassHeading(heading) / 45) % 8]!
}

export function formatCompassHeading(heading: number) {
  const rounded = Math.round(normalizeCompassHeading(heading) * 60) / 60
  return formatDegreesMinutes(normalizeCompassHeading(rounded))
}
