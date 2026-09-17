import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Vector3 } from 'three'

const compiledModules = new Map()
async function compileModule(url) {
  if (compiledModules.has(url.href)) return compiledModules.get(url.href)
  const source = await readFile(url, 'utf8')
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) {
    code = code.replace(match[0], `from '${await compileModule(new URL(`${match[1]}.ts`, url))}'`)
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  compiledModules.set(url.href, result)
  return result
}

const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.ts', parse(appSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
function actualFunction(name) {
  const node = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name)
  assert.ok(node, `App.vue must contain ${name}`)
  return node.getText(tree)
}
function actualVariable(name) {
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const node = statement.declarationList.declarations.find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name)
    if (node?.initializer) {
      const kind = statement.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let'
      return `${kind} ${name} = ${node.initializer.getText(tree)};`
    }
  }
  assert.fail(`App.vue must initialize ${name}`)
}
const motionWatcher = tree.statements.find(statement => ts.isExpressionStatement(statement)
  && ts.isCallExpression(statement.expression)
  && statement.expression.expression.getText(tree) === 'watch'
  && statement.expression.arguments[0]?.getText(tree) === '[rotationPlaying, revolutionPlaying]')
assert.ok(motionWatcher, 'Use the actual synchronous playback watcher, not a test-only substitute')

const functionNames = [
  'setObserverView', 'beginObserverFlight', 'finishObserverView', 'updateObserverCamera',
  'pauseForObserverFlight', 'resumeAfterObserverFlight', 'currentObserverBasis', 'cancelCameraTween',
  'cancelOrbitTransition', 'getEarthWorldPosition', 'visualOrbitDay', 'orbitThetaByDay',
  'overviewFitDistance', 'fitOverviewCameraToEarthViewport',
]
const variableNames = [
  'EARTH_R', 'ORBIT_R', 'DEG', 'obliquityMinutes', 'axialTilt', 'axialTiltRotation',
  'rotationPlaying', 'revolutionPlaying', 'playing', 'focusCenter', 'activeCameraMode',
  'controlsVisible', 'pointPickingEnabled', 'observerViewEnabled', 'observerFlying',
  'observerFlightPhase', 'observerFlightProgress', 'observerFlightVeil', 'selectedPoint',
  'observerSurface', 'observerFlight', 'observerFlightStarted', 'observerFlightReturning',
  'observerFlightPointKey', 'flightMotion', 'flightMotionChange', 'observerReturnView',
  'autoOrbitDay', 'orbitTweenToken', 'tweenOrbitVisualDay', 'suppressSceneUpdate',
  'cameraTween', 'lastFollowEarthPosition', 'lastOverviewFitDistance',
]
const harnessSource = [
  `import * as THREE from '${import.meta.resolve('three')}';`,
  `import { ref, reactive, computed, watch } from '${import.meta.resolve('vue')}';`,
  `import { MAX_OBLIQUITY_MINUTES } from '${await compileModule(new URL('../src/utils/astronomy.ts', import.meta.url))}';`,
  `import { orbitAngleAtDay } from '${await compileModule(new URL('../src/utils/earthOrbit.ts', import.meta.url))}';`,
  `import { createObserverFlight, observerBasis, OBSERVER_FLIGHT_DURATION } from '${await compileModule(new URL('../src/utils/observerFlight.ts', import.meta.url))}';`,
  'export { OBSERVER_FLIGHT_DURATION };',
  'export function createObserverModeHarness(options = {}) {',
  'let clock = 1000; const performance = { now: () => clock };',
  'const isAdvancedEdition = true; let runtimeSpinRadians = 0.31;',
  'const solar = ref({ altitude: 35, azimuth: 125, solarTimeValue: 600 });',
  ...variableNames.map(actualVariable),
  'const earthCamera = new THREE.PerspectiveCamera(47, 1.6, 0.1, 100);',
  // This boundary models only OrbitControls' queued pan: update consumes the residual when damping is off.
  'const queuedPan = new THREE.Vector3();',
  'const earthControls = { target: new THREE.Vector3(), enabled: true, enableDamping: true,',
  'update() { const step = this.enableDamping ? 0.07 : 1; this.target.addScaledVector(queuedPan, step);',
  'earthCamera.position.addScaledVector(queuedPan, step); queuedPan.multiplyScalar(this.enableDamping ? 0.93 : 0);',
  'earthCamera.lookAt(this.target); earthCamera.updateMatrixWorld(); } };',
  'const cachedSunTexture = new THREE.Texture(); let surfaceCreations = 0;',
  'function createObserverSurfaceScene(texture) { surfaceCreations++; return { sharedTexture: texture, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), update() {}, dispose() {} }; }',
  ...functionNames.map(actualFunction),
  `const stopMotionWatch = ${motionWatcher.expression.getText(tree)};`,
  'focusCenter.value = options.focus ?? "earth"; activeCameraMode.value = focusCenter.value === "earth" ? "point" : "overview";',
  'rotationPlaying.value = options.rotation ?? true; revolutionPlaying.value = options.revolution ?? false;',
  'controlsVisible.value = options.controlsVisible ?? true;',
  'const anchor = focusCenter.value === "earth" ? getEarthWorldPosition() : new THREE.Vector3();',
  'earthCamera.position.copy(anchor).add(new THREE.Vector3(2.5, 1.2, 3));',
  'earthControls.target.copy(anchor).add(new THREE.Vector3(0.12, 0.05, -0.08)); earthControls.update();',
  'return { camera: earthCamera, controls: earthControls, focusCenter, activeCameraMode, controlsVisible,',
  'rotationPlaying, revolutionPlaying, playing, selectedPoint, observerViewEnabled, observerFlying, observerFlightProgress,',
  'setObserverView, updateObserverCamera, currentObserverBasis, earthCenter: getEarthWorldPosition,',
  'overviewFitDistance, get previousFit() { return lastOverviewFitDistance; },',
  'resize(width, height) { earthCamera.aspect = width / height; fitOverviewCameraToEarthViewport(width, height); },',
  'tick(value) { clock = value; updateObserverCamera(clock); }, setClock(value) { clock = value; }, setDay(value) { autoOrbitDay = value; },',
  'queuePan(value) { queuedPan.copy(value); }, get clock() { return clock; }, get flightStarted() { return observerFlightStarted; },',
  'get returnView() { return observerReturnView; }, get flight() { return observerFlight; }, get returning() { return observerFlightReturning; },',
  'get savedMotion() { return flightMotion; }, get surfaceCreations() { return surfaceCreations; }, get followCenter() { return lastFollowEarthPosition; },',
  'dispose() { stopMotionWatch(); finishObserverView(); cachedSunTexture.dispose(); } };',
  '}',
].join('\n')
const harnessCode = ts.transpileModule(harnessSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { createObserverModeHarness, OBSERVER_FLIGHT_DURATION } = await import(`data:text/javascript;base64,${Buffer.from(harnessCode).toString('base64')}`)
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const vectorNear = (a, b) => near(a.distanceTo(b), 0)
const snapshot = app => ({ position: app.camera.position.clone(), target: app.controls.target.clone(),
  center: app.earthCenter(), focus: app.focusCenter.value, mode: app.activeCameraMode.value,
  fov: app.camera.fov, near: app.camera.near, controlsVisible: app.controlsVisible.value })

test('App实际观测模式进入时保存机位暂停演示，6200ms落地后保持观测并恢复原播放组合', () => {
  const app = createObserverModeHarness({ rotation: true, revolution: false })
  const original = snapshot(app)
  app.setObserverView(true)
  assert.equal(app.observerViewEnabled.value, true)
  assert.equal(app.observerFlying.value, true)
  assert.equal(app.controls.enabled, false)
  assert.equal(app.controlsVisible.value, false)
  assert.equal(app.playing.value, false)
  assert.deepEqual(app.savedMotion, { rotation: true, revolution: false })
  vectorNear(app.returnView.position, original.position.clone().sub(original.center))
  vectorNear(app.returnView.target, original.target.clone().sub(original.center))
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION - 1)
  assert.equal(app.observerFlying.value, true)
  assert.equal(app.playing.value, false)
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
  assert.equal(app.observerFlying.value, false)
  assert.equal(app.observerViewEnabled.value, true)
  assert.equal(app.rotationPlaying.value, true)
  assert.equal(app.revolutionPlaying.value, false)
  assert.equal(app.controls.enabled, false, 'OrbitControls stays disabled while standing at the observation point')
  assert.equal(app.savedMotion, null)
  near(app.camera.fov, 60)
  app.dispose()
})

test('App实际退出逆向飞行恢复原机位、控制状态与FOV，残留惯性不污染保存的pan偏移', () => {
  for (const focus of ['earth', 'sun']) {
    const app = createObserverModeHarness({ focus, rotation: false, revolution: true, controlsVisible: false })
    const original = snapshot(app)
    app.queuePan(new Vector3(0.3, -0.1, 0.2))
    app.setObserverView(true)
    app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
    app.setDay(230)
    app.tick(app.clock + 16)
    app.setObserverView(false)
    assert.equal(app.observerViewEnabled.value, false)
    assert.equal(app.observerFlying.value, true)
    assert.equal(app.returning, true)
    assert.equal(app.playing.value, false)
    app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION / 2)
    near(app.observerFlightProgress.value, 0.5)
    assert.equal(app.controls.enabled, false)
    app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
    const delta = focus === 'earth' ? app.earthCenter().sub(original.center) : new Vector3()
    vectorNear(app.camera.position, original.position.clone().add(delta))
    vectorNear(app.controls.target, original.target.clone().add(delta))
    assert.equal(app.focusCenter.value, original.focus)
    assert.equal(app.activeCameraMode.value, original.mode)
    assert.equal(app.controlsVisible.value, original.controlsVisible)
    near(app.camera.fov, original.fov)
    near(app.camera.near, original.near)
    assert.equal(app.controls.enabled, true)
    assert.equal(app.controls.enableDamping, true)
    assert.equal(app.rotationPlaying.value, false)
    assert.equal(app.revolutionPlaying.value, true)
    assert.equal(app.returnView, null)
    assert.equal(app.flight, null)
    vectorNear(app.followCenter, app.earthCenter())
    app.dispose()
  }
})

test('App实际进场中取消会立即安全恢复，不遗留飞行或disabledControls且尊重用户途中播放改动', () => {
  const app = createObserverModeHarness({ rotation: true, revolution: true })
  const original = snapshot(app)
  app.setObserverView(true)
  app.tick(app.flightStarted + 2100)
  // The actual synchronous watcher replaces the saved playback combination for a deliberate change.
  app.revolutionPlaying.value = true
  assert.equal(app.savedMotion, null)
  app.setObserverView(false)
  assert.equal(app.observerViewEnabled.value, false)
  assert.equal(app.observerFlying.value, false)
  assert.equal(app.controls.enabled, true)
  assert.equal(app.controlsVisible.value, original.controlsVisible)
  assert.equal(app.flight, null)
  assert.equal(app.returnView, null)
  assert.equal(app.rotationPlaying.value, false)
  assert.equal(app.revolutionPlaying.value, true)
  vectorNear(app.camera.position, original.position)
  vectorNear(app.controls.target, original.target)
  app.tick(app.clock + OBSERVER_FLIGHT_DURATION * 2)
  vectorNear(app.camera.position, original.position)
  vectorNear(app.controls.target, original.target)
  assert.equal(app.observerViewEnabled.value, false)
  near(app.camera.near, original.near)
  app.dispose()
})

test('App实际重复进入及换城市重飞保留最初返回机位，首帧不按新观测点瞬移', () => {
  const app = createObserverModeHarness({ rotation: true, revolution: false })
  const original = snapshot(app)
  app.setObserverView(true)
  const saved = app.returnView
  const firstStart = app.flightStarted
  app.setClock(app.clock + 100)
  app.setObserverView(true)
  assert.equal(app.flightStarted, firstStart)
  assert.equal(app.returnView, saved)
  assert.equal(app.surfaceCreations, 1)
  app.tick(firstStart + OBSERVER_FLIGHT_DURATION)
  const previousPosition = app.camera.position.clone()
  const previousOrientation = app.camera.quaternion.clone()
  Object.assign(app.selectedPoint, { name: '悉尼', lat: -33.87, lng: 151.21 })
  app.tick(app.clock + 16)
  assert.equal(app.observerFlying.value, true)
  assert.equal(app.observerViewEnabled.value, true)
  assert.equal(app.playing.value, false)
  assert.equal(app.returnView, saved)
  vectorNear(app.camera.position, previousPosition)
  near(app.camera.quaternion.angleTo(previousOrientation), 0)
  near(app.observerFlightProgress.value, 0)
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
  assert.equal(app.rotationPlaying.value, true)
  assert.equal(app.revolutionPlaying.value, false)
  app.setObserverView(false)
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
  vectorNear(app.camera.position, original.position)
  vectorNear(app.controls.target, original.target)
  assert.equal(app.controls.enabled, true)
  assert.equal(app.surfaceCreations, 1)
  app.dispose()
})

test('App地面观测调整分屏后按原FOV适配返回总览，保持用户平移和缩放且不污染后续resize', () => {
  const app = createObserverModeHarness({ focus: 'sun', rotation: false, revolution: false })
  app.resize(800, 600)
  const oldFit = app.previousFit
  // Use a non-default zoom and pan so fitting the canonical overview cannot satisfy this regression.
  app.controls.target.set(0.3, -0.1, 0.2)
  app.camera.position.multiplyScalar(0.73).add(app.controls.target)
  app.controls.update()
  const original = snapshot(app)
  const expectedFit = app.overviewFitDistance(400 / 600, original.fov)
  const expectedPosition = original.position.clone().sub(original.target)
    .multiplyScalar(expectedFit / oldFit).add(original.target)
  app.setObserverView(true)
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
  near(app.camera.fov, 60)
  const groundPosition = app.camera.position.clone()
  app.resize(400, 600)
  near(app.previousFit, expectedFit)
  vectorNear(app.camera.position, groundPosition)
  vectorNear(app.returnView.position, expectedPosition)
  vectorNear(app.returnView.target, original.target)
  app.setObserverView(false)
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
  vectorNear(app.camera.position, expectedPosition)
  vectorNear(app.controls.target, original.target)
  near(app.camera.fov, original.fov)
  app.resize(800, 600)
  vectorNear(app.camera.position, original.position)
  vectorNear(app.controls.target, original.target)
  near(app.previousFit, oldFit)
  app.dispose()
})

test('App进场和返程途中resize更新保存总览及返程终点，保留飞行计时且退出不再跳到旧机位', () => {
  const app = createObserverModeHarness({ focus: 'sun', rotation: false, revolution: false })
  app.resize(1000, 650)
  const oldFit = app.previousFit
  const original = snapshot(app)
  app.setObserverView(true)
  app.tick(app.flightStarted + 2100)
  app.resize(480, 650)
  const narrowFit = app.overviewFitDistance(480 / 650, original.fov)
  vectorNear(app.returnView.position, original.position.clone().sub(original.target)
    .multiplyScalar(narrowFit / oldFit).add(original.target))
  near(app.previousFit, narrowFit)
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
  app.setObserverView(false)
  const returnStarted = app.flightStarted
  app.tick(returnStarted + 1800)
  app.resize(720, 650)
  assert.equal(app.flightStarted, returnStarted, 'resize must not restart the flight clock')
  const expectedFit = app.overviewFitDistance(720 / 650, original.fov)
  const expectedPosition = original.position.clone().sub(original.target)
    .multiplyScalar(expectedFit / oldFit).add(original.target)
  vectorNear(app.returnView.position, expectedPosition)
  // Sample the real flight at its return endpoint before finishObserverView can conceal a stale target.
  const endpoint = app.flight.sample(app.currentObserverBasis(), 35, 125, 0)
  vectorNear(endpoint.position, expectedPosition)
  near(endpoint.fov, original.fov)
  app.tick(returnStarted + OBSERVER_FLIGHT_DURATION)
  vectorNear(app.camera.position, endpoint.position)
  near(app.camera.quaternion.angleTo(endpoint.quaternion), 0)
  near(app.previousFit, expectedFit)
  app.dispose()
})

test('App观测期间resize不会改变地球中心近景保存的距离与平移偏移', () => {
  const app = createObserverModeHarness({ focus: 'earth', rotation: false, revolution: false })
  app.resize(1000, 650)
  const original = snapshot(app)
  app.setObserverView(true)
  const savedPosition = app.returnView.position.clone()
  const savedTarget = app.returnView.target.clone()
  app.tick(app.flightStarted + OBSERVER_FLIGHT_DURATION)
  app.resize(400, 750)
  vectorNear(app.returnView.position, savedPosition)
  vectorNear(app.returnView.target, savedTarget)
  app.setObserverView(false)
  const returnStarted = app.flightStarted
  app.tick(returnStarted + 2000)
  app.resize(900, 650)
  vectorNear(app.returnView.position, savedPosition)
  app.tick(returnStarted + OBSERVER_FLIGHT_DURATION)
  vectorNear(app.camera.position, original.position)
  vectorNear(app.controls.target, original.target)
  app.dispose()
})
