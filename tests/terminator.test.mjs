import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import * as THREE from 'three'

const source = await readFile(new URL('../src/scene/createTerminator.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
const { createTerminator, terminatorFrame } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`)
const vectorNear = (a, b) => near(a.distanceTo(b), 0)
const axes = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(Math.sin((23 + 26 / 60) * Math.PI / 180), Math.cos((23 + 26 / 60) * Math.PI / 180), 0),
  new THREE.Vector3(0.2, -0.5, 0.7).normalize(),
]
const suns = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0.3, 0.6, -0.4).normalize()]

test('晨昏大圆始终经过地心并与太阳平行光方向垂直', () => {
  for (const axis of axes) {
    for (const sun of suns) {
      const frame = terminatorFrame(sun, axis)
      assert.ok(frame)
      for (const direction of [frame.dawnCenter, frame.duskCenter, frame.junction]) {
        near(direction.length(), 1)
        near(direction.dot(sun), 0)
      }
      const projectedPole = axis.clone().addScaledVector(sun, -axis.dot(sun)).normalize()
      vectorNear(frame.junction, projectedPole)
      for (let i = 0; i <= 128; i++) {
        const angle = Math.PI * 2 * i / 128
        const normal = frame.dawnCenter.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frame.junction, Math.sin(angle))
        near(normal.length(), 1)
        near(normal.dot(sun), 0)
      }
    }
  }
})

test('晨线随正常东向自转进入白昼，昏线进入黑夜，判据与实际小角度旋转一致', () => {
  for (const axis of axes) {
    for (const sun of suns) {
      const frame = terminatorFrame(sun, axis)
      for (const [center, enteringDay] of [[frame.dawnCenter, true], [frame.duskCenter, false]]) {
        for (const angle of [-1.4, -0.7, 0, 0.7, 1.4]) {
          const normal = center.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frame.junction, Math.sin(angle))
          const rate = new THREE.Vector3().crossVectors(axis, normal).dot(sun)
          const before = normal.clone().applyAxisAngle(axis, -1e-5).dot(sun)
          const after = normal.clone().applyAxisAngle(axis, 1e-5).dot(sun)
          assert.equal(rate > 0, enteringDay)
          assert.equal(after > 0, enteringDay)
          assert.equal(before < 0, enteringDay)
          near((after - before) / 2e-5, rate, 1e-8)
        }
      }
    }
  }
})

test('薄球壳贴合地球且父节点变换不会改变世界坐标中心或半径', () => {
  const radius = 0.56
  const terminator = createTerminator(radius)
  const parent = new THREE.Group()
  parent.position.set(6, -2, 3)
  parent.rotation.set(0.3, 0.7, -0.5)
  parent.scale.set(1.2, 0.8, 1.7)
  parent.add(terminator.group)
  const center = new THREE.Vector3(-3, 1, 4)
  try {
    terminator.update(center, suns[0].clone().multiplyScalar(8), axes[1].clone().multiplyScalar(3), true)
    terminator.group.updateWorldMatrix(true, true)
    const surface = terminator.group.getObjectByName('earth-terminator-surface')
    vectorNear(surface.getWorldPosition(new THREE.Vector3()), center)
    const position = surface.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i += 31) {
      near(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(surface.matrixWorld).distanceTo(center), radius * 1.005)
    }
    vectorNear(surface.material.uniforms.earthCenter.value, center)
    vectorNear(surface.material.uniforms.sunDirection.value, suns[0])
    vectorNear(surface.material.uniforms.axisDirection.value, axes[1])
    assert.equal(surface.material.depthTest, true)
    assert.equal(surface.material.depthWrite, false)
    assert.equal(surface.material.side, THREE.FrontSide)
    assert.ok(surface.renderOrder > 12, '细线应出现在五带透明色层之后')
  } finally { terminator.dispose() }
})

test('地轴指向太阳时不存在自转晨昏切换，平行与反平行情形保持有限值', () => {
  const terminator = createTerminator(0.56)
  try {
    for (const axis of axes) {
      for (const sign of [-1, 1]) {
        const sun = axis.clone().multiplyScalar(sign)
        const frame = terminatorFrame(sun, axis)
        near(frame.crossingStrength, 0)
        assert.ok([...frame.dawnCenter, ...frame.duskCenter, ...frame.junction].every(Number.isFinite))
        for (const angle of [0, Math.PI / 3, Math.PI / 2]) {
          const normal = frame.dawnCenter.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frame.junction, Math.sin(angle))
          near(normal.dot(sun), 0)
          near(normal.clone().applyAxisAngle(axis, 0.4).dot(sun), 0)
        }
        terminator.update(new THREE.Vector3(), sun, axis, true)
        assert.equal(terminator.group.visible, true)
        near(terminator.group.getObjectByName('earth-terminator-surface').material.uniforms.crossingStrength.value, 0)
      }
    }
  } finally { terminator.dispose() }
})

test('开关立即生效，非法方向隐藏，资源释放可以安全重复', () => {
  const terminator = createTerminator(0.56)
  const parent = new THREE.Group()
  parent.add(terminator.group)
  const surface = terminator.group.getObjectByName('earth-terminator-surface')
  let geometryDisposals = 0
  let materialDisposals = 0
  surface.geometry.addEventListener('dispose', () => geometryDisposals++)
  surface.material.addEventListener('dispose', () => materialDisposals++)
  terminator.update(new THREE.Vector3(), suns[0], axes[0], true)
  assert.equal(terminator.group.visible, true)
  terminator.update(new THREE.Vector3(), suns[0], axes[0], false)
  assert.equal(terminator.group.visible, false)
  terminator.update(new THREE.Vector3(), new THREE.Vector3(), axes[0], true)
  assert.equal(terminator.group.visible, false)
  terminator.update(new THREE.Vector3(Number.NaN, 0, 0), suns[0], axes[0], true)
  assert.equal(terminator.group.visible, false)
  terminator.dispose()
  terminator.dispose()
  assert.equal(geometryDisposals, 1)
  assert.equal(materialDisposals, 1)
  assert.equal(terminator.group.parent, null)
})
