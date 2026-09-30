import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { Vector3 } from 'three'

const DEG = Math.PI / 180
const near = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`)
}
const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const compiledModules = new Map()

async function compileTsModule(url, mode) {
  const key = `${url.href}:${mode}`
  if (compiledModules.has(key)) return compiledModules.get(key)
  const source = (await readFile(url, 'utf8'))
    .replace('import.meta.env?.VITE_ANGLE_FORMAT', JSON.stringify(mode))
  let code = transpile(source).replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
  for (const match of [...code.matchAll(/from '(\.[^']+)'/g)]) {
    const dependency = await compileTsModule(new URL(`${match[1]}.ts`, url), mode)
    code = code.replace(match[0], `from '${dependency}'`)
  }
  const compiled = moduleUrl(code)
  compiledModules.set(key, compiled)
  return compiled
}

const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.ts', parse(appSource).descriptor.scriptSetup.content,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const appFunction = name => {
  const node = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(node, `App.vue function ${name}`)
  return node
}
const appConstant = name => {
  const declaration = tree.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(node => ts.isIdentifier(node.name) && node.name.text === name)
  assert.ok(declaration?.initializer, `App.vue constant ${name}`)
  return `const ${name} = ${declaration.initializer.getText(tree)}`
}

// Use the production frame's exact directions and parent transforms, not a second
// implementation of the globe's tilt/spin convention. Other frame side effects
// (renderers, observers, camera updates) are outside this mathematical audit.
const frameStatements = appFunction('updateAnimatedOrbitFrame').body.statements
const frameVariables = frameStatements.filter(ts.isVariableStatement).filter(statement =>
  statement.declarationList.declarations.some(node => ts.isIdentifier(node.name)
    && ['theta', 'earthPos', 'earthToSunWorld', 'axisDirection'].includes(node.name.text)))
assert.equal(frameVariables.length, 4)
const transformStatements = [
  'earthSystem.position.copy(', 'tiltGroup.rotation.z =', 'spinGroup.rotation.y =',
].map(prefix => {
  const node = frameStatements.find(node => node.getText(tree).startsWith(prefix))
  assert.ok(node, `App.vue frame transform ${prefix}`)
  return node.getText(tree)
})

async function loadAudit(mode) {
  const astronomyUrl = await compileTsModule(new URL('../src/utils/astronomy.ts', import.meta.url), mode)
  const orbitUrl = await compileTsModule(new URL('../src/utils/earthOrbit.ts', import.meta.url), mode)
  const motionUrl = await compileTsModule(new URL('../src/utils/earthMotion.ts', import.meta.url), mode)
  const terminatorUrl = await compileTsModule(new URL('../src/scene/createTerminator.ts', import.meta.url), mode)
  const source = [
    `import * as THREE from '${import.meta.resolve('three')}'`,
    `import { ref, computed } from '${import.meta.resolve('vue')}'`,
    `import { MAX_OBLIQUITY_MINUTES } from '${astronomyUrl}'`,
    `import { orbitAngleAtDay } from '${orbitUrl}'`,
    ...['DEG', 'RAD', 'POLAR_EPS', 'EARTH_R', 'ORBIT_R', 'obliquityMinutes',
      'axialTilt', 'polarCircle', 'axialTiltRotation'].map(appConstant),
    // Labels need browser canvas; keep the actual line geometry under test.
    'function labelSprite() { return new THREE.Object3D() }',
    ...['orbitThetaByDay', 'latLngToVector', 'dashedLatitudeLine', 'createTropics',
      'dayLengthInfo', 'altitudeFromHourAngle', 'clamp']
      .map(name => `export ${appFunction(name).getText(tree)}`),
    `export function worldFrame(day, runtimeSpinRadians = 0) {
      ${frameVariables.map(node => node.getText(tree)).join('\n')}
      const earthSystem = new THREE.Group()
      const tiltGroup = new THREE.Group()
      const spinGroup = new THREE.Group()
      earthSystem.add(tiltGroup)
      tiltGroup.add(spinGroup)
      ${transformStatements.join('\n')}
      spinGroup.updateWorldMatrix(true, false)
      return { earthPos, earthToSunWorld, axisDirection, matrix: spinGroup.matrixWorld.clone() }
    }`,
  ].join('\n')
  return {
    ...await import(astronomyUrl),
    ...await import(orbitUrl),
    ...await import(motionUrl),
    ...await import(terminatorUrl),
    ...await import(moduleUrl(transpile(source))),
  }
}

for (const mode of ['dms', 'decimal']) {
  const actual = await loadAudit(mode)
  const tilt = actual.AXIAL_TILT
  const circle = actual.POLAR_CIRCLE

  test(`${mode}: 默认倾角与绘制极圈互余，度分和小数教学口径不混用`, () => {
    near(tilt, mode === 'dms' ? 23 + 26 / 60 : 23.5)
    near(circle, mode === 'dms' ? 66 + 34 / 60 : 66.5)
    near(tilt + circle, 90)
    const rings = actual.createTropics().children.filter(child => child.isLine)
    assert.equal(rings.length, 4)
    const expectedLatitudes = [tilt, -tilt, circle, -circle]
    rings.forEach((ring, index) => {
      const positions = ring.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        const normal = new Vector3().fromBufferAttribute(positions, i).normalize()
        // BufferGeometry stores Float32 coordinates, so allow their roundoff.
        near(Math.asin(normal.y) / DEG, expectedLatitudes[index], 3e-6)
      }
      ring.geometry.dispose()
      ring.material.dispose()
    })
  })

  test(`${mode}: 夏冬至晨昏线与两极圈相切，世界方向赤纬等于数据赤纬`, () => {
    for (const [day, sign] of [[172, 1], [356, -1]]) {
      const frame = actual.worldFrame(day)
      const sun = frame.earthToSunWorld
      const axis = frame.axisDirection
      const terminator = actual.terminatorFrame(sun, axis)
      assert.ok(terminator)
      near(Math.asin(axis.dot(sun)) / DEG, sign * tilt)
      near(actual.declinationAtDay(day, tilt), sign * tilt)
      for (const hemisphere of [-1, 1]) {
        const tangentPoint = terminator.junction.clone().multiplyScalar(hemisphere)
        near(tangentPoint.dot(sun), 0)
        near(Math.asin(tangentPoint.dot(axis)) / DEG, hemisphere * circle)
        const circleTangent = new Vector3().crossVectors(axis, tangentPoint).normalize()
        const terminatorTangent = new Vector3().crossVectors(sun, tangentPoint).normalize()
        near(new Vector3().crossVectors(circleTangent, terminatorTangent).length(), 0)
      }
    }
  })

  test(`${mode}: 夏冬至两极圈内外 0.01° 的全天几何高度与极昼极夜判据一致`, () => {
    for (const day of [172, 356]) {
      const declination = actual.declinationAtDay(day, tilt)
      const sunLongitude = actual.solarLongitudeAtDay(day, tilt)
      for (const hemisphere of [-1, 1]) {
        const summer = hemisphere * declination > 0
        for (const offset of [-0.01, 0, 0.01]) {
          const latitude = hemisphere * (circle + offset)
          const info = actual.dayLengthInfo(latitude, declination)
          const heights = []
          for (let minutes = 0; minutes < 1440; minutes += 30) {
            const spin = actual.rotationFromSolarMinutes(sunLongitude, minutes, 0)
            const frame = actual.worldFrame(day, spin)
            const worldPoint = actual.latLngToVector(latitude, 0, 1).applyMatrix4(frame.matrix)
            const worldNormal = worldPoint.sub(frame.earthPos).normalize()
            const geometryAltitude = Math.asin(worldNormal.dot(frame.earthToSunWorld)) / DEG
            const dataAltitude = actual.altitudeFromHourAngle(latitude, declination, (minutes - 720) / 4)
            near(geometryAltitude, dataAltitude)
            heights.push(geometryAltitude)
          }
          const minimum = Math.min(...heights)
          const maximum = Math.max(...heights)
          near(summer ? minimum : maximum, summer ? offset : -offset)
          if (offset < 0) {
            assert.equal(info.type, 'normal')
            assert.ok(minimum < 0 && maximum > 0)
            assert.ok(summer ? info.dayLength > 23 && info.dayLength < 24
              : info.dayLength > 0 && info.dayLength < 1)
          } else {
            assert.equal(info.type, summer ? 'polar-day' : 'polar-night')
            assert.equal(info.dayLength, summer ? 24 : 0)
            assert.ok(summer ? minimum >= -1e-10 : maximum <= 1e-10)
          }
        }
      }
    }
  })
}
