import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { PerspectiveCamera, Vector3 } from 'three'

// 用现有 TypeScript 编译器加载纯计算模块，不额外引入测试运行时依赖。
const compiledModules = new Map()
async function compileTsModule(url) {
  if (compiledModules.has(url.href)) return compiledModules.get(url.href)
  const source = await readFile(url, 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  let code = outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) {
    const dependency = await compileTsModule(new URL(`${match[1]}.ts`, url))
    code = code.replace(match[0], `from '${dependency}'`)
  }
  const compiled = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  compiledModules.set(url.href, compiled)
  return compiled
}
async function loadTs(path) {
  return import(await compileTsModule(new URL(path, import.meta.url)))
}

const { advanceEarthMotion, rotationFromSolarMinutes, solarMinutesFromRotation } = await loadTs('../src/utils/earthMotion.ts')
const { equatorialShadow, polarAxis, solarPathDirection, solarAltitudeGuide, sundialReadingNotice } = await loadTs('../src/utils/sundial.ts')
const { createEquatorialSundial } = await loadTs('../src/scene/createEquatorialSundial.ts')
const { southFacingSolarCameraPosition, southFacingSolarCameraTarget } = await loadTs('../src/utils/solarView.ts')
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`)

test('两项都暂停时，公转位置和地球朝向完全不变', () => {
  const state = { orbitDay: 172.4, spinRadians: 1.7 }
  assert.deepEqual(advanceEarthMotion(state, 12, { revolution: false, rotation: false }), state)
})
test('只自转，跨越午夜也不改变公转日期或位置', () => {
  const next = advanceEarthMotion({ orbitDay: 172.4, spinRadians: 1.7 }, 2, { revolution: false, rotation: true })
  assert.equal(next.orbitDay, 172.4)
  assert.notEqual(next.spinRadians, 1.7)
})
test('只公转，地球相对恒星的朝向保持不变', () => {
  const next = advanceEarthMotion({ orbitDay: 172.4, spinRadians: 1.7 }, 12, { revolution: true, rotation: false })
  near(next.orbitDay, 184.4)
  assert.equal(next.spinRadians, 1.7)
})
test('一起播放与年末回绕不会丢失小数公转进度', () => {
  const next = advanceEarthMotion({ orbitDay: 365.9, spinRadians: 1.7 }, 0.2, { revolution: true, rotation: true })
  near(next.orbitDay, 1.1)
  assert.notEqual(next.spinRadians, 1.7)
})

test('公转额外加速不改变自转速率，跨年和独立暂停仍然有效', () => {
  const state = { orbitDay: 365.9, spinRadians: 1.7 }
  const original = advanceEarthMotion(state, 0.1, { revolution: true, rotation: true })
  const accelerated = advanceEarthMotion(state, 0.1, { revolution: true, rotation: true }, 60)
  near(accelerated.orbitDay, 6.9)
  assert.equal(accelerated.spinRadians, original.spinRadians)
  const rotationOnly = advanceEarthMotion(state, 0.1, { revolution: false, rotation: true }, 60)
  assert.equal(rotationOnly.orbitDay, state.orbitDay)
  assert.equal(rotationOnly.spinRadians, original.spinRadians)
  const revolutionOnly = advanceEarthMotion(state, 0.1, { revolution: true, rotation: false }, 60)
  near(revolutionOnly.orbitDay, 6.9)
  assert.equal(revolutionOnly.spinRadians, state.spinRadians)
})
test('时间滑块与真实自转角互相换算，覆盖经度与午夜', () => {
  for (const longitude of [-180, -73, 0, 116.4, 180]) {
    for (const minutes of [0, 360, 720, 1080, 1439, 1440]) {
      const spin = rotationFromSolarMinutes(1.8, minutes, longitude)
      const result = solarMinutesFromRotation(1.8, spin, longitude)
      const distance = Math.abs(result - minutes % 1440)
      assert.ok(Math.min(distance, 1440 - distance) < 1e-8)
    }
  }
})
test('晷针与当地天极平行，南北半球和赤道均为单位向量', () => {
  for (const latitude of [-90, -33.87, 0, 39.9, 90]) {
    const axis = polarAxis(latitude)
    near(axis.length(), 1)
    near(axis.y, Math.sin(latitude * Math.PI / 180))
  }
})

test('桌面和平板从正北向正南观察，左东右西，南北标注完整入镜', () => {
  for (const [mode, fov] of [['normal', 46], ['compact', 53], ['veryCompact', 56]]) {
    const camera = new PerspectiveCamera(fov, 1.4, 0.1, 160)
    camera.position.copy(southFacingSolarCameraPosition(mode))
    camera.lookAt(southFacingSolarCameraTarget(mode))
    camera.updateMatrixWorld()
    assert.equal(camera.position.x, 0, '相机应位于南北中线，不带侧向偏角')
    assert.ok(camera.position.z > 0)
    const north = new Vector3(0, 0.18, 7.78).project(camera)
    const south = new Vector3(0, 0.18, -7.78).project(camera)
    near(north.x, 0)
    near(south.x, 0)
    assert.ok(south.y > north.y, '南方在远处，北方在前景')
    assert.ok(south.y < 0.9 && north.y > -0.9, '南北文字应留有边距，不被画布裁切')
    assert.ok(new Vector3(1, 0, 0).project(camera).x > 0, '西方应在画面右边')
    assert.ok(new Vector3(-1, 0, 0).project(camera).x < 0, '东方应在画面左边')
    assert.ok(solarPathDirection(39.9, 0, 6).project(camera).x < 0, '春分日出应位于左侧东方')
    assert.ok(solarPathDirection(39.9, 0, 18).project(camera).x > 0, '春分日落应位于右侧西方')
  }
})

function shadowAt(latitude, declination, hour) {
  const direction = solarPathDirection(latitude, declination, hour)
  const altitude = Math.asin(direction.y) * 180 / Math.PI
  const azimuth = Math.atan2(-direction.x, direction.z) * 180 / Math.PI
  return equatorialShadow(latitude, altitude, azimuth, 2, 1.3)
}

test('默认北侧视角正对北京、上海夏季受光的晷面和针影', () => {
  const dialCenter = new Vector3(0, 0.08 + 2.35 * 0.7, 0)
  for (const mode of ['normal', 'compact', 'veryCompact']) {
    const towardCamera = southFacingSolarCameraPosition(mode).sub(dialCenter).normalize()
    for (const latitude of [39.9, 31.23]) {
      const shadow = shadowAt(latitude, 23.44, 12)
      assert.equal(shadow.status, 'readable')
      const litFaceNormal = polarAxis(latitude).multiplyScalar(shadow.face)
      assert.ok(litFaceNormal.dot(towardCamera) > 0.95, '受光刻度面应接近正对相机，便于读数')
    }
  }
})

test('晷针投影落在对应时刻的刻度，南北半球、双面上午下午均一致', () => {
  for (const latitude of [-33.87, 0, 39.9, 69.65]) {
    for (const declination of [-23.44, 23.44]) {
      for (const hour of [9, 12, 15]) {
        const shadow = shadowAt(latitude, declination, hour)
        if (shadow.status === 'night') continue
        assert.equal(shadow.status, 'readable')
        assert.equal(shadow.face, Math.sign(declination))
        const length = Math.hypot(shadow.endpoint.x, shadow.endpoint.y)
        const angle = (hour - 12) * Math.PI / 12
        near(shadow.endpoint.x / length, -Math.sin(angle))
        near(shadow.endpoint.y / length, -Math.cos(angle))
        assert.ok(length <= 2 + 1e-9)
      }
    }
  }
})
test('春秋分平行入射不生成伪针影，赤道正午也不例外', () => {
  for (const latitude of [-33.87, 0, 39.9]) assert.equal(shadowAt(latitude, 0, 12).status, 'parallel')
})
test('夜晚与极夜隐藏阴影，极昼午夜仍能读数', () => {
  assert.equal(shadowAt(39.9, 23.44, 0).status, 'night')
  assert.equal(shadowAt(69.65, -23.44, 12).status, 'night')
  assert.equal(shadowAt(69.65, 23.44, 0).status, 'readable')
})

test('高度角图形与数值一致，覆盖上海夏至正午、低空太阳和天顶', () => {
  for (const altitude of [0.01, 26.66, 73.54, 82.21, 89.99, 90]) {
    for (const azimuth of [0, 90, 180, 270]) {
      const guide = solarAltitudeGuide(altitude, azimuth, 7.6)
      near(guide.direction.angleTo(guide.horizontal) * 180 / Math.PI, altitude, 1e-6)
      near(guide.horizontal.y, 0)
      near(guide.horizontal.length(), 1)
      near(guide.sunPosition.length(), 7.6)
      near(guide.sunPosition.clone().normalize().distanceTo(guide.direction), 0)
    }
  }
})

test('短晷针保留真实影长，长晷针的投影只在盘缘截断', () => {
  const declination = 23.44
  const direction = solarPathDirection(39.9, declination, 12)
  const altitude = Math.asin(direction.y) * 180 / Math.PI
  const azimuth = Math.atan2(-direction.x, direction.z) * 180 / Math.PI
  for (const pinLength of [0.1, 1.244]) {
    const shadow = equatorialShadow(39.9, altitude, azimuth, 2, pinLength)
    const realLength = pinLength / Math.tan(declination * Math.PI / 180)
    near(Math.hypot(shadow.endpoint.x, shadow.endpoint.y), Math.min(2, realLength))
  }
})

test('实际日晷网格的影线到达盘缘且不会越出晷面，夜间与春秋分隐藏', () => {
  // 只替代纹理绘字，测试真实工厂生成的 Three.js 几何，不需要浏览器或 GPU。
  const previousDocument = globalThis.document
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) })
  globalThis.document = { createElement: () => ({ getContext: () => context }) }
  let model
  try {
    model = createEquatorialSundial({ capabilities: { getMaxAnisotropy: () => 1 } })
    const shadow = model.group.getObjectByName('equatorial-gnomon-shadow')
    assert.ok(shadow)
    for (const declination of [1, 10, 23.44, -23.44]) {
      const sun = solarPathDirection(39.9, declination, 12)
      model.update(39.9, Math.asin(sun.y) * 180 / Math.PI, Math.atan2(-sun.x, sun.z) * 180 / Math.PI)
      assert.equal(shadow.visible, true)
      const positions = shadow.geometry.getAttribute('position')
      const radii = Array.from({ length: positions.count }, (_, i) => Math.hypot(positions.getX(i), positions.getY(i)))
      assert.ok(radii.every(radius => radius <= 2 + 1e-6))
      near(Math.max(...radii), 2, 1e-6)
    }
    model.update(39.9, -5, 180)
    assert.equal(shadow.visible, false)
    model.update(39.9, 90 - 39.9, 180)
    assert.equal(shadow.visible, false)
  } finally {
    model?.dispose()
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})

test('日晷说明与实际受光状态一致，区分南北半球、春秋分和夜间', () => {
  for (const latitude of [39.9, -33.87]) {
    for (const declination of [23.44, -23.44]) {
      const sun = solarPathDirection(latitude, declination, 12)
      const notice = sundialReadingNotice(latitude, Math.asin(sun.y) * 180 / Math.PI, Math.atan2(-sun.x, sun.z) * 180 / Math.PI)
      assert.equal(notice.status, 'readable')
      assert.ok(notice.title.includes(latitude * declination > 0 ? '上表面' : '下表面'))
      assert.ok(notice.detail.includes(declination > 0 ? '朝北天极面' : '朝南天极面'))
    }
  }
  assert.equal(sundialReadingNotice(39.9, -5, 180).status, 'night')
  assert.equal(sundialReadingNotice(39.9, 50.1, 180).status, 'parallel')
  assert.ok(sundialReadingNotice(0, 66.56, 0).title.includes('竖直晷面'))
})
