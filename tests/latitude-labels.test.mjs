import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import * as THREE from 'three'

const app = ts.createSourceFile('App.ts', parse(await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const astronomy = await readFile(new URL('../src/utils/astronomy.ts', import.meta.url), 'utf8')
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const actualFunction = name => app.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(app)
async function createHarness(mode) {
  const source = astronomy.replace(/import\.meta\.env\?\.VITE_ANGLE_FORMAT/g, JSON.stringify(mode))
  const { AXIAL_TILT, formatDegreesMinutes } = await import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`)
  return new Function('THREE', 'formatDegreesMinutes', 'AXIAL_TILT', compile([
    'const DEG=Math.PI/180, EARTH_R=.56;',
    'const axialTilt={value:AXIAL_TILT}; const polarCircle={get value(){return 90-axialTilt.value}};',
    'const layers={latitudeLabels:true,tropics:false}; let latitudeLightMaterials=[];',
    'function alwaysLabelSprite(text,color,scale,position){const sprite=new THREE.Sprite();sprite.position.copy(position);sprite.userData={text,color};return sprite;}',
    ...['createLatLngGrid', 'formatGridLat', 'currentLatitudeLabel', 'latLngToVector'].map(actualFunction),
    'return {layers,axialTilt,build:createLatLngGrid};',
  ].join('\n')))(THREE, formatDegreesMinutes, AXIAL_TILT)
}
function labels(group) { return group.children.filter(child => child.isSprite) }
function dispose(group) { labels(group).forEach(sprite => sprite.material.dispose()) }

for (const [mode, angle, special] of [
  ['dms', 23+26/60, ['23°26′N','23°26′S','66°34′N','66°34′S']],
  ['decimal',23.5,['23.5°N','23.5°S','66.5°N','66.5°S']],
]) {
  const ordinary = ['75°S', '60°S', '45°S', '30°S', '15°S', '0°', '15°N', '30°N', '45°N', '60°N', '75°N']

  test(`${mode}普通纬度标注仅显示常规11个值，回归线极圈度数只随对应开关和倾角变化`, async () => {
    const app = await createHarness(mode)
    let group = app.build()
    const ordinaryRadius = labels(group)[0].position.length()
    try {
      assert.deepEqual(labels(group).map(label => label.userData.text), ordinary)
      for (const label of labels(group)) {
        assert.ok(Math.abs(label.position.z) < 1e-12 && label.position.x > 0, '普通纬度标签沿 0° 经线排列')
        assert.ok(Math.abs(label.position.length() - ordinaryRadius) < 1e-12)
      }
    } finally { dispose(group) }

    Object.assign(app.layers, { latitudeLabels: false, tropics: true })
    group = app.build()
    try {
      assert.deepEqual(labels(group).map(label => label.userData.text).sort(), [...special].sort())
      for (const latitude of [angle, -angle, 90 - angle, angle - 90]) {
        const label = group.getObjectByName(`latitude-label-${latitude}`)
        assert.ok(label)
        assert.ok(Math.abs(Math.asin(label.position.y / label.position.length()) * 180 / Math.PI - latitude) < 1e-9)
        assert.ok(Math.abs(label.position.z) < 1e-12 && label.position.x > 0, '特殊纬度标签与普通标注共用 0° 经线')
        assert.ok(Math.abs(label.position.length() - ordinaryRadius) < 1e-12, '特殊纬度标签与普通标注使用相同半径')
      }
    } finally { dispose(group) }

    app.axialTilt.value = 10
    group = app.build()
    try {
      assert.deepEqual(labels(group).map(label => label.userData.text).sort(), ['10°N', '10°S', '80°N', '80°S'])
    } finally { dispose(group) }

    Object.assign(app.layers, { latitudeLabels: true, tropics: false })
    group = app.build()
    try {
      assert.deepEqual(labels(group).map(label => label.userData.text), ordinary)
    } finally { dispose(group) }
  })

  test(`${mode}回归线极圈与普通纬度标签分别开关，合开15个而关闭特殊层只保留11个`, async () => {
    const app = await createHarness(mode)
    const cases = [
      { latitudeLabels: false, tropics: false, count: 0 },
      { latitudeLabels: false, tropics: true, count: 4 },
      { latitudeLabels: true, tropics: true, count: 15 },
      { latitudeLabels: true, tropics: false, count: 11 },
      { latitudeLabels: false, tropics: false, count: 0 },
      { latitudeLabels: true, tropics: true, count: 15 },
      { latitudeLabels: false, tropics: true, count: 4 },
    ]
    for (const { latitudeLabels, tropics, count } of cases) {
      Object.assign(app.layers, { latitudeLabels, tropics })
      const group = app.build()
      try {
        const result = labels(group)
        assert.equal(result.length, count)
        assert.equal(new Set(result.map(label => label.userData.text)).size, count)
        assert.equal(new Set(result.map(label => label.name)).size, count)
        assert.equal(result.filter(label => special.includes(label.userData.text)).length, tropics ? 4 : 0)
        assert.equal(result.filter(label => ordinary.includes(label.userData.text)).length, latitudeLabels ? 11 : 0)
        assert.equal(result.filter(label => label.userData.text === '0°').length, Number(latitudeLabels))
      } finally { dispose(group) }
    }
  })

  test(`${mode}零倾角或特殊纬度与普通纬度重合时，两种开关都不产生重复标注`, async () => {
    const app = await createHarness(mode)
    for (const [tilt, allCount, specialCount] of [[0, 13, 3], [15, 11, 4]]) {
      app.axialTilt.value = tilt
      for (const [latitudeLabels, tropics, count] of [
        [true, false, 11], [true, true, allCount], [false, true, specialCount],
      ]) {
        Object.assign(app.layers, { latitudeLabels, tropics })
        const group = app.build()
        try {
          const result = labels(group)
          assert.equal(result.length, count)
          assert.equal(new Set(result.map(item => item.userData.text)).size, count)
          assert.equal(new Set(result.map(item => item.name)).size, count)
          assert.equal(result.filter(item => item.userData.text === '0°').length, Number(latitudeLabels || tilt === 0))
        } finally { dispose(group) }
      }
    }
  })
}
