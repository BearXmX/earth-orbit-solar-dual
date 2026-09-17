import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/compass.ts', import.meta.url), 'utf8')
const astronomySource = await readFile(new URL('../src/utils/astronomy.ts', import.meta.url), 'utf8')
const combined = astronomySource + '\n' + source.replace(/import \{ formatDegreesMinutes \} from '\.\/astronomy'/, '')
const compiled = ts.transpileModule(combined, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { COMPASS_DIRECTIONS, normalizeCompassHeading, compassPoint, compassDirection, formatCompassHeading } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`)

test('八方位从北顺时针每45度排列，角度读数正确归一化', () => {
  assert.deepEqual(COMPASS_DIRECTIONS.map(({ label, bearing }) => [label, bearing]), [
    ['北', 0], ['东北', 45], ['东', 90], ['东南', 135], ['南', 180], ['西南', 225], ['西', 270], ['西北', 315],
  ])
  for (const [input, expected] of [[0, 0], [360, 0], [-90, 270], [450, 90], [-720, 0]]) near(normalizeCompassHeading(input), expected)
  assert.equal(formatCompassHeading(90), '90°00′')
  assert.equal(formatCompassHeading(359.999), '0°00′')
  assert.equal(formatCompassHeading(-90), '270°00′')
  near(normalizeCompassHeading(Number.NaN), 0)
})

test('朝北/东/南/西时，北方分别位于罗盘上/左/下/右', () => {
  for (const [heading, x, y] of [[0, 110, 33], [90, 33, 110], [180, 110, 187], [270, 187, 110]]) {
    const north = compassPoint(0, heading, 77)
    near(north.x, x)
    near(north.y, y)
    const forward = compassPoint(heading, heading, 77)
    near(forward.x, 110)
    near(forward.y, 33)
  }
})

test('每个方位的顺时针右侧始终在右；跨越360度时罗盘位置连续', () => {
  for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const right = compassPoint(heading + 90, heading, 77)
    near(right.x, 187)
    near(right.y, 110)
    assert.equal(compassDirection(heading).bearing, heading)
  }
  for (const direction of COMPASS_DIRECTIONS) {
    const before = compassPoint(direction.bearing, 359.999, 77)
    const after = compassPoint(direction.bearing, .001, 77)
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < .003)
  }
  assert.equal(compassDirection(359).label, '北')
  assert.equal(compassDirection(22.4).label, '北')
  assert.equal(compassDirection(22.5).label, '东北')
})
