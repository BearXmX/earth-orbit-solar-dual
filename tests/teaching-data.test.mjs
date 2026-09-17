import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'

const source = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.ts', parse(source).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const functions = ['formatDuration', 'dayLengthInfo', 'altitudeFromHourAngle', 'clamp', 'formatLat', 'formatLng', 'currentLatitudeLabel', 'signedDeg', 'normalizeLng'].map(name => {
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, name)
  return `export ${declaration.getText(tree)}`
})
const constants = ['DEG', 'RAD', 'POLAR_EPS'].map(name => {
  const declaration = tree.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
    .find(node => ts.isIdentifier(node.name) && node.name.text === name)
  assert.ok(declaration?.initializer, name)
  return `const ${name} = ${declaration.initializer.getText(tree)}`
})
const astronomySource = await readFile(new URL('../src/utils/astronomy.ts', import.meta.url), 'utf8')
const code = ts.transpileModule([astronomySource, ...constants, ...functions].join('\n'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { formatDuration, dayLengthInfo, altitudeFromHourAngle, signedDeg, formatLat, formatLng } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('日长按总分钟进位，小时边界及24小时都不显示60分', () => {
  for (const [input, expected] of [[0, '0小时00分'], [12.999, '13小时00分'], [23.999, '24小时00分'], [0.999, '1小时00分'], [12.5, '12小时30分'], [24, '24小时00分']]) {
    assert.equal(formatDuration(input), expected)
  }
  assert.equal(formatDuration(Number.NaN), '—')
})

test('极圈以内的短昼和短夜保留，状态与午间和午夜真实太阳中心高度一致', () => {
  const tilt = 23 + 26 / 60
  const circle = 90 - tilt
  for (const hemisphere of [-1, 1]) {
    const lat = hemisphere * (circle - 0.01)
    for (const declination of [-tilt, tilt]) {
      const info = dayLengthInfo(lat, declination)
      assert.equal(info.type, 'normal')
      assert.ok(info.dayLength > 0 && info.dayLength < 24)
      assert.ok(altitudeFromHourAngle(lat, declination, 0) > 0)
      assert.ok(altitudeFromHourAngle(lat, declination, 180) < 0)
    }
    assert.equal(dayLengthInfo(hemisphere * circle, hemisphere * tilt).type, 'polar-day')
    assert.equal(dayLengthInfo(hemisphere * circle, -hemisphere * tilt).type, 'polar-night')
  }
})

test('数据面板当前高度、正午高度和经纬度统一为度分，角分进位不泄露小数', () => {
  assert.equal(signedDeg(73.2), '+73°12′')
  assert.equal(signedDeg(73.5), '+73°30′')
  assert.equal(signedDeg(-12.999), '−13°00′')
  assert.equal(formatLat(39.9), '北纬39°54′')
  assert.equal(formatLng(116.4), '东经116°24′')
  assert.equal(formatLat(-33.87), '南纬33°52′')
  assert.equal(formatLng(-0.001), '0°00′')
  assert.equal(formatLat(23 + 26 / 60), '北纬23°26′')
})
