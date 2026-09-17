import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import * as THREE from 'three'
import { WebGLProperties } from '../node_modules/three/src/renderers/webgl/WebGLProperties.js'

const compileTs = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const load = async path => {
  const code = compileTs(await readFile(new URL(path, import.meta.url), 'utf8')).replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
const { createSceneLoading } = await load('../src/utils/sceneLoading.ts')
const { clearObjectChildren } = await load('../src/scene/disposeSceneResources.ts')
const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const appTree = ts.createSourceFile('App.ts', parse(app).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const actualFunction = name => {
  const node = appTree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name)
  assert.ok(node, `App must contain ${name}`)
  return node.getText(appTree)
}
const actualHook = name => {
  const node = appTree.statements.find(statement => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(appTree) === name)
  assert.ok(node, `App must contain ${name}`)
  return node.expression.arguments[0].getText(appTree)
}
const rendererSource = await readFile(new URL('../node_modules/three/src/renderers/WebGLRenderer.js', import.meta.url), 'utf8')
const rendererTree = ts.createSourceFile('WebGLRenderer.js', rendererSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS)
let compileNode
function findCompile(node) {
  if (ts.isBinaryExpression(node) && node.left.getText(rendererTree) === 'this.compileAsync') compileNode = node.right
  ts.forEachChild(node, findCompile)
}
findCompile(rendererTree)
assert.ok(compileNode, 'Use the installed Three renderer\'s actual async readiness polling implementation')

function createRendererBoundary(options = {}) {
  const properties = WebGLProperties()
  const timers = []
  const frames = []
  const calls = { rendererDispose: 0, miniDispose: 0, materialDispose: 0, geometryDispose: 0, textureDispose: 0, canvasDetach: 0, controlDispose: 0, observerDisconnect: 0, render: 0, animate: 0, compile: 0, errors: 0 }
  const scene = new THREE.Scene()
  const texture = new THREE.Texture()
  const material = new THREE.MeshBasicMaterial({ map: texture })
  const geometry = new THREE.BoxGeometry()
  scene.add(new THREE.Mesh(geometry, material))
  texture.addEventListener('dispose', () => calls.textureDispose++)
  geometry.addEventListener('dispose', () => calls.geometryDispose++)
  material.addEventListener('dispose', () => { calls.materialDispose++; properties.remove(material) })
  let programReady = false
  let rejectCompile
  const canvas = () => {
    const node = { parentNode: { removeChild(child) { calls.canvasDetach++; child.parentNode = null } } }
    return node
  }
  const renderer = {
    domElement: canvas(),
    compile() {
      calls.compile++
      properties.get(material).currentProgram = { isReady: () => programReady }
      return new Set([material])
    },
    dispose() { calls.rendererDispose++; properties.dispose() },
  }
  renderer.compileAsync = options.rejectCompile
    ? () => { calls.compile++; return new Promise((_, reject) => { rejectCompile = reject }) }
    : new Function('properties', 'extensions', 'setTimeout', `return (${compileNode.getText(rendererTree)});`)(properties, { get: () => null }, callback => timers.push(callback))
  const miniRenderer = { domElement: canvas(), dispose() { calls.miniDispose++ } }
  const startup = createSceneLoading(['earth'])
  if (options.pendingImage) startup.manager.itemStart('day-map')
  const bindings = {
    THREE, clearObjectChildren, startup, boundary: { scene, renderer, miniRenderer, calls, options },
    nextTick: () => Promise.resolve(),
    requestAnimationFrame: callback => { frames.push(callback); return frames.length },
    cancelAnimationFrame() {},
    console: { error() { calls.errors++ } },
    window: { addEventListener() {}, removeEventListener() {} },
  }
  const harnessCode = [
    'let appDisposed = false, earthCompilePromise = null, earthDisposalPending = false;',
    'let earthRenderer = boundary.renderer, miniRenderer = boundary.miniRenderer, earthScene = boundary.scene, earthCamera = new THREE.PerspectiveCamera();',
    'let observerSurface=null, observerFlight=null, timeZoneOverlay=null, sunBeam=null, terminatorVisual=null, sunGlow=null, cameraTween=null, observerGuide=null, nebulaSky=null, obliquityHelper=null;',
    'let earthResize={disconnect(){boundary.calls.observerDisconnect++}}, miniResizeObserver={disconnect(){boundary.calls.observerDisconnect++}}, earthControls={dispose(){boundary.calls.controlDispose++}};',
    'let miniCamera=null,miniPerspectiveCamera=null,miniPolarCamera=null,cachedSunTexture=null,earthMaterial=null;',
    'let stopObserverLook=null,orbitTweenToken=0,raf=0,autoOrbitDay=172,runtimeUtcMinutes=720,lastTime=0;',
    'const dayNo={value:172},utcMinutes={value:720},preparingScene={value:false},pageReady={value:false},loadingError={value:""};',
    'const pointPickGesture={cancel(){}};',
    'function syncViewportInsets(){} function updateEarthScene(){} function prepareSceneTextures(){}',
    'function initEarthScene(){if(boundary.options.initializationFailure)throw new Error("initialization failed");}',
    'function renderEarthFrame(){boundary.calls.render++} function animate(){boundary.calls.animate++}',
    actualFunction('compileInitialEarthScene'), actualFunction('disposeEarthScene'), actualFunction('clearGroup'),
    `const mount=${actualHook('onMounted')}; const unmount=${actualHook('onBeforeUnmount')};`,
    'return { mount,unmount,pageReady,loadingError,get compiling(){return earthCompilePromise!==null},get disposed(){return appDisposed} };',
  ].join('\n')
  const actual = new Function(...Object.keys(bindings), compileTs(harnessCode))(...Object.values(bindings))
  return { ...actual, actual, calls, startup, scene, timers, frames, setReady() { programReady = true }, reject() { rejectCompile(new Error('shader compilation failed')) } }
}

async function flushMicrotasks() { for (let index = 0; index < 12; index++) await Promise.resolve() }
function assertReleased(calls) {
  for (const key of ['rendererDispose', 'miniDispose', 'materialDispose', 'geometryDispose', 'textureDispose', 'controlDispose']) assert.equal(calls[key], 1, key)
  assert.equal(calls.canvasDetach, 2)
  assert.equal(calls.observerDisconnect, 2)
}

test('unmount during the installed Three async compilation poll detaches immediately and releases GPU resources only after readiness', async () => {
  const app = createRendererBoundary()
  const mounting = app.mount()
  await flushMicrotasks()
  assert.equal(app.actual.compiling, true)
  assert.equal(app.timers.length, 1)
  app.unmount()
  app.unmount()
  assert.equal(app.calls.canvasDetach, 2)
  assert.equal(app.calls.observerDisconnect, 2)
  assert.equal(app.calls.rendererDispose, 0)
  assert.equal(app.calls.materialDispose, 0)
  assert.doesNotThrow(() => app.timers.shift()())
  assert.equal(app.timers.length, 1, 'The still-running production poll retains its currentProgram')
  app.setReady()
  assert.doesNotThrow(() => app.timers.shift()())
  await mounting
  assertReleased(app.calls)
  assert.equal(app.scene.children.length, 0)
  assert.equal(app.pageReady.value, false)
  assert.equal(app.calls.animate, 0)
  assert.equal(app.calls.render, 0)
  assert.equal(app.calls.errors, 0)
})

test('normal startup still awaits shader readiness and one rendered frame without disposing the live scene', async () => {
  const app = createRendererBoundary()
  const mounting = app.mount()
  await flushMicrotasks()
  assert.equal(app.pageReady.value, false)
  app.setReady(); app.timers.shift()()
  await flushMicrotasks()
  assert.equal(app.calls.render, 1)
  assert.equal(app.pageReady.value, false)
  app.frames.shift()()
  await mounting
  assert.equal(app.pageReady.value, true)
  assert.equal(app.calls.animate, 1)
  assert.equal(app.calls.rendererDispose, 0)
  app.unmount()
  assertReleased(app.calls)
})

test('unmount while waiting for images releases immediately and never starts shader compilation', async () => {
  const app = createRendererBoundary({ pendingImage: true })
  const mounting = app.mount()
  await flushMicrotasks()
  app.unmount()
  app.startup.manager.itemEnd('day-map')
  await mounting
  assertReleased(app.calls)
  assert.equal(app.calls.compile, 0)
  assert.equal(app.calls.errors, 0)
  assert.equal(app.pageReady.value, false)
})

test('a rejected compile after unmount still completes deferred release without a stale error or render', async () => {
  const app = createRendererBoundary({ rejectCompile: true })
  const mounting = app.mount()
  await flushMicrotasks()
  app.unmount(); app.reject()
  await mounting
  assertReleased(app.calls)
  assert.equal(app.calls.errors, 0)
  assert.equal(app.calls.render, 0)
  assert.equal(app.loadingError.value, '')
})

test('initialization failures clean partially created resources before displaying the retry error', async () => {
  const app = createRendererBoundary({ initializationFailure: true })
  await app.mount()
  assertReleased(app.calls)
  assert.equal(app.calls.compile, 0)
  assert.equal(app.calls.errors, 1)
  assert.equal(app.pageReady.value, false)
  assert.equal(app.loadingError.value, 'initialization failed')
  app.unmount()
  assertReleased(app.calls)
})
