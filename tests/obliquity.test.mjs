import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Matrix4, Vector3 } from 'three'

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
const { AXIAL_TILT, MAX_OBLIQUITY_MINUTES, formatDegreesMinutes } = await loadTs('../src/utils/astronomy.ts')
const { orbitAngleAtDay, declinationAtDay, solarLongitudeAtDay } = await loadTs('../src/utils/earthOrbit.ts')
const { advanceEarthMotion, rotationFromSolarMinutes, solarMinutesFromRotation } = await loadTs('../src/utils/earthMotion.ts')
const { polarAxis, solarPathDirection } = await loadTs('../src/utils/sundial.ts')

// 加载当前页面实际使用的纯几何/数据函数，避免测试维护另一份同名实现。
const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const appScript = parse(appSource).descriptor.scriptSetup.content
const syntaxTree = ts.createSourceFile('App.ts', appScript, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const requiredFunctions = ['latLngToVector', 'altitudeFromHourAngle', 'clamp']
const actualFunctions = requiredFunctions.map(name => {
  const declaration = syntaxTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, `App.vue must expose the pure ${name} calculation`)
  return `export ${declaration.getText(syntaxTree)}`
})
const actualModule = ts.transpileModule([
  `import * as THREE from '${import.meta.resolve('three')}'`,
  'const DEG = Math.PI / 180; const RAD = 180 / Math.PI;',
  ...actualFunctions,
].join('\n'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { latLngToVector, altitudeFromHourAngle } = await import(`data:text/javascript;base64,${Buffer.from(actualModule).toString('base64')}`)

const DEG = Math.PI / 180
const near = (actual, expected, tolerance = 1e-9, context = '') => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${context}: ${actual} ≠ ${expected}`)
}
const angleDistance = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const earthPosition = day => new Vector3(Math.cos(orbitAngleAtDay(day)), 0, Math.sin(orbitAngleAtDay(day))).multiplyScalar(4.05)
const worldSunDirection = day => earthPosition(day).negate().normalize()
const earthRotation = (tilt, spin = 0) => new Matrix4().makeRotationZ(-tilt * DEG).multiply(new Matrix4().makeRotationY(spin))
const tilts = [0, 10, AXIAL_TILT]
const sampleDays = [1, 35.25, 79, 111.4, 172, 217.8, 266, 308.7, 356, 365.99]

test('分至日映射到四个季节方向，赤纬分别为0、当前倾角、0、负倾角', () => {
  for (const [day, theta, sign] of [[79, -Math.PI / 2, 0], [172, -Math.PI, 1], [266, -Math.PI * 1.5, 0], [356, -Math.PI * 2, -1]]) {
    near(angleDistance(orbitAngleAtDay(day), theta), 0)
    for (const tilt of tilts) near(declinationAtDay(day, tilt), sign * tilt)
  }
  near(AXIAL_TILT * 60, MAX_OBLIQUITY_MINUTES)
  assert.equal(formatDegreesMinutes(MAX_OBLIQUITY_MINUTES / 60), '23°26′')
  assert.equal(formatDegreesMinutes(0), '0°00′')
  assert.equal(formatDegreesMinutes(600 / 60), '10°00′')
})

test('跨年及四季分段边界位置连续，365天后位置与赤纬重合', () => {
  for (const day of [-365.2, 0, ...sampleDays, 366, 444]) {
    near(earthPosition(day).distanceTo(earthPosition(day + 365)), 0)
    for (const tilt of tilts) {
      near(declinationAtDay(day, tilt), declinationAtDay(day + 365, tilt))
      near(angleDistance(solarLongitudeAtDay(day, tilt), solarLongitudeAtDay(day + 365, tilt)), 0)
    }
  }
  for (const boundary of [1, 79, 172, 266, 356, 366]) {
    const before = boundary - 1e-5
    const after = boundary + 1e-5
    const step = angleDistance(orbitAngleAtDay(after), orbitAngleAtDay(before))
    assert.ok(step < 0 && step > -1e-6, `Boundary ${boundary} must advance smoothly in the same direction`)
    assert.ok(earthPosition(before).distanceTo(earthPosition(after)) < 2e-6)
    for (const tilt of tilts) near(declinationAtDay(before, tilt), declinationAtDay(after, tilt), 2e-5)
  }
  const next = advanceEarthMotion({ orbitDay: 365.99, spinRadians: 1.2 }, .02, { revolution: true, rotation: false })
  near(next.orbitDay, 1.01)
  assert.ok(earthPosition(365.99).distanceTo(earthPosition(next.orbitDay)) < .002)
})

test('0度、10度和默认倾角的地轴世界方向与太阳点积，等于数据赤纬正弦', () => {
  for (const tilt of tilts) {
    const worldAxis = new Vector3(0, 1, 0).transformDirection(earthRotation(tilt))
    for (const day of sampleDays) {
      const sun = worldSunDirection(day)
      near(worldAxis.dot(sun), Math.sin(declinationAtDay(day, tilt) * DEG), 1e-12, `tilt=${tilt}, day=${day}`)
      const equatorialSun = sun.clone().transformDirection(earthRotation(tilt).invert())
      near(angleDistance(Math.atan2(-equatorialSun.z, equatorialSun.x), solarLongitudeAtDay(day, tilt)), 0)
    }
  }
})

test('多城市经纬度经过真实自转和地轴变换后的太阳高度，与页面数据方程一致', () => {
  const cities = [
    ['北京', 39.9, 116.4], ['厦门', 24.48, 118.08], ['新加坡', 1.35, 103.82],
    ['悉尼', -33.87, 151.21], ['特罗姆瑟', 69.65, 18.96],
    ['纽约', 40.71, -74.01], ['赤道西经180度', 0, -180], ['北极', 90, 0], ['南极', -90, 0],
  ]
  for (const tilt of tilts) for (const day of sampleDays) for (const spin of [0, .73, Math.PI, 5.81]) {
    const rotation = earthRotation(tilt, spin)
    const sun = worldSunDirection(day)
    const declination = declinationAtDay(day, tilt)
    for (const [name, latitude, longitude] of cities) {
      const normal = latLngToVector(latitude, longitude, 1).transformDirection(rotation)
      const solarMinutes = solarMinutesFromRotation(solarLongitudeAtDay(day, tilt), spin, longitude)
      const dataAltitude = altitudeFromHourAngle(latitude, declination, (solarMinutes - 720) / 4)
      near(Math.sin(dataAltitude * DEG), normal.dot(sun), 1e-11, `${name}, tilt=${tilt}, day=${day}, spin=${spin}`)
    }
  }
})

test('调整倾角后以同一自转相位重算地方太阳时，反解仍恢复原相位', () => {
  for (const day of [35.25, 111.4, 217.8, 308.7]) for (const spin of [-1.1, 0, 2.7, 8.2]) {
    for (const longitude of [-180, -74.01, 0, 118.08, 180]) {
      const originalState = Object.freeze({ orbitDay: day, spinRadians: spin })
      for (const tilt of tilts) {
        const solarLongitude = solarLongitudeAtDay(originalState.orbitDay, tilt)
        const minutes = solarMinutesFromRotation(solarLongitude, originalState.spinRadians, longitude)
        const reconstructed = rotationFromSolarMinutes(solarLongitude, minutes, longitude)
        near(angleDistance(reconstructed, originalState.spinRadians), 0)
      }
      assert.deepEqual(originalState, { orbitDay: day, spinRadians: spin })
    }
  }
  const before = solarMinutesFromRotation(solarLongitudeAtDay(111.4, AXIAL_TILT), 2.7, 118.08)
  const after = solarMinutesFromRotation(solarLongitudeAtDay(111.4, 0), 2.7, 118.08)
  assert.ok(Math.abs(before - after) > 1, '固定自转相位调倾角时，太阳时应重新计算，而非锁死旧读数')
})

test('当前倾角决定直射回归线及极圈昼夜临界，0度时极点全天沿地平线', () => {
  for (const tilt of tilts) {
    const tropic = tilt
    const polarCircle = 90 - tilt
    near(tropic + polarCircle, 90)
    for (const hemisphere of [-1, 1]) {
      const summerDay = hemisphere > 0 ? 172 : 356
      const winterDay = hemisphere > 0 ? 356 : 172
      const summerDeclination = declinationAtDay(summerDay, tilt)
      const winterDeclination = declinationAtDay(winterDay, tilt)
      near(altitudeFromHourAngle(hemisphere * tropic, summerDeclination, 0), 90, 1e-6)
      near(altitudeFromHourAngle(hemisphere * polarCircle, summerDeclination, 180), 0)
      near(altitudeFromHourAngle(hemisphere * polarCircle, winterDeclination, 0), 0)
      if (tilt > 0) {
        assert.ok(altitudeFromHourAngle(hemisphere * (polarCircle + .1), summerDeclination, 180) > 0)
        assert.ok(altitudeFromHourAngle(hemisphere * (polarCircle + .1), winterDeclination, 0) < 0)
      } else {
        for (const hourAngle of [-180, -90, 0, 90, 180]) near(altitudeFromHourAngle(hemisphere * 90, 0, hourAngle), 0)
      }
    }
  }
})

test('太阳视运动日周路径随倾角改变，同时保持与当地赤道晷面平行', () => {
  for (const tilt of tilts) for (const latitude of [-33.87, 0, 24.48, 39.9, 90]) {
    const dialNormal = polarAxis(latitude)
    for (const day of sampleDays) {
      const declination = declinationAtDay(day, tilt)
      const first = solarPathDirection(latitude, declination, 0)
      for (const hour of [0, 3, 6, 12, 18, 21, 24]) {
        const direction = solarPathDirection(latitude, declination, hour)
        near(direction.dot(dialNormal), Math.sin(declination * DEG))
        near(direction.clone().sub(first).dot(dialNormal), 0)
        if (!tilt) near(direction.dot(dialNormal), 0)
      }
    }
  }
})
