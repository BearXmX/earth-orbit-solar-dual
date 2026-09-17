import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Vector3 } from 'three'

const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const appTree = ts.createSourceFile('App.ts', parse(appSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const orbitSource = await readFile(new URL('../src/utils/earthOrbit.ts', import.meta.url), 'utf8')
const orbitTree = ts.createSourceFile('earthOrbit.ts', orbitSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)

function actualFunction(tree, name) {
  const node = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name)
  assert.ok(node, `Production source must contain ${name}`)
  return node
}

function actualVariable(statements, name) {
  const statement = statements.find(item => ts.isVariableStatement(item) && item.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name))
  assert.ok(statement, `Production source must contain ${name}`)
  return statement
}

const layerDeclaration = actualVariable(appTree.statements, 'layers').declarationList.declarations.find(declaration => declaration.name.getText(appTree) === 'layers')
assert.ok(ts.isCallExpression(layerDeclaration.initializer))
const layerDefaults = layerDeclaration.initializer.arguments[0].getText(appTree)
const animationStatements = actualFunction(appTree, 'updateAnimatedOrbitFrame').body.statements
const productionLightingUpdate = animationStatements.find(statement => ts.isExpressionStatement(statement)
  && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(appTree) === 'updateLatitudeLineLighting')
assert.ok(productionLightingUpdate, 'The actual animated orbit frame must update latitude lighting')

// Execute the current grid and material functions. The orbit slice below retains the exact
// production Earth/Sun calculations and lighting call, without unrelated scene/UI setup.
const code = ts.transpileModule([
  `import * as THREE from '${import.meta.resolve('three')}'`,
  ...['DEG', 'EARTH_R', 'ORBIT_R'].map(name => actualVariable(appTree.statements, name).getText(appTree)),
  actualVariable(orbitTree.statements, 'TERM_DAYS').getText(orbitTree),
  actualFunction(orbitTree, 'orbitAngleAtDay').getText(orbitTree).replace(/^export\s+/, ''),
  'export function createLatitudeHarness() {',
  `const layers = ${layerDefaults}; let latitudeLightMaterials = [];`,
  ...['createLatLngGrid', 'createLightAwareLatitudeLine', 'updateLatitudeLineLighting', 'latLngToVector', 'orbitThetaByDay']
    .map(name => actualFunction(appTree, name).getText(appTree)),
  'function build(flags = {}) {',
  'for (const name of Object.keys(layers)) layers[name] = false;',
  'Object.assign(layers, flags); return createLatLngGrid();',
  '}',
  'function updateOrbitDay(day) {',
  ...['theta', 'earthPos', 'earthToSunWorld'].map(name => actualVariable(animationStatements, name).getText(appTree)),
  productionLightingUpdate.getText(appTree),
  'return earthPos;',
  '}',
  'return { layers, build, updateOrbitDay, updateLatitudeLineLighting, get materials() { return latitudeLightMaterials } };',
  '}',
].join('\n'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { createLatitudeHarness } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const latitudeLines = group => group.children.filter(object => object.isLine && object.material.isShaderMaterial)
function dispose(group) {
  group.traverse(object => {
    object.geometry?.dispose()
    object.material?.dispose()
  })
}

test('ordinary latitudes can be hidden while either or both arc overlays still create all 11 circles including the equator', () => {
  for (const [day, night] of [[true, false], [false, true], [true, true]]) {
    const app = createLatitudeHarness()
    const group = app.build({ latitudeDayArc: day, latitudeNightArc: night })
    try {
      const lines = latitudeLines(group)
      assert.equal(lines.length, 11)
      assert.equal(app.materials.length, 11)
      assert.deepEqual(lines.map(line => line.name), Array.from({ length: 11 }, (_, index) => `latitude-${-75 + index * 15}`))
      const equator = group.getObjectByName('latitude-0')
      for (let index = 0; index < equator.geometry.attributes.position.count; index++) near(equator.geometry.attributes.position.getY(index), 0)
      for (const line of lines) {
        const { uniforms } = line.material
        assert.equal(uniforms.baseOpacity.value, 0)
        assert.equal(uniforms.dayArcEnabled.value, Number(day))
        assert.equal(uniforms.nightArcEnabled.value, Number(night))
        const points = line.geometry.attributes.position
        assert.ok(points.count > 3)
        near(new Vector3().fromBufferAttribute(points, 0).distanceTo(new Vector3().fromBufferAttribute(points, points.count - 1)), 0)
      }
    } finally { dispose(group) }
  }
})

test('the equator plane alone retains exactly one red equator line; ordinary latitudes retain their base appearance', () => {
  const app = createLatitudeHarness()
  for (const [flags, expectedCount] of [[{}, 0], [{ equator: true }, 1], [{ latitudeLines: true }, 11]]) {
    const group = app.build(flags)
    try {
      const lines = latitudeLines(group)
      assert.equal(lines.length, expectedCount)
      if (!expectedCount) continue
      const equator = group.getObjectByName('latitude-0')
      assert.ok(equator)
      assert.equal(equator.material.uniforms.baseOpacity.value, 1)
      const color = equator.material.uniforms.baseColor.value
      assert.ok(color.r > color.g && color.r > color.b, 'The base equator remains red')
      for (const line of lines) {
        const { uniforms } = line.material
        assert.ok(uniforms.baseOpacity.value > 0)
        assert.equal(uniforms.dayArcEnabled.value, 0)
        assert.equal(uniforms.nightArcEnabled.value, 0)
        const day = uniforms.dayColor.value
        const night = uniforms.nightColor.value
        assert.ok(day.r > day.g && day.g > day.b, 'Day arcs use gold')
        assert.ok(night.b > night.g && night.g > night.r, 'Night arcs use blue')
      }
    } finally { dispose(group) }
  }
})

test('day and night toggles independently update every existing material without changing base visibility', () => {
  const app = createLatitudeHarness()
  const group = app.build({ latitudeLines: true })
  try {
    const materials = [...app.materials]
    const baseOpacities = materials.map(material => material.uniforms.baseOpacity.value)
    const direction = new Vector3(-1, .4, .6).normalize()
    const unchangedDirection = direction.clone()
    for (const [day, night] of [[true, false], [true, true], [false, true], [false, false]]) {
      app.layers.latitudeDayArc = day
      app.layers.latitudeNightArc = night
      app.updateLatitudeLineLighting(direction)
      assert.deepEqual(app.materials, materials)
      materials.forEach((material, index) => {
        assert.equal(material.uniforms.dayArcEnabled.value, Number(day))
        assert.equal(material.uniforms.nightArcEnabled.value, Number(night))
        assert.equal(material.uniforms.baseOpacity.value, baseOpacities[index])
        near(material.uniforms.sunDir.value.distanceTo(direction), 0)
        assert.notEqual(material.uniforms.sunDir.value, direction, 'Materials copy rather than own the caller\'s vector')
      })
    }
    near(direction.distanceTo(unchangedDirection), 0)
  } finally { dispose(group) }
})

test('the actual animated orbit frame supplies the current world-space direction toward the Sun to every latitude', () => {
  const app = createLatitudeHarness()
  const group = app.build({ latitudeDayArc: true, latitudeNightArc: true })
  try {
    let previous
    for (const day of [1, 79, 111.5, 172, 266, 356, 366]) {
      const center = app.updateOrbitDay(day)
      const worldSunDirection = new Vector3().sub(center).normalize()
      for (const material of app.materials) {
        near(material.uniforms.sunDir.value.distanceTo(worldSunDirection), 0)
        near(material.uniforms.sunDir.value.length(), 1)
      }
      if (previous) assert.ok(worldSunDirection.distanceTo(previous) > .01)
      previous = worldSunDirection.clone()
    }
  } finally { dispose(group) }
})
