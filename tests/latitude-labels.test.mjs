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
    'const layers={latitudeLabels:true}; let latitudeLightMaterials=[];',
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
]) test(`${mode}纬度开关独立补齐南北回归线和极圈的度数，位置随倾角变化`, async () => {
  const app = await createHarness(mode)
  let group = app.build()
  try {
    assert.equal(labels(group).length,15)
    for(const text of special) assert.ok(labels(group).some(label=>label.userData.text===text), text)
    for(const latitude of [angle,-angle,90-angle,angle-90]) {
      const label=group.getObjectByName(`latitude-label-${latitude}`)
      assert.ok(label)
      assert.ok(Math.abs(Math.asin(label.position.y/label.position.length())*180/Math.PI-latitude)<1e-9)
    }
  } finally { dispose(group) }
  app.axialTilt.value=10
  group=app.build()
  try {
    for(const text of ['10°N','10°S','80°N','80°S']) assert.ok(labels(group).some(label=>label.userData.text===text))
    for(const text of special) assert.ok(!labels(group).some(label=>label.userData.text===text))
  } finally { dispose(group) }
  app.layers.latitudeLabels=false
  group=app.build()
  assert.equal(labels(group).length,0)
})

test('零倾角或特殊纬度与普通纬度重合时不产生重复标注',async()=>{
  const app=await createHarness('dms')
  for(const [tilt,count] of [[0,13],[15,11]]) {
    app.axialTilt.value=tilt
    const group=app.build()
    try {
      const result=labels(group)
      assert.equal(result.length,count)
      assert.equal(new Set(result.map(item=>item.userData.text)).size,count)
      assert.equal(result.filter(item=>item.userData.text==='0°').length,1)
    } finally {dispose(group)}
  }
})
