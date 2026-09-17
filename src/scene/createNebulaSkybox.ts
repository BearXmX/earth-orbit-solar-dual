import * as THREE from 'three'
import milkyWayUrl from '../assets/image/nasa-starmap-8k.jpg?inline'

/** Offline sky panorama. The JPEG is embedded once by Vite, including single-file builds. */
export function createNebulaSkybox(manager?: THREE.LoadingManager) {
  let disposed = false
  const uniforms = {
    skyMap: { value: null as THREE.Texture | null },
    texelSize: { value: new THREE.Vector2(1 / 8192, 1 / 4096) },
    daylight: { value: 0 },
    twilight: { value: 0 },
    exposure: { value: 0.62 },
  }
  const texture = new THREE.TextureLoader(manager).load(milkyWayUrl, loaded => {
    // A scene can be closed before the embedded image finishes decoding.
    if (disposed) {
      loaded.dispose()
      return
    }
    const image = loaded.image as HTMLImageElement
    uniforms.texelSize.value.set(1 / (image.naturalWidth || image.width), 1 / (image.naturalHeight || image.height))
  })
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  uniforms.skyMap.value = texture

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vSkyDirection;

      void main() {
        vUv = uv;
        vSkyDirection = mat3(modelMatrix) * position;
        // Sky follows camera orientation, never its translation or zoom distance.
        vec4 viewPosition = vec4(mat3(viewMatrix) * vSkyDirection, 1.0);
        if (isOrthographic) {
          float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
          float focalLength = 1.0 / tan(radians(38.0) * 0.5);
          gl_Position = vec4(viewPosition.x * focalLength / aspect,
            viewPosition.y * focalLength, -viewPosition.z, -viewPosition.z);
        } else {
          gl_Position = projectionMatrix * viewPosition;
        }
        gl_Position.z = gl_Position.w - 0.00001;
      }
    `,
    fragmentShader: `
      uniform sampler2D skyMap;
      uniform vec2 texelSize;
      uniform float exposure;
      uniform float daylight;
      uniform float twilight;
      varying vec2 vUv;
      varying vec3 vSkyDirection;

      void main() {
        vec2 uv = vec2(1.0 - vUv.x, vUv.y);
        vec3 center = texture2D(skyMap, uv).rgb;
        vec3 neighbors = (
          texture2D(skyMap, uv + vec2(texelSize.x, 0.0)).rgb +
          texture2D(skyMap, uv - vec2(texelSize.x, 0.0)).rgb +
          texture2D(skyMap, uv + vec2(0.0, texelSize.y)).rgb +
          texture2D(skyMap, uv - vec2(0.0, texelSize.y)).rgb
        ) * 0.25;
        vec3 stars = max(center + (center - neighbors) * 0.45, 0.0) * exposure;
        vec3 nightSky = vec3(0.0003, 0.0004, 0.00065) + stars * vec3(0.96, 1.0, 1.04);

        float elevation = normalize(vSkyDirection).y;
        float zenith = smoothstep(-0.16, 0.78, elevation);
        vec3 daySky = mix(vec3(0.42, 0.65, 0.69), vec3(0.07, 0.24, 0.33), zenith);
        vec3 duskSky = mix(vec3(0.49, 0.18, 0.075), vec3(0.014, 0.044, 0.052), zenith);
        vec3 atmosphere = mix(duskSky, daySky, daylight);
        // Teaching view: retain the panorama during daytime rather than erasing it
        // at daylight == 1. The faint structure is a visual aid, not naked-eye visibility.
        float atmosphereOpacity = max(daylight * 0.82, twilight * 0.72);
        vec3 color = mix(nightSky, atmosphere, atmosphereOpacity);
        vec3 daytimeNebula = pow(max(center, vec3(0.0)), vec3(0.6)) * vec3(0.12, 0.14, 0.145);
        color += daytimeNebula * daylight * mix(0.35, 1.0, zenith);

        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(72, 128, 64), material)
  mesh.name = 'offline-nebula-skybox'
  mesh.rotation.set(0.18, 1.05, -0.12)
  mesh.frustumCulled = false
  mesh.renderOrder = -10000

  function setDaylight(value: number) {
    uniforms.daylight.value = THREE.MathUtils.clamp(value, 0, 1)
    uniforms.twilight.value = 0
  }

  function setSolarAltitude(altitude: number) {
    // Below astronomical twilight the same panorama as the orbital scene is fully visible.
    uniforms.daylight.value = THREE.MathUtils.smoothstep(altitude, -6, 18)
    uniforms.twilight.value = (1 - THREE.MathUtils.smoothstep(Math.abs(altitude + 3), 0, 10))
  }

  function dispose() {
    if (disposed) return
    disposed = true
    mesh.removeFromParent()
    mesh.geometry.dispose()
    material.dispose()
    texture.dispose()
  }

  return { mesh, setDaylight, setSolarAltitude, dispose }
}
