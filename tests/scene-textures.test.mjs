import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import * as THREE from 'three'

const source = await readFile(new URL('../src/scene/prepareSceneTextures.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("from 'three'", `from '${import.meta.resolve('three')}'`)
const { prepareSceneTextures } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('首帧前上传隐藏贴图、shader昼夜图和共享纹理，每张图只上传一次', () => {
  const [day, night, sun, zone, sky, label] = Array.from({ length: 6 }, () => new THREE.Texture())
  const scene = new THREE.Scene()
  const earth = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.ShaderMaterial({ uniforms: { map: { value: day }, nightMap: { value: night } } }))
  const hidden = new THREE.Group()
  hidden.visible = false
  hidden.add(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial({ map: zone })))
  scene.add(earth, hidden, new THREE.Sprite(new THREE.SpriteMaterial({ map: label })))
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial({ map: sun })))
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.ShaderMaterial({ uniforms: { shared: { value: [sun, sky] } } })))
  scene.background = sky
  const uploaded = []
  assert.equal(prepareSceneTextures({ initTexture: texture => uploaded.push(texture) }, scene), 6)
  assert.equal(uploaded.length, new Set(uploaded).size)
  assert.deepEqual(new Set(uploaded), new Set([day, night, sun, zone, sky, label]))
})
