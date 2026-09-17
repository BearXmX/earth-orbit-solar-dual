import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import * as THREE from 'three'

const svg = await readFile(new URL('../src/assets/image/time-zone-ranges.svg', import.meta.url), 'utf8')
const source = await readFile(new URL('../src/scene/createTimeZoneOverlay.ts', import.meta.url), 'utf8')
const inlineAsset = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  .replace(/import (\w+) from '\.\.\/assets\/image\/time-zone-ranges\.svg\?inline';/, (_, name) => `const ${name} = ${JSON.stringify(inlineAsset)};`)
const { createTimeZoneOverlay, sampleDateLinePath } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const radius = 0.56
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`)

function createOverlay() {
  const previousLoad = THREE.TextureLoader.prototype.load
  THREE.TextureLoader.prototype.load = function (url) {
    const texture = new THREE.Texture()
    texture.userData.url = url
    return texture
  }
  try { return createTimeZoneOverlay(radius) }
  finally { THREE.TextureLoader.prototype.load = previousLoad }
}

const bands = Array.from(svg.matchAll(/<g data-zone="(-?\d+)"[^>]*>([\s\S]*?)<\/g>/g), ([, zone, body]) => ({
  zone: Number(zone),
  rectangles: Array.from(body.matchAll(/<rect x="([-.\d]+)" y="0" width="([.\d]+)" height="2048" fill="#[^"]+" fill-opacity=/g), ([, x, width]) => ({ x: Number(x), width: Number(width) })),
}))
function zonesAt(longitude) {
  const x = (longitude + 180) / 360 * 4096
  return bands.filter(band => band.rectangles.some(rect => x > rect.x && x < rect.x + rect.width)).map(band => band.zone)
}

test('本地分区贴图完整覆盖24个理论时区，中时区与东八区按中央经线左右7.5度注册', () => {
  assert.equal(bands.length, 24)
  assert.equal(new Set(bands.map(band => band.zone)).size, 24)
  for (let i = 0; i < 720; i++) assert.equal(zonesAt(-179.75 + i * 0.5).length, 1)
  for (const [longitude, expected] of [[-7.49, 0], [0, 0], [7.49, 0], [7.51, 1], [112.49, 7], [112.51, 8], [120, 8], [127.49, 8], [127.51, 9], [-90, -6]]) {
    assert.deepEqual(zonesAt(longitude), [expected])
  }
  assert.deepEqual(zonesAt(-179.99), [-12])
  assert.deepEqual(zonesAt(179.99), [-12])
  assert.equal(bands.find(band => band.zone === -12).rectangles.length, 2)
  assert.ok(svg.includes('不表示现行行政时区'))
  assert.ok(!/<image|<foreignObject|(?:href|src)="https?:/i.test(svg))
})

test('真实球面UV将格林尼治放在正X、90度东经放在负Z，北纬对应图片上部', () => {
  const overlay = createOverlay()
  try {
    const mesh = overlay.group.getObjectByName('theoretical-time-zone-surface')
    const positions = mesh.geometry.getAttribute('position')
    const uv = mesh.geometry.getAttribute('uv')
    for (const [direction, expectedU, expectedV] of [
      [new THREE.Vector3(1, 0, 0), 0.5, 0.5],
      [new THREE.Vector3(0, 0, -1), 0.75, 0.5],
      [new THREE.Vector3(0, 0, 1), 0.25, 0.5],
      [new THREE.Vector3(Math.sqrt(3) / 2, 0.5, 0), 0.5, 2 / 3],
      [new THREE.Vector3(Math.sqrt(3) / 2, -0.5, 0), 0.5, 1 / 3],
    ]) {
      let index = 0
      let distance = Infinity
      for (let i = 0; i < positions.count; i++) {
        const candidate = new THREE.Vector3().fromBufferAttribute(positions, i).normalize().distanceToSquared(direction)
        if (candidate < distance) { distance = candidate; index = i }
      }
      assert.ok(distance < 1e-12)
      near(uv.getX(index), expectedU)
      near(uv.getY(index), expectedV)
    }
    assert.equal(mesh.material.map.flipY, true)
    assert.equal(mesh.material.map.wrapS, THREE.RepeatWrapping)
    near(mesh.material.map.offset.length(), 0)
    near(mesh.material.map.rotation, 0)
    assert.equal(mesh.material.map.userData.url, inlineAsset)
    assert.equal(mesh.material.depthTest, true)
    assert.equal(mesh.material.depthWrite, false)
  } finally { overlay.dispose() }
})

test('日期界线三段从北极接到南极，保持球面连通并沿太平洋折转', () => {
  const overlay = createOverlay()
  try {
    const dateLine = overlay.group.getObjectByName('international-date-line')
    assert.equal(dateLine.children.length, 3)
    let previousEnd = null
    let first = null
    let minimumLongitudeMagnitude = 180
    for (const line of dateLine.children) {
      const position = line.geometry.getAttribute('position')
      const start = new THREE.Vector3().fromBufferAttribute(position, 0)
      first ??= start
      if (previousEnd) near(start.distanceTo(previousEnd), 0)
      let previous = start
      for (let i = 0; i < position.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, i)
        near(point.length(), radius * 1.011)
        assert.ok(point.distanceTo(previous) < radius * 0.022, '相邻样本不能穿球或绕到另一半球')
        assert.ok(point.x <= 1e-7, 'IDL应留在太平洋一侧，不能穿过格林尼治')
        if (Math.abs(point.y / point.length()) < 0.999) {
          const longitude = Math.atan2(-point.z, point.x) * 180 / Math.PI
          minimumLongitudeMagnitude = Math.min(minimumLongitudeMagnitude, Math.abs(longitude))
        }
        previous = point
      }
      previousEnd = previous
      assert.equal(line.material.depthTest, true)
    }
    near(first.distanceTo(new THREE.Vector3(0, radius * 1.011, 0)), 0)
    near(previousEnd.distanceTo(new THREE.Vector3(0, -radius * 1.011, 0)), 0)
    near(minimumLongitudeMagnitude, 150.000278, 1e-4)
    assert.ok(dateLine.getObjectByName('date-line-kiribati-samoa').material instanceof THREE.LineDashedMaterial)
  } finally { overlay.dispose() }
})

test('180度接缝的插值走最短路径，正反经度和双极端点均不产生异常', () => {
  for (const path of [[[20, 179], [20, -179]], [[20, -179], [20, 179]], [[90, 180], [-90, 180]]]) {
    const points = sampleDateLinePath(path, radius)
    assert.ok(points.length > 1)
    for (const point of points) {
      assert.ok(point.toArray().every(Number.isFinite))
      near(point.length(), radius)
      assert.ok(point.x <= 1e-9)
    }
  }
})

test('时区与日界线开关完全独立，随spin父节点旋转且可安全释放', () => {
  const overlay = createOverlay()
  const spin = new THREE.Group()
  spin.add(overlay.group)
  const zones = overlay.group.getObjectByName('theoretical-time-zones')
  const dateLine = overlay.group.getObjectByName('international-date-line')
  for (const timeZones of [false, true]) for (const enabledDateLine of [false, true]) {
    overlay.update({ timeZones, dateLine: enabledDateLine })
    assert.equal(zones.visible, timeZones)
    assert.equal(dateLine.visible, enabledDateLine)
    assert.equal(overlay.group.visible, timeZones || enabledDateLine)
  }
  spin.rotation.y = Math.PI / 2
  spin.updateMatrixWorld(true)
  near(new THREE.Vector3(1, 0, 0).applyMatrix4(zones.matrixWorld).distanceTo(new THREE.Vector3(0, 0, -1)), 0)
  const texture = zones.children[0].material.map
  let disposalCount = 0
  texture.addEventListener('dispose', () => disposalCount++)
  overlay.dispose()
  overlay.dispose()
  assert.equal(disposalCount, 1)
  assert.equal(overlay.group.parent, null)
})
