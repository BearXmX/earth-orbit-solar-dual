import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Vector3 } from 'three'

const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const compiled = new Map()
async function compileModule(url, mode) {
  const key = `${mode}:${url.href}`
  if (compiled.has(key)) return compiled.get(key)
  // Replace only Vite's build-time environment boundary; all calculations stay production code.
  const source = (await readFile(url, 'utf8')).replace(/import\.meta\.env\?\.VITE_ANGLE_FORMAT/g, mode === undefined ? 'undefined' : JSON.stringify(mode))
  let code = transpile(source).replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) {
    code = code.replace(match[0], `from '${await compileModule(new URL(`${match[1]}.ts`, url), mode)}'`)
  }
  const result = dataUrl(code)
  compiled.set(key, result)
  return result
}
const load = async (path, mode) => import(await compileModule(new URL(path, import.meta.url), mode))
const sunSource = await readFile(new URL('../src/sun.vue', import.meta.url), 'utf8')
const sunTree = ts.createSourceFile('sun.ts', parse(sunSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
function actualFunction(name) {
  const declaration = sunTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, name)
  return `export ${declaration.getText(sunTree)}`
}
function actualVariable(name) {
  const declaration = sunTree.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => ts.isIdentifier(node.name) && node.name.text === name)
  assert.ok(declaration?.initializer, name)
  return declaration.initializer
}
async function loadSolarPaths(mode) {
  const props = actualVariable('props')
  assert.ok(ts.isCallExpression(props))
  return import(dataUrl(transpile([
    `import * as THREE from '${import.meta.resolve('three')}'`,
    `import { AXIAL_TILT } from '${await compileModule(new URL('../src/utils/astronomy.ts', import.meta.url), mode)}'`,
    `import { sunDirection } from '${await compileModule(new URL('../src/utils/sundial.ts', import.meta.url), mode)}'`,
    `const SKY_RADIUS = ${actualVariable('SKY_RADIUS').getText(sunTree)};`,
    `const POLAR_EPS = ${actualVariable('POLAR_EPS').getText(sunTree)};`,
    `export const defaultProps = ${props.arguments[1].getText(sunTree)};`,
    ...['buildSunPathPoints', 'isHorizonPath', 'computeSolarMetricsByDeclination', 'dayLengthInfoByDeclination',
      'solarToPosition', 'degToRad', 'radToDeg', 'clamp', 'normalize360'].map(actualFunction),
  ].join('\n'))))
}
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)

for (const [mode, label, tilt, tiltLabel, circleLabel, zero] of [
  [undefined, '默认度分版', 23 + 26 / 60, '23°26′', '66°34′', '0°00′'],
  ['decimal', '小数版', 23.5, '23.5°', '66.5°', '0.0°'],
]) {
  test(`${label}：默认倾角、极圈和格式化精度一起切换，保留进位与零值符号约束`, async () => {
    const astronomy = await load('../src/utils/astronomy.ts', mode)
    assert.equal(astronomy.ANGLE_FORMAT, mode ?? 'dms')
    near(astronomy.AXIAL_TILT, tilt)
    near(astronomy.MAX_OBLIQUITY_MINUTES, mode ? 1410 : 1406)
    near(astronomy.POLAR_CIRCLE, 90 - tilt)
    assert.equal(astronomy.AXIAL_TILT_LABEL, tiltLabel)
    assert.equal(astronomy.POLAR_CIRCLE_LABEL, circleLabel)
    assert.equal(astronomy.latitudeMagnitudeLabel(-tilt), tiltLabel)
    for (const value of [-0.00001, -0, 0, 0.00001]) {
      assert.equal(astronomy.formatDegreesMinutes(value), zero)
      assert.equal(astronomy.formatSignedDegreesMinutes(value), zero)
    }
    assert.equal(astronomy.formatDegreesMinutes(12.999), mode ? '13.0°' : '13°00′')
    assert.equal(astronomy.formatSignedDegreesMinutes(-12.999), mode ? '−13.0°' : '−13°00′')
    assert.equal(astronomy.formatSignedDegreesMinutes(12.999), mode ? '+13.0°' : '+13°00′')
    for (const value of [NaN, Infinity, -Infinity]) {
      assert.equal(astronomy.formatDegreesMinutes(value), '—')
      assert.equal(astronomy.formatSignedDegreesMinutes(value), '—')
    }
  })

  test(`${label}：太阳方位和罗盘以本版精度一次取整，进位后回到正北`, async () => {
    const { solarAzimuthText } = await load('../src/utils/sundial.ts', mode)
    const { formatCompassHeading } = await load('../src/utils/compass.ts', mode)
    for (const format of [angle => solarAzimuthText(30, angle), formatCompassHeading]) {
      assert.equal(format(359.999), zero)
      assert.equal(format(-0.001), zero)
      assert.equal(format(720), zero)
      assert.equal(format(123.449), mode ? '123.4°' : '123°27′')
      if (mode) {
        assert.equal(format(359.96), zero)
        assert.equal(format(359.94), '359.9°')
      }
    }
    assert.equal(solarAzimuthText(90, 123), '天顶（方位不定）')
    assert.equal(solarAzimuthText(-90, 123), '天底（方位不定）')
  })

  test(`${label}：分至日实际赤纬、太阳场景默认值与日晷平行轨迹使用同一个模型倾角`, async () => {
    const { declinationAtDay } = await load('../src/utils/earthOrbit.ts', mode)
    const { polarAxis } = await load('../src/utils/sundial.ts', mode)
    const paths = await loadSolarPaths(mode)
    near(paths.defaultProps.axialTilt, tilt)
    for (const [day, expectedDeclination] of [[79, 0], [172, tilt], [266, 0], [356, -tilt]]) {
      const declination = declinationAtDay(day)
      near(declination, expectedDeclination)
      for (const latitude of [-90, -(90 - tilt), -33.87, 0, 24.48, 39.9, 90 - tilt, 90]) {
        const points = paths.buildSunPathPoints(latitude, declination)
        const axis = polarAxis(latitude)
        for (const point of points) near(point.dot(axis), 7.6 * Math.sin(declination * Math.PI / 180))
      }
    }
    near(paths.computeSolarMetricsByDeclination(tilt, declinationAtDay(172), 12).altitude, 90, 1e-6)
    near(paths.computeSolarMetricsByDeclination(90 - tilt, declinationAtDay(172), 0).altitude, 0)
    near(paths.computeSolarMetricsByDeclination(90 - tilt, declinationAtDay(356), 12).altitude, 0)
  })

  test(`${label}：三维黄赤交角标签复用公共格式，图形终点同步`, async () => {
    const { createObliquityHelper } = await load('../src/scene/createObliquityHelper.ts', mode)
    const texts = []
    const context = new Proxy({ fillText: text => texts.push(text) }, { get: (target, key) => target[key] ?? (() => {}) })
    const originalDocument = globalThis.document
    globalThis.document = { createElement: () => ({ getContext: () => context }) }
    let helper
    try {
      helper = createObliquityHelper(0.56, tilt * Math.PI / 180)
      assert.ok(texts.includes(tiltLabel))
      const arc = helper.group.getObjectByName('obliquity-angle-arc').geometry.getAttribute('position')
      const endpoint = new Vector3().fromBufferAttribute(arc, arc.count - 1)
      near(Math.atan2(-endpoint.y, endpoint.x) * 180 / Math.PI, tilt, 1e-5)
      helper.setTilt(0)
      assert.ok(texts.includes(zero))
    } finally {
      helper?.dispose()
      if (originalDocument === undefined) delete globalThis.document
      else globalThis.document = originalDocument
    }
  })
}
