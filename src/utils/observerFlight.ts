import { Matrix4, Quaternion, Vector3, MathUtils } from 'three'

export const OBSERVER_FLIGHT_DURATION = 6200
const DEG = Math.PI / 180
const ease = (value: number) => MathUtils.smootherstep(value, 0, 1)

/** Same west/up/north frame as the apparent-solar-motion scene, transformed with Earth. */
export function observerBasis(latitude: number, longitude: number, spin: number, tilt: number, center: Vector3) {
  const phi = latitude * DEG
  const lambda = longitude * DEG
  const rotation = new Matrix4().makeRotationZ(tilt).multiply(new Matrix4().makeRotationY(spin))
  return {
    center: center.clone(),
    up: new Vector3(Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda)).transformDirection(rotation),
    west: new Vector3(Math.sin(lambda), 0, Math.cos(lambda)).transformDirection(rotation),
    north: new Vector3(-Math.sin(phi) * Math.cos(lambda), Math.cos(phi), Math.sin(phi) * Math.sin(lambda)).transformDirection(rotation),
  }
}

export type ObserverBasis = ReturnType<typeof observerBasis>

export function observerLookDirection(frame: ObserverBasis, altitude: number, azimuth: number) {
  const pitch = MathUtils.clamp(altitude, 4, 78) * DEG
  const heading = azimuth * DEG
  return frame.west.clone().multiplyScalar(-Math.sin(heading) * Math.cos(pitch))
    .addScaledVector(frame.up, Math.sin(pitch))
    .addScaledVector(frame.north, Math.cos(heading) * Math.cos(pitch)).normalize()
}

/** A spherical approach avoids flying through Earth even when the point starts on its far side. */
export function createObserverFlight(radius: number, startPosition: Vector3, startQuaternion: Quaternion, startFov: number, center: Vector3) {
  const initialOffset = startPosition.clone().sub(center)
  const initialDistance = Math.max(radius * 1.004, initialOffset.length())
  const initialDirection = initialOffset.lengthSq() > 1e-12 ? initialOffset.normalize() : new Vector3(0, 0, 1)
  const initialQuaternion = startQuaternion.clone()
  return {
    sample(frame: ObserverBasis, altitude: number, azimuth: number, elapsed: number) {
      const progress = MathUtils.clamp(elapsed / OBSERVER_FLIGHT_DURATION, 0, 1)
      const approachEnd = Math.max(radius * 3, Math.min(initialDistance, radius * 5))
      const descentEnd = radius * 1.14
      let distance: number
      let direction: Vector3
      let phase: string
      const lookingDown = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(frame.up, new Vector3(), frame.north))
      let quaternion: Quaternion
      if (progress < 0.36) {
        const fraction = ease(progress / 0.36)
        const turn = new Quaternion().setFromUnitVectors(initialDirection, frame.up)
        direction = initialDirection.clone().applyQuaternion(new Quaternion().slerp(turn, fraction))
        distance = MathUtils.lerp(initialDistance, approachEnd, fraction)
        quaternion = initialQuaternion.clone().slerp(lookingDown, fraction)
        phase = '正在靠近地球'
      } else if (progress < 0.7) {
        direction = frame.up.clone()
        distance = MathUtils.lerp(approachEnd, descentEnd, ease((progress - 0.36) / 0.34))
        quaternion = lookingDown
        phase = '正在下降到观测点'
      } else {
        const fraction = ease((progress - 0.7) / 0.3)
        direction = frame.up.clone()
        distance = MathUtils.lerp(descentEnd, radius * 1.004, fraction)
        const look = observerLookDirection(frame, altitude, azimuth)
        const lookingAtSky = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(), look, frame.up))
        quaternion = lookingDown.slerp(lookingAtSky, fraction)
        phase = '正在抬头看向太阳'
      }
      return {
        position: frame.center.clone().addScaledVector(direction, distance), quaternion,
        fov: MathUtils.lerp(startFov, 60, ease(progress)), phase, progress, complete: progress >= 1,
      }
    },
  }
}
