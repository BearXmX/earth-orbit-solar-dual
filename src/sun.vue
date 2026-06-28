<template>
  <div ref="wrapRef" class="sun-lite">
    <div ref="canvasWrapRef" class="canvas-wrap"></div>

    <!--     <div class="legend-panel">
      <div class="legend-title">图例</div>
      <div><i class="dot yellow"></i> 当前太阳</div>
      <div><i class="dot current"></i> 当前日期路径</div>
      <div><i class="dot blue"></i> 夏至路径</div>
      <div><i class="dot white"></i> 春秋分路径</div>
      <div><i class="dot cyan"></i> 冬至路径</div>
      <div><i class="dot shadow"></i> 建筑原生阴影</div>
      <div><i class="dot ray"></i> 太阳直射光线</div>
    </div> -->

    <div class="mini-hud">
      <div>
        <span>太阳高度</span><b>{{ formatDeg(runtimeMetrics.altitude) }}</b>
      </div>
      <div>
        <span>太阳方位</span><b>{{ formatDeg(runtimeMetrics.azimuth) }}</b>
      </div>
      <div>
        <span>地方太阳时</span><b>{{ formatClock(runtimeMetrics.solarTime) }}</b>
      </div>
      <div>
        <span>昼长</span><b>{{ props.dayLengthText }}</b>
      </div>
      <div>
        <span>日出</span><b>{{ props.sunriseText }}</b>
      </div>
      <div>
        <span>日落</span><b>{{ props.sunsetText }}</b>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** SUN_LITE_PARENT_DRIVEN_V14: 当前太阳位置、赤纬、太阳时由父组件统一传入；本组件只负责渲染。 */
/** 基于 SUN_APP_MOTION_CORE_V13：保留城市观察场景、太阳路径、阴影、光线和高度角演示。 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

type SolarMetrics = {
  declination: number
  hourAngle: number
  altitude: number
  azimuth: number
  noonAltitude: number
  dayLength: number
  sunrise: number
  sunset: number
  polarType: '' | '极昼' | '极夜'
  east: number
  north: number
  up: number
  solarTime: number
}

type CityBuildingOpts = {
  x: number
  z: number
  width: number
  depth: number
  height: number
  color: number
  roof?: number
  floors?: number
}

type WindowLightItem = { material: THREE.MeshBasicMaterial; seed: number }
type StreetLightItem = { pole: THREE.Mesh; lamp: THREE.Mesh; glow: THREE.Sprite; cone?: THREE.Mesh }
type TrafficLightItem = { red: THREE.MeshBasicMaterial; yellow: THREE.MeshBasicMaterial; green: THREE.MeshBasicMaterial; seed: number }
type CityClockItem = {
  texture: THREE.CanvasTexture
  ctx: CanvasRenderingContext2D
  material: THREE.MeshBasicMaterial
  group: THREE.Group
  lastKey?: string
}

const props = defineProps<{
  latitude: number
  longitude: number
  dayOfYear: number
  solarTime: number
  declination: number
  altitude: number
  azimuth: number
  sunriseText: string
  sunsetText: string
  dayLengthText: string
}>()

const canvasWrapRef = ref<HTMLDivElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)

const SKY_RADIUS = 7.6
const GROUND_RADIUS = 7.4
const GROUND_SURFACE_Y = 0.08
const OBSERVER_POINT = new THREE.Vector3(-0.02, 0.08, -0.98)
// 极昼/极夜临界点容差，与父组件保持一致，避免北极圈临界值被浮点误差误判。
const POLAR_EPS = 0.0015

const BILLBOARD_BACK_CONFIG = {
  eyebrow: '敲代码做 HTML 互动课件',
  title: '码上教育你',
  subtitle: '小红书同名',
  footer: '太阳视运动城市观察实验室',
}

const state = reactive({
  latitude: props.latitude,
  longitude: props.longitude,
  dayOfYear: props.dayOfYear,
  solarTime: props.solarTime / 60,
  declination: props.declination,
  altitude: props.altitude,
  azimuth: props.azimuth,
})

const layers = reactive({
  dome: true,
  paths: true,
  shadow: true,
  rays: true,
  cityTime: true,
})

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let resizeObserver: ResizeObserver | null = null
let animationId = 0

let rootGroup: THREE.Group
let domeGroup: THREE.Group
let pathGroup: THREE.Group
let sunGroup: THREE.Group
let rayGroup: THREE.Group
let schoolGroup: THREE.Group
let labelGroup: THREE.Group
let skyDecorationGroup: THREE.Group
let altitudeAngleGroup: THREE.Group

let ambientLight: THREE.AmbientLight
let keyLight: THREE.DirectionalLight
let rimLight: THREE.DirectionalLight
let sunMesh: THREE.Mesh
let sunGlow: THREE.Sprite
let lightRay: THREE.Line
let hemisphereDome: THREE.Mesh

const streetLightItems: StreetLightItem[] = []
const windowLightItems: WindowLightItem[] = []
const trafficLightItems: TrafficLightItem[] = []
const cityClockItems: CityClockItem[] = []
const cityRoadMaterials: THREE.MeshStandardMaterial[] = []

let lastPathKey = ''
let lastCityKey = ''

const runtimeMetrics = computed(() => buildRuntimeMetricsFromProps())

const sceneTitle = computed(() => {
  if (state.dayOfYear >= 160 && state.dayOfYear <= 185) return '6月夏至前后 · 北半球路径高、昼长较长'
  if (state.dayOfYear >= 345 || state.dayOfYear <= 12) return '12月冬至前后 · 北半球路径低、昼长较短'
  if (Math.abs(state.dayOfYear - 80) < 10 || Math.abs(state.dayOfYear - 266) < 10) return '春秋分前后 · 昼夜接近等长'
  return '太阳周日视运动 · 路径随日期变化'
})

const sceneSubtitle = computed(
  () => `纬度 ${formatDeg(state.latitude)} · 经度 ${formatDeg(state.longitude)} · 第 ${state.dayOfYear} 天 · 地方太阳时 ${formatClock(state.solarTime)}`,
)

watch(
  () => [
    props.latitude,
    props.longitude,
    props.dayOfYear,
    props.solarTime,
    props.declination,
    props.altitude,
    props.azimuth,
    props.sunriseText,
    props.sunsetText,
    props.dayLengthText,
  ],
  () => {
    state.latitude = props.latitude
    state.longitude = props.longitude
    state.dayOfYear = props.dayOfYear
    state.solarTime = props.solarTime / 60
    state.declination = props.declination
    state.altitude = props.altitude
    state.azimuth = props.azimuth
    syncFromProps()
  },
)

onMounted(async () => {
  await nextTick()
  initScene()
  syncFromProps()
  animate()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  disposeScene()
})

function initScene() {
  if (!canvasWrapRef.value) return

  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x071427, 12.5, 32)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160)
  camera.position.set(7.2, 4.7, 8.2)
  camera.lookAt(0, 0.5, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(canvasWrapRef.value.clientWidth, canvasWrapRef.value.clientHeight)
  renderer.setClearColor(0x071427, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  canvasWrapRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = true
  controls.minDistance = 4.2
  controls.maxDistance = 32
  controls.target.set(0, 0.75, 0)
  controls.update()

  ambientLight = new THREE.AmbientLight(0x9fd7ff, 0.64)
  keyLight = new THREE.DirectionalLight(0xfff0c2, 2.2)
  rimLight = new THREE.DirectionalLight(0x6ee7ff, 0.46)

  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(2048, 2048)
  keyLight.shadow.camera.near = 0.1
  keyLight.shadow.camera.far = 26
  keyLight.shadow.camera.left = -9
  keyLight.shadow.camera.right = 9
  keyLight.shadow.camera.top = 9
  keyLight.shadow.camera.bottom = -9

  rimLight.position.set(-6, 5, -4)

  scene.add(ambientLight, keyLight, keyLight.target, rimLight)

  rootGroup = new THREE.Group()
  domeGroup = new THREE.Group()
  pathGroup = new THREE.Group()
  sunGroup = new THREE.Group()
  rayGroup = new THREE.Group()
  schoolGroup = new THREE.Group()
  labelGroup = new THREE.Group()
  skyDecorationGroup = new THREE.Group()
  altitudeAngleGroup = new THREE.Group()

  scene.add(rootGroup, domeGroup, pathGroup, sunGroup, rayGroup, altitudeAngleGroup, schoolGroup, labelGroup, skyDecorationGroup)

  createGround()
  createCityScene()
  createDome()
  createLabels()
  createSun()
  createLightRay()
  createNightSkyDecorations()

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasWrapRef.value)
  resize()
}

function syncFromProps() {
  if (!scene) return

  // 当前太阳路径由父组件传入的 declination 驱动，避免父子组件各算一套赤纬导致不一致。
  const pathKey = [Math.round(state.latitude * 10), state.dayOfYear, state.declination.toFixed(2)].join('-')
  if (pathKey !== lastPathKey) {
    lastPathKey = pathKey
    rebuildSolarPaths()
  }

  updateSceneBySolar(runtimeMetrics.value)
}

function createGround() {
  const grassTexture = createGrassTexture()
  grassTexture.wrapS = THREE.RepeatWrapping
  grassTexture.wrapT = THREE.RepeatWrapping
  grassTexture.repeat.set(7, 7)

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(GROUND_RADIUS, GROUND_RADIUS, 0.08, 192),
    new THREE.MeshStandardMaterial({ map: grassTexture, color: 0x7fcf67, roughness: 0.86, metalness: 0.02 }),
  )
  ground.position.y = GROUND_SURFACE_Y - 0.04
  ground.receiveShadow = true
  rootGroup.add(ground)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(GROUND_RADIUS + 0.03, 0.035, 12, 180),
    new THREE.MeshBasicMaterial({ color: 0x2cc7ff, transparent: true, opacity: 0.85 }),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = GROUND_SURFACE_Y + 0.018
  rootGroup.add(ring)
}

function createCityScene() {
  streetLightItems.length = 0
  windowLightItems.length = 0
  trafficLightItems.length = 0
  cityRoadMaterials.length = 0
  cityClockItems.length = 0

  // 基本照搬 App.vue：圆形地面 + 城市街区 + 广告牌/城市时钟 + 原生阴影。
  createCityRoadNetwork()
  createCityBlocks()
  createRoadsideTreeBelts()
  createCityTimeElements()
  createCityObservationPoint()
}

function createCityRoadNetwork() {
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3d4651, roughness: 0.78, metalness: 0.04 })
  cityRoadMaterials.push(roadMat)
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xaeb8c2, roughness: 0.82, metalness: 0.02 })
  const dividerMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.68 })
  const roadWidth = 0.62
  const roadLength = 11.2
  const roadOffsets = [-1.95, 1.95]

  function addRoad(x: number, z: number, width: number, length: number, vertical: boolean) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.026, length), roadMat)
    road.position.set(x, 0.078, z)
    if (!vertical) road.rotation.y = Math.PI / 2
    road.receiveShadow = true
    schoolGroup.add(road)

    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, length * 0.94), dividerMat)
    divider.position.set(x, 0.098, z)
    if (!vertical) divider.rotation.y = Math.PI / 2
    schoolGroup.add(divider)

    const sideOffset = roadWidth * 0.5 + 0.15
    ;[-sideOffset, sideOffset].forEach(offset => {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, length), sidewalkMat)
      walk.position.set(vertical ? x + offset : x, 0.095, vertical ? z : z + offset)
      if (!vertical) walk.rotation.y = Math.PI / 2
      walk.receiveShadow = true
      schoolGroup.add(walk)
    })
  }

  roadOffsets.forEach(offset => {
    addRoad(offset, 0, roadWidth, roadLength, true)
    addRoad(0, offset, roadWidth, roadLength, false)
  })

  roadOffsets.forEach(x => {
    roadOffsets.forEach(z => {
      const crossing = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.012, 0.9),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.28 }),
      )
      crossing.position.set(x, 0.112, z)
      schoolGroup.add(crossing)
    })
  })
}

function createCityBlocks() {
  const blockCenters = [-3.75, 0, 3.75]
  const palettes = [0x8ecae6, 0xffb703, 0xfb8500, 0xbde0fe, 0xcdb4db, 0xa7c957, 0xffafcc, 0x90dbf4, 0xfed9b7, 0x98f5e1, 0xf4a261, 0xa5b4fc]
  const modernTowerBlocks = new Set([4])
  let blockIndex = 0

  for (const z of blockCenters) {
    for (const x of blockCenters) {
      const buildingsInBlock = blockIndex === 4 ? 3 : 2
      for (let i = 0; i < buildingsInBlock; i++) {
        const col = i % 3
        const row = Math.floor(i / 3)
        const jitterX = (col - 1) * 0.42 + ((blockIndex + i) % 2 ? 0.04 : -0.04)
        const jitterZ = (row - 0.45) * 0.55 + (((blockIndex + i) % 3) - 1) * 0.05
        const width = 0.22 + ((blockIndex + i) % 3) * 0.04
        const depth = 0.22 + ((blockIndex + i + 1) % 3) * 0.035
        const height = 0.58 + ((blockIndex * 2 + i) % 6) * 0.18

        const base = {
          x: x + jitterX,
          z: z + jitterZ,
          width,
          depth,
          height: modernTowerBlocks.has(blockIndex) ? height + 0.82 : height,
          color: palettes[(blockIndex + i) % palettes.length]!,
          roof: [0x1f2937, 0x334155, 0x475569, 0x7c2d12][(blockIndex + i) % 4],
          floors: Math.max(3, Math.round(height / 0.18)),
        }

        if (modernTowerBlocks.has(blockIndex) && i < 1) {
          createModernCityTower({
            ...base,
            width: width * 1.55,
            depth: depth * 1.45,
            glassColor: [0x0f766e, 0x1d4ed8, 0x0f172a][(blockIndex + i) % 3],
            accentColor: 0x020617,
            spire: i === 0,
          })
        } else {
          createCartoonCityBuilding(base)
        }
      }
      blockIndex += 1
    }
  }
}

function createModernCityTower(opts: CityBuildingOpts & { glassColor?: number; accentColor?: number; spire?: boolean }) {
  const floors = opts.floors ?? Math.max(9, Math.round(opts.height / 0.17))
  const bodyMat = new THREE.MeshStandardMaterial({
    color: opts.glassColor ?? 0x1d4ed8,
    roughness: 0.18,
    metalness: 0.42,
    transparent: false,
    opacity: 1,
    emissive: new THREE.Color(0x061525),
    emissiveIntensity: 0.12,
  })

  const body = new THREE.Mesh(new THREE.BoxGeometry(opts.width, opts.height, opts.depth), bodyMat)
  body.position.set(opts.x, opts.height / 2 + 0.08, opts.z)
  applyMeshShadowSettings(body)
  schoolGroup.add(body)

  const accentMat = new THREE.MeshStandardMaterial({ color: opts.accentColor ?? 0x0f172a, roughness: 0.28, metalness: 0.58 })
  const edgeSize = 0.026
  ;[
    [-opts.width / 2, -opts.depth / 2],
    [opts.width / 2, -opts.depth / 2],
    [-opts.width / 2, opts.depth / 2],
    [opts.width / 2, opts.depth / 2],
  ].forEach(([cx, cz]) => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(edgeSize, opts.height + 0.04, edgeSize), accentMat)
    edge.position.set(opts.x + cx!, opts.height / 2 + 0.1, opts.z + cz!)
    applyMeshShadowSettings(edge)
    schoolGroup.add(edge)
  })

  const windowMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.78, side: THREE.DoubleSide })
  windowLightItems.push({ material: windowMat, seed: opts.x * 10 + opts.z })
  for (let r = 0; r < floors; r++) {
    const y = 0.24 + (r * (opts.height - 0.18)) / floors
    for (let c = -1; c <= 1; c++) {
      const wx = opts.x + (c / 2.8) * opts.width * 0.36
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.038), windowMat)
      front.position.set(wx, y + 0.08, opts.z - opts.depth / 2 - 0.004)
      schoolGroup.add(front)
      const back = front.clone()
      back.position.z = opts.z + opts.depth / 2 + 0.004
      back.rotation.y = Math.PI
      schoolGroup.add(back)
    }
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(opts.width * 1.08, 0.08, opts.depth * 1.08), accentMat)
  roof.position.set(opts.x, opts.height + 0.14, opts.z)
  applyMeshShadowSettings(roof)
  schoolGroup.add(roof)

  if (opts.spire) {
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(opts.width * 0.16, 0.58, 4),
      new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.32, metalness: 0.36 }),
    )
    spire.position.set(opts.x, opts.height + 0.47, opts.z)
    applyMeshShadowSettings(spire)
    schoolGroup.add(spire)
  }
}

function createCartoonCityBuilding(opts: CityBuildingOpts) {
  const floors = opts.floors ?? Math.max(2, Math.round(opts.height / 0.3))
  const body = new THREE.Mesh(new THREE.BoxGeometry(opts.width, opts.height, opts.depth), createCartoonFacadeMaterial(opts.color, floors))
  body.position.set(opts.x, opts.height / 2 + 0.08, opts.z)
  applyMeshShadowSettings(body)
  schoolGroup.add(body)

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(opts.width * 1.08, 0.09, opts.depth * 1.08),
    new THREE.MeshStandardMaterial({ color: opts.roof ?? 0x334155, roughness: 0.55, metalness: 0.08 }),
  )
  roof.position.set(opts.x, opts.height + 0.15, opts.z)
  applyMeshShadowSettings(roof)
  schoolGroup.add(roof)

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8),
    new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.42, metalness: 0.28 }),
  )
  antenna.position.set(opts.x + opts.width * 0.23, opts.height + 0.31, opts.z - opts.depth * 0.15)
  applyMeshShadowSettings(antenna)
  schoolGroup.add(antenna)

  const frontZ = opts.z - opts.depth / 2 - 0.006
  for (let r = 0; r < floors; r++) {
    for (let c = -1; c <= 1; c += 2) {
      const winMat = new THREE.MeshBasicMaterial({ color: 0xdff7ff, transparent: true, opacity: 0.78, side: THREE.DoubleSide })
      windowLightItems.push({ material: winMat, seed: opts.x * 10 + opts.z + r + c })
      const win = new THREE.Mesh(new THREE.PlaneGeometry(opts.width * 0.16, (opts.height / floors) * 0.38), winMat)
      win.position.set(opts.x + c * opts.width * 0.23, 0.2 + r * (opts.height / floors), frontZ)
      schoolGroup.add(win)
    }
  }
}

function createCartoonFacadeMaterial(color: number, floors: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = Math.max(128, floors * 42)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(255,255,255,.12)'
  for (let y = 0; y < canvas.height; y += 32) ctx.fillRect(0, y, canvas.width, 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0.04 })
}

function createRoadsideTreeBelts() {
  const roadOffsets = [-1.95, 1.95]
  const treeOffset = 0.52
  const positions: Array<[number, number]> = []

  for (const roadOffset of roadOffsets) {
    for (let t = -5.25; t <= 5.25; t += 2.5) {
      if (roadOffsets.some(offset => Math.abs(t - offset) < 0.42)) continue
      positions.push([roadOffset - treeOffset, t], [roadOffset + treeOffset, t])
      positions.push([t, roadOffset - treeOffset], [t, roadOffset + treeOffset])
    }
  }

  positions.forEach(([x, z], i) => {
    if (Math.hypot(x, z) > GROUND_RADIUS - 0.55) return
    createTree(x, z, 0.21 + (i % 3) * 0.032)
  })
}

function createTree(x: number, z: number, size: number) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.12, size * 0.14, size * 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x7c4a21, roughness: 0.75 }),
  )
  trunk.position.set(x, GROUND_SURFACE_Y + size * 0.55, z)
  applyMeshShadowSettings(trunk)
  schoolGroup.add(trunk)

  const crown = new THREE.Mesh(new THREE.SphereGeometry(size * 0.42, 14, 12), new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 }))
  crown.position.set(x, GROUND_SURFACE_Y + size * 1.2, z)
  applyMeshShadowSettings(crown)
  schoolGroup.add(crown)
}

function createCityTimeElements() {
  const roadOffsets = [-1.95, 1.95]
  const lampOffset = 0.52

  for (const roadOffset of roadOffsets) {
    for (let t = -5.25; t <= 5.25; t += 2.76) {
      if (roadOffsets.some(offset => Math.abs(t - offset) < 0.4)) continue
      createStreetLamp(roadOffset - lampOffset, t, 0)
      createStreetLamp(roadOffset + lampOffset, t, Math.PI)
      createStreetLamp(t, roadOffset - lampOffset, Math.PI / 2)
      createStreetLamp(t, roadOffset + lampOffset, -Math.PI / 2)
    }
  }

  roadOffsets.forEach(x => {
    roadOffsets.forEach(z => createTrafficLight(x + 0.31, z + 0.31, (x + z) * 0.17))
  })

  createCityClockBillboard(0, 0)
}

function createStreetLamp(x: number, z: number, rotation: number) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.72, 10),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.55, metalness: 0.35 }),
  )
  pole.position.set(x, 0.44, z)
  applyMeshShadowSettings(pole)
  schoolGroup.add(pole)

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.035, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.55, metalness: 0.35 }),
  )
  arm.position.set(x + Math.cos(rotation) * 0.12, 0.82, z + Math.sin(rotation) * 0.12)
  arm.rotation.y = -rotation
  applyMeshShadowSettings(arm)
  schoolGroup.add(arm)

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), lampMat)
  lamp.position.set(x + Math.cos(rotation) * 0.28, 0.82, z + Math.sin(rotation) * 0.28)
  schoolGroup.add(lamp)

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: createGlowTexture(), color: 0xffd166, transparent: true, opacity: 0.0, depthWrite: false }),
  )
  glow.position.copy(lamp.position)
  glow.scale.set(0.55, 0.55, 1)
  schoolGroup.add(glow)

  streetLightItems.push({ pole, lamp, glow })
}

function createTrafficLight(x: number, z: number, seed: number) {
  const group = new THREE.Group()
  group.position.set(x, 0.1, z)

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x1f2937 }))
  pole.position.y = 0.3
  group.add(pole)

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.06), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.44 }))
  box.position.y = 0.72
  group.add(box)

  const red = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 })
  const yellow = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.25 })
  const green = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.25 })
  ;[red, yellow, green].forEach((mat, i) => {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat)
    light.position.set(0, 0.79 - i * 0.08, -0.034)
    group.add(light)
  })
  schoolGroup.add(group)
  trafficLightItems.push({ red, yellow, green, seed })
}

function createCityClockBillboard(x: number, z: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  const group = new THREE.Group()
  group.position.set(x, 0, z)

  const boardY = 3.08
  const boardWidth = 2.25
  const boardHeight = 0.86

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide, opacity: 0.96 })
  const board = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth, boardHeight), material)
  board.position.set(0, boardY, 0.006)
  group.add(board)

  const adTexture = createAdBillboardTexture()
  const adMaterial = new THREE.MeshBasicMaterial({ map: adTexture, transparent: true, side: THREE.FrontSide, opacity: 0.96 })
  const adBoard = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth, boardHeight), adMaterial)
  adBoard.position.set(0, boardY, -0.006)
  adBoard.rotation.y = Math.PI
  group.add(adBoard)

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.42, metalness: 0.35 })
  const topFrame = new THREE.Mesh(new THREE.BoxGeometry(boardWidth + 0.12, 0.045, 0.055), frameMat)
  topFrame.position.set(0, boardY + boardHeight / 2 + 0.035, 0)
  const bottomFrame = topFrame.clone()
  bottomFrame.position.y = boardY - boardHeight / 2 - 0.035
  group.add(topFrame, bottomFrame)
  ;[-boardWidth / 2 - 0.02, boardWidth / 2 + 0.02].forEach(px => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, boardY - 0.3, 10), frameMat)
    pole.position.set(px, (boardY - 0.3) / 2 + 0.08, 0)
    applyMeshShadowSettings(pole)
    group.add(pole)
  })

  schoolGroup.add(group)
  cityClockItems.push({ texture, ctx, material, group })
}

function createAdBillboardTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  const bg = ctx.createLinearGradient(0, 0, 768, 256)
  bg.addColorStop(0, '#111827')
  bg.addColorStop(0.52, '#0f172a')
  bg.addColorStop(1, '#1e1b4b')
  ctx.fillStyle = bg
  roundRect(ctx, 16, 12, 736, 232, 28)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 209, 102, 0.82)'
  ctx.lineWidth = 5
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.70)'
  ctx.font = '700 22px Microsoft YaHei, Arial'
  ctx.textAlign = 'center'
  ctx.fillText(BILLBOARD_BACK_CONFIG.eyebrow, 384, 58)

  ctx.fillStyle = '#ffd166'
  ctx.font = '900 54px Microsoft YaHei, Arial'
  ctx.fillText(BILLBOARD_BACK_CONFIG.title, 384, 130)

  ctx.fillStyle = 'rgba(224,242,254,0.88)'
  ctx.font = '700 23px Microsoft YaHei, Arial'
  ctx.fillText(BILLBOARD_BACK_CONFIG.subtitle, 384, 176)

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '600 18px Microsoft YaHei, Arial'
  ctx.fillText(BILLBOARD_BACK_CONFIG.footer, 384, 214)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function createCityObservationPoint() {
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.035, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.92 }),
  )
  marker.position.set(OBSERVER_POINT.x, 0.115, OBSERVER_POINT.z)
  schoolGroup.add(marker)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.008, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 }),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.set(OBSERVER_POINT.x, 0.13, OBSERVER_POINT.z)
  schoolGroup.add(ring)
}

function createDome() {
  hemisphereDome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x72d8ff, transparent: true, opacity: 0.06, side: THREE.BackSide, depthWrite: false }),
  )
  domeGroup.add(hemisphereDome)

  for (const alt of [15, 30, 45, 60, 75]) {
    const y = SKY_RADIUS * Math.sin(degToRad(alt))
    const r = SKY_RADIUS * Math.cos(degToRad(alt))
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.007, 8, 160),
      new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: alt % 30 === 0 ? 0.42 : 0.23 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = y
    domeGroup.add(ring)
  }

  for (let az = 0; az < 360; az += 15) {
    const p = azimuthAltitudeToVec3(az, 0, SKY_RADIUS)
    const radial = makeLine(
      [new THREE.Vector3(0, 0.012, 0), new THREE.Vector3(p.x, 0.012, p.z)],
      az % 90 === 0 ? 0xffd166 : 0x38779b,
      az % 90 === 0 ? 0.55 : 0.18,
    )
    domeGroup.add(radial)
  }
}

function createLabels() {
  const labels = [
    { text: '北 N', az: 0, color: '#9defff' },
    { text: '东 E', az: 90, color: '#ffe08a' },
    { text: '南 S', az: 180, color: '#9defff' },
    { text: '西 W', az: 270, color: '#ffe08a' },
  ]
  labels.forEach(item => {
    const p = azimuthAltitudeToVec3(item.az, 0, GROUND_RADIUS + 0.38)
    // 方位标签统一 15 号字，避免在场景里过大抢画面。
    labelGroup.add(createLabelSpriteText(item.text, item.color, new THREE.Vector3(p.x, 0.18, p.z), 15, 1))
  })
  labelGroup.add(createLabelSpriteText('天顶', '#ffffff', new THREE.Vector3(0, SKY_RADIUS + 0.28, 0), 15, 1))
}

function createLabelSpriteText(text: string, color: string, position: THREE.Vector3, fontSize = 15, worldSize = 0.34) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const padding = Math.ceil(fontSize * 1.2)
  canvas.width = Math.max(96, Math.ceil(text.length * fontSize * 1.25 + padding * 2))
  canvas.height = Math.max(48, Math.ceil(fontSize * 2.6))

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `900 ${fontSize}px Microsoft YaHei, Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.18))
  ctx.strokeStyle = 'rgba(0,0,0,0.72)'
  ctx.fillStyle = color
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2)
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.position.copy(position)
  sprite.scale.set(worldSize * (canvas.width / canvas.height), worldSize, 1)
  return sprite
}

function createSun() {
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffd166 }))
  sunGroup.add(sunMesh)

  const spriteMaterial = new THREE.SpriteMaterial({ map: createGlowTexture(), color: 0xffd166, transparent: true, opacity: 0.95, depthWrite: false })
  sunGlow = new THREE.Sprite(spriteMaterial)
  sunGlow.scale.set(1.7, 1.7, 1)
  sunGroup.add(sunGlow)
}

function createLightRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
  lightRay = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.84 }))
  rayGroup.add(lightRay)
}

function createNightSkyDecorations() {
  const starGeometry = new THREE.BufferGeometry()
  const positions: number[] = []
  for (let i = 0; i < 160; i++) {
    const radius = SKY_RADIUS * (0.92 + Math.random() * 0.03)
    const az = degToRad(Math.random() * 360)
    const alt = degToRad(12 + Math.random() * 72)
    positions.push(-Math.sin(az) * Math.cos(alt) * radius, Math.sin(alt) * radius, Math.cos(az) * Math.cos(alt) * radius)
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0 }))
  skyDecorationGroup.add(stars)
}

function clearGroup(group: THREE.Group) {
  while (group.children.length) {
    const child = group.children.pop()!
    child.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach(item => item.dispose())
      else material?.dispose?.()
    })
  }
}

function rebuildSolarPaths() {
  clearGroup(pathGroup)
  if (!layers.paths) return

  const pathDefs = [
    { declination: state.declination, name: `${state.dayOfYear}路径`, color: 0xffd166, opacity: 1, radius: 0.018 },
    { declination: 23.44, name: '夏至路径', color: 0x3687ff, opacity: 0.78, radius: 0.011 },
    { declination: 0, name: '春秋分路径', color: 0xffffff, opacity: 0.62, radius: 0.01 },
    { declination: -23.44, name: '冬至路径', color: 0x45e8ff, opacity: 0.76, radius: 0.011 },
  ]

  pathDefs.forEach((def, index) => {
    const points = buildSunPathPoints(state.latitude, def.declination)
    if (points.length < 2) return
    pathGroup.add(makeTubeLine(points, def.color, def.radius, def.opacity))

    const mid = points[Math.floor(points.length / 2)]!
    const textColor = def.color === 0xffffff ? '#ffffff' : def.color === 0xffd166 ? '#ffe28a' : def.color === 0x3687ff ? '#9fc0ff' : '#8af6ff'
    pathGroup.add(
      createSpriteText(
        def.name,
        textColor,
        mid
          .clone()
          .multiplyScalar(1.035)
          .add(new THREE.Vector3(0, index === 0 ? 0.18 : 0, 0)),
        index === 0 ? 0.22 : 0.18,
      ),
    )

    if (index === 0) {
      const currentPathMetrics = computeSolarMetricsByDeclination(state.latitude, def.declination, 12)
      if (!currentPathMetrics.polarType) {
        const first = points[0]!
        const last = points[points.length - 1]!
        pathGroup.add(createSmallMarker(first, 0xffd166, '日出'))
        pathGroup.add(createSmallMarker(last, 0xff8f70, '日落'))
      }
    }
  })
}

function buildSunPathPoints(latitude: number, declination: number) {
  const m = computeSolarMetricsByDeclination(latitude, declination, 12)
  const points: THREE.Vector3[] = []
  if (m.polarType === '极夜') return points

  const start = m.polarType === '极昼' ? 0 : m.sunrise
  const end = m.polarType === '极昼' ? 24 : m.sunset
  const steps = 180

  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps
    const metrics = computeSolarMetricsByDeclination(latitude, declination, t)
    if (metrics.altitude >= -0.1 || m.polarType === '极昼') points.push(solarToPosition(metrics, SKY_RADIUS))
  }
  return points
}

function updateSceneBySolar(metrics: SolarMetrics) {
  if (!sunMesh || !sunGlow || !lightRay) return

  const sunPos = solarToPosition(metrics, SKY_RADIUS)
  const isAbove = metrics.altitude > 0

  sunMesh.position.copy(sunPos)
  sunGlow.position.copy(sunPos)
  sunMesh.visible = isAbove
  sunGlow.visible = isAbove
  sunGlow.material.opacity = metrics.altitude > 8 ? 0.88 : 1

  updateLightRay(sunPos, isAbove)
  updateAltitudeAngleGauge(metrics)
  syncThreeJsSunShadow(metrics)
  updateSkyByTime(metrics)
}

function updateLightRay(sunPos: THREE.Vector3, visible: boolean) {
  lightRay.visible = layers.rays && visible
  if (!lightRay.visible) return
  const position = (lightRay.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute
  position.setXYZ(0, sunPos.x, sunPos.y, sunPos.z)
  position.setXYZ(1, OBSERVER_POINT.x, OBSERVER_POINT.y, OBSERVER_POINT.z)
  position.needsUpdate = true
}

function updateAltitudeAngleGauge(metrics: SolarMetrics) {
  if (!altitudeAngleGroup) return
  clearGroup(altitudeAngleGroup)

  // 太阳在地平线以下时不画夹角，避免视觉上穿过地面。
  if (metrics.altitude <= 0) return

  /**
   * 太阳高度角 h 的实时夹角演示：
   * - 黄色长线：从城市观测点指向太阳的直射光线；
   * - 白色基准线：从同一个夹角顶点出发，表示与地面平行的地平线方向；
   * - 半透明扇形 + 弧线：从白色基准线扫到黄色光线，实时表示 h。
   */
  const rayTarget = OBSERVER_POINT.clone()
  const sunPos = solarToPosition(metrics, SKY_RADIUS)

  const sunDir = sunPos.clone().sub(rayTarget).normalize()
  const horizontal = new THREE.Vector3(sunDir.x, 0, sunDir.z)
  if (horizontal.lengthSq() < 0.0001) horizontal.set(0, 0, -1)
  horizontal.normalize()

  const visualAltitude = THREE.MathUtils.radToDeg(Math.atan2(sunDir.y, Math.sqrt(sunDir.x * sunDir.x + sunDir.z * sunDir.z)))
  const shownAltitude = clamp(visualAltitude, 0, 89.5)

  // 夹角顶点：放在观测点到太阳的直射光线上。白线和黄线都从这里开始，保证对接。
  const origin = rayTarget.clone().add(sunDir.clone().multiplyScalar(1.55))
  const radius = 1.48

  const horizonEnd = origin.clone().add(horizontal.clone().multiplyScalar(radius * 1.35))
  const sunEdge = origin.clone().add(sunDir.clone().multiplyScalar(radius * 1.18))

  // 完整太阳直射光线：城市观测点 -> 太阳。
  altitudeAngleGroup.add(makeTubeLine([rayTarget, sunPos], 0xffd166, 0.016, 0.96))
  altitudeAngleGroup.add(makeLine([rayTarget, sunPos], 0xfff4bd, 0.42))

  // 夹角两条边：从同一个 origin 出发，避免白色基准线偏出来。
  altitudeAngleGroup.add(makeTubeLine([origin, horizonEnd], 0xe5e7eb, 0.012, 0.72))
  altitudeAngleGroup.add(makeTubeLine([origin, sunEdge], 0xffd166, 0.024, 1))

  // 从观测点引导到夹角顶点。
  altitudeAngleGroup.add(makeLine([rayTarget, origin], 0x9ca3af, 0.3))

  // 扇形和弧线也以同一个顶点 origin 为圆心。
  altitudeAngleGroup.add(createAngleSector(origin, horizontal, sunDir, radius * 0.58, 0xffd166, 0.18))
  altitudeAngleGroup.add(makeArcLine(origin, horizontal, sunDir, radius * 0.68, 0xffd166, 0.94))

  // 顶点小球，明确白线和黄线的公共交点。
  const vertex = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
  )
  vertex.position.copy(origin)
  altitudeAngleGroup.add(vertex)

  altitudeAngleGroup.add(createSpriteText('地平线方向', '#e5e7eb', horizonEnd.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.14))
  altitudeAngleGroup.add(createSpriteText('太阳直射光线', '#ffd166', sunEdge.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.14))

  const labelPos = origin
    .clone()
    .add(horizontal.clone().multiplyScalar(radius * 0.42))
    .add(new THREE.Vector3(0, radius * 0.26, 0))

  altitudeAngleGroup.add(createSpriteText(`太阳高度角 h = ${formatDeg(runtimeMetrics.value.altitude)}`, '#fff1b8', labelPos, 0.2))
}

function createAngleSector(origin: THREE.Vector3, fromDir: THREE.Vector3, toDir: THREE.Vector3, radius: number, color: number, opacity = 0.18) {
  const steps = 36
  const positions: number[] = []
  const indices: number[] = []
  const axis = new THREE.Vector3().crossVectors(fromDir, toDir)
  if (axis.lengthSq() < 0.0001) axis.set(0, 1, 0)
  axis.normalize()

  const angle = fromDir.angleTo(toDir)
  positions.push(origin.x, origin.y, origin.z)

  for (let i = 0; i <= steps; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, (angle * i) / steps)
    const p = origin.clone().add(fromDir.clone().applyQuaternion(q).normalize().multiplyScalar(radius))
    positions.push(p.x, p.y, p.z)
  }

  for (let i = 1; i <= steps; i++) indices.push(0, i, i + 1)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
}

function makeArcLine(origin: THREE.Vector3, fromDir: THREE.Vector3, toDir: THREE.Vector3, radius: number, color: number, opacity = 1) {
  const points: THREE.Vector3[] = []
  const steps = 48
  const axis = new THREE.Vector3().crossVectors(fromDir, toDir)
  if (axis.lengthSq() < 0.0001) axis.set(0, 1, 0)
  axis.normalize()

  const angle = fromDir.angleTo(toDir)
  for (let i = 0; i <= steps; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, (angle * i) / steps)
    points.push(origin.clone().add(fromDir.clone().applyQuaternion(q).normalize().multiplyScalar(radius)))
  }
  return makeTubeLine(points, color, 0.012, opacity)
}

function syncThreeJsSunShadow(metrics: SolarMetrics) {
  if (!keyLight || !renderer) return

  const isShadowVisible = layers.shadow && metrics.altitude > 1
  keyLight.castShadow = isShadowVisible
  renderer.shadowMap.enabled = isShadowVisible

  const sunDir = solarToPosition(metrics, 1).normalize()
  keyLight.position.set(sunDir.x * 9, Math.max(0.08, sunDir.y * 9), sunDir.z * 9)
  keyLight.target.position.set(0, GROUND_SURFACE_Y, 0)
  keyLight.target.updateMatrixWorld()

  const dayK = smoothstep(-2, 30, metrics.altitude)
  keyLight.intensity = isShadowVisible ? 1.35 + dayK * 2.05 : 0.14
}

function updateSkyByTime(metrics: SolarMetrics) {
  if (!renderer || !scene) return
  const colors = getSmoothSkyColors(metrics.altitude, metrics.solarTime)

  renderer.setClearColor(colors.clear, 0)
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(colors.fog)
    scene.fog.near = metrics.altitude <= -4 ? 10 : 12.5
    scene.fog.far = metrics.altitude <= -4 ? 28 : 32
  }

  if (hemisphereDome?.material) {
    const material = hemisphereDome.material as THREE.MeshBasicMaterial
    material.color.set(colors.dome)
    material.opacity = metrics.altitude > 20 ? 0.08 : metrics.altitude <= -4 ? 0.045 : 0.065
  }

  const dayK = smoothstep(-2, 30, metrics.altitude)
  const nightK = 1 - smoothstep(-6, 6, metrics.altitude)
  if (ambientLight) ambientLight.intensity = 0.42 + dayK * 0.62
  if (rimLight) rimLight.intensity = 0.22 + dayK * 0.36

  updateNightSkyDecorations(nightK)
  updateCityTimeElements(nightK, dayK, metrics)
}

function updateCityTimeElements(nightK: number, dayK: number, metrics: SolarMetrics) {
  const lampOpacity = Math.max(nightK, smoothstep(-4, 5, 8 - metrics.altitude) * 0.45)

  streetLightItems.forEach(item => {
    const material = item.lamp.material as THREE.MeshBasicMaterial
    material.opacity = 0.18 + lampOpacity * 0.82
    material.color.set(lampOpacity > 0.5 ? 0xffd166 : 0xe5e7eb)
    item.glow.material.opacity = lampOpacity * 0.58
  })

  windowLightItems.forEach(item => {
    const flicker = 0.82 + 0.18 * Math.sin(performance.now() * 0.001 + item.seed)
    item.material.opacity = 0.2 + nightK * 0.72 * flicker
    item.material.color.set(nightK > 0.3 ? 0xffe08a : 0xdff7ff)
  })

  trafficLightItems.forEach(item => {
    const phase = Math.floor(((metrics.solarTime * 60 + item.seed * 20) % 90) / 30)
    item.red.opacity = phase === 0 ? 0.95 : 0.22
    item.yellow.opacity = phase === 1 ? 0.9 : 0.18
    item.green.opacity = phase === 2 ? 0.95 : 0.22
  })

  // 城市广告牌是 CanvasTexture，不会像模板文本一样自动更新。
  // key 必须包含父组件传入的日出/日落文本；否则从普通昼夜切到极昼/极夜时，
  // HUD 已经显示“极夜”，广告牌仍可能沿用上一帧内部格式化的 00:00:00。
  const sunriseText = normalizeParentSunText(props.sunriseText, metrics)
  const sunsetText = normalizeParentSunText(props.sunsetText, metrics)
  const key = [
    formatClock(metrics.solarTime),
    Math.round(metrics.altitude),
    Math.round(dayK * 10),
    sunriseText,
    sunsetText,
    props.dayLengthText,
  ].join('-')

  cityClockItems.forEach(item => {
    if (item.lastKey === key) return
    item.lastKey = key
    drawCityClockTexture(item.ctx, item.texture, metrics, sunriseText, sunsetText)
  })

  cityRoadMaterials.forEach(material => {
    material.color.set(mixColorNumber(0x1f2937, 0x3d4651, dayK))
  })
}

function updateNightSkyDecorations(nightK: number) {
  skyDecorationGroup.children.forEach(child => {
    const points = child as THREE.Points
    const mat = points.material as THREE.PointsMaterial
    mat.opacity = nightK * 0.9
  })
}

function normalizeParentSunText(text: string, metrics: SolarMetrics) {
  const safeText = String(text || '').trim()
  if (safeText) return safeText
  if (metrics.polarType === '极昼') return '极昼'
  if (metrics.polarType === '极夜') return '极夜'
  return '--:--'
}

function drawCityClockTexture(
  ctx: CanvasRenderingContext2D,
  texture: THREE.CanvasTexture,
  metrics: SolarMetrics,
  sunriseText = normalizeParentSunText(props.sunriseText, metrics),
  sunsetText = normalizeParentSunText(props.sunsetText, metrics),
) {
  ctx.clearRect(0, 0, 768, 256)
  const bg = ctx.createLinearGradient(0, 0, 768, 256)
  bg.addColorStop(0, '#0f172a')
  bg.addColorStop(1, '#082f49')
  ctx.fillStyle = bg
  roundRect(ctx, 18, 14, 732, 228, 26)
  ctx.fill()

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.78)'
  ctx.lineWidth = 5
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(224,242,254,0.78)'
  ctx.font = '700 24px Microsoft YaHei, Arial'
  ctx.fillText('城市太阳时', 384, 55)

  ctx.fillStyle = '#ffd166'
  ctx.font = '900 58px Microsoft YaHei, Arial'
  ctx.fillText(formatClock(metrics.solarTime), 384, 124)

  ctx.fillStyle = 'rgba(224,242,254,0.88)'
  ctx.font = '700 22px Microsoft YaHei, Arial'
  ctx.fillText(`太阳高度 ${formatDeg(metrics.altitude)}   方位 ${formatDeg(metrics.azimuth)}`, 384, 171)

  ctx.fillStyle = 'rgba(255,255,255,0.58)'
  ctx.font = '600 18px Microsoft YaHei, Arial'
  // 日出 / 日落文本由父组件统一传入，极昼极夜时不会被内部时间格式化成 00:00 / 24:00。
  ctx.fillText(`日出 ${sunriseText} · 日落 ${sunsetText}`, 384, 211)

  texture.needsUpdate = true
}

function createSmallMarker(position: THREE.Vector3, color: number, text: string) {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }))
  mesh.position.copy(position)
  group.add(mesh)
  group.add(createSpriteText(text, color === 0xffd166 ? '#ffdc82' : '#ffad96', position.clone().add(new THREE.Vector3(0, 0.22, 0)), 0.14))
  return group
}

function createGrassTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#5da94e'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const len = 3 + Math.random() * 9
    const alpha = 0.06 + Math.random() * 0.16
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.random() * 2 - 1, y + len)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function getSmoothSkyColors(altitude: number, solarTime: number) {
  const isMorning = solarTime < 12
  const night = { top: 0x020713, mid: 0x071427, bottom: 0x030611, dome: 0x2351a3 }
  const dawn = { top: 0xf1b06f, mid: 0x6fb8dd, bottom: 0x092142, dome: 0xffd19a }
  const day = { top: 0x7ed7ff, mid: 0xbfeeff, bottom: 0x0d3158, dome: 0x9be7ff }
  const sunset = { top: 0x664c94, mid: 0xc66b58, bottom: 0x081529, dome: 0xffa66b }

  let a = night
  let b = isMorning ? dawn : sunset
  let t = smoothstep(-8, 7, altitude)

  if (altitude > 4) {
    a = isMorning ? dawn : sunset
    b = day
    t = smoothstep(4, 28, altitude)
  }

  const top = mixColor(a.top, b.top, t)
  const mid = mixColor(a.mid, b.mid, t)
  const bottom = mixColor(a.bottom, b.bottom, t)

  if (wrapRef.value) {
    wrapRef.value.style.setProperty('--sky-top', top)
    wrapRef.value.style.setProperty('--sky-mid', mid)
    wrapRef.value.style.setProperty('--sky-bottom', bottom)
  }

  return {
    top,
    mid,
    bottom,
    clear: mixColorNumber(a.mid, b.mid, t),
    fog: mixColorNumber(a.bottom, b.bottom, t),
    dome: mixColorNumber(a.dome, b.dome, t),
  }
}

function buildRuntimeMetricsFromProps(): SolarMetrics {
  const latitude = props.latitude
  const declination = props.declination
  const altitude = props.altitude
  const azimuth = normalize360(props.azimuth)
  const solarTime = props.solarTime / 60

  const altRad = degToRad(altitude)
  const azRad = degToRad(azimuth)
  const horizontal = Math.cos(altRad)

  // 与本组件坐标系保持一致：z=北，x+ 为西，x- 为东。
  // solarToPosition 会使用 x=-east，因此 east 为正时太阳显示在东方。
  const east = Math.sin(azRad) * horizontal
  const north = Math.cos(azRad) * horizontal
  const up = Math.sin(altRad)

  const hourAngle = 15 * (solarTime - 12)
  const noonAltitude = 90 - Math.abs(latitude - declination)
  const dayInfo = dayLengthInfoByDeclination(latitude, declination)

  let polarType: SolarMetrics['polarType'] = ''
  let sunrise = 12
  let sunset = 12
  let dayLength = 0

  if (dayInfo.type === 'polar-day') {
    polarType = '极昼'
    sunrise = 0
    sunset = 24
    dayLength = 24
  } else if (dayInfo.type === 'polar-night') {
    polarType = '极夜'
    sunrise = 12
    sunset = 12
    dayLength = 0
  } else {
    sunrise = 12 - dayInfo.dayLength / 2
    sunset = 12 + dayInfo.dayLength / 2
    dayLength = dayInfo.dayLength
  }

  return {
    declination,
    hourAngle,
    altitude,
    azimuth,
    noonAltitude,
    dayLength,
    sunrise,
    sunset,
    polarType,
    east,
    north,
    up,
    solarTime,
  }
}

function dayLengthInfoByDeclination(latitude: number, declination: number) {
  const latRad = degToRad(latitude)
  const decRad = degToRad(declination)
  const cosH0 = -Math.tan(latRad) * Math.tan(decRad)

  // 与父组件保持一致：极昼 / 极夜临界点加容差，避免北极圈临界值被误判。
  if (cosH0 <= -1 + POLAR_EPS) {
    return {
      type: 'polar-day' as const,
      h0: 180,
      dayLength: 24,
    }
  }

  if (cosH0 >= 1 - POLAR_EPS) {
    return {
      type: 'polar-night' as const,
      h0: 0,
      dayLength: 0,
    }
  }

  const h0 = radToDeg(Math.acos(clamp(cosH0, -1, 1)))
  return {
    type: 'normal' as const,
    h0,
    dayLength: (2 * h0) / 15,
  }
}

function computeSolarMetricsByDeclination(latitude: number, declination: number, solarTime: number): SolarMetrics {
  const hourAngle = 15 * (solarTime - 12)

  const latRad = degToRad(latitude)
  const decRad = degToRad(declination)
  const hourRad = degToRad(hourAngle)

  // 与父组件算法坐标约定保持一致：z=北，x+ 为西，x- 为东。
  const east = -Math.cos(decRad) * Math.sin(hourRad)
  const north = Math.cos(latRad) * Math.sin(decRad) - Math.sin(latRad) * Math.cos(decRad) * Math.cos(hourRad)
  const up = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourRad)

  const altitude = radToDeg(Math.asin(clamp(up, -1, 1)))
  const azimuth = normalize360(radToDeg(Math.atan2(east, north)))
  const noonAltitude = 90 - Math.abs(latitude - declination)
  const dayInfo = dayLengthInfoByDeclination(latitude, declination)

  let polarType: SolarMetrics['polarType'] = ''
  let sunrise = 12
  let sunset = 12
  let dayLength = 0

  if (dayInfo.type === 'polar-day') {
    polarType = '极昼'
    sunrise = 0
    sunset = 24
    dayLength = 24
  } else if (dayInfo.type === 'polar-night') {
    polarType = '极夜'
    sunrise = 12
    sunset = 12
    dayLength = 0
  } else {
    sunrise = 12 - dayInfo.dayLength / 2
    sunset = 12 + dayInfo.dayLength / 2
    dayLength = dayInfo.dayLength
  }

  return {
    declination,
    hourAngle,
    altitude,
    azimuth,
    noonAltitude,
    dayLength,
    sunrise,
    sunset,
    polarType,
    east,
    north,
    up,
    solarTime,
  }
}

function solarToPosition(metrics: SolarMetrics, radius = SKY_RADIUS) {
  const x = -metrics.east * radius
  const y = metrics.up * radius
  const z = metrics.north * radius
  return new THREE.Vector3(x, y, z)
}

function azimuthAltitudeToVec3(azimuth: number, altitude: number, radius: number) {
  const az = degToRad(azimuth)
  const alt = degToRad(altitude)
  const horizontal = Math.cos(alt)
  const x = -Math.sin(az) * horizontal * radius
  const y = Math.sin(alt) * radius
  const z = Math.cos(az) * horizontal * radius
  return new THREE.Vector3(x, y, z)
}

function makeLine(points: THREE.Vector3[], color: number, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
}

function makeTubeLine(points: THREE.Vector3[], color: number, radius = 0.01, opacity = 1) {
  const curve = new THREE.CatmullRomCurve3(points)
  const geometry = new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), radius, 8, false)
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))
}

function createSpriteText(text: string, color: string, position: THREE.Vector3, size = 0.22) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 44
  canvas.width = 512
  canvas.height = 128
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `900 ${fontSize}px Microsoft YaHei, Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(0,0,0,0.72)'
  ctx.fillStyle = color
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2)
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.position.copy(position)
  sprite.scale.set(size * 3.2, size * 0.8, 1)
  return sprite
}

function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255, 255, 220, 1)')
  gradient.addColorStop(0.24, 'rgba(255, 209, 102, .92)')
  gradient.addColorStop(0.68, 'rgba(255, 159, 28, .28)')
  gradient.addColorStop(1, 'rgba(255, 159, 28, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function applyMeshShadowSettings(mesh: THREE.Object3D) {
  mesh.castShadow = true
  mesh.receiveShadow = true
}

function degToRad(deg: number) {
  return THREE.MathUtils.degToRad(deg)
}

function radToDeg(rad: number) {
  return THREE.MathUtils.radToDeg(rad)
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function normalize360(deg: number) {
  return ((deg % 360) + 360) % 360
}

function hexToRgb(hex: number) {
  return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 }
}

function mixColor(a: number, b: number, t: number) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const k = clamp(t, 0, 1)
  const r = Math.round(ca.r + (cb.r - ca.r) * k)
  const g = Math.round(ca.g + (cb.g - ca.g) * k)
  const bl = Math.round(ca.b + (cb.b - ca.b) * k)
  return `rgb(${r}, ${g}, ${bl})`
}

function mixColorNumber(a: number, b: number, t: number) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const k = clamp(t, 0, 1)
  const r = Math.round(ca.r + (cb.r - ca.r) * k)
  const g = Math.round(ca.g + (cb.g - ca.g) * k)
  const bl = Math.round(ca.b + (cb.b - ca.b) * k)
  return (r << 16) + (g << 8) + bl
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function formatClock(value: number) {
  // 与 App.vue 保持一致：value 单位是“小时”，显示 HH:mm:ss。
  if (!Number.isFinite(value)) return '--:--:--'

  const totalSeconds = Math.round((((value % 24) + 24) % 24) * 3600) % 86400
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const sec = totalSeconds % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatDeg(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`
}

function formatHour(v: number) {
  return `${v.toFixed(1)}小时`
}

function resize() {
  if (!canvasWrapRef.value || !renderer || !camera) return
  const width = canvasWrapRef.value.clientWidth
  const height = canvasWrapRef.value.clientHeight
  camera.aspect = width / Math.max(1, height)
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function animate() {
  controls?.update()
  renderer?.render(scene, camera)
  animationId = requestAnimationFrame(animate)
}

function disposeScene() {
  resizeObserver?.disconnect()
  resizeObserver = null
  controls?.dispose()
  if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
  renderer?.dispose()
}
</script>

<style scoped>
.sun-lite {
  --sky-top: #7ed7ff;
  --sky-mid: #bfeeff;
  --sky-bottom: #0d3158;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 45% 20%, rgba(255, 255, 255, 0.18), transparent 24%),
    linear-gradient(to bottom, var(--sky-top), var(--sky-mid) 54%, var(--sky-bottom));
}

.canvas-wrap {
  width: 100%;
  height: 100%;
}

.scene-title {
  display: none;
}

.legend-panel {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 6;
  width: 190px;
  border: 1px solid rgba(255, 209, 102, 0.2);
  border-radius: 14px;
  padding: 10px;
  background: rgba(4, 13, 28, 0.64);
  backdrop-filter: blur(12px);
  display: grid;
  gap: 6px;
  pointer-events: none;
}

.legend-title {
  color: #fff1b8;
  font-size: 12px;
  font-weight: 900;
}

.legend-panel div:not(.legend-title) {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(235, 247, 255, 0.78);
  font-size: 10px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.yellow {
  background: #ffd166;
  box-shadow: 0 0 12px rgba(255, 209, 102, 0.58);
}
.dot.current {
  background: #ffd166;
}
.dot.blue {
  background: #3687ff;
}
.dot.white {
  background: #ffffff;
}
.dot.cyan {
  background: #45e8ff;
}
.dot.shadow {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.dot.ray {
  background: #fff4bd;
}

.mini-hud {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 6;
  display: grid;
  grid-template-columns: repeat(3, minmax(96px, 1fr));
  gap: 8px;
  pointer-events: none;
}

.mini-hud div {
  border: 1px solid rgba(117, 219, 255, 0.18);
  border-radius: 12px;
  background: rgba(4, 13, 28, 0.66);
  backdrop-filter: blur(12px);
  padding: 8px;
  display: grid;
  gap: 3px;
}

.mini-hud span {
  color: rgba(235, 247, 255, 0.66);
  font-size: 10px;
}

.mini-hud b {
  color: #ffd166;
  font-size: 12px;
  font-weight: 900;
  text-shadow: 0 0 12px rgba(255, 209, 102, 0.34);
}

.mini-hud div:first-child b,
.mini-hud div:nth-child(3) b {
  color: #fff1b8;
}
</style>
