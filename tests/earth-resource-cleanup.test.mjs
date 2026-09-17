import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import * as THREE from 'three'

const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from ['"]three['"]/g, `from '${import.meta.resolve('three')}'`)
const cleanupSource = await readFile(new URL('../src/scene/disposeSceneResources.ts', import.meta.url), 'utf8')
const cleanupUrl = `data:text/javascript;base64,${Buffer.from(transpile(cleanupSource)).toString('base64')}`
const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.ts', parse(appSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const clear = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'clearGroup')
assert.ok(clear)
const code = transpile([
  `import { clearObjectChildren } from '${cleanupUrl}'`,
  'export function createHarness(earthScene, cachedSunTexture) {',
  clear.getText(tree),
  'return { clearGroup }; }',
].join('\n'))
const { createHarness } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
function countDisposals(resource) {
  let count = 0
  resource.addEventListener('dispose', () => { count++ })
  return () => count
}

test('rebuilding Earth layers releases each old label texture, preserves the solar map and leaves Sprite shared geometry intact', () => {
  const scene = new THREE.Scene()
  const layer = new THREE.Group()
  scene.add(layer)
  const solarTexture = new THREE.Texture()
  const solarDisposals = countDisposals(solarTexture)
  const app = createHarness(scene, solarTexture)
  const spriteGeometry = new THREE.Sprite().geometry
  const sharedGeometryDisposals = countDisposals(spriteGeometry)
  for (let rebuild = 0; rebuild < 5; rebuild++) {
    const labelTexture = new THREE.CanvasTexture({ width: 32, height: 16 })
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture }))
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4), new THREE.MeshBasicMaterial({ map: solarTexture }))
    const counts = [labelTexture, label.material, sun.geometry, sun.material].map(countDisposals)
    layer.add(label, sun)
    app.clearGroup(layer)
    counts.forEach(count => assert.equal(count(), 1))
    assert.equal(solarDisposals(), 0)
    assert.equal(sharedGeometryDisposals(), 0)
    assert.equal(label.parent, null)
    assert.equal(sun.parent, null)
  }
  solarTexture.dispose()
})

test('Earth layer cleanup preserves resources in another layer, then frees them after their final owner is removed', () => {
  const scene = new THREE.Scene()
  const first = new THREE.Group()
  const second = new THREE.Group()
  const texture = new THREE.Texture()
  const material = new THREE.ShaderMaterial({ uniforms: { textureArray: { value: [texture] } } })
  const geometry = new THREE.PlaneGeometry(1, 1)
  const counts = [texture, material, geometry].map(countDisposals)
  first.add(new THREE.Mesh(geometry, material))
  second.add(new THREE.Mesh(geometry, material))
  scene.add(first, second)
  const app = createHarness(scene, null)
  app.clearGroup(first)
  counts.forEach(count => assert.equal(count(), 0))
  app.clearGroup(scene)
  counts.forEach(count => assert.equal(count(), 1))
  assert.equal(scene.children.length, 0)
})
