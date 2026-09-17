import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { Group, Matrix4, Quaternion, Spherical, Vector3 } from 'three'

const compiledModules = new Map()
async function compileTsModule(url) {
  if (compiledModules.has(url.href)) return compiledModules.get(url.href)
  const source = await readFile(url, 'utf8')
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) {
    const dependency = await compileTsModule(new URL(`${match[1]}.ts`, url))
    code = code.replace(match[0], `from '${dependency}'`)
  }
  const compiled = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  compiledModules.set(url.href, compiled)
  return compiled
}
const loadTs = async path => import(await compileTsModule(new URL(path, import.meta.url)))
const { createObserverFlight, observerBasis, observerLookDirection, OBSERVER_FLIGHT_DURATION } = await loadTs('../src/utils/observerFlight.ts')
const { AXIAL_TILT } = await loadTs('../src/utils/astronomy.ts')
const { orbitAngleAtDay, declinationAtDay, solarLongitudeAtDay } = await loadTs('../src/utils/earthOrbit.ts')
const { solarMinutesFromRotation } = await loadTs('../src/utils/earthMotion.ts')
const { solarPathDirection, sunDirection } = await loadTs('../src/utils/sundial.ts')

const DEG = Math.PI / 180
const near = (actual, expected, tolerance = 1e-9, context = '') => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${context}: ${actual} ≠ ${expected}`)
}
const vectorNear = (actual, expected, tolerance = 1e-9, context = '') => near(actual.distanceTo(expected), 0, tolerance, context)
const quaternionNear = (actual, expected, context = '') => near(actual.angleTo(expected), 0, 1e-7, context)
const earthCenter = day => new Vector3(Math.cos(orbitAngleAtDay(day)), 0, Math.sin(orbitAngleAtDay(day))).multiplyScalar(4.05)
const orientationAt = (position, target, up) => new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position, target, up))
const localToWorldDirection = (frame, direction) => frame.west.clone().multiplyScalar(direction.x)
  .addScaledVector(frame.up, direction.y).addScaledVector(frame.north, direction.z)

// Use Three's spherical coordinates and a real globe hierarchy as the independent geometry oracle.
function globePoint(latitude, longitude, spinGroup, radius = 1) {
  return spinGroup.localToWorld(new Vector3().setFromSpherical(new Spherical(radius, (90 - latitude) * DEG, (90 + longitude) * DEG)))
}

test('当地西、天顶、北基与实际地球层级的经纬切线及东向自转一致，包括极点', () => {
  const globe = new Group()
  const tiltGroup = new Group()
  const spinGroup = new Group()
  globe.add(tiltGroup)
  tiltGroup.add(spinGroup)
  globe.position.set(-2.4, 0.3, 3.1)
  const epsilon = 1e-5
  for (const tilt of [0, 10, AXIAL_TILT]) for (const spin of [0, 0.73, Math.PI, 5.81]) {
    tiltGroup.rotation.z = -tilt * DEG
    spinGroup.rotation.y = spin
    globe.updateMatrixWorld(true)
    for (const [latitude, longitude] of [[0, 0], [0, 90], [24.48, 118.08], [-33.87, 151.21], [90, 0], [-90, -74.01], [89.999, 180]]) {
      const frame = observerBasis(latitude, longitude, spin, -tilt * DEG, globe.position)
      const point = globePoint(latitude, longitude, spinGroup)
      vectorNear(frame.up, point.clone().sub(globe.position).normalize())
      vectorNear(frame.west.clone().cross(frame.up), frame.north)
      for (const direction of [frame.west, frame.up, frame.north]) near(direction.length(), 1)
      near(frame.west.dot(frame.up), 0)
      near(frame.north.dot(frame.up), 0)
      near(frame.north.dot(frame.west), 0)
      const northward = globePoint(latitude + epsilon, longitude, spinGroup)
        .sub(globePoint(latitude - epsilon, longitude, spinGroup)).normalize()
      vectorNear(frame.north, northward, 5e-8)
      if (Math.abs(latitude) < 89.99) {
        const eastward = globePoint(latitude, longitude + epsilon, spinGroup)
          .sub(globePoint(latitude, longitude - epsilon, spinGroup)).normalize()
        vectorNear(frame.west.clone().negate(), eastward, 5e-8)
        spinGroup.rotation.y = spin + epsilon * DEG
        globe.updateMatrixWorld(true)
        const eastByRotation = globePoint(latitude, longitude, spinGroup).sub(point).normalize()
        assert.ok(eastByRotation.dot(frame.west) < -0.99999999, 'positive physical rotation must carry the observer eastward')
        spinGroup.rotation.y = spin
        globe.updateMatrixWorld(true)
      }
    }
  }
})

test('分至日、任意日期及南北半球的真实太阳高度方位，经当地基转回世界后均指向太阳', () => {
  const cities = [[24.48, 118.08], [39.9, 116.4], [-33.87, 151.21], [0, 0], [0, -180], [90, 0], [-90, 120]]
  for (const tilt of [0, 10, AXIAL_TILT]) for (const day of [1, 35.25, 79, 111.4, 172, 217.8, 266, 308.7, 356, 365.99]) {
    const center = earthCenter(day)
    const toSun = center.clone().negate().normalize()
    for (const spin of [0, 0.73, Math.PI, 5.81]) for (const [latitude, longitude] of cities) {
      const frame = observerBasis(latitude, longitude, spin, -tilt * DEG, center)
      const minutes = solarMinutesFromRotation(solarLongitudeAtDay(day, tilt), spin, longitude)
      const path = solarPathDirection(latitude, declinationAtDay(day, tilt), minutes / 60)
      const altitude = Math.asin(Math.max(-1, Math.min(1, path.y))) / DEG
      const azimuth = Math.atan2(-path.x, path.z) / DEG
      // Use the physical solar direction here: the camera's 4°–78° pitch limit is a framing choice.
      const worldSun = localToWorldDirection(frame, sunDirection(altitude, azimuth))
      vectorNear(worldSun, toSun, 1e-10, `latitude=${latitude}, day=${day}, tilt=${tilt}, spin=${spin}`)
      near(frame.up.dot(toSun), Math.sin(altitude * DEG), 1e-11)
    }
  }
})

test('近侧、远侧、侧面及南北极的完整飞行始终位于球外，姿态与视场有限', () => {
  const radius = 0.56
  const center = earthCenter(111.4)
  for (const latitude of [24.48, -33.87, 90, -90]) {
    const frame = observerBasis(latitude, 118.08, 0.73, -AXIAL_TILT * DEG, center)
    for (const direction of [frame.up, frame.up.clone().negate(), frame.west]) for (const distance of [1.6, 8]) {
      const start = center.clone().addScaledVector(direction, radius * distance)
      const orientation = orientationAt(start, center, frame.north)
      const flight = createObserverFlight(radius, start, orientation, 42, center)
      vectorNear(flight.sample(frame, 32, 145, 0).position, start)
      quaternionNear(flight.sample(frame, 32, 145, 0).quaternion, orientation)
      for (let i = 0; i <= 240; i++) {
        const pose = flight.sample(frame, 32, 145, OBSERVER_FLIGHT_DURATION * i / 240)
        assert.ok(pose.position.distanceTo(center) >= radius * 1.004 - 1e-12, `flight crossed Earth: latitude=${latitude}, t=${i}`)
        assert.ok([...pose.position.toArray(), ...pose.quaternion.toArray(), pose.fov].every(Number.isFinite))
        near(pose.quaternion.length(), 1)
        assert.ok(pose.fov >= 42 && pose.fov <= 60)
      }
    }
  }
})

test('靠近、下降、抬头阶段交界的相机位置、四元数和视场连续', () => {
  const radius = 0.56
  const frame = observerBasis(24.48, 118.08, 2.4, -AXIAL_TILT * DEG, earthCenter(266))
  const start = frame.center.clone().addScaledVector(frame.up, -radius * 8)
  const flight = createObserverFlight(radius, start, orientationAt(start, frame.center, frame.north), 75, frame.center)
  for (const fraction of [0.36, 0.7]) {
    const time = OBSERVER_FLIGHT_DURATION * fraction
    const exact = flight.sample(frame, 45, 220, time)
    for (const adjacentTime of [time - 0.001, time + 0.001]) {
      const adjacent = flight.sample(frame, 45, 220, adjacentTime)
      vectorNear(adjacent.position, exact.position, 1e-8)
      quaternionNear(adjacent.quaternion, exact.quaternion)
      near(adjacent.fov, exact.fov, 1e-5)
    }
  }
})

test('6.2秒准时到达观测点上方并看向天空，结束后跟随地球自转与公转', () => {
  assert.equal(OBSERVER_FLIGHT_DURATION, 6200)
  const radius = 0.56
  const first = observerBasis(24.48, 118.08, 0.73, -AXIAL_TILT * DEG, earthCenter(79))
  const start = first.center.clone().add(new Vector3(3, 2, -4))
  const flight = createObserverFlight(radius, start, orientationAt(start, first.center, first.north), 42, first.center)
  assert.equal(flight.sample(first, 32, 145, 6199.99).complete, false)
  for (const frame of [first, observerBasis(24.48, 118.08, 2.8, -AXIAL_TILT * DEG, earthCenter(172))]) {
    const pose = flight.sample(frame, 32, 145, 6200)
    vectorNear(pose.position, frame.center.clone().addScaledVector(frame.up, radius * 1.004))
    vectorNear(new Vector3(0, 0, -1).applyQuaternion(pose.quaternion), observerLookDirection(frame, 32, 145))
    near(pose.fov, 60)
    assert.equal(pose.progress, 1)
    assert.equal(pose.complete, true)
    const after = flight.sample(frame, 32, 145, 62000)
    vectorNear(after.position, pose.position)
    quaternionNear(after.quaternion, pose.quaternion)
    near(after.fov, pose.fov)
  }
})

test('极夜、地平线及天顶太阳的最终机位保持稳定，视线限幅不改变物理太阳方向', () => {
  const center = earthCenter(172)
  for (const latitude of [-90, 0, 90]) for (const altitude of [-90, -0.001, 0, 45, 90]) for (const azimuth of [0, 90, 180, 270]) {
    const frame = observerBasis(latitude, 0, 1.2, -AXIAL_TILT * DEG, center)
    const start = center.clone().addScaledVector(frame.west, 4)
    const flight = createObserverFlight(0.56, start, orientationAt(start, center, frame.north), 42, center)
    const pose = flight.sample(frame, altitude, azimuth, 6200)
    const look = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion)
    assert.ok([...pose.position.toArray(), ...pose.quaternion.toArray(), ...look.toArray()].every(Number.isFinite))
    near(pose.quaternion.length(), 1)
    near(look.dot(frame.up), Math.sin(Math.max(4, Math.min(78, altitude)) * DEG))
    const physical = localToWorldDirection(frame, sunDirection(altitude, azimuth))
    near(physical.dot(frame.up), Math.sin(altitude * DEG))
    if (altitude >= 0) assert.ok(look.angleTo(physical) <= 12 * DEG + 1e-9, 'the visible Sun should remain within the final 60° field of view')
  }
})

test('飞行采样保留输入快照，不原地改动当地基、地心、初始姿态', () => {
  const center = earthCenter(79)
  const frame = observerBasis(24.48, 118.08, 0.73, -AXIAL_TILT * DEG, center)
  const start = center.clone().add(new Vector3(2, 3, 4))
  const orientation = orientationAt(start, center, frame.north)
  const snapshot = JSON.stringify({ center, frame, start, orientation })
  const flight = createObserverFlight(0.56, start, orientation, 42, center)
  for (const elapsed of [0, 1000, 2232, 4340, 5500, 6200]) flight.sample(frame, 32, 145, elapsed)
  assert.equal(JSON.stringify({ center, frame, start, orientation }), snapshot)
  const initial = flight.sample(frame, 32, 145, 0)
  start.set(100, 200, 300)
  orientation.identity()
  vectorNear(flight.sample(frame, 32, 145, 0).position, initial.position)
  quaternionNear(flight.sample(frame, 32, 145, 0).quaternion, initial.quaternion)
})
