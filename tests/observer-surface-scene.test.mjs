import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Texture, Vector3 } from 'three'

const compiled = new Map()
async function compile(url) {
  if (compiled.has(url.href)) return compiled.get(url.href)
  const source = await readFile(url, 'utf8')
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) {
    code = code.replace(match[0], `from '${await compile(new URL(`${match[1]}.ts`, url))}'`)
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  compiled.set(url.href, result)
  return result
}
const { createObserverSurfaceScene } = await import(await compile(new URL('../src/scene/createObserverSurfaceScene.ts', import.meta.url)))
const { solarAzimuthText, solarPathDirection, sundialIllumination, sundialReadingNotice } = await import(await compile(new URL('../src/utils/sundial.ts', import.meta.url)))
const { AXIAL_TILT } = await import(await compile(new URL('../src/utils/astronomy.ts', import.meta.url)))

// Exercise the current solar scene's actual classification functions, not a second approximation.
const solarSceneSource = await readFile(new URL('../src/sun.vue', import.meta.url), 'utf8')
const solarSceneTree = ts.createSourceFile('sun.ts', parse(solarSceneSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const solarSceneFunctions = ['dayLengthInfoByDeclination', 'computeSolarMetricsByDeclination', 'degToRad', 'radToDeg', 'normalize360', 'clamp'].map(name => {
  const declaration = solarSceneTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, `sun.vue must contain ${name}`)
  return `export ${declaration.getText(solarSceneTree)}`
})
const polarEpsilon = solarSceneTree.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => ts.isIdentifier(node.name) && node.name.text === 'POLAR_EPS')
assert.ok(polarEpsilon?.initializer)
const actualSolarCode = ts.transpileModule([
  `import * as THREE from '${import.meta.resolve('three')}'`,
  `const POLAR_EPS = ${polarEpsilon.initializer.getText(solarSceneTree)};`,
  ...solarSceneFunctions,
].join('\n'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { dayLengthInfoByDeclination, computeSolarMetricsByDeclination } = await import(`data:text/javascript;base64,${Buffer.from(actualSolarCode).toString('base64')}`)
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const degrees = radians => radians * 180 / Math.PI
const azimuthOf = direction => (degrees(Math.atan2(-direction.x, direction.z)) + 360) % 360

test('surface sun matches the supplied altitude and azimuth from the fixed eye position', () => {
  const surface = createObserverSurfaceScene(new Texture())
  const eye = surface.camera.position.clone()
  assert.equal(surface.camera.fov, 60, 'Surface framing matches the final observer flight camera')
  const sun = surface.scene.getObjectByName('observer-apparent-sun')
  for (const altitude of [-30, -0.000001, 0, 4, 35, 78, 89.9, 90]) {
    for (const azimuth of [0, 90, 180, 270, 359]) {
      surface.update({ altitude, azimuth, solarMinutes: 720, aspect: 1.4 })
      const actual = sun.position.clone().sub(surface.camera.position).normalize()
      near(degrees(Math.asin(actual.y)), altitude, 1e-7)
      if (altitude < 90) near(azimuthOf(actual), azimuth)
      assert.equal(sun.visible, altitude >= 0)
      near(surface.camera.position.distanceTo(eye), 0)
      const gaze = surface.camera.getWorldDirection(new Vector3())
      near(degrees(Math.asin(gaze.y)), Math.max(4, Math.min(78, altitude)))
      near(azimuthOf(gaze), azimuth)
      near(surface.camera.aspect, 1.4)
    }
  }
  const radius = sun.geometry.parameters.radius
  const distance = sun.position.distanceTo(surface.camera.position)
  near(degrees(Math.asin(radius / distance)) * 2, 3, 1e-8)
  surface.dispose()
})

test('manual surface look persists while the Sun, daylight, time, and viewport keep updating', () => {
  const surface = createObserverSurfaceScene(new Texture())
  try {
    surface.setLook(90, -20)
    const view = surface.camera.getWorldDirection(new Vector3())
    const eye = surface.camera.position.clone()
    const sun = surface.scene.getObjectByName('observer-apparent-sun')
    const sky = surface.scene.getObjectByName('local-day-night-sky')
    for (const [altitude, azimuth, solarMinutes, aspect] of [[45, 180, 720, 1.4], [-20, 300, 0, .6], [12, 68, 370, 2]]) {
      surface.update({ altitude, azimuth, solarMinutes, aspect })
      const look = surface.getLook()
      assert.equal(look.followingSun, false)
      near(look.heading, 90)
      near(look.pitch, -20)
      near(surface.camera.getWorldDirection(new Vector3()).distanceTo(view), 0)
      near(surface.camera.position.distanceTo(eye), 0)
      near(surface.camera.aspect, aspect)
      const actualSunDirection = sun.position.clone().sub(eye).normalize()
      near(degrees(Math.asin(actualSunDirection.y)), altitude)
      near(azimuthOf(actualSunDirection), azimuth)
      assert.equal(sun.visible, altitude >= 0)
      if (altitude < -8) assert.equal(sky.material.uniforms.uNightWeight.value, 1)
      if (altitude > 10) assert.equal(sky.material.uniforms.uDayWeight.value, 1)
    }
  } finally { surface.dispose() }
})

test('followSun immediately resumes the latest solar heading and continues tracking with comfortable pitch limits', () => {
  const surface = createObserverSurfaceScene(new Texture())
  try {
    assert.equal(surface.getLook().followingSun, true)
    surface.setLook(15, -50)
    surface.update({ altitude: -30, azimuth: 280, solarMinutes: 0, aspect: 1 })
    surface.followSun()
    assert.equal(surface.getLook().followingSun, true)
    near(surface.getLook().heading, 280)
    near(surface.getLook().pitch, 4)
    for (const [altitude, azimuth, expectedPitch] of [[90, 20, 78], [25, 300, 25], [0, 0, 4]]) {
      surface.update({ altitude, azimuth, solarMinutes: 720, aspect: 1 })
      near(surface.getLook().heading, azimuth)
      near(surface.getLook().pitch, expectedPitch)
      assert.equal(surface.getLook().followingSun, true)
    }
  } finally { surface.dispose() }
})

test('manual headings wrap clockwise from north and pitches clamp above either pole without changing solar geometry', () => {
  const surface = createObserverSurfaceScene(new Texture())
  try {
    const originalSun = surface.scene.getObjectByName('observer-apparent-sun').position.clone()
    for (const [heading, pitch, expectedHeading, expectedPitch] of [[0, 0, 0, 0], [90, 15, 90, 15], [180, -35, 180, -35], [-90, 120, 270, 85], [450, -120, 90, -85], [720, 85, 0, 85]]) {
      surface.setLook(heading, pitch)
      const look = surface.getLook()
      const direction = surface.camera.getWorldDirection(new Vector3())
      near(look.heading, expectedHeading)
      near(look.pitch, expectedPitch)
      near(degrees(Math.asin(direction.y)), expectedPitch)
      near(look.heading, (azimuthOf(direction) + 360) % 360)
      assert.equal(look.followingSun, false)
      assert.ok([...direction, ...surface.camera.quaternion].every(Number.isFinite))
      near(surface.scene.getObjectByName('observer-apparent-sun').position.distanceTo(originalSun), 0)
    }
    surface.setLook(Number.NaN, Number.POSITIVE_INFINITY)
    near(surface.getLook().heading, 0)
    near(surface.getLook().pitch, 85)
    surface.camera.lookAt(surface.camera.position.clone().add(new Vector3(-1, 0, 0)))
    near(surface.getLook().heading, 90, 1e-8)
    near(surface.getLook().pitch, 0, 1e-8)
  } finally { surface.dispose() }
})

test('the enlarged teaching Sun keeps the geometric horizon through its center and hides below it', () => {
  const surface = createObserverSurfaceScene(new Texture())
  const sun = surface.scene.getObjectByName('observer-apparent-sun')
  const eyeHeight = surface.camera.position.y
  assert.equal(sun.material.uniforms.eyeHeight.value, eyeHeight)
  assert.match(sun.material.vertexShader, /vHeightAboveHorizon\s*=\s*worldPosition\.y\s*-\s*eyeHeight/)
  assert.match(sun.material.fragmentShader, /if\s*\(vHeightAboveHorizon\s*<\s*-0\.001\)\s*discard/)
  for (const azimuth of [0, 90, 180, 270]) {
    surface.update({ altitude: 0, azimuth, solarMinutes: 360, aspect: 1 })
    near(sun.position.y, eyeHeight)
    assert.equal(sun.visible, true)
    const radius = sun.geometry.parameters.radius
    assert.ok(sun.position.y - radius < eyeHeight && sun.position.y + radius > eyeHeight, 'the geometric horizon cuts the enlarged disc in half at center altitude 0°')
    surface.update({ altitude: -0.01, azimuth, solarMinutes: 359, aspect: 1 })
    assert.equal(sun.visible, false, 'visibility is determined by the center, not the artificially enlarged upper limb')
  }
  surface.dispose()
})

test('solar bearing copy wraps north consistently and never assigns a bearing at zenith or nadir', () => {
  assert.equal(solarAzimuthText(30, 0), '0°00′')
  assert.equal(solarAzimuthText(30, 90), '90°00′')
  assert.equal(solarAzimuthText(30, -90), '270°00′')
  assert.equal(solarAzimuthText(30, 359.99), '359°59′')
  assert.equal(solarAzimuthText(30, 359.999), '0°00′')
  assert.equal(solarAzimuthText(30, 720), '0°00′')
  for (const azimuth of [0, 90, 180, 270]) {
    assert.equal(solarAzimuthText(90, azimuth), '天顶（方位不定）')
    assert.equal(solarAzimuthText(-90, azimuth), '天底（方位不定）')
  }
})

test('sundial descriptions follow the illuminated face in both hemispheres, the equator, and the poles', () => {
  for (const latitude of [-90, -33.87, 0, 24.48, 90]) for (const declination of [-20, 0, 20]) {
    const direction = solarPathDirection(latitude, declination, 12)
    const altitude = degrees(Math.asin(direction.y))
    const azimuth = azimuthOf(direction)
    const lighting = sundialIllumination(latitude, altitude, azimuth)
    const notice = sundialReadingNotice(latitude, altitude, azimuth)
    assert.equal(notice.status, lighting.status)
    if (lighting.status === 'readable') {
      assert.ok(notice.detail.includes(lighting.face > 0 ? '朝北天极面' : '朝南天极面'))
      if (latitude === 0) assert.ok(notice.title.includes('竖直晷面'))
      else assert.ok(notice.title.includes(lighting.normal.y * lighting.face > 0 ? '上表面' : '下表面'))
    } else if (lighting.status === 'parallel') {
      assert.ok(notice.title.includes('掠射'))
      assert.ok(notice.detail.includes('地面上的影子仍可能存在'))
    } else {
      assert.ok(notice.detail.includes('地平线或以下'))
    }
  }
  assert.ok(!sundialReadingNotice(24.48, 0, 90).title.includes('夜间'), 'center on the horizon is a day/night boundary, not an unqualified night label')
})

test('solar paths preserve a real short day or night immediately equatorward of either polar circle', () => {
  for (const tilt of [10, AXIAL_TILT]) for (const hemisphere of [-1, 1]) for (const season of [-1, 1]) {
    const latitude = hemisphere * (90 - tilt - 0.01)
    const declination = hemisphere * season * tilt
    const day = dayLengthInfoByDeclination(latitude, declination)
    assert.equal(day.type, 'normal', 'a brief real day/night must not be rounded to a polar classification')
    assert.ok(day.dayLength > 0 && day.dayLength < 24)
    assert.ok(season > 0 ? day.dayLength > 23 : day.dayLength < 1)
    const noon = computeSolarMetricsByDeclination(latitude, declination, 12)
    near(computeSolarMetricsByDeclination(latitude, declination, noon.sunrise).altitude, 0)
    near(computeSolarMetricsByDeclination(latitude, declination, noon.sunset).altitude, 0)
    const beyond = dayLengthInfoByDeclination(hemisphere * (90 - tilt + 0.01), declination)
    assert.equal(beyond.type, season > 0 ? 'polar-day' : 'polar-night')
  }
})

test('surface scene stays fog-free and synchronizes sky and level ground with local daylight', () => {
  const surface = createObserverSurfaceScene(new Texture())
  const sky = surface.scene.getObjectByName('local-day-night-sky')
  const ground = surface.scene.getObjectByName('observer-level-ground')
  assert.equal(surface.scene.fog, null)
  ground.updateMatrixWorld(true)
  const normal = new Vector3(0, 0, 1).transformDirection(ground.matrixWorld)
  near(normal.distanceTo(new Vector3(0, 1, 0)), 0)
  surface.update({ altitude: 40, azimuth: 180, solarMinutes: 720, aspect: 0.4 })
  assert.equal(sky.material.uniforms.uDayWeight.value, 1)
  assert.equal(sky.material.uniforms.uNightWeight.value, 0)
  const dayGround = ground.material.color.clone()
  surface.update({ altitude: -20, azimuth: 0, solarMinutes: 0, aspect: 2 })
  assert.equal(sky.material.uniforms.uDayWeight.value, 0)
  assert.equal(sky.material.uniforms.uNightWeight.value, 1)
  assert.ok(ground.material.color.r < dayGround.r && ground.material.color.g < dayGround.g && ground.material.color.b < dayGround.b)
  assert.equal(surface.scene.getObjectByName('observer-apparent-sun').visible, false)
  surface.dispose()
})

test('surface disposal releases owned resources once and preserves the shared solar texture', () => {
  const texture = new Texture()
  let textureDisposals = 0
  texture.addEventListener('dispose', () => textureDisposals++)
  const surface = createObserverSurfaceScene(texture)
  const geometries = new Set()
  const materials = new Set()
  surface.scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    if (object.material) materials.add(object.material)
  })
  let geometryDisposals = 0
  let materialDisposals = 0
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => geometryDisposals++))
  materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++))
  surface.dispose()
  surface.dispose()
  assert.equal(textureDisposals, 0)
  assert.equal(geometryDisposals, geometries.size)
  assert.equal(materialDisposals, materials.size)
  assert.equal(surface.scene.children.length, 0)
})

test('cardinal labels dispose owned textures without disposing the globally shared sprite quad', () => {
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ strokeText() {}, fillText() {} }) }),
  }
  try {
    const surface = createObserverSurfaceScene(new Texture())
    const labels = surface.scene.children.filter(object => object.isSprite)
    assert.equal(labels.length, 4)
    let labelTextureDisposals = 0
    let sharedQuadDisposals = 0
    const sharedQuad = labels[0].geometry
    const trackSharedQuad = () => sharedQuadDisposals++
    sharedQuad.addEventListener('dispose', trackSharedQuad)
    labels.forEach(label => label.material.map.addEventListener('dispose', () => labelTextureDisposals++))
    surface.dispose()
    surface.dispose()
    assert.equal(labelTextureDisposals, 4)
    assert.equal(sharedQuadDisposals, 0)
    sharedQuad.removeEventListener('dispose', trackSharedQuad)
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
