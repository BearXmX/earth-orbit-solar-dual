import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Vector3 } from 'three'

// Exercise the actual scene builders, including their generated Three.js geometry.
const source = await readFile(new URL('../src/sun.vue', import.meta.url), 'utf8')
const tree = ts.createSourceFile('sun.ts', parse(source).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const builders = ['createAngleSector', 'makeArcLine', 'makeTubeLine'].map(name => {
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, `${name} must be tested from sun.vue`)
  return `export ${declaration.getText(tree)}`
})
const code = ts.transpileModule([
  `import * as THREE from '${import.meta.resolve('three')}'`,
  ...builders,
].join('\n'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { createAngleSector, makeArcLine } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

function checkGeometry(altitude, azimuth) {
  const radians = Math.PI / 180
  const origin = new Vector3(1.2, 0.8, -0.9)
  const radius = 1.48
  const horizon = new Vector3(-Math.sin(azimuth * radians), 0, Math.cos(azimuth * radians))
  const solarDirection = horizon.clone().multiplyScalar(Math.cos(altitude * radians))
    .addScaledVector(new Vector3(0, 1, 0), Math.sin(altitude * radians))
  const planeNormal = new Vector3().crossVectors(horizon, new Vector3(0, 1, 0)).normalize()
  const expectedStart = origin.clone().addScaledVector(horizon, radius)
  const expectedEnd = origin.clone().addScaledVector(solarDirection, radius)
  const sector = createAngleSector(origin, horizon, solarDirection, radius, 0xffffff)
  const arc = makeArcLine(origin, horizon, solarDirection, radius, 0xffffff)
  try {
    const sectorPositions = sector.geometry.getAttribute('position')
    const sectorPoints = Array.from({ length: sectorPositions.count - 1 }, (_, i) => new Vector3().fromBufferAttribute(sectorPositions, i + 1))
    const arcCurve = arc.geometry.parameters.path
    const arcPoints = arcCurve.getPoints(96)
    for (const points of [sectorPoints, arcPoints]) {
      assert.ok(points[0].distanceTo(expectedStart) < 1e-6, `start: h=${altitude}, az=${azimuth}`)
      assert.ok(points.at(-1).distanceTo(expectedEnd) < 1e-6, `end: h=${altitude}, az=${azimuth}`)
      for (const point of points) {
        assert.ok(point.toArray().every(Number.isFinite), 'angle geometry must remain finite at zero altitude')
        assert.ok(Math.abs(point.clone().sub(origin).dot(planeNormal)) < 1e-6, `solar plane: h=${altitude}, az=${azimuth}`)
      }
    }
    assert.ok(Array.from(arc.geometry.getAttribute('position').array).every(Number.isFinite))
  } finally {
    sector.geometry.dispose()
    sector.material.dispose()
    arc.geometry.dispose()
    arc.material.dispose()
  }
}

test('日出日落附近正负小高度角的扇形和弧线均接到太阳方向，并保持在竖直太阳平面', () => {
  for (const altitude of [-0.57, -0.5, -0.1, -0.00001, 0.00001, 0.1, 0.5, 0.57, 0.6]) {
    for (const azimuth of [0, 47, 90, 180, 270]) checkGeometry(altitude, azimuth)
  }
})

test('零高度角和天顶边界的角度几何终点正确，退化角度不产生非法坐标', () => {
  for (const altitude of [0, 90]) for (const azimuth of [0, 47, 90, 180, 270]) checkGeometry(altitude, azimuth)
})
