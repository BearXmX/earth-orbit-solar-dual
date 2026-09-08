import { Vector3 } from 'three'

const DEG = Math.PI / 180

/** 本地坐标：x 向西，y 向上，z 向北。 */
export function sunDirection(altitude: number, azimuth: number) {
  return new Vector3(
    -Math.sin(azimuth * DEG) * Math.cos(altitude * DEG),
    Math.sin(altitude * DEG),
    Math.cos(azimuth * DEG) * Math.cos(altitude * DEG),
  )
}

/** 天球以当地观测原点为中心，光线与高度角使用同一个太阳方向。 */
export function solarAltitudeGuide(altitude: number, azimuth: number, skyRadius: number) {
  const direction = sunDirection(altitude, azimuth)
  return {
    direction,
    horizontal: sunDirection(0, azimuth),
    sunPosition: direction.clone().multiplyScalar(skyRadius),
  }
}

export function polarAxis(latitude: number) {
  return new Vector3(0, Math.sin(latitude * DEG), Math.cos(latitude * DEG))
}

export function solarPathDirection(latitude: number, declination: number, hour: number) {
  const phi = latitude * DEG
  const delta = declination * DEG
  const h = (hour - 12) * 15 * DEG
  return new Vector3(
    Math.cos(delta) * Math.sin(h),
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h),
    Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(h),
  )
}

export function sundialIllumination(latitude: number, altitude: number, azimuth: number) {
  const sun = sunDirection(altitude, azimuth)
  const normal = polarAxis(latitude)
  const incidence = sun.dot(normal)
  const face = incidence >= 0 ? 1 : -1
  const status = altitude <= 0 ? 'night' : Math.abs(incidence) < Math.sin(0.1 * DEG) ? 'parallel' : 'readable'
  return { sun, normal, incidence, face, status } as const
}

export function sundialReadingNotice(latitude: number, altitude: number, azimuth: number) {
  const { status, face } = sundialIllumination(latitude, altitude, azimuth)
  if (status === 'night') return {
    status, title: '夜间：日晷无法读数',
    detail: '太阳在地平线或以下，没有直射阳光形成可读针影。',
  }
  if (status === 'parallel') return {
    status, title: '春秋分前后：针影不清晰',
    detail: '阳光近乎平行于晷面，暂时无法形成清晰针影。',
  }
  const faceName = face > 0 ? '朝北天极面' : '朝南天极面'
  const surface = Math.abs(latitude) < 0.01 ? '竖直晷面' : latitude * face > 0 ? '上表面' : '下表面'
  return {
    status, title: `当前受光面：${surface}`,
    detail: `${surface === '下表面' ? '当地冬半年，' : ''}${faceName}受光，针影在这一面；可拖动场景查看。`,
  }
}

/** 将受光一侧的有限长晷针沿平行太阳光投影到赤道平面，再裁剪到真实盘缘。 */
export function equatorialShadow(latitude: number, altitude: number, azimuth: number, radius: number, pinLength: number) {
  const { sun, normal, incidence, face, status } = sundialIllumination(latitude, altitude, azimuth)
  if (status !== 'readable') return { status, face, endpoint: null }

  const projected = sun.clone().addScaledVector(normal, -incidence).multiplyScalar(-pinLength / Math.abs(incidence))
  projected.clampLength(0, radius)
  // 晷盘局部 x 向西，y 位于当地子午面内，z 指向北天极。
  const dialY = new Vector3(0, Math.cos(latitude * DEG), -Math.sin(latitude * DEG))
  return { status: 'readable' as const, face, endpoint: { x: projected.x, y: projected.dot(dialY) } }
}
