import { Vector3 } from 'three'

/** Translate camera and target together, preserving zoom, orbit angle, and any pan offset. */
export function followMovingCenter(camera: Vector3, target: Vector3, previous: Vector3, current: Vector3) {
  const delta = current.clone().sub(previous)
  camera.add(delta)
  target.add(delta)
}

/** Only an intentional primary click can select a point; a drag returning to its start is still a drag. */
export function createPointPickGesture() {
  let active: { id: number; x: number; y: number; time: number; moved: boolean } | null = null
  return {
    start(id: number, x: number, y: number, time: number, allowed: boolean) {
      if (active || !allowed) { active = null; return }
      active = { id, x, y, time, moved: false }
    },
    move(id: number, x: number, y: number) {
      if (active?.id === id && Math.hypot(x - active.x, y - active.y) > 4) active.moved = true
    },
    finish(id: number, x: number, y: number, time: number) {
      const state = active
      active = null
      return !!state && id === state.id && !state.moved && Math.hypot(x - state.x, y - state.y) <= 4 && time - state.time < 450
    },
    cancel() { active = null },
  }
}

/** All rays occupy one vertical plane and remain parallel to the Sun–Earth direction. */
export function verticalSunRaySegments(earthCenter: Vector3, earthRadius: number, sunRadius: number, count: number) {
  const direction = earthCenter.clone().normalize()
  const total = Math.max(1, Math.round(count))
  const up = new Vector3(0, 1, 0).addScaledVector(direction, -direction.y).normalize()
  return Array.from({ length: total }, (_, index) => {
    const height = total === 1 ? 0 : (index / (total - 1) - 0.5) * earthRadius * 1.65
    const offset = up.clone().multiplyScalar(height)
    return {
      start: direction.clone().multiplyScalar(Math.sqrt(Math.max(0, sunRadius * sunRadius - height * height))).add(offset),
      end: earthCenter.clone().addScaledVector(direction, -Math.sqrt(Math.max(0, earthRadius * earthRadius - height * height)) - 0.008).add(offset),
    }
  })
}
