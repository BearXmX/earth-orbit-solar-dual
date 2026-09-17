import * as THREE from 'three'
import { createDayNightSky } from './createDayNightSky'
import { sunDirection } from '../utils/sundial'

export interface ObserverSurfaceState {
  altitude: number
  azimuth: number
  solarMinutes: number
  aspect: number
}

/** Local coordinates: x west, y up, z north. Uses the supplied solar angles, never the teaching globe's scale. */
export function createObserverSurfaceScene(sunTexture: THREE.Texture) {
  const scene = new THREE.Scene()
  scene.name = 'observer-surface-scene'
  scene.fog = null
  const eyeHeight = 1.65
  const sunDistance = 6000
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300000)
  camera.position.set(0, eyeHeight, 0)
  const sky = createDayNightSky()
  scene.add(sky.mesh)
  let disposed = false
  let followingSun = true
  let latestAltitude = 30
  let latestAzimuth = 180

  function normalizeHeading(degrees: number) {
    return ((degrees % 360) + 360) % 360
  }

  function applyLook(heading: number, pitch: number) {
    camera.lookAt(camera.position.clone().add(sunDirection(pitch, heading)))
    camera.updateMatrixWorld()
  }

  /** Report the actual camera orientation, using north = 0° and east = 90°. */
  function getLook() {
    const direction = camera.getWorldDirection(new THREE.Vector3())
    const heading = normalizeHeading(THREE.MathUtils.radToDeg(Math.atan2(-direction.x, direction.z)))
    const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)))
    return {
      heading: heading < 1e-10 || 360 - heading < 1e-10 ? 0 : heading,
      pitch: Math.abs(pitch) < 1e-10 ? 0 : pitch,
      followingSun,
    }
  }

  /** Manual panning changes only the gaze; solar position and illumination keep advancing. */
  function setLook(heading: number, pitch: number) {
    if (disposed) return
    const current = getLook()
    followingSun = false
    applyLook(
      Number.isFinite(heading) ? normalizeHeading(heading) : current.heading,
      Number.isFinite(pitch) ? THREE.MathUtils.clamp(pitch, -85, 85) : current.pitch,
    )
  }

  function followSun() {
    if (disposed) return
    followingSun = true
    applyLook(latestAzimuth, THREE.MathUtils.clamp(latestAltitude, 4, 78))
  }

  const groundDayColor = new THREE.Color(0x67665e)
  const groundNightColor = new THREE.Color(0x10141c)
  const groundMaterial = new THREE.MeshBasicMaterial({ color: groundDayColor })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000), groundMaterial)
  ground.name = 'observer-level-ground'
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  // 教学放大：示意视直径固定为 3°（约原 0.54° 的 5.6 倍），不代表真实太阳视直径。
  // Only the disc size changes; its center and geometric-horizon clipping retain the supplied solar angles.
  const sunRadius = sunDistance * Math.sin(THREE.MathUtils.degToRad(1.5))
  const solarMaterial = new THREE.ShaderMaterial({
    uniforms: { sunMap: { value: sunTexture }, eyeHeight: { value: eyeHeight } },
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
    vertexShader: `
      uniform float eyeHeight;
      varying vec2 vUv;
      varying float vHeightAboveHorizon;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vHeightAboveHorizon = worldPosition.y - eyeHeight;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D sunMap;
      varying vec2 vUv;
      varying float vHeightAboveHorizon;
      void main() {
        // Clip the lower limb at the geometric horizon, eliminating finite-distance parallax.
        if (vHeightAboveHorizon < -0.001) discard;
        gl_FragColor = vec4(texture2D(sunMap, vUv).rgb, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  const sun = new THREE.Mesh(new THREE.SphereGeometry(sunRadius, 48, 32), solarMaterial)
  sun.name = 'observer-apparent-sun'
  scene.add(sun)

  const ownedTextures: THREE.Texture[] = []
  // Labels are optional in a non-DOM renderer; the horizon and solar geometry are not.
  if (typeof document !== 'undefined') {
    const cardinals = [
      { text: '北 N', x: 0, z: 500 },
      { text: '东 E', x: -500, z: 0 },
      { text: '南 S', x: 0, z: -500 },
      { text: '西 W', x: 500, z: 0 },
    ]
    for (const cardinal of cardinals) {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 96
      const context = canvas.getContext('2d')
      if (!context) continue
      context.font = '600 48px Microsoft YaHei, Arial'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.strokeStyle = 'rgba(5, 8, 13, 0.85)'
      context.lineWidth = 7
      context.strokeText(cardinal.text, 128, 48)
      context.fillStyle = '#d5e3ef'
      context.fillText(cardinal.text, 128, 48)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      ownedTextures.push(texture)
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      }))
      label.name = `observer-cardinal-${cardinal.text}`
      // An annotation just below the horizon, kept clear of the rising solar disc.
      label.position.set(cardinal.x, -6, cardinal.z)
      label.scale.set(40, 15, 1)
      label.renderOrder = 10
      scene.add(label)
    }
  }

  function update({ altitude, azimuth, solarMinutes, aspect }: ObserverSurfaceState) {
    if (disposed) return
    latestAltitude = altitude
    latestAzimuth = normalizeHeading(azimuth)
    const direction = sunDirection(altitude, azimuth)
    sun.position.copy(camera.position).addScaledVector(direction, sunDistance)
    sun.visible = altitude >= 0
    if (followingSun) applyLook(latestAzimuth, THREE.MathUtils.clamp(altitude, 4, 78))
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
    if (camera.aspect !== safeAspect) {
      camera.aspect = safeAspect
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
    sky.updateSolar(altitude, azimuth, solarMinutes)
    groundMaterial.color.copy(groundNightColor).lerp(groundDayColor, THREE.MathUtils.smoothstep(altitude, -8, 10))
  }

  function dispose() {
    if (disposed) return
    disposed = true
    sky.dispose()
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    scene.traverse(object => {
      const drawable = object as THREE.Mesh
      // THREE.Sprite shares one global quad geometry across unrelated scenes.
      if (object instanceof THREE.Mesh && drawable.geometry) geometries.add(drawable.geometry)
      if (drawable.material) {
        for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) materials.add(material)
      }
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    ownedTextures.forEach(texture => texture.dispose())
    // sunTexture belongs to the orbital scene and must remain usable after exit.
    scene.clear()
  }

  update({ altitude: 30, azimuth: 180, solarMinutes: 720, aspect: 1 })
  return { scene, camera, update, setLook, followSun, getLook, dispose }
}
