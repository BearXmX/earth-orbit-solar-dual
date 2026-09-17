import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Vector3 } from 'three'

const source = await readFile(new URL('../src/utils/sceneInteraction.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
const { followMovingCenter, createPointPickGesture, verticalSunRaySegments } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`)
const vectorNear = (a, b) => near(a.distanceTo(b), 0)
const orbitPoint = angle => new Vector3(7.2 * Math.cos(angle), 0, 7.2 * Math.sin(angle))

// Execute the page's current camera functions; this harness owns only the clock and controls boundary.
const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const appTree = ts.createSourceFile('App.ts', parse(appSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const orbitSource = await readFile(new URL('../src/utils/earthOrbit.ts', import.meta.url), 'utf8')
const orbitTree = ts.createSourceFile('earthOrbit.ts', orbitSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
function actualFunction(tree, name) {
  const node = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name)
  assert.ok(node, `Current source must contain ${name}`)
  return node.getText(tree).replace(/^export\s+/, '')
}
function actualConstant(tree, name) {
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === name)
    if (declaration?.initializer) return `const ${name} = ${declaration.initializer.getText(tree)};`
  }
  assert.fail(`Current source must contain constant ${name}`)
}
const appCameraFunctions = [
  'animateCameraTo', 'stepCameraTween', 'fitOverviewCameraToEarthViewport', 'overviewFitDistance',
  'getEarthWorldPosition', 'visualOrbitDay', 'orbitThetaByDay', 'clamp', 'easeInOutCubic',
  'getCameraPose', 'setCamera', 'setFocusCenter',
].map(name => actualFunction(appTree, name))
const appCameraCode = ts.transpileModule([
  `import * as THREE from '${import.meta.resolve('three')}'`,
  actualConstant(appTree, 'DEG'), actualConstant(appTree, 'ORBIT_R'), actualConstant(appTree, 'EARTH_R'),
  actualConstant(orbitTree, 'TERM_DAYS'), actualFunction(orbitTree, 'orbitAngleAtDay'),
  'export function createAppCameraHarness() {',
  'let now = 1000; const performance = { now: () => now };',
  'let autoOrbitDay = 172; let cameraTween = null; let lastOverviewFitDistance = 0;',
  'const axialTiltRotation = { value: -(23 + 26 / 60) * Math.PI / 180 };',
  'const focusCenter = { value: "earth" }; const activeCameraMode = { value: "point" };',
  'const observerViewEnabled = { value: false }; const observerFlying = { value: false }; const observerReturnView = null; function finishObserverView() {}',
  'const earthCamera = new THREE.PerspectiveCamera(42, 1.8, 0.1, 100);',
  'const earthControls = { target: new THREE.Vector3(), maxDistance: 32, update() {} };',
  ...appCameraFunctions,
  'return { camera: earthCamera, controls: earthControls, focusCenter, activeCameraMode,',
  'animateCameraTo, stepCameraTween, fitOverviewCameraToEarthViewport, overviewFitDistance, setFocusCenter, setCamera,',
  'earthCenter: getEarthWorldPosition, setNow(value) { now = value }, setDay(value) { autoOrbitDay = value },',
  'setTilt(degrees) { axialTiltRotation.value = -degrees * Math.PI / 180 },',
  'get tween() { return cameraTween }, get previousFit() { return lastOverviewFitDistance } };',
  '}',
].join('\n'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { createAppCameraHarness } = await import(`data:text/javascript;base64,${Buffer.from(appCameraCode).toString('base64')}`)

test('连续公转跨越完整轨道后，相机、目标与地球的相对偏移及观察距离保持不变', () => {
  const previous = orbitPoint(0)
  const cameraOffset = new Vector3(2.2, 1.4, 3.1)
  const targetOffset = new Vector3(0.1, -0.08, 0.2)
  const camera = previous.clone().add(cameraOffset)
  const target = previous.clone().add(targetOffset)
  const cameraToTarget = camera.clone().sub(target)
  for (let i = 1; i <= 720; i++) {
    const current = orbitPoint(i * Math.PI * 4 / 720)
    const savedPrevious = previous.clone()
    const savedCurrent = current.clone()
    followMovingCenter(camera, target, previous, current)
    vectorNear(camera.clone().sub(current), cameraOffset)
    vectorNear(target.clone().sub(current), targetOffset)
    vectorNear(camera.clone().sub(target), cameraToTarget)
    vectorNear(previous, savedPrevious)
    vectorNear(current, savedCurrent)
    previous.copy(current)
  }
  vectorNear(camera, orbitPoint(0).add(cameraOffset))
  vectorNear(target, orbitPoint(0).add(targetOffset))
})

test('日期前后跳转与年末回绕均平移整个机位，不重新对准地心', () => {
  const previous = orbitPoint(0.2)
  const cameraOffset = new Vector3(-2, 0.7, 1.6)
  const targetOffset = new Vector3(0.35, 0.2, -0.1)
  const camera = previous.clone().add(cameraOffset)
  const target = previous.clone().add(targetOffset)
  for (const angle of [Math.PI, Math.PI / 2, Math.PI * 1.999, 0.001, -0.4, -0.4]) {
    const current = orbitPoint(angle)
    followMovingCenter(camera, target, previous, current)
    vectorNear(camera.clone().sub(current), cameraOffset)
    vectorNear(target.clone().sub(current), targetOffset)
    previous.copy(current)
  }
})

test('用户缩放、旋转和平移后，后续跟随保留新的观察位置而不重置操作', () => {
  const previous = orbitPoint(0.5)
  const camera = previous.clone().add(new Vector3(2, 1.3, 2.4))
  const target = previous.clone().add(new Vector3(0.1, 0, 0.15))
  const view = camera.clone().sub(target).multiplyScalar(0.42)
    .applyAxisAngle(new Vector3(0.1, 1, 0.3).normalize(), 0.65)
  camera.copy(target).add(view)
  const pan = new Vector3(0.3, -0.18, 0.22)
  camera.add(pan)
  target.add(pan)
  const cameraOffset = camera.clone().sub(previous)
  const targetOffset = target.clone().sub(previous)
  for (const angle of [0.501, 0.6, 1.7, 3.4]) {
    const current = orbitPoint(angle)
    followMovingCenter(camera, target, previous, current)
    vectorNear(camera.clone().sub(current), cameraOffset)
    vectorNear(target.clone().sub(current), targetOffset)
    vectorNear(camera.clone().sub(target), view)
    previous.copy(current)
  }
})

test('App实际相机补间在地球移动时跟随，完成后到达最新地球位置对应的终点', () => {
  const app = createAppCameraHarness()
  const initialCenter = app.earthCenter()
  const startOffset = new Vector3(3, 2, 4)
  const startTargetOffset = new Vector3(0.2, -0.1, 0.3)
  const endOffset = new Vector3(1.7, 1.02, 2)
  const endTargetOffset = new Vector3(0.04, 0.02, -0.03)
  app.camera.position.copy(initialCenter).add(startOffset)
  app.controls.target.copy(initialCenter).add(startTargetOffset)
  const destination = initialCenter.clone().add(endOffset)
  const destinationTarget = initialCenter.clone().add(endTargetOffset)
  app.animateCameraTo(destination, destinationTarget, 760)
  assert.equal(app.tween.followsEarth, true)
  vectorNear(app.tween.startPosition, startOffset)
  vectorNear(app.tween.endPosition, endOffset)
  app.stepCameraTween(1000)
  vectorNear(app.camera.position, initialCenter.clone().add(startOffset))

  app.setDay(230)
  app.stepCameraTween(1380)
  vectorNear(app.camera.position, app.earthCenter().add(startOffset.clone().lerp(endOffset, 0.5)))
  vectorNear(app.controls.target, app.earthCenter().add(startTargetOffset.clone().lerp(endTargetOffset, 0.5)))
  app.setDay(300)
  app.stepCameraTween(1760)
  vectorNear(app.camera.position, app.earthCenter().add(endOffset))
  vectorNear(app.controls.target, app.earthCenter().add(endTargetOffset))
  assert.equal(app.tween, null)
  vectorNear(destination, initialCenter.clone().add(endOffset))
  vectorNear(destinationTarget, initialCenter.clone().add(endTargetOffset))

  const previous = app.earthCenter()
  app.setDay(356)
  followMovingCenter(app.camera.position, app.controls.target, previous, app.earthCenter())
  vectorNear(app.camera.position, app.earthCenter().add(endOffset))
  vectorNear(app.controls.target, app.earthCenter().add(endTargetOffset))
})

test('App总览补间中调整分屏宽度会从当前机位连续重基，并保留居中的目标终点', () => {
  const app = createAppCameraHarness()
  app.fitOverviewCameraToEarthViewport(1440, 800)
  app.camera.position.set(6, 3, 4)
  app.controls.target.set(2, 0.7, 1)
  app.setFocusCenter('sun')
  app.setNow(1200)
  app.stepCameraTween(1200)
  const currentPosition = app.camera.position.clone()
  const currentTarget = app.controls.target.clone()
  const oldEndPosition = app.tween.endPosition.clone()
  const oldEndTarget = app.tween.endTarget.clone()
  const oldFit = app.previousFit
  const expectedDuration = app.tween.duration - (1200 - app.tween.started)
  const expectedFit = app.overviewFitDistance(600 / 900)
  const expectedEnd = oldEndPosition.clone().sub(oldEndTarget).multiplyScalar(expectedFit / oldFit).add(oldEndTarget)

  app.camera.aspect = 600 / 900
  app.fitOverviewCameraToEarthViewport(600, 900)
  assert.ok(app.tween, 'resize不能直接取消正在进行的相机补间')
  assert.equal(app.tween.followsEarth, false)
  near(app.tween.started, 1200)
  near(app.tween.duration, expectedDuration)
  vectorNear(app.camera.position, currentPosition)
  vectorNear(app.controls.target, currentTarget)
  vectorNear(app.tween.startPosition, currentPosition)
  vectorNear(app.tween.startTarget, currentTarget)
  vectorNear(app.tween.endPosition, expectedEnd)
  vectorNear(app.tween.endTarget, oldEndTarget)
  vectorNear(oldEndTarget, new Vector3())
  app.stepCameraTween(1200)
  vectorNear(app.camera.position, currentPosition)
  vectorNear(app.controls.target, currentTarget)
  app.setDay(266)
  app.stepCameraTween(1200 + expectedDuration)
  vectorNear(app.camera.position, expectedEnd)
  vectorNear(app.controls.target, oldEndTarget)
  assert.equal(app.tween, null)
})

test('App地球近景补间不被尺寸变化改写，焦点切换同时更新模式和补间锚点', () => {
  const app = createAppCameraHarness()
  app.fitOverviewCameraToEarthViewport(1440, 800)
  app.camera.position.copy(app.earthCenter()).add(new Vector3(3, 2, 3))
  app.controls.target.copy(app.earthCenter())
  app.setFocusCenter('earth')
  assert.equal(app.focusCenter.value, 'earth')
  assert.equal(app.activeCameraMode.value, 'point')
  assert.equal(app.tween.followsEarth, true)
  vectorNear(app.tween.endTarget, new Vector3())
  const earthTween = app.tween
  app.setNow(1100)
  app.stepCameraTween(1100)
  const currentPosition = app.camera.position.clone()
  const currentTarget = app.controls.target.clone()
  app.fitOverviewCameraToEarthViewport(580, 900)
  assert.equal(app.tween, earthTween)
  vectorNear(app.camera.position, currentPosition)
  vectorNear(app.controls.target, currentTarget)

  app.setFocusCenter('sun')
  assert.equal(app.focusCenter.value, 'sun')
  assert.equal(app.activeCameraMode.value, 'overview')
  assert.equal(app.tween.followsEarth, false)
  vectorNear(app.tween.startPosition, currentPosition)
  vectorNear(app.tween.startTarget, currentTarget)
  vectorNear(app.tween.endTarget, new Vector3())
  app.setFocusCenter('earth')
  assert.equal(app.focusCenter.value, 'earth')
  assert.equal(app.activeCameraMode.value, 'point')
  assert.equal(app.tween.followsEarth, true)
  vectorNear(app.tween.endTarget, new Vector3())
})

test('App北极主视角在0度、10度和23度26分倾角下，均沿当前地轴朝北极俯视', () => {
  for (const tilt of [0, 10, 23 + 26 / 60]) {
    // 从地球真实Rz变换得到地轴，独立核对生产getCameraPose与setCamera的结果。
    const worldAxis = new Vector3(0, 1, 0).applyAxisAngle(new Vector3(0, 0, 1), -tilt * Math.PI / 180)
    for (const day of [79, 172, 266, 356]) {
      const app = createAppCameraHarness()
      app.setDay(day)
      app.setTilt(tilt)
      app.setCamera('north')
      assert.equal(app.activeCameraMode.value, 'north')
      assert.equal(app.focusCenter.value, 'earth')
      assert.equal(app.tween.followsEarth, true)
      app.stepCameraTween(app.tween.started + app.tween.duration)
      const center = app.earthCenter()
      vectorNear(app.controls.target, center)
      const viewFromEarth = app.camera.position.clone().sub(center).normalize()
      assert.ok(viewFromEarth.dot(worldAxis) > 0, '相机必须在北极一侧')
      // 允许生产机位防止极点视图退化的小偏移，但不能仍沿未倾斜的世界Y轴观察。
      assert.ok(viewFromEarth.angleTo(worldAxis) < 0.2 * Math.PI / 180,
        `倾角${tilt}°、第${day}天：北极机位必须对齐当前地轴`)
      near(viewFromEarth.x / viewFromEarth.y, Math.tan(tilt * Math.PI / 180))
      assert.equal(app.tween, null)
    }
  }
})

test('正常主指针点击与4像素以内抖动可选点，完成后状态清空', () => {
  const gesture = createPointPickGesture()
  gesture.start(1, 100, 200, 1000, true)
  gesture.move(1, 102, 201)
  assert.equal(gesture.finish(1, 102, 201, 1140), true)
  assert.equal(gesture.finish(1, 102, 201, 1160), false)
  gesture.start(2, 20, 30, 2000, true)
  gesture.move(2, 24, 30)
  assert.equal(gesture.finish(2, 24, 30, 2449), true)
})

test('拖动途中超过阈值后，即使回到起点也不误选观测点', () => {
  const gesture = createPointPickGesture()
  for (const [dx, dy] of [[12, 0], [0, -12], [3, 3], [4.01, 0]]) {
    gesture.start(1, 100, 100, 0, true)
    gesture.move(1, 100 + dx, 100 + dy)
    gesture.move(1, 100, 100)
    assert.equal(gesture.finish(1, 100, 100, 160), false)
  }
  gesture.start(1, 100, 100, 1000, true)
  assert.equal(gesture.finish(1, 100, 100, 1100), true)
})

test('第二触点取消选点，任意抬起顺序都不会把多指手势当成点击', () => {
  for (const secondAllowed of [false, true]) {
    for (const releaseOrder of [[1, 2], [2, 1]]) {
      const gesture = createPointPickGesture()
      gesture.start(1, 100, 100, 0, true)
      gesture.start(2, 120, 120, 10, secondAllowed)
      for (const pointer of releaseOrder) {
        const coordinate = pointer === 1 ? 100 : 120
        assert.equal(gesture.finish(pointer, coordinate, coordinate, 100), false)
      }
      gesture.start(3, 60, 60, 200, true)
      assert.equal(gesture.finish(3, 60, 60, 260), true)
    }
  }
})

test('长按、被禁止的按键、取消及不匹配指针均拒绝选点', () => {
  const gesture = createPointPickGesture()
  for (const duration of [450, 800, 3000]) {
    gesture.start(1, 20, 20, 100, true)
    assert.equal(gesture.finish(1, 20, 20, 100 + duration), false)
  }
  gesture.start(1, 20, 20, 0, false)
  assert.equal(gesture.finish(1, 20, 20, 100), false)
  gesture.start(1, 20, 20, 0, true)
  gesture.cancel()
  assert.equal(gesture.finish(1, 20, 20, 100), false)
  gesture.start(1, 20, 20, 0, true)
  assert.equal(gesture.finish(2, 20, 20, 100), false)
  assert.equal(gesture.finish(1, 20, 20, 120), false)
})

test('全轨道的太阳光按指定数量竖向均匀排列，所有光线保持平行', () => {
  for (const count of [1, 3, 5, 7]) {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 1.95]) {
      const center = orbitPoint(angle)
      const savedCenter = center.clone()
      const direction = center.clone().normalize()
      const planeNormal = new Vector3().crossVectors(direction, new Vector3(0, 1, 0)).normalize()
      const rays = verticalSunRaySegments(center, 0.56, 0.76, count)
      assert.equal(rays.length, count)
      vectorNear(center, savedCenter)
      for (let i = 0; i < rays.length; i++) {
        const { start, end } = rays[i]
        assert.ok([...start, ...end].every(Number.isFinite))
        vectorNear(end.clone().sub(start).normalize(), direction)
        near(start.dot(planeNormal), 0)
        near(end.dot(planeNormal), 0)
        near(start.y, end.y)
        if (i > 0) {
          assert.ok(start.y > rays[i - 1].start.y)
          near(start.y - rays[i - 1].start.y, 0.56 * 1.65 / (count - 1))
        }
      }
      near(rays[0].start.y + rays.at(-1).start.y, 0)
      near(rays[Math.floor(count / 2)].start.y, 0)
    }
  }
})

test('每条光线从太阳表面出发，结束于地球迎光面且只留防穿模小间隙', () => {
  const earthRadius = 0.56
  const sunRadius = 0.76
  for (const angle of [0.1, 1.3, 2.4, 3.9, 5.4]) {
    const center = orbitPoint(angle)
    const direction = center.clone().normalize()
    for (const count of [1, 3, 5, 7]) {
      for (const { start, end } of verticalSunRaySegments(center, earthRadius, sunRadius, count)) {
        near(start.length(), sunRadius)
        assert.ok(start.dot(direction) > 0, '起点必须在朝向地球的太阳半球')
        const relativeEnd = end.clone().sub(center)
        assert.ok(relativeEnd.dot(direction) < 0, '终点必须在地球迎光侧')
        assert.ok(relativeEnd.length() >= earthRadius)
        assert.ok(relativeEnd.length() <= earthRadius + 0.008 + 1e-9)
        // The renderer stops 0.008 world units before the geometric sphere intersection.
        near(end.clone().addScaledVector(direction, 0.008).distanceTo(center), earthRadius)
        assert.ok(end.clone().sub(start).dot(direction) > 0)
      }
    }
  }
})
