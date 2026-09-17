import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import * as THREE from 'three'
import { WebGLTextures } from '../node_modules/three/src/renderers/webgl/WebGLTextures.js'
import { WebGLProperties } from '../node_modules/three/src/renderers/webgl/WebGLProperties.js'

const source = await readFile(new URL('../src/sun.vue', import.meta.url), 'utf8')
const tree = ts.createSourceFile('sun.ts', parse(source).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createAltitudeGaugeLabel')
assert.ok(declaration)
const functionSource = declaration.getText(tree)
const functionCode = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function createUploadBoundary() {
  const storage = []
  const uploads = []
  let bound
  let nextConstant = 100
  let nextTexture = 1
  const constants = new Map()
  const gl = new Proxy({
    createTexture: () => ({ id: nextTexture++ }),
    deleteTexture() {}, texParameteri() {}, generateMipmap() {},
  }, {
    get(target, name) {
      if (name in target) return target[name]
      if (!constants.has(name)) constants.set(name, nextConstant++)
      return constants.get(name)
    },
  })
  const state = {
    bindTexture(_target, texture) { bound = texture },
    activeTexture() {}, pixelStorei() {},
    texStorage2D(_target, levels, _format, width, height) {
      assert.ok(!bound.storage, 'An immutable GPU texture is allocated only once')
      bound.storage = { width, height }
      storage.push({ texture: bound.id, levels, width, height })
    },
    texSubImage2D(...args) {
      const canvas = args.at(-1)
      uploads.push({ texture: bound.id, width: canvas.width, height: canvas.height, allocation: { ...bound.storage } })
    },
  }
  const info = { memory: { textures: 0 }, render: { frame: 0 } }
  const uploader = new WebGLTextures(gl, { has: () => false, get: () => null }, state, WebGLProperties(),
    { maxTextures: 16, maxTextureSize: 4096, getMaxAnisotropy: () => 1 }, {
      convert(value) {
        if (value === THREE.RGBAFormat) return gl.RGBA
        if (value === THREE.UnsignedByteType) return gl.UNSIGNED_BYTE
        throw new Error(`Unexpected upload format/type: ${value}`)
      },
    }, info)
  return { uploader, storage, uploads, info }
}

function createCanvasBoundary() {
  const clearCalls = []
  const paints = []
  const canvas = { width: 300, height: 150 }
  const context = {
    font: '',
    measureText(text) {
      const size = Number(this.font.match(/(\d+)px/)?.[1] ?? 10)
      return { width: [...text].reduce((width, character) => width + size * (character === ' ' ? .3 : .58), 0) }
    },
    clearRect(...bounds) { clearCalls.push(bounds) },
    strokeText() {},
    fillText(text, x, y) { paints.push({ text, x, y }) },
  }
  canvas.getContext = () => context
  return { document: { createElement: () => canvas }, canvas, clearCalls, paints }
}

test('the actual cached solar label fully updates one immutable GPU allocation when altitude text shrinks and grows', () => {
  const drawing = createCanvasBoundary()
  const factory = new Function('THREE', 'document', `const altitudeGaugeLabels = new Map();\n${functionCode}\nreturn createAltitudeGaugeLabel;`)(THREE, drawing.document)
  const gl = createUploadBoundary()
  const snapshots = []
  let sprite
  try {
    for (const text of ['h = +73°12′', 'h = +7°10′', 'h = +16°24′']) {
      const current = factory(text, '#fff1b8', new THREE.Vector3(), true)
      if (sprite) assert.equal(current, sprite, 'Digit changes must retain the same sprite and texture')
      sprite = current
      gl.uploader.setTexture2D(sprite.material.map, 0)
      const content = sprite.userData.gaugeLabel
      snapshots.push({ contentWidth: content.width, repeat: sprite.material.map.repeat.x, offset: sprite.material.map.offset.x,
        painted: drawing.paints.at(-1), clears: drawing.clearCalls.splice(0) })
    }
    assert.equal(gl.storage.length, 1)
    assert.equal(gl.uploads.length, 3)
    assert.equal(gl.info.memory.textures, 1)
    // Exercise r184's real allocation/upload decisions; the GL boundary only records calls.
    for (const upload of gl.uploads) {
      assert.equal(upload.width, upload.allocation.width, 'A shorter sub-image leaves old pixels at the right of the immutable GPU allocation')
      assert.equal(upload.height, upload.allocation.height)
      assert.equal(upload.texture, gl.storage[0].texture)
    }
    assert.deepEqual([gl.storage[0].width, gl.storage[0].height], [512, 112])
    assert.ok(snapshots[1].contentWidth < snapshots[0].contentWidth)
    assert.ok(snapshots[2].contentWidth > snapshots[1].contentWidth)
    for (const snapshot of snapshots) {
      assert.deepEqual(snapshot.clears, [[0, 0, 512, 112]], 'Each repaint clears every pixel uploaded, including the old trailing minute mark')
      assert.equal(snapshot.offset, 0)
      assert.ok(Math.abs(snapshot.repeat * 512 - snapshot.contentWidth) < 1e-9, 'UV cropping matches only the newly drawn text width')
      assert.equal(snapshot.painted.x, snapshot.contentWidth / 2, 'The new text is centered inside its UV crop')
    }
    assert.equal(snapshots[1].painted.text, 'h = +7°10′')
  } finally {
    sprite?.material.map.dispose()
    sprite?.material.dispose()
  }
  assert.equal(gl.info.memory.textures, 0)
})
