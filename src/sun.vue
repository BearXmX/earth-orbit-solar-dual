<template>
  <div ref="wrapRef" class="sun-lite">
    <div ref="canvasWrapRef" class="canvas-wrap"></div>

    <!--     <div class="legend-panel">
      <div class="legend-title">图例</div>
      <div><i class="dot yellow"></i> 当前太阳</div>
      <div><i class="dot current"></i> 当前日期路径</div>
      <div><i class="dot blue"></i> 6月夏至路径</div>
      <div><i class="dot white"></i> 春秋分路径</div>
      <div><i class="dot cyan"></i> 12月冬至路径</div>
      <div><i class="dot shadow"></i> 场景物体阴影</div>
      <div><i class="dot ray"></i> 太阳光线</div>
    </div> -->

    <Teleport to="body">
    <FloatingPanel title="太阳视运动数据" class="solar-data-panel" anchor="top-right"
      :initial-right="14" :initial-top="128" :top-inset="128" :bottom-inset="props.panelBottomInset"
      :initial-width="360" :initial-height="310" :min-width="320" :min-height="224">
    <template #header-meta>
      <button v-if="props.sceneObject === 'sundial'" type="button" class="solar-info-toggle"
        :aria-pressed="showSundialInfo" :aria-label="showSundialInfo ? '返回太阳视运动读数' : '查看日晷说明'"
        @click="showSundialInfo = !showSundialInfo">{{ showSundialInfo ? '返回读数' : '日晷说明' }}</button>
    </template>
    <div class="solar-readout">
        <dl v-if="!showSundialInfo || props.sceneObject !== 'sundial'" class="solar-data-grid">
          <div class="solar-metric-altitude"><dt title="太阳中心与当地地平面的夹角；地平线上方为正，下方为负。">太阳高度角</dt><dd>{{ formatSignedDegreesMinutes(runtimeMetrics.altitude) }}</dd></div>
          <div class="solar-metric-azimuth"><dt title="北为0°，东90°，南180°，西270°；极点以所选经线建立参考方向。">太阳方位角</dt><dd>{{ solarAzimuthText(runtimeMetrics.altitude, runtimeMetrics.azimuth) }}</dd></div>
          <div><dt>地方太阳时</dt><dd>{{ formatClock(runtimeMetrics.solarTime) }}</dd></div>
          <div><dt>昼长</dt><dd>{{ props.dayLengthText }}</dd></div>
          <div><dt><i class="solar-time-dot sunrise-dot" aria-hidden="true"></i>日出</dt><dd>{{ props.sunriseText }}</dd></div>
          <div><dt><i class="solar-time-dot sunset-dot" aria-hidden="true"></i>日落</dt><dd>{{ props.sunsetText }}</dd></div>
        </dl>
        <div v-else class="solar-sundial-info">
        <p class="sundial-notice" role="status" aria-atomic="true">
          <b>{{ sundialNotice.title }}</b>
          <span>{{ sundialNotice.detail }}</span>
        </p>
        <div class="sundial-guide-control">
          <button type="button" :aria-pressed="showSundialGuide" @click="showSundialGuide = !showSundialGuide">
            {{ showSundialGuide ? '收起' : '显示' }}晷面平行示意
          </button>
          <p v-if="showSundialGuide">{{ isZeroTilt ? '全年' : '春秋分' }}轨迹平面 ∥ 晷面<span v-if="sundialNotice.status === 'parallel'"> · 沿盘缘入射</span></p>
        </div>
        </div>
    </div>
    </FloatingPanel>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/** SUN_LITE_PARENT_DRIVEN_V14: 当前太阳位置、赤纬、太阳时由父组件统一传入；本组件只负责渲染。 */
/** 基于 SUN_APP_MOTION_CORE_V13：保留城市观察场景、太阳路径、阴影、光线和高度角演示。 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createEquatorialSundial } from './scene/createEquatorialSundial'
import FloatingPanel from './components/FloatingPanel.vue'
import { createSundialAlignmentGuide } from './scene/createSundialAlignmentGuide'
import { createDayNightSky } from './scene/createDayNightSky'
import { clearObjectChildren } from './scene/disposeSceneResources'
import { AXIAL_TILT, formatSignedDegreesMinutes } from './utils/astronomy'
import { southFacingSolarCameraPosition, southFacingSolarCameraTarget } from './utils/solarView'
import { solarAltitudeGuide, solarAzimuthText, sundialGroundPosition, sundialReadingNotice, sunDirection } from './utils/sundial'

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

const props = withDefaults(defineProps<{
  sceneObject?: 'city' | 'sundial'
  panelBottomInset?: number
  axialTilt?: number
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
}>(), { axialTilt: AXIAL_TILT, panelBottomInset: 14 })

const emit = defineEmits<{ ready: []; loadError: [message: string] }>()
let mountedDisposed = false
let sceneDisposed = false

const canvasWrapRef = ref<HTMLDivElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)
const showSundialGuide = ref(true)
const showSundialInfo = ref(false)

const SKY_RADIUS = 7.6
const GROUND_RADIUS = 7.4
const GROUND_SURFACE_Y = 0.08
// 与天球和太阳路径使用同一原点，避免有限距离的太阳标记引入视差。
const OBSERVER_POINT = new THREE.Vector3(0, 0, 0)
// 极昼/极夜临界点容差，与父组件保持一致，避免北极圈临界值被浮点误差误判。
const POLAR_EPS = 1e-10

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
let altitudeAngleGroup: THREE.Group
let dayNightSky: ReturnType<typeof createDayNightSky> | null = null

let ambientLight: THREE.AmbientLight
let keyLight: THREE.DirectionalLight
let rimLight: THREE.DirectionalLight
let sunMesh: THREE.Mesh
let sunGlow: THREE.Sprite
let lightRay: THREE.Line
let sundialModel: ReturnType<typeof createEquatorialSundial> | null = null
let sundialGuide: ReturnType<typeof createSundialAlignmentGuide> | null = null
const treeMeshes: THREE.Mesh[] = []
const altitudeGaugeLabels = new Map<string, THREE.Sprite>()

const streetLightItems: StreetLightItem[] = []
const windowLightItems: WindowLightItem[] = []
const trafficLightItems: TrafficLightItem[] = []
const cityClockItems: CityClockItem[] = []
const cityRoadMaterials: THREE.MeshStandardMaterial[] = []

let lastPathKey = ''
let lastCityKey = ''
let controlsInteracting = false
let lastCanvasWidth = 0
let lastCanvasHeight = 0
let resizeRaf = 0
let resizeTimer = 0
let resizeFinalTimer = 0
let pendingResizeForce = false
let lastCameraFitDistance = 0

const runtimeMetrics = computed(() => buildRuntimeMetricsFromProps())
const isZeroTilt = computed(() => Math.abs(props.axialTilt) < 1e-6)
const sundialNotice = computed(() => {
  const notice = sundialReadingNotice(props.latitude, props.altitude, props.azimuth)
  if (isHorizonPath(props.latitude, props.declination)) return {
    ...notice,
    title: '太阳沿地平线运行',
    detail: '太阳中心全天位于地平线上，属于昼夜临界情形；晷面无法形成可读针影。',
  }
  if (isZeroTilt.value && notice.status === 'parallel') return {
    ...notice,
    title: '黄赤交角 0°：全年沿晷面掠射',
    detail: '全年太阳赤纬为 0°；白天阳光沿晷面边缘掠过，盘面上无可读针影，地面仍可能有影子。',
  }
  return notice
})

watch(showSundialGuide, visible => {
  if (sundialGuide) sundialGuide.group.visible = visible
})

watch(
  () => [
    props.axialTilt,
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
  if (mountedDisposed) return
  try {
    initScene()
    syncFromProps()
    animate()
    if (!mountedDisposed) emit('ready')
  } catch (error) {
    console.error(error)
    disposeScene()
    if (!mountedDisposed) emit('loadError', '太阳视运动场景初始化失败')
  }
})

onBeforeUnmount(() => {
  mountedDisposed = true
  cancelAnimationFrame(animationId)
  disposeScene()
})

function initScene() {
  if (!canvasWrapRef.value) throw new Error('Solar scene canvas is unavailable')

  scene = new THREE.Scene()
  dayNightSky = createDayNightSky()
  scene.fog = null
  scene.add(dayNightSky.mesh)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160)
  camera.position.copy(southFacingSolarCameraPosition())
  camera.lookAt(southFacingSolarCameraTarget())

  const safeRenderMode = shouldUseSafeRenderMode()
  renderer = new THREE.WebGLRenderer({
    antialias: !safeRenderMode,
    alpha: false,
    powerPreference: safeRenderMode ? 'default' : 'high-performance',
  })
  renderer.setPixelRatio(safeRenderMode ? 1 : Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(Math.max(1, canvasWrapRef.value.clientWidth), Math.max(1, canvasWrapRef.value.clientHeight), true)
  renderer.setClearColor(0x080b11, 1)
  renderer.shadowMap.enabled = !safeRenderMode
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const canvas = renderer.domElement
  canvas.className = 'sun-lite-canvas'
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.touchAction = 'none'
  canvas.style.webkitUserSelect = 'none'
  canvas.style.userSelect = 'none'
  canvasWrapRef.value.appendChild(canvas)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = true
  controls.minDistance = 4.2
  controls.maxDistance = 32
  controls.target.copy(southFacingSolarCameraTarget())
  controls.update()
  controls.addEventListener('start', () => {
    controlsInteracting = true
  })
  controls.addEventListener('end', () => {
    controlsInteracting = false
    // 结束拖拽后补一次高度角夹角等辅助几何，避免拖动过程中频繁重建导致 iPad 闪烁。
    updateSceneBySolar(runtimeMetrics.value)
  })

  ambientLight = new THREE.AmbientLight(0x9fd7ff, 0.64)
  keyLight = new THREE.DirectionalLight(0xfff0c2, 2.2)
  rimLight = new THREE.DirectionalLight(0x6ee7ff, 0.46)

  keyLight.castShadow = !safeRenderMode
  keyLight.shadow.mapSize.set(safeRenderMode ? 512 : 2048, safeRenderMode ? 512 : 2048)
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
  altitudeAngleGroup = new THREE.Group()

  scene.add(rootGroup, domeGroup, pathGroup, sunGroup, rayGroup, altitudeAngleGroup, schoolGroup, labelGroup)

  createGround()
  createCityScene()
  createDome()
  createLabels()
  createSun()
  createLightRay()

  // v10：不要依赖 ResizeObserver 防抖。窗口拖拽时 ResizeObserver 触发节奏不稳定，
  // 容易和 WebGL setSize / 浏览器重排撞在一起导致闪烁。
  // 改为在 render loop 里每帧检查容器尺寸，只有尺寸真的变化时才 setSize。
  resize(true)
}

function syncFromProps() {
  if (!scene) return

  // 当前太阳路径由父组件传入的 declination 驱动，避免父子组件各算一套赤纬导致不一致。
  const pathKey = [Math.round(state.latitude * 10), state.dayOfYear, state.declination.toFixed(2), props.axialTilt].join('-')
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
  treeMeshes.length = 0

  // 日晷场景保留草地、树木和观测点，移除街道及路灯、交通灯等城市设施。
  if (props.sceneObject === 'sundial') {
    sundialModel = createEquatorialSundial(renderer)
    sundialModel.group.position.y = GROUND_SURFACE_Y
    schoolGroup.add(sundialModel.group)
    sundialGuide = createSundialAlignmentGuide(SKY_RADIUS, sundialModel.radius)
    sundialGuide.group.visible = showSundialGuide.value
    scene.add(sundialGuide.group)
  } else {
    createCityRoadNetwork()
    createCityBlocks()
    createCityTimeElements()
  }
  createRoadsideTreeBelts()
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
  treeMeshes.push(trunk, crown)
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

  if (props.sceneObject !== 'sundial') createCityClockBillboard(0, 0)
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

function clearGroup(group: THREE.Group) {
  clearObjectChildren(group, { retainRoot: scene })
}

function rebuildSolarPaths() {
  clearGroup(pathGroup)
  if (!layers.paths) return

  const pathDefs = isZeroTilt.value ? [
    { declination: 0, name: '全年路径（黄赤交角 0°）', color: 0xffd166, opacity: 1, radius: 0.018 },
  ] : [
    { declination: state.declination, name: `当日路径（第${state.dayOfYear}天）`, color: 0xffd166, opacity: 1, radius: 0.018 },
    { declination: props.axialTilt, name: '6月夏至路径', color: 0x3687ff, opacity: 0.78, radius: 0.011 },
    { declination: 0, name: '春秋分路径', color: 0xffffff, opacity: 0.62, radius: 0.01 },
    { declination: -props.axialTilt, name: '12月冬至路径', color: 0x45e8ff, opacity: 0.76, radius: 0.011 },
  ]

  pathDefs.forEach((def, index) => {
    const points = buildSunPathPoints(state.latitude, def.declination)
    if (points.length < 2) return
    pathGroup.add(makeTubeLine(points, def.color, def.radius, def.opacity))

    const mid = points[Math.floor(points.length / 2)]!
    const textColor = def.color === 0xffffff ? '#ffffff' : def.color === 0xffd166 ? '#ffe28a' : def.color === 0x3687ff ? '#9fc0ff' : '#8af6ff'
    pathGroup.add(
      createLabelSpriteText(
        def.name,
        textColor,
        mid
          .clone()
          .multiplyScalar(1.035)
          .add(new THREE.Vector3(0, index === 0 ? 0.36 : 0, 0)),
        28,
        index === 0 ? 0.42 : 0.38,
      ),
    )

    if (index === 0) {
      const currentPathMetrics = computeSolarMetricsByDeclination(state.latitude, def.declination, 12)
      if (!currentPathMetrics.polarType && !isHorizonPath(state.latitude, def.declination)) {
        const first = points[0]!
        const last = points[points.length - 1]!
        pathGroup.add(createSmallMarker(first, 0xffd166, '日出'))
        pathGroup.add(createSmallMarker(last, 0xff8f70, '日落'))
      }
    }
  })
}

function isHorizonPath(latitude: number, declination: number) {
  return Math.abs(Math.abs(latitude) - 90) < 1e-6 && Math.abs(declination) < 1e-6
}

function buildSunPathPoints(latitude: number, declination: number) {
  const m = computeSolarMetricsByDeclination(latitude, declination, 12)
  const points: THREE.Vector3[] = []
  const horizonPath = isHorizonPath(latitude, declination)
  if (m.polarType === '极夜' && !horizonPath) return points

  const fullDayPath = m.polarType === '极昼' || horizonPath
  const start = fullDayPath ? 0 : m.sunrise
  const end = fullDayPath ? 24 : m.sunset
  const steps = 180

  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps
    const metrics = computeSolarMetricsByDeclination(latitude, declination, t)
    if (metrics.altitude >= -0.1 || fullDayPath) points.push(solarToPosition(metrics, SKY_RADIUS))
  }
  return points
}

function updateSceneBySolar(metrics: SolarMetrics) {
  if (!sunMesh || !sunGlow || !lightRay) return

  const sunPos = solarToPosition(metrics, SKY_RADIUS)
  const isAbove = metrics.altitude > 0 || isHorizonPath(state.latitude, metrics.declination)

  sunMesh.position.copy(sunPos)
  sunGlow.position.copy(sunPos)
  sunMesh.visible = isAbove
  sunGlow.visible = isAbove
  sunGlow.material.opacity = metrics.altitude > 8 ? 0.88 : 1

  updateLightRay(sunPos, isAbove)
  updateAltitudeAngleGauge(metrics)
  syncThreeJsSunShadow(metrics)
  updateSkyByTime(metrics)
  if (sundialModel) {
    sundialModel.group.position.copy(sundialGroundPosition(state.latitude, GROUND_SURFACE_Y + sundialModel.centerHeight, GROUND_RADIUS, 1.75, GROUND_SURFACE_Y))
    sundialModel.update(state.latitude, metrics.altitude, metrics.azimuth)
    sundialGuide?.update(state.latitude, sundialModel.getCenter(), metrics.altitude, metrics.azimuth)
    // 换城市后重新留出底座和支架的空间，避免树木穿过日晷。
    treeMeshes.forEach(tree => {
      tree.visible = Math.hypot(tree.position.x, tree.position.z - sundialModel!.group.position.z) > 1.75
    })
  }
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

  // iPad / Android 平板拖拽 OrbitControls 时，如果一边拖拽一边重建 TubeGeometry 和 CanvasTexture，
  // 很容易出现 WebGL 闪烁。拖拽期间保留上一帧辅助线，松手后再补绘。
  if (controlsInteracting) return

  // Keep the three canvas labels alive; only the angle geometry is rebuilt.
  altitudeGaugeLabels.forEach(label => label.removeFromParent())
  clearGroup(altitudeAngleGroup)

  // 太阳在地平线以下时不画夹角，避免视觉上穿过地面。
  if (metrics.altitude <= 0) return

  /**
   * 太阳高度角 h 的实时夹角演示：
   * - 黄色长线：连接天球观测原点与太阳的光线；
   * - 白色基准线：从同一个夹角顶点出发，表示与地面平行的地平线方向；
   * - 半透明扇形 + 弧线：从白色基准线扫到黄色光线，实时表示 h。
   */
  const rayTarget = OBSERVER_POINT.clone()
  const { direction: sunDir, horizontal, sunPosition: sunPos } = solarAltitudeGuide(metrics.altitude, metrics.azimuth, SKY_RADIUS)

  // 夹角顶点：放在观测点与太阳的连线上。白线和黄线都从这里开始，保证对接。
  const origin = rayTarget.clone().add(sunDir.clone().multiplyScalar(1.55))
  const radius = 1.48

  const horizonEnd = origin.clone().add(horizontal.clone().multiplyScalar(radius * 1.35))
  const sunEdge = origin.clone().add(sunDir.clone().multiplyScalar(radius * 1.18))

  // 完整太阳光线：连接天球观测原点与太阳，与日晷入射光平行。
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

  const labelPos = origin
    .clone()
    .add(horizontal.clone().multiplyScalar(radius * 0.42))
    .add(new THREE.Vector3(0, radius * 0.26, 0))

  // Put the numeric readout first so it keeps the closest position when labels would overlap.
  altitudeAngleGroup.add(createAltitudeGaugeLabel(`h = ${formatSignedDegreesMinutes(metrics.altitude)}`, '#fff1b8', labelPos, true))
  altitudeAngleGroup.add(createAltitudeGaugeLabel('地平线方向', '#e5e7eb', horizonEnd.clone().add(new THREE.Vector3(0, 0.12, 0))))
  altitudeAngleGroup.add(createAltitudeGaugeLabel('太阳光线', '#ffd166', sunEdge.clone().add(new THREE.Vector3(0, 0.12, 0))))
  updateAltitudeGaugeLabels()
}

function createAngleSector(origin: THREE.Vector3, fromDir: THREE.Vector3, toDir: THREE.Vector3, radius: number, color: number, opacity = 0.18) {
  const steps = 36
  const positions: number[] = []
  const indices: number[] = []
  // Preserve the vertical solar plane even when the altitude is close to zero.
  const rotation = new THREE.Quaternion().setFromUnitVectors(fromDir.clone().normalize(), toDir.clone().normalize())
  const identity = new THREE.Quaternion()
  positions.push(origin.x, origin.y, origin.z)

  for (let i = 0; i <= steps; i++) {
    const q = new THREE.Quaternion().slerpQuaternions(identity, rotation, i / steps)
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
  const rotation = new THREE.Quaternion().setFromUnitVectors(fromDir.clone().normalize(), toDir.clone().normalize())
  const identity = new THREE.Quaternion()
  for (let i = 0; i <= steps; i++) {
    const q = new THREE.Quaternion().slerpQuaternions(identity, rotation, i / steps)
    points.push(origin.clone().add(fromDir.clone().applyQuaternion(q).normalize().multiplyScalar(radius)))
  }
  return makeTubeLine(points, color, 0.012, opacity)
}

function syncThreeJsSunShadow(metrics: SolarMetrics) {
  if (!keyLight || !renderer) return

  const safeRenderMode = shouldUseSafeRenderMode()
  const isShadowVisible = !safeRenderMode && layers.shadow && metrics.altitude > 1
  keyLight.castShadow = isShadowVisible
  renderer.shadowMap.enabled = isShadowVisible

  const sunDir = solarToPosition(metrics, 1).normalize()
  keyLight.target.position.set(0, GROUND_SURFACE_Y, 0)
  keyLight.position.copy(keyLight.target.position).addScaledVector(sunDir, 9)
  keyLight.target.updateMatrixWorld()

  const dayK = smoothstep(-2, 30, metrics.altitude)
  keyLight.intensity = (isShadowVisible ? 1.35 + dayK * 2.05 : 0.92 + dayK * 1.08) * smoothstep(-4, 2, metrics.altitude)
}

function updateSkyByTime(metrics: SolarMetrics) {
  if (!renderer || !scene) return
  dayNightSky?.updateSolar(metrics.altitude, metrics.azimuth, props.solarTime)

  const dayK = smoothstep(-2, 30, metrics.altitude)
  const nightK = 1 - smoothstep(-6, 6, metrics.altitude)
  if (ambientLight) ambientLight.intensity = 0.25 + dayK * 0.79
  if (rimLight) rimLight.intensity = 0.12 + dayK * 0.46

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
    formatSignedDegreesMinutes(metrics.altitude),
    solarAzimuthText(metrics.altitude, metrics.azimuth),
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
  ctx.fillText('地方太阳时', 384, 55)

  ctx.fillStyle = '#ffd166'
  ctx.font = '900 58px Microsoft YaHei, Arial'
  ctx.fillText(formatClock(metrics.solarTime), 384, 124)

  ctx.fillStyle = 'rgba(224,242,254,0.88)'
  ctx.font = '700 22px Microsoft YaHei, Arial'
  ctx.fillText(`高度角 ${formatSignedDegreesMinutes(metrics.altitude)}   方位角 ${solarAzimuthText(metrics.altitude, metrics.azimuth)}`, 384, 171)

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
  return sunDirection(metrics.altitude, metrics.azimuth).multiplyScalar(radius)
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

function createAltitudeGaugeLabel(text: string, color: string, position: THREE.Vector3, emphasis = false) {
  const key = emphasis ? 'altitude' : text
  const cached = altitudeGaugeLabels.get(key)
  if (cached) {
    cached.position.copy(position)
    cached.userData.gaugeLabel.anchor.copy(position)
    cached.userData.gaugeLabel.setText(text)
    return cached
  }
  const canvas = document.createElement('canvas')
  // Keep GPU storage dimensions stable as the angle changes digit count.
  // Crop the unused width with UVs instead of resizing an uploaded CanvasTexture.
  canvas.width = 512
  canvas.height = emphasis ? 112 : 66
  const ctx = canvas.getContext('2d')!
  const fontSize = emphasis ? 52 : 40
  const font = `700 ${fontSize}px "Microsoft YaHei", Arial, sans-serif`
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
    toneMapped: false, sizeAttenuation: false,
  }))
  sprite.name = emphasis ? 'solar-altitude-readout' : 'solar-altitude-direction-label'
  sprite.position.copy(position)
  sprite.renderOrder = 54
  sprite.frustumCulled = false
  const label = { anchor: position.clone(), width: 0, height: 0, fontSize, emphasis, setText }
  sprite.userData.gaugeLabel = label
  function setText(value: string) {
    if (sprite.userData.text === value) return
    ctx.font = font
    const contentWidth = Math.min(canvas.width, Math.ceil(ctx.measureText(value).width + 28))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(8, 11, 17, 0.95)'
    ctx.fillStyle = color
    if (emphasis) {
      ctx.font = '600 28px "Microsoft YaHei", Arial, sans-serif'
      ctx.strokeText('太阳高度角', contentWidth / 2, 22)
      ctx.fillText('太阳高度角', contentWidth / 2, 22)
    }
    ctx.font = font
    ctx.strokeText(value, contentWidth / 2, emphasis ? 76 : 34)
    ctx.fillText(value, contentWidth / 2, emphasis ? 76 : 34)
    label.width = contentWidth
    label.height = canvas.height
    sprite.userData.text = value
    texture.repeat.x = contentWidth / canvas.width
    texture.needsUpdate = true
  }
  setText(text)
  altitudeGaugeLabels.set(key, sprite)
  return sprite
}

function updateAltitudeGaugeLabels() {
  if (!camera || !altitudeAngleGroup || !lastCanvasWidth || !lastCanvasHeight) return
  camera.updateWorldMatrix(true, false)
  const width = lastCanvasWidth
  const height = lastCanvasHeight
  const worldPerPixel = 2 / (height * camera.projectionMatrix.elements[5]!)
  const placed: { x: number; y: number; width: number; height: number }[] = []
  for (const object of altitudeAngleGroup.children) {
    if (!(object instanceof THREE.Sprite) || !object.userData.gaugeLabel) continue
    const label = object.userData.gaugeLabel
    const projected = label.anchor.clone().project(camera) as THREE.Vector3
    object.visible = projected.z >= -1 && projected.z <= 1
    if (!object.visible) continue
    // Actual glyph size is 22–24 px for the angle, 15–16 px for the two reference directions.
    const fontPixels = label.emphasis ? (width < 420 ? 22 : 24) : (width < 420 ? 15 : 16)
    const pixelsPerTexel = Math.min(fontPixels / label.fontSize, Math.max(1, width - 20) / label.width)
    const boxWidth = label.width * pixelsPerTexel
    const boxHeight = label.height * pixelsPerTexel
    object.scale.set(boxWidth * worldPerPixel, boxHeight * worldPerPixel, 1)
    const x = clamp((projected.x + 1) * width / 2, boxWidth / 2 + 8, width - boxWidth / 2 - 8)
    const anchorY = (1 - projected.y) * height / 2 - (label.emphasis ? 18 : 8)
    let y = clamp(anchorY, boxHeight / 2 + 8, height - boxHeight / 2 - 8)
    for (const offset of [0, -34, 34, -68, 68, -102, 102]) {
      y = clamp(anchorY + offset, boxHeight / 2 + 8, height - boxHeight / 2 - 8)
      if (!placed.some(box => Math.abs(x - box.x) < (boxWidth + box.width) / 2 + 6 && Math.abs(y - box.y) < (boxHeight + box.height) / 2 + 6)) break
    }
    placed.push({ x, y, width: boxWidth, height: boxHeight })
    object.position.set(x / width * 2 - 1, 1 - y / height * 2, projected.z).unproject(camera)
  }
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

function shouldUseSafeRenderMode() {
  if (typeof navigator === 'undefined') return false

  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua)
  const isMobileWebView = /; wv\)|Version\/\d+.*Mobile/i.test(ua)

  return isIOS || isAndroidTablet || isMobileWebView
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

function formatHour(v: number) {
  return `${v.toFixed(1)}小时`
}

function getSolarViewportMode(width: number, height: number) {
  const aspect = width / Math.max(1, height)
  if (width < 580 || height < 380) return 'veryCompact'
  if (width < 720 || height < 430 || aspect > 1.72) return 'compact'
  return 'normal'
}

function fitCameraToSolarViewport(width: number, height: number, reset = false) {
  if (!camera || !controls) return

  const mode = getSolarViewportMode(width, height)
  const compact = mode === 'compact'
  const veryCompact = mode === 'veryCompact'
  const target = southFacingSolarCameraTarget(mode)
  const position = southFacingSolarCameraPosition(mode)

  camera.fov = veryCompact ? 56 : compact ? 53 : 46
  const verticalHalfAngle = degToRad(camera.fov / 2)
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * width / Math.max(1, height))
  const fitDistance = (SKY_RADIUS + 0.6) / Math.sin(Math.min(verticalHalfAngle, horizontalHalfAngle))
  if (reset || !lastCameraFitDistance) {
    controls.target.copy(target)
    camera.position.copy(position.sub(target).normalize().multiplyScalar(fitDistance).add(target))
  } else {
    // 分栏拖动只按视角变化缩放取景距离，保留用户已经旋转的方向和缩放比例。
    camera.position.sub(controls.target).multiplyScalar(fitDistance / lastCameraFitDistance).add(controls.target)
  }
  lastCameraFitDistance = fitDistance
  controls.maxDistance = Math.max(32, fitDistance * 1.8)
  camera.far = Math.max(160, fitDistance * 2.4)
  camera.lookAt(controls.target)
  camera.updateProjectionMatrix()
  controls.update()
}

function requestSolarResize(force = false) {
  pendingResizeForce = pendingResizeForce || force

  if (force) {
    if (resizeRaf) cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0
      const shouldForce = pendingResizeForce
      pendingResizeForce = false
      resize(shouldForce)
    })
    return
  }

  // 拖拽页面窗口 / 平板浏览器地址栏变化时，ResizeObserver 会连续触发。
  // 不要每一帧都 renderer.setSize + 重置相机；等尺寸稳定后再做一次 WebGL resize。
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    resizeTimer = 0
    const shouldForce = pendingResizeForce
    pendingResizeForce = false
    resize(shouldForce)
  }, 140)

  if (resizeFinalTimer) window.clearTimeout(resizeFinalTimer)
  resizeFinalTimer = window.setTimeout(() => {
    resizeFinalTimer = 0
    pendingResizeForce = false
    resize(true)
  }, 320)
}

function resize(force = false) {
  if (!canvasWrapRef.value || !renderer || !camera) return

  const rect = canvasWrapRef.value.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width || canvasWrapRef.value.clientWidth || 1))
  const height = Math.max(1, Math.round(rect.height || canvasWrapRef.value.clientHeight || 1))

  const widthDelta = Math.abs(width - lastCanvasWidth)
  const heightDelta = Math.abs(height - lastCanvasHeight)
  if (!force && widthDelta < 2 && heightDelta < 2) return

  lastCanvasWidth = width
  lastCanvasHeight = height

  camera.aspect = width / Math.max(1, height)
  fitCameraToSolarViewport(width, height)

  // 这里必须 updateStyle=true，并且同步 CSS 尺寸。
  // 但 resize 已做防抖，避免拖拽页面窗口时连续 setSize 造成 sun 场景闪烁。
  renderer.setSize(width, height, true)
  const canvas = renderer.domElement
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
}

function animate() {
  if (sceneDisposed || mountedDisposed) return
  // 每帧只“检查”尺寸，只有 width / height 真的变了才 renderer.setSize。
  // 这样拖拽页面窗口时画布能连续跟随容器，又不会每帧无脑重建 drawingBuffer。
  resize(false)
  controls?.update()
  updateAltitudeGaugeLabels()
  renderer?.render(scene, camera)
  animationId = requestAnimationFrame(animate)
}

function disposeScene() {
  if (sceneDisposed) return
  sceneDisposed = true
  if (animationId) cancelAnimationFrame(animationId)
  animationId = 0
  // Helper groups share the same ownership rules as the remaining scene. Empty them
  // before calling helper disposal, which would otherwise dispose Sprite/Arrow quads.
  if (sundialGuide) clearGroup(sundialGuide.group)
  if (sundialModel) clearGroup(sundialModel.group)
  dayNightSky?.dispose()
  dayNightSky = null
  sundialGuide?.dispose()
  sundialGuide = null
  sundialModel?.dispose()
  sundialModel = null
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = 0
  }
  if (resizeTimer) {
    window.clearTimeout(resizeTimer)
    resizeTimer = 0
  }
  if (resizeFinalTimer) {
    window.clearTimeout(resizeFinalTimer)
    resizeFinalTimer = 0
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  controls?.dispose()
  if (scene) {
    // Below the horizon these labels are detached but still owned by this component.
    altitudeGaugeLabels.forEach(label => { if (!label.parent) scene.add(label) })
    clearObjectChildren(scene)
  }
  altitudeGaugeLabels.clear()
  streetLightItems.length = windowLightItems.length = trafficLightItems.length = cityRoadMaterials.length = cityClockItems.length = treeMeshes.length = 0
  if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
  renderer?.dispose()
  renderer?.forceContextLoss()
}
</script>

<style scoped>
.sun-lite {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  container-name: solar-scene;
  container-type: inline-size;
  overflow: hidden;
  background: #080b11;
}

.canvas-wrap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: contain;
}

.scene-title {
  display: none;
}

.legend-panel {
  position: absolute;
  left: 16px;
  bottom: var(--scene-bottom-inset, 16px);
  z-index: 6;
  width: 190px;
  border: 1px solid rgba(204, 213, 221, 0.24);
  border-radius: 14px;
  padding: 10px;
  background: rgba(19, 22, 28, 0.7);
  backdrop-filter: blur(18px) saturate(110%);
  display: grid;
  gap: 6px;
  pointer-events: none;
}

.legend-title {
  color: #f2f2ef;
  font-size: 12px;
  font-weight: 900;
}

.legend-panel div:not(.legend-title) {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(229, 233, 238, 0.78);
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

.solar-data-panel :deep(.floating-panel-content) {
  container: solar-panel-body / size;
  overflow: hidden;
  padding: 0;
}
.solar-info-toggle {
  padding: 5px 8px;
  border: 1px solid #ddc69d30;
  border-radius: 7px;
  background: #ddc69d0b;
  color: #e0cead;
  font: inherit;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.solar-info-toggle:hover,
.solar-info-toggle[aria-pressed="true"] { background: #ddc69d20; color: #fff0d6; }
.solar-info-toggle:focus-visible,
.sundial-guide-control button:focus-visible { outline: 2px solid #ddc69d; outline-offset: 2px; }
.solar-readout {
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  padding: 10px 12px 16px;
  color: #edf0f2;
  font-variant-numeric: tabular-nums;
}
.solar-data-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 8px;
  height: 100%;
  margin: 0;
}
.solar-data-grid > div {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid #ffffff0e;
  border-radius: 10px;
  background: #ffffff04;
}
.solar-data-grid dt { display: flex; align-items: center; gap: 6px; color: #aebac3; font-size: 11px; line-height: 1.3; }
.solar-data-grid dd { margin: 0; color: #e5eaf0; font-size: 19px; font-weight: 600; line-height: 1.2; white-space: nowrap; }
.solar-data-grid .solar-metric-altitude { background: linear-gradient(125deg, #dcc29416, #dcc29404); border-color: #dcc29424; }
.solar-metric-altitude dd { color: #f0d6a2; font-size: 23px; }
.solar-data-grid .solar-metric-azimuth { background: linear-gradient(125deg, #a0c9da13, #a0c9da03); border-color: #a0c9da20; }
.solar-metric-azimuth dd { color: #b9dce7; font-size: 23px; }
.solar-time-dot { width: 5px; height: 5px; border-radius: 50%; flex: none; }
.sunrise-dot { background: #e4c38c; }
.sunset-dot { background: #b2bfd9; }
.solar-sundial-info { padding: 4px 2px; }
.sundial-notice { display: grid; gap: 9px; margin: 0; font-size: 12px; line-height: 1.6; }
.sundial-notice b { color: #ecd9b8; font-size: 14px; }
.sundial-notice span { color: #bcc8d1; }
.sundial-guide-control { margin-top: 14px; padding-top: 12px; border-top: 1px solid #ffffff12; font-size: 11px; }
.sundial-guide-control button { padding: 6px 10px; border: 1px solid #ddc69d30; border-radius: 7px; background: #ddc69d10; color: #e8d8b9; font: inherit; cursor: pointer; }
.sundial-guide-control p { margin: 8px 0 0; color: #b7c1cb; line-height: 1.5; }
@container solar-panel-body (max-width: 330px) {
  .solar-data-grid > div { padding-inline: 10px; }
  .solar-data-grid dd { font-size: 17px; }
  .solar-metric-altitude dd, .solar-metric-azimuth dd { font-size: 21px; }
}
@container solar-panel-body (max-height: 205px) {
  .solar-readout { padding: 7px 10px 14px; }
  .solar-data-grid { gap: 5px; }
  .solar-data-grid > div { gap: 2px; padding: 4px 9px; border-radius: 7px; }
  .solar-data-grid dt { font-size: 10px; line-height: 12px; }
  .solar-data-grid dd, .solar-metric-altitude dd, .solar-metric-azimuth dd { font-size: 16px; line-height: 19px; }
  .solar-sundial-info { padding: 0; }
  .sundial-notice { gap: 4px; font-size: 11px; line-height: 1.5; }
  .sundial-notice b { font-size: 12px; }
  .sundial-guide-control { margin-top: 8px; padding-top: 8px; }
  .sundial-guide-control button { padding: 4px 8px; }
  .sundial-guide-control p { margin-top: 5px; }
}
/* v5：小容器下把太阳视运动场景整体拉远并居中；DOM 本身不再产生横向裁切 */
.canvas-wrap canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}


/* v6：小容器下让太阳视运动画布按容器居中铺满，不产生内部偏移。 */
.sun-lite,
.canvas-wrap {
  min-width: 0;
  min-height: 0;
}

.canvas-wrap canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}


/* v10：改为 render loop 每帧检查容器尺寸；只有尺寸变化时才 setSize，避免 ResizeObserver 抖动。 */
:deep(.sun-lite-canvas) {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
  touch-action: none !important;
  -webkit-user-select: none !important;
  user-select: none !important;
}

@supports (-webkit-touch-callout: none) {
  .legend-panel {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    background: rgba(19, 22, 28, 0.88);
  }
}

</style>
