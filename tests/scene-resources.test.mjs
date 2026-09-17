import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import * as THREE from 'three'

const modules = new Map()
async function compile(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  let code = ts.transpileModule(await readFile(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) code = code.replace(match[0], `from '${await compile(new URL(`${match[1]}.ts`, url))}'`)
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  modules.set(url.href, result)
  return result
}
const load = async path => import(await compile(new URL(path, import.meta.url)))
const { clearObjectChildren, disposeObjectResources } = await load('../src/scene/disposeSceneResources.ts')
const { createEquatorialSundial } = await load('../src/scene/createEquatorialSundial.ts')
const { createSundialAlignmentGuide } = await load('../src/scene/createSundialAlignmentGuide.ts')
const { createDayNightSky } = await load('../src/scene/createDayNightSky.ts')
const astronomy = await load('../src/utils/astronomy.ts')
const sundial = await load('../src/utils/sundial.ts')

function track(resources) {
  const counts = new Map([...new Set(resources)].map(resource => [resource, 0]))
  const listeners = new Map()
  for (const resource of counts.keys()) {
    const listener = () => counts.set(resource, counts.get(resource) + 1)
    listeners.set(resource, listener)
    resource.addEventListener('dispose', listener)
  }
  return { counts, stop() { for (const [resource, listener] of listeners) resource.removeEventListener('dispose', listener) } }
}

test('branch cleanup releases owned maps and shader texture structs while retaining live/shared/external resources', () => {
  const scene = new THREE.Scene()
  const removed = new THREE.Group()
  const retained = new THREE.Group()
  scene.add(removed, retained)
  const [owned, external, shared] = Array.from({ length: 3 }, () => new THREE.Texture())
  const sharedGeometry = new THREE.BoxGeometry()
  const sharedMaterial = new THREE.MeshBasicMaterial({ map: shared })
  const ownedMaterial = new THREE.ShaderMaterial({ uniforms: { nested: { value: { maps: [owned, external, shared] } } } })
  const ownedGeometry = new THREE.SphereGeometry()
  removed.add(new THREE.Mesh(ownedGeometry, ownedMaterial), new THREE.Mesh(sharedGeometry, sharedMaterial))
  retained.add(new THREE.Mesh(sharedGeometry, sharedMaterial))
  const tracked = track([owned, external, shared, sharedGeometry, sharedMaterial, ownedGeometry, ownedMaterial])
  try {
    clearObjectChildren(removed, { retainRoot: scene, preserveTextures: new Set([external]) })
    assert.equal(removed.children.length, 0)
    for (const resource of [owned, ownedGeometry, ownedMaterial]) assert.equal(tracked.counts.get(resource), 1)
    for (const resource of [external, shared, sharedGeometry, sharedMaterial]) assert.equal(tracked.counts.get(resource), 0)
    clearObjectChildren(scene)
    for (const resource of [shared, sharedGeometry, sharedMaterial]) assert.equal(tracked.counts.get(resource), 1)
    assert.equal(tracked.counts.get(external), 0)
    clearObjectChildren(scene)
    assert.ok([...tracked.counts.values()].every(count => count <= 1))
  } finally { tracked.stop(); external.dispose() }
})

test('Sprite and default ArrowHelper geometry survive unrelated cleanup, while owned arrow clones and shadow targets are released', () => {
  const externalSprite = new THREE.Sprite()
  const externalArrow = new THREE.ArrowHelper()
  const group = new THREE.Group()
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture() }))
  const arrow = new THREE.ArrowHelper()
  const clonedArrow = new THREE.ArrowHelper()
  clonedArrow.line.geometry = clonedArrow.line.geometry.clone()
  clonedArrow.cone.geometry = clonedArrow.cone.geometry.clone()
  const light = new THREE.DirectionalLight()
  light.shadow.map = new THREE.WebGLRenderTarget(16, 16)
  group.add(sprite, arrow, clonedArrow, light)
  const shared = track([externalSprite.geometry, externalArrow.line.geometry, externalArrow.cone.geometry])
  const owned = track([sprite.material.map, sprite.material, clonedArrow.line.geometry, clonedArrow.cone.geometry, light.shadow.map])
  try {
    disposeObjectResources(group)
    assert.ok([...shared.counts.values()].every(count => count === 0))
    assert.ok([...owned.counts.values()].every(count => count === 1))
  } finally { shared.stop(); owned.stop(); externalSprite.material.dispose(); externalArrow.line.material.dispose(); externalArrow.cone.material.dispose() }
})

const source = await readFile(new URL('../src/sun.vue', import.meta.url), 'utf8')
const tree = ts.createSourceFile('sun.ts', parse(source).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
function actualVariable(name) {
  const node = tree.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name)
  assert.ok(node?.initializer, `sun.vue must declare ${name}`)
  return node.initializer.getText(tree)
}
const dependencies = { THREE, clearObjectChildren, createEquatorialSundial, createSundialAlignmentGuide, createDayNightSky, ...astronomy, ...sundial }
const harnessSource = [
  'return function createSunHarness(sceneObject) {',
  'const props = { sceneObject, axialTilt: AXIAL_TILT, latitude: 39.9, longitude: 116.4, dayOfYear: 172, solarTime: 720, declination: AXIAL_TILT, altitude: 73.2, azimuth: 180, sunriseText: "05:00:00", sunsetText: "19:00:00", dayLengthText: "14小时" };',
  'const reactive = value => value;',
  ...['SKY_RADIUS', 'GROUND_RADIUS', 'GROUND_SURFACE_Y', 'OBSERVER_POINT', 'POLAR_EPS', 'BILLBOARD_BACK_CONFIG', 'state', 'layers', 'altitudeGaugeLabels'].map(name => `const ${name} = ${actualVariable(name)};`),
  'const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(45, 1, .1, 160); camera.position.set(0, 5, 15); camera.lookAt(0, 0, 0);',
  'const rootGroup = new THREE.Group(), domeGroup = new THREE.Group(), pathGroup = new THREE.Group(), sunGroup = new THREE.Group(), rayGroup = new THREE.Group(), schoolGroup = new THREE.Group(), labelGroup = new THREE.Group(), altitudeAngleGroup = new THREE.Group();',
  'scene.add(rootGroup, domeGroup, pathGroup, sunGroup, rayGroup, schoolGroup, labelGroup, altitudeAngleGroup);',
  'const streetLightItems = [], windowLightItems = [], trafficLightItems = [], cityRoadMaterials = [], cityClockItems = [], treeMeshes = [];',
  'let sceneDisposed = false, mountedDisposed = false, animationId = 17, resizeRaf = 0, resizeTimer = 0, resizeFinalTimer = 0, resizeObserver = null, controls = null;',
  'let dayNightSky = createDayNightSky(), sundialModel = null, sundialGuide = null, sunMesh, sunGlow, lightRay;',
  'const isZeroTilt = { value: false }, showSundialGuide = { value: true }; const lastCanvasWidth = 480, lastCanvasHeight = 720; let controlsInteracting = false;',
  'const calls = { dispose: 0, contextLoss: 0, cancelled: [], frames: 0 };',
  'const cancelAnimationFrame = id => calls.cancelled.push(id), requestAnimationFrame = () => ++calls.frames;',
  'const renderer = { capabilities: { getMaxAnisotropy: () => 1 }, domElement: { parentNode: null }, dispose() { calls.dispose++ }, forceContextLoss() { calls.contextLoss++ } };',
  ...tree.statements.filter(ts.isFunctionDeclaration).map(node => node.getText(tree)),
  'scene.add(dayNightSky.mesh); createGround(); createCityScene(); createDome(); createLabels(); createSun(); createLightRay(); rebuildSolarPaths();',
  'function updateGauge(altitude, azimuth = 180) { props.altitude = altitude; props.azimuth = azimuth; updateAltitudeAngleGauge(buildRuntimeMetricsFromProps()); }',
  'updateGauge(73.2);',
  'return { scene, calls, updateGauge, disposeScene, animate, labels: altitudeGaugeLabels, pathGroup, rebuildSolarPaths, get sceneDisposed() { return sceneDisposed } };',
  '}',
].join('\n')
const createSunHarness = new Function(...Object.keys(dependencies), ts.transpileModule(harnessSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText)(...Object.values(dependencies))

function withCanvas(run) {
  const previous = globalThis.document
  const context = new Proxy({ measureText: text => ({ width: text.length * 28 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (target, name) => target[name] ?? (() => {}) })
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) }
  try { return run() }
  finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous }
}

test('actual solar altitude updates reuse three label textures, redraw changed minutes only, and release detached night labels at close', () => withCanvas(() => {
  const app = createSunHarness('sundial')
  const labels = [...app.labels.values()]
  const textures = labels.map(label => label.material.map)
  const tracked = track(textures)
  try {
    assert.equal(labels.length, 3)
    const altitude = app.labels.get('altitude')
    const version = altitude.material.map.version
    app.updateGauge(73.201)
    assert.equal(altitude.material.map.version, version, 'No redraw when the displayed arcminute is unchanged')
    app.updateGauge(73.21)
    assert.ok(altitude.material.map.version > version)
    assert.equal(altitude.userData.text, 'h = +73°13′')
    for (let index = 0; index < 40; index++) app.updateGauge(5 + index * 1.4, 40 + index * 3)
    assert.deepEqual([...app.labels.values()], labels)
    assert.deepEqual([...app.labels.values()].map(label => label.material.map), textures)
    assert.ok([...tracked.counts.values()].every(count => count === 0))
    app.updateGauge(-10)
    assert.ok(labels.every(label => label.parent === null))
    app.disposeScene()
    app.disposeScene()
    assert.ok([...tracked.counts.values()].every(count => count === 1))
  } finally { app.disposeScene(); tracked.stop() }
}))

test('actual sundial and city creation/close/reopen frees every owned scene resource exactly once and stops rendering', () => withCanvas(() => {
  const sharedArrow = new THREE.ArrowHelper()
  const shared = track([new THREE.Sprite().geometry, sharedArrow.line.geometry, sharedArrow.cone.geometry])
  try {
    for (const edition of ['sundial', 'city']) for (let cycle = 0; cycle < 2; cycle++) {
      const app = createSunHarness(edition)
      const resources = new Set()
      app.scene.traverse(object => {
        if (object.geometry && !object.isSprite && !shared.counts.has(object.geometry)) resources.add(object.geometry)
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          resources.add(material)
          Object.values(material).forEach(value => { if (value?.isTexture) resources.add(value) })
        }
      })
      const tracked = track(resources)
      try {
        app.disposeScene(); app.disposeScene(); app.animate()
        assert.equal(app.scene.children.length, 0)
        assert.equal(app.labels.size, 0)
        assert.deepEqual(app.calls, { dispose: 1, contextLoss: 1, cancelled: [17], frames: 0 })
        for (const [resource, count] of tracked.counts) assert.equal(count, 1, `${edition}: ${resource.type ?? resource.constructor.name} ${resource.id} must dispose once`)
      } finally { app.disposeScene(); tracked.stop() }
    }
    assert.ok([...shared.counts.values()].every(count => count === 0))
  } finally { shared.stop(); sharedArrow.line.material.dispose(); sharedArrow.cone.material.dispose() }
}))

test('the actual solar path rebuild disposes retired label maps instead of accumulating them', () => withCanvas(() => {
  const app = createSunHarness('city')
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const textures = []
      app.pathGroup.traverse(object => { if (object.isSprite) textures.push(object.material.map) })
      assert.ok(textures.length >= 4)
      const tracked = track(textures)
      app.rebuildSolarPaths()
      assert.ok([...tracked.counts.values()].every(count => count === 1))
      tracked.stop()
    }
  } finally { app.disposeScene() }
}))
