const TAU = Math.PI * 2

export function wrapOrbitDay(day: number) {
  return 1 + ((((day - 1) % 365) + 365) % 365)
}

/** 独立推进两种运动；公转可额外加速供课堂观察，设为 1 时保持原时间比例。 */
export function advanceEarthMotion(
  state: { orbitDay: number; spinRadians: number },
  elapsedSolarDays: number,
  enabled: { revolution: boolean; rotation: boolean },
  revolutionMultiplier = 1,
) {
  return {
    orbitDay: enabled.revolution ? wrapOrbitDay(state.orbitDay + elapsedSolarDays * revolutionMultiplier) : state.orbitDay,
    spinRadians: enabled.rotation
      ? (state.spinRadians + elapsedSolarDays * TAU * (366 / 365)) % TAU
      : state.spinRadians,
  }
}

export function rotationFromSolarMinutes(sunLongitude: number, solarMinutes: number, longitude = 0) {
  return sunLongitude + ((solarMinutes - 720) / 4 - longitude) * Math.PI / 180
}

export function solarMinutesFromRotation(sunLongitude: number, spinRadians: number, longitude = 0) {
  const minutes = 720 + 4 * (longitude + (spinRadians - sunLongitude) * 180 / Math.PI)
  return ((minutes % 1440) + 1440) % 1440
}
