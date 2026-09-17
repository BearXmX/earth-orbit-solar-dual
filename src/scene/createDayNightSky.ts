import * as THREE from 'three'
import { sunDirection } from '../utils/sundial'

/** Procedural sky adapted from the sea-and-land-breezes scene; no external assets. */
export function createDayNightSky() {
  let disposed = false
  const uniforms = {
    uDayWeight: { value: 1 },
    uNightWeight: { value: 0 },
    uTwilightWeight: { value: 0 },
    uSolarPhase: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
  }
  const fogColor = new THREE.Color(0x9bc9dc)
  const dayFog = new THREE.Color(0x9bc9dc)
  const nightFog = new THREE.Color(0x071326)
  const twilightFog = new THREE.Color(0xc79474)
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = mat3(modelMatrix) * position;
        // Ignore translation so dragging or resizing never reveals a dome edge.
        vec4 viewPosition = vec4(mat3(viewMatrix) * vDirection, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_Position.z = gl_Position.w - 0.00001;
      }
    `,
    fragmentShader: `
      uniform float uDayWeight;
      uniform float uNightWeight;
      uniform float uTwilightWeight;
      uniform float uSolarPhase;
      uniform vec3 uSunDirection;
      varying vec3 vDirection;
      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2d(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
          mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
          value += noise2d(p) * amplitude;
          p = p * 2.03 + vec2(11.7, 7.9);
          amplitude *= 0.5;
        }
        return value;
      }
      void main() {
        vec3 dir = normalize(vDirection);
        float height = clamp(dir.y, 0.0, 1.0);
        float horizon = pow(1.0 - height, 4.0);
        vec3 dayColor = mix(vec3(0.40, 0.67, 0.79), vec3(0.11, 0.43, 0.66), smoothstep(0.0, 0.38, height));
        dayColor = mix(dayColor, vec3(0.025, 0.15, 0.36), smoothstep(0.38, 1.0, height));
        dayColor += vec3(0.20, 0.10, 0.035) * horizon * 0.42;
        vec3 nightColor = mix(vec3(0.018, 0.040, 0.080), vec3(0.002, 0.005, 0.018), smoothstep(0.0, 0.72, height));

        // Cloud drift follows the parent's solar time and loops at midnight.
        vec2 drift = vec2(sin(uSolarPhase) * 0.42, cos(uSolarPhase) * 0.12);
        vec2 cloudUv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, dir.y * 0.72 + 0.18);
        float cloudNoise = fbm(cloudUv * vec2(8.5, 5.2) + drift);
        float fineCloud = fbm(cloudUv * vec2(18.0, 9.0) - drift * 1.6 + vec2(0.0, 3.0));
        float clouds = smoothstep(0.44, 0.67, cloudNoise * 0.78 + fineCloud * 0.30);
        clouds *= smoothstep(-0.02, 0.22, dir.y) * (1.0 - smoothstep(0.82, 1.0, dir.y));
        float cloudLight = smoothstep(0.48, 0.78, fineCloud);
        vec3 cloudColor = mix(vec3(0.48, 0.60, 0.66), vec3(0.94, 0.96, 0.94), cloudLight);
        vec3 dayWithClouds = mix(dayColor, cloudColor, clouds * 0.56);
        vec3 nightWithClouds = mix(nightColor, vec3(0.034, 0.048, 0.073), clouds * 0.15);
        vec3 color = mix(nightWithClouds, dayWithClouds, uDayWeight);

        // Warm twilight points toward the real local solar azimuth.
        vec2 horizonDirection = dir.xz / max(length(dir.xz), 0.0001);
        vec2 sunHeading = uSunDirection.xz / max(length(uSunDirection.xz), 0.0001);
        float towardSun = pow(max(dot(horizonDirection, sunHeading), 0.0), 4.0);
        float duskAmount = uTwilightWeight * horizon * (0.28 + towardSun * 0.64);
        color = mix(color, vec3(0.66, 0.255, 0.095), duskAmount);
        color += cloudColor * clouds * uTwilightWeight * towardSun * vec3(0.16, 0.055, 0.012);

        vec2 starUv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec2 starCoord = starUv * vec2(920.0, 460.0);
        vec2 starCell = floor(starCoord);
        vec2 starLocal = fract(starCoord) - 0.5;
        float starSeed = hash21(starCell);
        float starDot = 1.0 - smoothstep(0.045, 0.20, length(starLocal));
        float star = step(0.987, starSeed) * starDot * smoothstep(0.0, 0.16, dir.y);
        float twinkle = 0.76 + 0.24 * sin(uSolarPhase * 72.0 + starSeed * 42.0);
        color += vec3(0.72, 0.88, 1.0) * star * twinkle * uNightWeight * (1.0 - clouds * 0.7) * 1.7;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(72, 64, 36), material)
  mesh.name = 'local-day-night-sky'
  mesh.frustumCulled = false
  mesh.renderOrder = -10000

  function updateSolar(altitude: number, azimuth: number, solarMinutes: number) {
    const dayWeight = THREE.MathUtils.smoothstep(altitude, -8, 10)
    const nightWeight = 1 - THREE.MathUtils.smoothstep(altitude, -12, -2)
    const twilightWeight = 1 - THREE.MathUtils.smoothstep(Math.abs(altitude + 2), 0, 10)
    uniforms.uDayWeight.value = dayWeight
    uniforms.uNightWeight.value = nightWeight
    uniforms.uTwilightWeight.value = twilightWeight
    uniforms.uSolarPhase.value = ((solarMinutes % 1440) + 1440) % 1440 / 1440 * Math.PI * 2
    uniforms.uSunDirection.value.copy(sunDirection(altitude, azimuth))
    fogColor.copy(nightFog).lerp(dayFog, dayWeight).lerp(twilightFog, twilightWeight * 0.5)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    mesh.removeFromParent()
    mesh.geometry.dispose()
    material.dispose()
  }
  return { mesh, fogColor, updateSolar, dispose }
}
