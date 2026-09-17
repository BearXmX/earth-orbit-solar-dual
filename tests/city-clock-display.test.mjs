import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'

const sunSource = await readFile(new URL('../src/sun.vue', import.meta.url), 'utf8')
const sunTree = ts.createSourceFile('sun.ts', parse(sunSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const sundialTree = ts.createSourceFile('sundial.ts', await readFile(new URL('../src/utils/sundial.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
function actualFunction(tree, name) {
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, `${name} must come from the current production source`)
  return declaration.getText(tree).replace(/^export\s+/, '')
}
const astronomySource = await readFile(new URL('../src/utils/astronomy.ts', import.meta.url), 'utf8')
const code = ts.transpileModule([
  `import * as THREE from '${import.meta.resolve('three')}'`,
  astronomySource,
  actualFunction(sundialTree, 'solarAzimuthText'),
  'export function createCityClockHarness() {',
  'const POLAR_EPS = 1e-10;',
  'const streetLightItems = [], windowLightItems = [], trafficLightItems = [], cityRoadMaterials = [];',
  'const props = { sunriseText: "极昼", sunsetText: "极昼", dayLengthText: "24小时" };',
  'const texts = []; const texture = new THREE.Texture();',
  // Only replace the canvas drawing boundary; cache decisions and displayed text stay real.
  'const ctx = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), fillText: text => texts.push(text) },',
  '  { get: (target, key) => target[key] ?? (() => {}) });',
  'const cityClockItems = [{ ctx, texture }];',
  ...['updateCityTimeElements', 'drawCityClockTexture', 'normalizeParentSunText', 'formatClock', 'roundRect', 'smoothstep',
    'computeSolarMetricsByDeclination', 'dayLengthInfoByDeclination', 'degToRad', 'radToDeg', 'clamp', 'normalize360']
    .map(name => actualFunction(sunTree, name)),
  'return { props, texture, texts, update(latitude, declination) {',
  '  const metrics = computeSolarMetricsByDeclination(latitude, declination, 12);',
  '  updateCityTimeElements(0, 1, metrics);',
  '  return metrics;',
  '} };',
  '}',
].join('\n'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { createCityClockHarness } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const angularReadout = app => app.texts.filter(text => text.startsWith('高度角 ')).at(-1)

test('城市信息牌在北极圈夏至正午微调倾角后立即更新角分读数', () => {
  const app = createCityClockHarness()
  try {
    const initialTilt = 23 + 26 / 60
    app.update(90 - initialTilt, initialTilt)
    assert.match(angularReadout(app), /高度角 \+46°52′/)
    assert.equal(app.texture.version, 1)

    const changedTilt = 23 + 25 / 60
    app.update(90 - changedTilt, changedTilt)
    assert.match(angularReadout(app), /高度角 \+46°50′/)
    assert.equal(app.texture.version, 2, 'A two-arcminute change must repaint the board even within the same integer degree')

    app.update(90 - changedTilt, changedTilt)
    assert.equal(app.texture.version, 2, 'An unchanged displayed value should retain its cached texture')
  } finally { app.texture.dispose() }
})

test('太阳时和高度角相同、太阳转到相反方位时，城市信息牌仍刷新方位角', () => {
  const app = createCityClockHarness()
  Object.assign(app.props, { sunriseText: '06:00:00', sunsetText: '18:00:00', dayLengthText: '12小时00分' })
  try {
    const north = app.update(39.9, 0)
    assert.match(angularReadout(app), /方位角 180°00′/)
    const south = app.update(-39.9, 0)
    assert.equal(north.altitude, south.altitude)
    assert.equal(north.solarTime, south.solarTime)
    assert.match(angularReadout(app), /方位角 0°00′/)
    assert.equal(app.texture.version, 2, 'A changed azimuth must repaint even when every other board field stays unchanged')
  } finally { app.texture.dispose() }
})
