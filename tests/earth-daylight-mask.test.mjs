import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { MathUtils, Matrix4, Texture, Vector3 } from 'three'

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const astronomyUrl = dataUrl(compile(await readFile(new URL('../src/utils/astronomy.ts', import.meta.url), 'utf8')))
const orbitSource = compile(await readFile(new URL('../src/utils/earthOrbit.ts', import.meta.url), 'utf8'))
  .replace(/from '\.\/astronomy'/g, `from '${astronomyUrl}'`)
const { orbitAngleAtDay, declinationAtDay } = await import(dataUrl(orbitSource))
const appearanceSource = compile(await readFile(new URL('../src/scene/createEarthAppearance.ts', import.meta.url), 'utf8'))
  .replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
const { createEarthAppearance } = await import(dataUrl(appearanceSource))
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)

function fixture() {
  const day = new Texture()
  const night = new Texture()
  const appearance = createEarthAppearance(day, night, 0.56)
  const shader = appearance.material.fragmentShader
  const body = shader.match(/float\s+earthDayMask\(float lightAmount\)\s*\{([^}]*)\}/)?.[1]
  assert.ok(body, 'Evaluate the production GLSL day mask, including its derivative-based edge width')
  assert.match(shader, /float dayMask = earthDayMask\(lightAmount\);/)
  const evaluateMask = new Function('lightAmount', 'fwidth', 'max', 'smoothstep', body.replace(/\bfloat\s+/g, 'const '))
  const lightExpression = shader.match(/float lightAmount = ([^;]+);/)?.[1]
  assert.ok(lightExpression)
  const evaluateLight = new Function('normalDirection', 'sunDirection', 'dot', `return ${lightExpression}`)
  const colorExpression = shader.match(/vec3 color = ([^;]+);/)?.[1]
  assert.ok(colorExpression, 'Check the actual day/night texture composition too')
  const evaluateColor = new Function('darkSurface', 'cityEmission', 'litDay', 'oceanGlint', 'dayMask', 'mix', `return ${colorExpression}`)
  return {
    appearance,
    mask: (lightAmount, pixelDerivative) => evaluateMask(lightAmount, () => pixelDerivative, Math.max,
      (low, high, value) => MathUtils.smoothstep(value, low, high)),
    light: normal => evaluateLight(normal, appearance.material.uniforms.sunDir.value, (a, b) => a.dot(b)),
    // Isolate city emission with all other colour inputs zero, without replacing the shader's blend expression.
    city: dayMask => evaluateColor(0, 1, 0, 0, dayMask, (a, b, amount) => a * (1 - amount) + b * amount),
    dispose() {
      appearance.material.dispose()
      appearance.atmosphere.material.dispose()
      appearance.atmosphere.geometry.dispose()
      day.dispose()
      night.dispose()
    },
  }
}

test('day/night boundary stays at solar altitude zero for every antialiasing footprint', () => {
  const earth = fixture()
  try {
    // Different projected globe sizes and grazing pixels change derivatives, never the boundary centre.
    for (const derivative of [0, 0.000001, 0.0001, 0.002, 0.02, 0.2]) {
      near(earth.mask(0, derivative), 0.5)
      for (const light of [0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.05, 0.2, 1]) {
        near(earth.mask(light, derivative) + earth.mask(-light, derivative), 1)
        assert.ok(earth.mask(light, derivative) >= 0.5)
        assert.ok(earth.mask(-light, derivative) <= 0.5)
      }
    }
    for (const derivative of [0.0001, 0.002, 0.02]) {
      near(earth.mask(derivative, derivative), 1, 0)
      near(earth.mask(-derivative, derivative), 0, 0)
    }
  } finally { earth.dispose() }
})

for (const tilt of [23 + 26 / 60, 23.5]) {
  test(`${tilt} degree model: both solstices meet both polar circles at the same shader boundary`, () => {
    const earth = fixture()
    try {
      const transform = new Matrix4().makeRotationZ(-tilt * Math.PI / 180)
      const inverse = transform.clone().invert()
      for (const [day, season] of [[172, 1], [356, -1]]) {
        near(declinationAtDay(day, tilt), season * tilt)
        const orbit = orbitAngleAtDay(day)
        const sun = new Vector3(-Math.cos(orbit), 0, -Math.sin(orbit))
        earth.appearance.material.uniforms.sunDir.value.copy(sun)
        const localSun = sun.clone().applyMatrix4(inverse)
        const noonLongitude = Math.atan2(localSun.z, localSun.x)
        for (const hemisphere of [-1, 1]) {
          const polarDay = hemisphere === season
          const criticalLongitude = noonLongitude + (polarDay ? Math.PI : 0)
          // Points on either side ensure the entire polar boundary did not merely shift together.
          for (const offset of [-0.05, 0, 0.05]) {
            const latitude = hemisphere * (90 - tilt + offset) * Math.PI / 180
            const normal = new Vector3(
              Math.cos(latitude) * Math.cos(criticalLongitude), Math.sin(latitude),
              Math.cos(latitude) * Math.sin(criticalLongitude),
            ).applyMatrix4(transform)
            const light = earth.light(normal)
            near(Math.asin(light) * 180 / Math.PI, offset * (polarDay ? 1 : -1))
            near(earth.mask(light, 0.0001), offset === 0 ? 0.5 : ((offset > 0) === polarDay ? 1 : 0))
          }
        }
      }
    } finally { earth.dispose() }
  })
}

test('city lights occur only in night pixels, with a shared antialiased horizon edge', () => {
  const earth = fixture()
  try {
    for (const derivative of [0, 0.0001, 0.002, 0.02]) {
      near(earth.city(earth.mask(0, derivative)), 0.5)
      const outsideEdge = Math.max(derivative, 0.00002)
      for (const light of [outsideEdge, 0.2, 0.7, 1]) {
        near(earth.city(earth.mask(light, derivative)), 0, 0)
        near(earth.city(earth.mask(-light, derivative)), 1, 0)
      }
    }
  } finally { earth.dispose() }
})
