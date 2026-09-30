import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import * as THREE from 'three'

const modules = new Map()
async function moduleUrl(url, angleFormat) {
  const key = `${url.href}|${angleFormat ?? 'default'}`
  if (modules.has(key)) return modules.get(key)
  let source = await readFile(url, 'utf8')
  if (angleFormat) source = source.replace('import.meta.env?.VITE_ANGLE_FORMAT', JSON.stringify(angleFormat))
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) {
    code = code.replace(match[0], `from '${await moduleUrl(new URL(`${match[1]}.ts`, url), angleFormat)}'`)
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  modules.set(key, result)
  return result
}
const { createNoonAltitudeGuide, noonAltitudeFrame, noonAltitudeSamples, NOON_ALTITUDE_LATITUDES } = await import(
  await moduleUrl(new URL('../src/scene/createNoonAltitudeGuide.ts', import.meta.url)),
)
const { orbitAngleAtDay, solarLongitudeAtDay, declinationAtDay } = await import(
  await moduleUrl(new URL('../src/utils/earthOrbit.ts', import.meta.url)),
)
const { rotationFromSolarMinutes } = await import(await moduleUrl(new URL('../src/utils/earthMotion.ts', import.meta.url)))
const { AXIAL_TILT } = await import(await moduleUrl(new URL('../src/utils/astronomy.ts', import.meta.url)))
const DEG = Math.PI / 180
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
const vectorNear = (a, b, tolerance = 1e-8) => near(a.distanceTo(b), 0, tolerance)

function state(day, tilt = AXIAL_TILT) {
  const angle = orbitAngleAtDay(day)
  const center = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(4.05)
  const rotation = new THREE.Matrix4().makeRotationZ(-tilt * DEG)
  return { center, sun: center.clone().negate().normalize(), axis: new THREE.Vector3(0, 1, 0).transformDirection(rotation), rotation }
}

test('正午各纬度样本与地球真实旋转到地方太阳时12点后的法线一致', () => {
  assert.deepEqual(NOON_ALTITUDE_LATITUDES, Array.from({ length: 19 }, (_, index) => -90 + 10 * index))
  for (const tilt of [0, 10, AXIAL_TILT]) {
    for (const day of [1, 79, 120.5, 172, 266, 356]) {
      const world = state(day, tilt)
      const frame = noonAltitudeFrame(world.sun, world.axis)
      near(frame.declination, declinationAtDay(day, tilt))
      for (const longitude of [-150, 0, 116.4]) {
        const spin = rotationFromSolarMinutes(solarLongitudeAtDay(day, tilt), 720, longitude)
        const matrix = world.rotation.clone().multiply(new THREE.Matrix4().makeRotationY(spin))
        for (const sample of frame.samples) {
          const phi = sample.latitude * DEG
          const lambda = longitude * DEG
          const normal = new THREE.Vector3(Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda))
            .transformDirection(matrix)
          vectorNear(sample.normal, normal)
          near(sample.normal.dot(world.axis), Math.sin(phi))
          near(Math.asin(THREE.MathUtils.clamp(normal.dot(world.sun), -1, 1)) / DEG, sample.altitude, 1e-6)
        }
      }
      vectorNear(frame.subsolar.normal, world.sun)
      near(frame.subsolar.latitude, frame.declination)
      assert.equal(frame.subsolar.altitude, 90)
    }
  }
})

test('二分二至的正午高度保留极夜负值，0倾角两极为地平线临界且赤道直射', () => {
  for (const [day, sign] of [[172, 1], [356, -1]]) {
    const world = state(day)
    const frame = noonAltitudeFrame(world.sun, world.axis)
    near(frame.samples.find(sample => sample.latitude === 90 * sign).altitude, AXIAL_TILT)
    near(frame.samples.find(sample => sample.latitude === -90 * sign).altitude, -AXIAL_TILT)
    near(frame.samples.find(sample => sample.latitude === 0).altitude, 90 - AXIAL_TILT)
  }
  for (const day of [79, 266]) {
    const world = state(day)
    const frame = noonAltitudeFrame(world.sun, world.axis)
    near(frame.declination, 0)
    for (const sample of frame.samples) near(sample.altitude, 90 - Math.abs(sample.latitude))
  }
  for (const day of [1, 79, 172, 266, 356]) {
    const world = state(day, 0)
    const frame = noonAltitudeFrame(world.sun, world.axis)
    assert.equal(frame.samples[0].altitude, 0)
    assert.equal(frame.samples.at(-1).altitude, 0)
    assert.equal(frame.samples.find(sample => sample.latitude === 0).altitude, 90)
    near(frame.subsolar.latitude, 0)
  }
})

test('面板共用的纯读数保留负高度，并与3D各纬度逐项一致', () => {
  for (const tilt of [0, 10, AXIAL_TILT]) {
    for (const day of [79, 172, 266, 356]) {
      const world = state(day, tilt)
      const frame = noonAltitudeFrame(world.sun, world.axis)
      assert.deepEqual(noonAltitudeSamples(frame.declination), frame.samples.map(({ latitude, altitude }) => ({ latitude, altitude })))
    }
  }
  near(noonAltitudeSamples(AXIAL_TILT)[0].altitude, -AXIAL_TILT)
  near(noonAltitudeSamples(-AXIAL_TILT).at(-1).altitude, -AXIAL_TILT)
  assert.deepEqual(noonAltitudeSamples(Number.NaN), [])
  assert.deepEqual(noonAltitudeSamples(91), [])
})

test('正午子午线绑定太阳而非贴图自转，父节点任意变换也保持世界表面位置', () => {
  const radius = 0.56
  const guide = createNoonAltitudeGuide(radius)
  const parent = new THREE.Group()
  parent.position.set(2, -3, 1)
  parent.scale.set(0.8, 1.4, 1.2)
  parent.add(guide.group)
  const world = state(172)
  try {
    for (const spin of [0, 0.5, 2, 4, Math.PI * 2]) {
      parent.rotation.set(0.3, spin, -0.7)
      guide.update(world.center, world.sun, world.axis, true)
      guide.group.updateWorldMatrix(true, true)
      const frame = noonAltitudeFrame(world.sun, world.axis)
      for (const sample of frame.samples) {
        const dot = guide.group.getObjectByName(`noon-latitude-${sample.latitude}`)
        vectorNear(dot.getWorldPosition(new THREE.Vector3()), world.center.clone().addScaledVector(sample.normal, radius * 1.018))
        near(dot.userData.altitude, sample.altitude)
        assert.equal(dot.material.depthTest, true)
        assert.equal(dot.material.depthWrite, false)
      }
      const ribbon = guide.group.getObjectByName('noon-meridian-ribbon')
      const positions = ribbon.geometry.getAttribute('position')
      for (let index = 0; index < positions.count; index += 17) {
        near(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(ribbon.matrixWorld).distanceTo(world.center), radius * 1.018, 1e-7)
      }
      assert.equal(ribbon.material.depthTest, true)
      assert.equal(ribbon.material.depthWrite, false)
    }
  } finally { guide.dispose() }
})

test('直射点始终在太阳方向上，春秋分与0度倾角不叠画普通赤道刻度', () => {
  const radius = 0.56
  const guide = createNoonAltitudeGuide(radius)
  try {
    for (const [day, tilt] of [[172, AXIAL_TILT], [79, AXIAL_TILT], [356, 0]]) {
      const world = state(day, tilt)
      guide.update(world.center, world.sun, world.axis, true)
      guide.group.updateWorldMatrix(true, true)
      const marker = guide.group.getObjectByName('noon-subsolar-marker')
      vectorNear(marker.getWorldPosition(new THREE.Vector3()), world.center.clone().addScaledVector(world.sun, radius * 1.025))
      vectorNear(new THREE.Vector3(0, 0, 1).applyQuaternion(marker.getWorldQuaternion(new THREE.Quaternion())), world.sun)
      assert.equal(marker.userData.altitude, 90)
      near(marker.userData.latitude, declinationAtDay(day, tilt))
      assert.equal(guide.group.getObjectByName('noon-latitude-0').visible, day === 172)
    }
  } finally { guide.dispose() }
})

test('开关与非法输入安全，极端太阳沿轴方向不产生NaN且不修改输入', () => {
  const guide = createNoonAltitudeGuide(0.56)
  const center = new THREE.Vector3(3, 0, 2)
  const axis = new THREE.Vector3(0.2, 0.8, -0.4).normalize()
  const snapshots = [center.clone(), axis.clone()]
  try {
    for (const sign of [-1, 1]) {
      const frame = noonAltitudeFrame(axis.clone().multiplyScalar(sign), axis)
      assert.equal(frame.uniqueMeridian, false)
      assert.ok([...frame.equatorial, ...frame.sideways, ...frame.samples.flatMap(sample => [...sample.normal, sample.altitude])].every(Number.isFinite))
      near(frame.declination, sign * 90, 1e-6)
    }
    guide.update(center, new THREE.Vector3(1, 0, 0), axis, true)
    assert.equal(guide.group.visible, true)
    guide.update(center, new THREE.Vector3(1, 0, 0), axis, false)
    assert.equal(guide.group.visible, false)
    guide.update(center, new THREE.Vector3(), axis, true)
    assert.equal(guide.group.visible, false)
    guide.update(new THREE.Vector3(Infinity, 0, 0), new THREE.Vector3(1, 0, 0), axis, true)
    assert.equal(guide.group.visible, false)
    assert.equal(noonAltitudeFrame(new THREE.Vector3(NaN, 0, 0), axis), null)
    vectorNear(center, snapshots[0])
    vectorNear(axis, snapshots[1])
  } finally { guide.dispose() }
})

test('共享刻度资源仅释放一次，卸载后不再显示也不修改场景', () => {
  const guide = createNoonAltitudeGuide(0.56)
  const parent = new THREE.Group()
  parent.add(guide.group)
  const world = state(172)
  guide.update(world.center, world.sun, world.axis, true)
  const resources = new Set()
  guide.group.traverse(object => {
    if (object.geometry) resources.add(object.geometry)
    if (object.material) resources.add(object.material)
  })
  const counts = new Map([...resources].map(resource => [resource, 0]))
  resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)))
  guide.dispose()
  guide.dispose()
  resources.forEach(resource => assert.equal(counts.get(resource), 1))
  assert.equal(guide.group.parent, null)
  guide.update(world.center, world.sun, world.axis, true)
  assert.equal(guide.group.visible, false)
})

test('唯一90度标签保持像素字号，背面及离屏不显示，文字贴图能安全释放', () => {
  const previousDocument = globalThis.document
  const drawn = []
  globalThis.document = {
    createElement() { return { width: 0, height: 0, getContext() { return { clearRect() {}, strokeText() {}, fillText(text) { drawn.push(text) } } } } },
  }
  const radius = 0.56
  const guide = createNoonAltitudeGuide(radius)
  try {
    assert.deepEqual(drawn, ['90°'])
    const label = guide.group.getObjectByName('noon-subsolar-altitude-label')
    assert.equal(label.material.depthTest, true)
    assert.equal(label.material.depthWrite, false)
    guide.update(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), true)
    const perspective = new THREE.PerspectiveCamera(42, 1.5, 0.1, 100)
    perspective.position.set(0, 0, 3)
    perspective.lookAt(0, 0, 0)
    guide.updateForCamera(perspective, 600)
    assert.equal(label.visible, true)
    let distance = 3 - radius * 1.04
    near(label.scale.y / (2 * distance * Math.tan(21 * DEG)) * 600, 26)
    perspective.position.z = 6
    guide.updateForCamera(perspective, 600)
    distance = 6 - radius * 1.04
    near(label.scale.y / (2 * distance * Math.tan(21 * DEG)) * 600, 26)
    const ortho = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100)
    ortho.position.set(0, 0, 3)
    ortho.lookAt(0, 0, 0)
    ortho.zoom = 2
    ortho.updateProjectionMatrix()
    guide.updateForCamera(ortho, 600)
    assert.equal(label.visible, true)
    near(label.scale.y / 2 * 600, 26)
    perspective.position.z = -3
    perspective.lookAt(0, 0, 0)
    guide.updateForCamera(perspective, 600)
    assert.equal(label.visible, false)
    perspective.position.set(0, 0, 3)
    perspective.lookAt(10, 0, 0)
    guide.updateForCamera(perspective, 600)
    assert.equal(label.visible, false)
    let textureDisposals = 0
    let materialDisposals = 0
    label.material.map.addEventListener('dispose', () => textureDisposals++)
    label.material.addEventListener('dispose', () => materialDisposals++)
    guide.dispose()
    guide.dispose()
    assert.equal(textureDisposals, 1)
    assert.equal(materialDisposals, 1)
  } finally {
    guide.dispose()
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})

function mockCanvasDocument() {
  const previous = globalThis.document
  const canvases = []
  globalThis.document = {
    createElement() {
      const canvas = { width: 0, height: 0, drawings: [] }
      const context = { clearRect() {}, strokeText() {}, fillText(text) { canvas.drawings.push(text) }, measureText(text) { return { width: text.length * 21 } } }
      canvas.getContext = () => context
      canvases.push(canvas)
      return canvas
    },
  }
  return { canvases, restore() { if (previous === undefined) delete globalThis.document; else globalThis.document = previous } }
}

function latitudeSprites(guide) {
  return guide.group.children.filter(item => /^noon-latitude-.*-label$/.test(item.name))
}

test('各纬度标签使用公共度分/小数格式，纹理尺寸固定且仅格式化读数改变时重绘', async () => {
  const dom = mockCanvasDocument()
  try {
    for (const [mode, tilt, expected] of [['dms', 23 + 26 / 60, '30°N · H 83°26′'], ['decimal', 23.5, '30°N · H 83.5°']]) {
      const module = await import(await moduleUrl(new URL('../src/scene/createNoonAltitudeGuide.ts', import.meta.url), mode))
      const guide = module.createNoonAltitudeGuide(0.56)
      try {
        const world = state(172, tilt)
        guide.update(world.center, world.sun, world.axis, true)
        const labels = latitudeSprites(guide)
        assert.equal(labels.length, 19)
        assert.equal(guide.group.getObjectByName('noon-latitude-30-label').userData.text, expected)
        assert.match(guide.group.getObjectByName('noon-latitude--90-label').userData.text, /H −23/)
        const textures = labels.map(label => label.material.map)
        const versions = textures.map(texture => texture.version)
        const canvases = textures.map(texture => texture.image)
        const calls = canvases.map(canvas => canvas.drawings.length)
        canvases.forEach(canvas => assert.deepEqual([canvas.width, canvas.height], [512, 64]))
        guide.update(world.center, world.sun, world.axis, true)
        guide.update(world.center, world.sun, world.axis, true)
        assert.deepEqual(textures.map(texture => texture.version), versions)
        assert.deepEqual(canvases.map(canvas => canvas.drawings.length), calls)
        const changed = state(79, tilt)
        guide.update(changed.center, changed.sun, changed.axis, true)
        assert.equal(guide.group.getObjectByName('noon-latitude-30-label').userData.text, mode === 'dms' ? '30°N · H 60°00′' : '30°N · H 60.0°')
        assert.ok(textures.some((texture, index) => texture.version > versions[index]))
        canvases.forEach((canvas, index) => {
          assert.equal(textures[index].image, canvas)
          assert.deepEqual([canvas.width, canvas.height], [512, 64])
        })
      } finally { guide.dispose() }
    }
  } finally { dom.restore() }
})

test('近看展示可见侧全部纬度读数，交替引线对准采样点，远看避让且背面全部隐藏', () => {
  const dom = mockCanvasDocument()
  const radius = 0.56
  const guide = createNoonAltitudeGuide(radius)
  const camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 100)
  const height = 900
  const width = height * camera.aspect
  function bounds(sprite) {
    const world = sprite.getWorldPosition(new THREE.Vector3())
    const projected = world.clone().project(camera)
    const units = -world.applyMatrix4(camera.matrixWorldInverse).z * 2 * Math.tan(21 * DEG) / height
    const w = sprite.scale.x / units
    const h = sprite.scale.y / units
    const x = (projected.x + 1) * width / 2
    const y = (1 - projected.y) * height / 2
    return { left: x - sprite.center.x * w, right: x + (1 - sprite.center.x) * w, top: y - (1 - sprite.center.y) * h, bottom: y + sprite.center.y * h, h }
  }
  function checkLayout() {
    const shown = latitudeSprites(guide).filter(item => item.visible)
    const boxes = shown.map(bounds)
    const ninety = guide.group.getObjectByName('noon-subsolar-altitude-label')
    if (ninety.visible) boxes.push(bounds(ninety))
    for (const [index, box] of boxes.entries()) {
      assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height)
      for (const other of boxes.slice(index + 1)) {
        assert.ok(box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top, 'labels must not overlap')
      }
    }
    return shown
  }
  try {
    guide.update(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), true)
    camera.position.set(0, 0, 3)
    camera.lookAt(0, 0, 0)
    guide.updateForCamera(camera, height)
    const labels = checkLayout()
    assert.equal(labels.length, 15, 'all front-facing 10-degree samples from 70S to 70N should fit at close view')
    for (const sprite of labels) {
      near(bounds(sprite).h * 40 / 64, 14)
      const baseName = sprite.name.replace(/-label$/, '')
      const dot = guide.group.getObjectByName(baseName)
      const leader = guide.group.getObjectByName(`${baseName}-leader`)
      assert.equal(leader.visible, true)
      guide.group.updateWorldMatrix(true, true)
      vectorNear(new THREE.Vector3().fromBufferAttribute(leader.geometry.getAttribute('position'), 0).applyMatrix4(leader.matrixWorld), dot.getWorldPosition(new THREE.Vector3()), 1e-7)
    }
    const textureVersions = latitudeSprites(guide).map(sprite => sprite.material.map.version)
    camera.position.z = 24
    guide.updateForCamera(camera, height)
    const distant = checkLayout()
    assert.ok(distant.length > 0 && distant.length < 19)
    assert.deepEqual(latitudeSprites(guide).map(sprite => sprite.material.map.version), textureVersions)
    camera.position.z = -3
    camera.lookAt(0, 0, 0)
    guide.updateForCamera(camera, height)
    assert.equal(latitudeSprites(guide).filter(sprite => sprite.visible).length, 0)
    assert.equal(guide.group.children.filter(item => item.name.endsWith('-leader') && item.visible).length, 0)
  } finally { guide.dispose(); dom.restore() }
})

test('新增19个标签的固定纹理、材质和引线各释放一次', () => {
  const dom = mockCanvasDocument()
  const guide = createNoonAltitudeGuide(0.56)
  try {
    const resources = new Set()
    for (const sprite of latitudeSprites(guide)) {
      const leader = guide.group.getObjectByName(sprite.name.replace('-label', '-leader'))
      for (const resource of [sprite.material, sprite.material.map, leader.geometry, leader.material]) resources.add(resource)
    }
    assert.equal(resources.size, 19 * 4)
    const counts = new Map([...resources].map(resource => [resource, 0]))
    resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)))
    guide.dispose()
    guide.dispose()
    resources.forEach(resource => assert.equal(counts.get(resource), 1))
  } finally { guide.dispose(); dom.restore() }
})
