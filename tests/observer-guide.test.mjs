import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import * as THREE from 'three'

const source = await readFile(new URL('../src/scene/createObserverGuide.ts', import.meta.url), 'utf8')
const astronomy = await readFile(new URL('../src/utils/astronomy.ts', import.meta.url), 'utf8')
const combined = astronomy + '\n' + source.replace(/import \{ formatSignedDegreesMinutes \} from '\.\.\/utils\/astronomy'/, '')
const output = ts.transpileModule(combined, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
const { createObserverGuide, observerGuideFrame } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const radius = 0.56
const allVisible = { ripple: true, normal: true, sunRay: true, horizon: true, altitude: true }
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`)
const vectorNear = (a, b, tolerance = 1e-7) => near(a.distanceTo(b), 0, tolerance)

function createGuide() {
  const previousDocument = globalThis.document
  const context = new Proxy({ measureText: text => ({ width: text.length * 26 }) }, {
    get: (target, key) => target[key] ?? (() => {}),
  })
  globalThis.document = { createElement: () => ({ getContext: () => context }) }
  try { return createObserverGuide(radius) }
  finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
}

function stateAt(altitude, visibility = allVisible) {
  const radians = altitude * Math.PI / 180
  return {
    point: new THREE.Vector3(0, radius, 0), normal: new THREE.Vector3(0, 1, 0),
    sunDirection: new THREE.Vector3(Math.cos(radians), Math.sin(radians), 0),
    altitude, time: 1000, visibility,
  }
}

test('观测点切平面与高度角在地平、负角和天顶天底都保持正交且无NaN', () => {
  for (const normal of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 3, -4)]) {
    const up = normal.clone().normalize()
    const tangent = observerGuideFrame(normal, normal).horizontal
    for (const altitude of [-90, -89.999, -35, 0, 45, 89.999, 90]) {
      const radians = altitude * Math.PI / 180
      const sun = tangent.clone().multiplyScalar(Math.cos(radians)).addScaledVector(up, Math.sin(radians))
      const previousSun = sun.clone()
      const frame = observerGuideFrame(normal, sun)
      for (const vector of [frame.up, frame.sun, frame.horizontal, frame.sideways]) {
        assert.ok(vector.toArray().every(Number.isFinite))
        near(vector.length(), 1)
      }
      near(frame.up.dot(frame.horizontal), 0)
      near(frame.sideways.dot(frame.up), 0)
      near(frame.sideways.dot(frame.horizontal), 0)
      vectorNear(new THREE.Vector3().crossVectors(frame.horizontal, frame.up), frame.sideways)
      near(frame.altitude * 180 / Math.PI, altitude, 1e-6)
      vectorNear(sun, previousSun)
    }
  }
  const degenerate = observerGuideFrame(new THREE.Vector3(), new THREE.Vector3(Number.NaN, 0, 0))
  assert.ok([...degenerate.up, ...degenerate.horizontal, degenerate.altitude].every(Number.isFinite))
})

test('实际法线、地平面和入射箭头使用同一世界坐标与太阳平行方向', () => {
  const guide = createGuide()
  const parent = new THREE.Group()
  parent.position.set(3, 2, -5)
  parent.rotation.set(0.4, 1.1, -0.2)
  parent.scale.set(1.5, 0.8, 2)
  parent.add(guide.group)
  try {
    const normal = new THREE.Vector3(0.4, 0.6, 0.3).normalize()
    const horizontal = observerGuideFrame(normal, normal).horizontal
    const sun = horizontal.clone().add(normal).normalize()
    const point = new THREE.Vector3(-2, 0.2, 4)
    guide.update({ point, normal, sunDirection: sun, altitude: 45, time: 0, visibility: allVisible })
    guide.group.updateWorldMatrix(true, true)
    vectorNear(guide.group.getWorldPosition(new THREE.Vector3()), point)
    const arrow = guide.group.getObjectByName('observer-normal-arrow')
    vectorNear(new THREE.Vector3(0, 1, 0).transformDirection(arrow.matrixWorld), normal)
    const plane = guide.group.getObjectByName('observer-horizon-plane')
    vectorNear(new THREE.Vector3(0, 0, 1).transformDirection(plane.matrixWorld), normal)
    const planeCenter = plane.getWorldPosition(new THREE.Vector3())
    const positions = plane.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      near(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(plane.matrixWorld).sub(planeCenter).dot(normal), 0)
    }
    const sunlight = guide.group.getObjectByName('observer-incoming-sun-arrow')
    vectorNear(new THREE.Vector3(0, 1, 0).transformDirection(sunlight.matrixWorld), sun.clone().negate())
    vectorNear(new THREE.Vector3(0, radius * 0.78, 0).applyMatrix4(sunlight.matrixWorld), point)
    near(guide.group.userData.altitude, 45)
  } finally { guide.dispose() }
})

test('高度角末端与真实太阳方向重合，夜间只显示延长虚线并保留负号', () => {
  const guide = createGuide()
  try {
    for (const altitude of [-90, -40, -0.01, 0, 30, 90]) {
      const state = stateAt(altitude)
      // The physical vectors stay authoritative even if a caller supplies a stale numeric readout.
      guide.update({ ...state, altitude: 12.345 })
      guide.group.updateWorldMatrix(true, true)
      const arc = guide.group.getObjectByName('observer-altitude-arc')
      const position = arc.geometry.getAttribute('position')
      const last = new THREE.Vector3().fromBufferAttribute(position, position.count - 1)
        .applyMatrix4(arc.matrixWorld).sub(state.point).normalize()
      vectorNear(last, state.sunDirection)
      near(guide.group.userData.altitude, altitude)
      assert.equal(guide.group.getObjectByName('observer-night-ray').visible, altitude < 0)
      assert.equal(guide.group.getObjectByName('observer-incoming-sun-arrow').visible, altitude >= 0)
      assert.equal(arc.visible, altitude !== 0)
      const text = guide.group.getObjectByName('observer-altitude-label').userData.text
      assert.equal(text.includes('−'), altitude < -0.0084)
      guide.group.traverse(object => {
        const attribute = object.geometry?.getAttribute('position')
        if (attribute) assert.ok(Array.from(attribute.array).every(Number.isFinite))
      })
    }
  } finally { guide.dispose() }
})

test('五项辅助开关互相独立，三圈水波只在本地切平面扩散', () => {
  const guide = createGuide()
  try {
    for (const enabled of Object.keys(allVisible)) {
      const flags = Object.fromEntries(Object.keys(allVisible).map(key => [key, key === enabled]))
      guide.update(stateAt(45, flags))
      for (const key of Object.keys(allVisible)) assert.equal(guide.group.getObjectByName(`observer-${key}`).visible, key === enabled)
    }
    for (const time of [-10, 0, 500, 40000]) {
      guide.update({ ...stateAt(45), time })
      const scales = []
      for (let index = 0; index < 3; index++) {
        const ring = guide.group.getObjectByName(`observer-ripple-${index}`)
        near(ring.rotation.x, -Math.PI / 2)
        assert.ok(ring.material.opacity >= 0 && ring.material.opacity <= 0.52)
        assert.ok(ring.scale.x >= 0.82 && ring.scale.x < 3.17)
        scales.push(ring.scale.x)
      }
      assert.equal(new Set(scales).size, 3)
    }
    guide.update(stateAt(45, Object.fromEntries(Object.keys(allVisible).map(key => [key, false]))))
    assert.equal(guide.group.visible, false)
  } finally { guide.dispose() }
})

test('透视和正交相机都隐藏背面观测辅助，近侧负高度仍可读', () => {
  const guide = createGuide()
  try {
    guide.update(stateAt(-30))
    for (const camera of [new THREE.PerspectiveCamera(45, 1.4, 0.01, 100), new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)]) {
      for (const hemisphere of [1, -1]) {
        camera.position.set(0, 4 * hemisphere, 2)
        camera.lookAt(0, radius, 0)
        guide.updateForCamera(camera, 720)
        assert.equal(guide.group.visible, hemisphere > 0)
        if (hemisphere > 0) {
          guide.group.traverse(object => {
            if (object instanceof THREE.Sprite) assert.ok([...object.position, ...object.scale].every(Number.isFinite))
          })
        }
      }
    }
  } finally { guide.dispose() }
})

test('释放观测辅助只清理自身资源且可重复调用', () => {
  const guide = createGuide()
  const otherGuide = createGuide()
  const parent = new THREE.Group()
  parent.add(guide.group, otherGuide.group)
  const geometry = guide.group.getObjectByName('observer-normal-arrow').line.geometry
  const otherGeometry = otherGuide.group.getObjectByName('observer-normal-arrow').line.geometry
  assert.notEqual(geometry, otherGeometry)
  let disposed = 0
  let otherDisposed = 0
  geometry.addEventListener('dispose', () => disposed++)
  otherGeometry.addEventListener('dispose', () => otherDisposed++)
  guide.dispose()
  guide.dispose()
  assert.equal(disposed, 1)
  assert.equal(otherDisposed, 0)
  assert.equal(guide.group.parent, null)
  otherGuide.dispose()
  assert.equal(otherDisposed, 1)
})
