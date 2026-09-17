import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { MathUtils, Raycaster, Scene, Vector3 } from 'three'

const source = await readFile(new URL('../src/scene/createSunBeam.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
const { createSunBeam } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
const meshes = group => { const result = []; group.traverse(object => { if (object.isMesh) result.push(object) }); return result }

// Execute the production GLSL mask expressions with GLSL scalar/vector primitives.
// No second JavaScript implementation of the beam's clipping or day-mask formula.
function shaderMask(material, name) {
  const match = material.fragmentShader.match(new RegExp(`float\\s+${name}\\(([^)]*)\\)\\s*\\{([^}]*)\\}`))
  assert.ok(match, `Production shader contains ${name}`)
  const argumentsList = match[1].split(',').map(argument => argument.trim().split(/\s+/).at(-1))
  const evaluate = new Function(...argumentsList, 'step', 'length', 'dot', 'smoothstep', match[2])
  return (...values) => evaluate(...values, (edge, value) => value < edge ? 0 : 1,
    vector => vector.length(), (a, b) => a.dot(b), (low, high, value) => MathUtils.smoothstep(value, low, high))
}

function daylightNormal(sunlight, degrees, bearing = 0) {
  const tangent = new Vector3(0, 1, 0)
  const side = new Vector3().crossVectors(sunlight, tangent).normalize()
  const angle = degrees * Math.PI / 180
  return sunlight.clone().multiplyScalar(Math.cos(angle))
    .addScaledVector(tangent, Math.sin(angle) * Math.cos(bearing))
    .addScaledVector(side, Math.sin(angle) * Math.sin(bearing)).normalize()
}

test('daylight shell covers the whole face from subsolar point to the fading terminator and excludes the night side', () => {
  const radius = 0.56
  const beam = createSunBeam(0.76, radius)
  for (const orbitAngle of [0, 0.6, Math.PI / 2, Math.PI, Math.PI * 1.7]) {
    const center = new Vector3(Math.cos(orbitAngle) * 4.05, 0, Math.sin(orbitAngle) * 4.05)
    const sunlight = center.clone().normalize().negate()
    beam.update(center, true, 1)
    beam.group.updateMatrixWorld(true)
    const shells = meshes(beam.group).filter(mesh => mesh.name === 'sun-beam-day-hemisphere')
    assert.equal(shells.length, 2)
    for (const shell of shells) {
      near(shell.position.distanceTo(center), 0)
      const mask = shaderMask(shell.material, 'shellDayMask')
      assert.match(shell.material.fragmentShader, /float dayMask = shellDayMask\(/)
      // Sample within triangles, avoiding ray/UV-seam roundoff at exact shared meridians.
      for (const bearing of [0.13, Math.PI / 2 + 0.13, Math.PI + 0.13, Math.PI * 1.5 + 0.13]) {
        for (const angle of [0, 20, 45, 70, 85, 89]) {
          const normal = daylightNormal(sunlight, angle, bearing)
          assert.ok(mask(normal, shell.material.uniforms.uSunDirection.value) > 0, `Daylight reaches ${angle} degrees from subsolar point`)
          const ray = new Raycaster(center.clone().addScaledVector(normal, radius * 3), normal.clone().negate(), 0, radius * 2.2)
          assert.ok(ray.intersectObject(shell, false).length > 0, `The actual shell geometry covers the ${angle} degree sample`)
        }
        for (const angle of [90, 91, 120, 180]) {
          near(mask(daylightNormal(sunlight, angle, bearing), sunlight), 0)
        }
      }
      // Geometry itself is constrained to the day half-space, in addition to shader fading.
      const positions = shell.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        const relative = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(shell.matrixWorld).sub(center)
        assert.ok(relative.dot(sunlight) >= -1e-7)
        assert.ok(relative.length() > radius)
      }
      assert.equal(shell.material.depthTest, true)
      assert.equal(shell.material.depthWrite, false)
    }
  }
  beam.dispose()
})

test('parallel beam spans the projected Earth disc and clips all light inside Earth or beyond the terminator', () => {
  const radius = 0.56
  const beam = createSunBeam(0.76, radius)
  for (const orbitAngle of [0, Math.PI / 3, Math.PI, Math.PI * 1.8]) {
    const center = new Vector3(Math.cos(orbitAngle) * 4.05, 0, Math.sin(orbitAngle) * 4.05)
    const direction = center.clone().normalize()
    const sunlight = direction.clone().negate()
    beam.update(center, true, 1)
    beam.group.updateMatrixWorld(true)
    const volume = beam.group.getObjectByName('sun-beam-disc-volume')
    near(new Vector3(0, 1, 0).applyQuaternion(volume.quaternion).distanceTo(direction), 0)
    near(new Vector3(0, 0.5, 0).applyMatrix4(volume.matrixWorld).distanceTo(center), 0)
    const outer = volume.children[0]
    const outerEnd = new Vector3(1, 0.5, 0).applyMatrix4(outer.matrixWorld).sub(center)
    assert.ok(outerEnd.length() > radius, 'The bundle contains the full projected disc, not a subsolar spotlight')
    for (const mesh of volume.children) {
      const mask = shaderMask(mesh.material, 'beamAirMask')
      assert.match(mesh.material.fragmentShader, /if \(beamAirMask\(/)
      const uniforms = mesh.material.uniforms
      near(uniforms.uEarthCenter.value.distanceTo(center), 0)
      near(uniforms.uSunDirection.value.distanceTo(sunlight), 0)
      for (const angle of [0, 35, 65, 85, 89]) {
        const normal = daylightNormal(sunlight, angle)
        assert.equal(mask(normal.clone().multiplyScalar(radius * 1.01), sunlight, radius), 1)
        assert.equal(mask(normal.clone().multiplyScalar(radius * 0.99), sunlight, radius), 0, 'No volume inside the globe')
      }
      for (const angle of [91, 120, 180]) {
        assert.equal(mask(daylightNormal(sunlight, angle).multiplyScalar(radius * 2), sunlight, radius), 0, 'No volume in night-side air')
      }
      const positions = mesh.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
        assert.ok(point.length() > 0.76, 'Light starts outside the solar surface')
        const relative = point.clone().sub(center)
        if (relative.length() < radius) assert.equal(mask(relative, sunlight, radius), 0)
      }
      assert.equal(mesh.material.depthTest, true)
      assert.equal(mesh.material.depthWrite, false)
    }
  }
  beam.dispose()
})

test('bundle and hemisphere share one visibility and strength control', () => {
  const beam = createSunBeam(0.76, 0.56)
  const center = new Vector3(4.05, 0, 0)
  for (const [visible, strength] of [[false, 1], [true, 0], [true, -1], [true, NaN]]) {
    beam.update(center, visible, strength)
    assert.equal(beam.group.visible, false)
  }
  beam.update(new Vector3(0.5, 0, 0), true, 1)
  assert.equal(beam.group.visible, false)
  beam.update(center, true, 1.6)
  assert.equal(beam.group.visible, true)
  const uniforms = meshes(beam.group).map(mesh => mesh.material.uniforms.uStrength)
  assert.ok(uniforms.every(uniform => uniform === uniforms[0]))
  assert.equal(uniforms[0].value, 1.6)
  beam.dispose()
})

test('moving sunlight reuses all geometries and disposal releases each owned resource once', () => {
  const beam = createSunBeam(0.76, 0.56)
  const scene = new Scene()
  scene.add(beam.group)
  const drawables = meshes(beam.group)
  const originalGeometry = drawables.map(mesh => mesh.geometry)
  const geometries = new Set(originalGeometry)
  const materials = new Set(drawables.map(mesh => mesh.material))
  let geometryDisposals = 0
  let materialDisposals = 0
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => geometryDisposals++))
  materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++))
  for (let i = 0; i < 30; i++) {
    beam.update(new Vector3(Math.cos(i) * 4.05, 0, Math.sin(i) * 4.05), true, 1)
    meshes(beam.group).forEach((mesh, index) => assert.equal(mesh.geometry, originalGeometry[index]))
  }
  beam.dispose()
  beam.dispose()
  assert.equal(scene.children.length, 0)
  assert.equal(geometryDisposals, geometries.size)
  assert.equal(materialDisposals, materials.size)
  beam.update(new Vector3(4.05, 0, 0), true, 1)
  assert.equal(beam.group.visible, false)
})
