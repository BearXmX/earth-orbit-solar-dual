<template>
  <div class="earth-orbit-lab" :class="{ 'is-solar-open': isAdvanced && solarVisible }">
    <header class="lab-header">
      <div class="brand">
        <div class="brand-sun"></div>
        <div>
          <div class="brand-sub">地球运动互动实验室</div>
          <div class="brand-title-row">
            <h1>地球日夜变化与四季交替</h1>
            <span class="edition-tag" :class="isAdvanced ? 'advanced' : 'standard'">{{ isAdvanced ? '进阶版' : '标准版' }}</span>
          </div>
        </div>
      </div>

      <div class="header-actions">
        <el-button size="small" round @click="setCamera('overview')">总览</el-button>
        <el-button size="small" round @click="setFocusCenter(focusCenter === 'sun' ? 'earth' : 'sun')">
          {{ focusCenter === 'sun' ? '地球中心' : '太阳中心' }}
        </el-button>
        <el-button size="small" round type="warning" @click="playing = !playing">
          {{ playing ? '暂停演示' : '开始演示' }}
        </el-button>
        <el-button size="small" round :type="dataPanelVisible ? 'primary' : 'default'" @click="dataPanelVisible = !dataPanelVisible">
          {{ dataPanelVisible ? '收起实时数据' : '打开实时数据' }}
        </el-button>
        <el-button size="small" round :type="formulaPanelVisible ? 'primary' : 'default'" @click="formulaPanelVisible = !formulaPanelVisible">
          {{ formulaPanelVisible ? '收起公式面板' : '打开公式面板' }}
        </el-button>
        <el-button size="small" round :type="legendVisible ? 'primary' : 'default'" @click="legendVisible = !legendVisible">
          {{ legendVisible ? '隐藏图例' : '显示图例' }}
        </el-button>

        <el-button size="small" round :type="miniCameraVisible ? 'primary' : 'default'" @click="miniCameraVisible = !miniCameraVisible">
          {{ miniCameraVisible ? '隐藏副相机' : '显示副相机' }}
        </el-button>
        <el-button v-if="isAdvanced" size="small" round type="primary" :class="{ active: solarVisible }" @click="solarVisible = !solarVisible">
          {{ solarVisible ? '收起联动' : '太阳视运动联动' }}
        </el-button>
      </div>
    </header>

    <main class="page">
      <aside class="left-panel">
        <section class="panel-card control-center-card">
          <div class="panel-title"><i></i><span>控制中心</span></div>
          <div class="control-center-grid">
            <el-button size="small" :type="focusCenter === 'sun' ? 'primary' : 'default'" @click="setFocusCenter('sun')">太阳中心</el-button>
            <el-button size="small" :type="focusCenter === 'earth' ? 'primary' : 'default'" @click="setFocusCenter('earth')">地球中心</el-button>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>视图模式</span></div>
          <div class="button-grid two">
            <el-button size="small" @click="setCamera('point')">锁定点位</el-button>
            <el-button size="small" @click="setCamera('north')">北极俯视</el-button>
            <el-button size="small" @click="setCamera('ecliptic')">黄道面</el-button>
            <el-button size="small" @click="setCamera('overview')">自由视角</el-button>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>演示控制</span></div>

          <div class="mini-control-grid">
            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>自动演示速度</span>
                <b>{{ playSpeed.toFixed(1) }}x</b>
              </div>
              <el-slider v-model="playSpeed" :min="0.2" :max="20" :step="0.5" :show-tooltip="false" />
            </div>

            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>自转位置 / 地方太阳时</span>
                <b>{{ formatClock(localSolarMinutes) }}</b>
              </div>
              <el-slider
                :model-value="localSolarSliderValue"
                :min="0"
                :max="1440"
                :step="5"
                :show-tooltip="false"
                @input="handleLocalSolarSliderInput"
              />
              <div class="quick-time-row">
                <el-button size="small" round @click="jumpToSunrise">日出</el-button>
                <el-button size="small" round @click="setLocalSolarTime(12)">正午</el-button>
                <el-button size="small" round @click="jumpToSunset">日落</el-button>
              </div>
            </div>

            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>公转位置 / 节气日期</span>
                <b>{{ formatOrbitDayLabel(orbitDay) }}</b>
              </div>
              <el-slider v-model="orbitDay" :min="1" :max="365" :step="1" :show-tooltip="false" />
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>节气</span></div>
          <div class="button-grid four">
            <el-button v-for="term in terms" :key="term.name" size="small" :type="isTermActive(term) ? 'warning' : 'default'" @click="setTerm(term)">
              {{ term.name }}
            </el-button>
          </div>
          <div class="term-compare-tip">
            <b>对比节气</b>
            <span>{{ seasonCompareTip }}</span>
          </div>
        </section>

        <section class="panel-card lesson-preset-card">
          <div class="panel-title"><i></i><span>课堂预设</span></div>
          <div class="button-grid two">
            <el-button size="small" @click="applyLessonPreset('beijingSummerNoon')">北京夏至正午</el-button>
            <el-button size="small" @click="applyLessonPreset('beijingWinterNoon')">北京冬至正午</el-button>
            <el-button size="small" @click="applyLessonPreset('equatorEquinoxNoon')">赤道春分正午</el-button>
            <el-button size="small" @click="applyLessonPreset('arcticSummerNoon')">北极圈夏至</el-button>
            <el-button size="small" @click="applyLessonPreset('arcticWinterNoon')">北极圈冬至</el-button>
          </div>
          <div class="misconception-tip">
            <b>距离误区</b>
            <span>{{ distanceMisconceptionTip }}</span>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>观测点</span></div>

          <div class="city-button-grid">
            <el-button size="small" :type="cityKey === '' ? 'warning' : 'default'" @click="selectCustomPoint"> 自选点 </el-button>
            <el-button
              v-for="city in cities"
              :key="city.key"
              size="small"
              :type="cityKey === city.key ? 'primary' : 'default'"
              @click="selectCity(city)"
            >
              {{ city.name }}
            </el-button>
          </div>

          <div class="location-card">
            <b>{{ selectedPoint.name }}</b>
            <span>{{ formatLat(selectedPoint.lat) }} · {{ formatLng(selectedPoint.lng) }}</span>
            <em>激活自选点后，轻点地球表面重新定位</em>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>显示图层</span></div>

          <div class="layer-grid">
            <el-button size="small" :type="layers.longitudeLines ? 'primary' : 'default'" @click="layers.longitudeLines = !layers.longitudeLines"
              >经度线</el-button
            >
            <el-button size="small" :type="layers.latitudeLines ? 'primary' : 'default'" @click="layers.latitudeLines = !layers.latitudeLines"
              >纬度线</el-button
            >
            <el-button size="small" :type="layers.longitudeLabels ? 'primary' : 'default'" @click="layers.longitudeLabels = !layers.longitudeLabels"
              >经度标注</el-button
            >
            <el-button size="small" :type="layers.latitudeLabels ? 'primary' : 'default'" @click="layers.latitudeLabels = !layers.latitudeLabels"
              >纬度标注</el-button
            >
            <el-button
              size="small"
              :type="layers.latitudeNightArc ? 'primary' : 'default'"
              @click="layers.latitudeNightArc = !layers.latitudeNightArc"
              >纬线夜弧</el-button
            >
            <el-button size="small" :type="layers.terminator ? 'primary' : 'default'" @click="layers.terminator = !layers.terminator"
              >晨昏线</el-button
            >
            <el-button size="small" :type="layers.sunRays ? 'primary' : 'default'" @click="layers.sunRays = !layers.sunRays">太阳光</el-button>
            <el-button size="small" :type="layers.equator ? 'primary' : 'default'" @click="layers.equator = !layers.equator">赤道面</el-button>
            <el-button size="small" :type="layers.ecliptic ? 'primary' : 'default'" @click="layers.ecliptic = !layers.ecliptic">黄道面</el-button>
            <el-button size="small" :type="layers.tiltAngle ? 'primary' : 'default'" @click="layers.tiltAngle = !layers.tiltAngle"
              >夹角标注</el-button
            >
            <el-button size="small" :type="layers.zones ? 'primary' : 'default'" @click="layers.zones = !layers.zones">地球五带</el-button>
            <el-button size="small" :type="layers.tropics ? 'primary' : 'default'" @click="layers.tropics = !layers.tropics">回归线</el-button>
            <el-button size="small" :type="layers.orbit ? 'primary' : 'default'" @click="layers.orbit = !layers.orbit">公转轨道</el-button>
            <el-button size="small" :type="layers.subsolar ? 'primary' : 'default'" @click="layers.subsolar = !layers.subsolar">直射点</el-button>
            <el-button size="small" :type="layers.axisArrow ? 'primary' : 'default'" @click="layers.axisArrow = !layers.axisArrow"
              >地轴箭头</el-button
            >
            <el-button size="small" :type="layers.orbitDirection ? 'primary' : 'default'" @click="layers.orbitDirection = !layers.orbitDirection"
              >公转方向</el-button
            >
            <el-button
              size="small"
              :type="layers.rotationDirection ? 'primary' : 'default'"
              @click="layers.rotationDirection = !layers.rotationDirection"
              >自转方向</el-button
            >
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>光线控制</span></div>
          <div class="mini-control-grid light-control-grid">
            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>太阳光线数量</span>
                <b>{{ rayCount }} 条</b>
              </div>
              <el-slider v-model="rayCount" :min="1" :max="7" :step="2" :show-tooltip="false" />
            </div>

            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>光照强度</span>
                <b>{{ lightIntensity.toFixed(1) }}</b>
              </div>
              <el-slider v-model="lightIntensity" :min="0.4" :max="2.6" :step="0.1" :show-tooltip="false" />
            </div>

            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>夜景底图亮度</span>
                <b>{{ nightBrightness.toFixed(1) }}</b>
              </div>
              <el-slider v-model="nightBrightness" :min="0.8" :max="2.4" :step="0.1" :show-tooltip="false" />
            </div>

            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>城市灯光强度</span>
                <b>{{ cityLightStrength.toFixed(1) }}</b>
              </div>
              <el-slider v-model="cityLightStrength" :min="1.2" :max="4" :step="0.1" :show-tooltip="false" />
            </div>
          </div>
        </section>
      </aside>

      <section class="stage-zone" :class="{ split: isAdvanced && solarVisible }">
        <div class="world-stage">
          <div ref="earthRef" class="canvas-host"></div>

          <div class="floating-card observer-card" v-show="dataPanelVisible">
            <div class="float-head">
              <b>观测点实时数据</b>
              <span>{{ selectedPoint.name }}</span>
            </div>

            <div class="mini-data">
              <div class="highlight">
                <span>太阳高度角</span>
                <b>{{ signedDeg(solar.altitude) }}</b>
              </div>
              <div class="highlight">
                <span>昼夜状态</span>
                <b>{{ solar.pointStatusText }}</b>
              </div>
              <div>
                <span>观测点经纬度</span>
                <b>{{ formatLat(selectedPoint.lat) }} · {{ formatLng(selectedPoint.lng) }}</b>
              </div>
              <div>
                <span>昼长</span>
                <b>{{ solar.dayLengthText }}</b>
              </div>
              <div>
                <span>日出 / 日落</span>
                <b>{{ solar.sunriseText }} / {{ solar.sunsetText }}</b>
              </div>
              <div>
                <span>太阳直射点</span>
                <b>{{ formatLat(solar.subsolarLat) }}</b>
              </div>
              <div>
                <span>地方太阳时</span>
                <b>{{ solar.solarTimeText }}</b>
              </div>
              <div class="highlight">
                <span>正午太阳高度</span>
                <b>{{ signedDeg(solar.noonAltitude) }}</b>
              </div>
            </div>

            <div class="day-night-card">
              <div class="day-night-head">
                <b>昼夜比例</b>
                <span>白昼 {{ dayNightRatio.dayText }} / 黑夜 {{ dayNightRatio.nightText }}</span>
              </div>
              <div class="day-night-bar">
                <i class="day" :style="{ width: `${dayNightRatio.dayPercent}%` }"></i>
                <i class="night" :style="{ width: `${dayNightRatio.nightPercent}%` }"></i>
              </div>
              <div class="day-night-axis">
                <span>0时</span>
                <span>12时</span>
                <span>24时</span>
              </div>
            </div>

            <div class="observer-subsolar-chart">
              <div class="day-night-head">
                <b>直射点纬度年变化</b>
                <span>当前 {{ signedDeg(solar.declination) }}</span>
              </div>
              <svg class="subsolar-chart" viewBox="0 0 280 142" preserveAspectRatio="none">
                <line
                  v-for="line in subsolarChartGridLines"
                  :key="line.label"
                  x1="34"
                  x2="268"
                  :y1="line.y"
                  :y2="line.y"
                  class="chart-grid-line"
                  :class="line.main ? 'main' : ''"
                />
                <text v-for="line in subsolarChartGridLines" :key="`${line.label}-text`" x="4" :y="line.y + 3" class="chart-y-label">
                  {{ line.label }}
                </text>
                <polyline :points="subsolarTrendLine" class="chart-trend-line" />
                <circle :cx="currentSubsolarChartPoint.x" :cy="currentSubsolarChartPoint.y" r="4" class="chart-current-dot" />
                <text :x="currentSubsolarChartPoint.x + 7" :y="currentSubsolarChartPoint.y - 7" class="chart-current-text">当前</text>
                <text x="34" y="137" class="chart-x-label">1月</text>
                <text x="146" y="137" class="chart-x-label">年中</text>
                <text x="246" y="137" class="chart-x-label">12月</text>
              </svg>
            </div>
          </div>

          <div class="floating-card formula-card" v-show="formulaPanelVisible">
            <div class="float-head">
              <b>动态公式演示</b>
              <span>实时参数代入</span>
            </div>
            <div class="formula-list">
              <div v-for="item in formulaRows" :key="item.name" class="formula-line">
                <span>{{ item.name }}</span>
                <p class="formula-desc">{{ item.desc }}</p>
                <code class="formula-real">{{ item.formula }}</code>
                <code>{{ item.dynamic }}</code>
              </div>
            </div>
          </div>

          <div class="floating-card legend-card" v-show="legendVisible">
            <div class="float-head">
              <b>图例</b>
              <span>观察辅助</span>
            </div>
            <div class="legend-list">
              <div class="legend-item">
                <i class="legend-dot observer"></i>
                <span>观测点</span>
              </div>
              <div class="legend-item">
                <i class="legend-line dawn"></i>
                <span>晨线：进入白昼</span>
              </div>
              <div class="legend-item">
                <i class="legend-line dusk"></i>
                <span>昏线：进入黑夜</span>
              </div>
            </div>
          </div>

          <div ref="miniCameraUiRef" class="mini-camera-ui" v-show="miniCameraVisible">
            <div ref="miniCameraCanvasRef" class="mini-camera-canvas-host"></div>
            <div class="mini-camera-select-row" @pointerdown.stop @click.stop @wheel.stop>
              <el-select v-model="miniCameraMode" size="small" class="mini-camera-select" popper-class="mini-camera-select-popper">
                <el-option v-for="item in miniCameraModes" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
          </div>

          <!--           <div class="floating-card tip-card">
            <div class="float-head">
              <b>交互提示</b>
              <span>自由观察</span>
            </div>
            <p>太阳固定在中心，地球沿轨道公转；地球自西向东自转。左键拖动旋转视角，滚轮缩放，轻点地球选点。</p>
          </div> -->
        </div>

        <div v-if="isAdvanced && solarVisible" class="solar-lite-shell">
          <div class="solar-top">
            <div>
              <b>太阳视运动联动观察窗</b>
              <span>{{ selectedPoint.name }} · {{ formatOrbitDayLabel(dayNo) }} · {{ solar.solarTimeText }}</span>
            </div>
          </div>

          <SunLite
            class="solar-component"
            :latitude="selectedPoint.lat"
            :longitude="selectedPoint.lng"
            :day-of-year="dayNo"
            :solar-time="solar.solarTimeValue"
            :declination="solar.declination"
            :altitude="solar.altitude"
            :azimuth="solar.azimuth"
            :sunrise-text="solar.sunriseText"
            :sunset-text="solar.sunsetText"
            :day-length-text="solar.dayLengthText"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import earthTextureDataUrl from '@/assets/image/Material.002_diffuse.jpg?inline'
import earthNightTextureDataUrl from '@/assets/image/Earth_emissive.jpg?inline'
import sunTextureDataUrl from '@/assets/image/sun.png?inline'
import SunLite from './sun.vue'

type FocusCenter = 'sun' | 'earth'
type CameraMode = 'overview' | 'north' | 'ecliptic' | 'point'
type LessonPresetKey = 'beijingSummerNoon' | 'beijingWinterNoon' | 'equatorEquinoxNoon' | 'arcticSummerNoon' | 'arcticWinterNoon'
type MiniCameraMode = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

interface Term {
  name: string
  date: string
}

interface City {
  key: string
  name: string
  lat: number
  lng: number
}

const isAdvanced = computed(() => import.meta.env.DEV || String(import.meta.env.VITE_APP_EDITION || 'advanced') !== 'standard')

const earthRef = ref<HTMLDivElement | null>(null)
const miniCameraUiRef = ref<HTMLDivElement | null>(null)
const miniCameraCanvasRef = ref<HTMLDivElement | null>(null)

const dateValue = ref('2026-06-21')
const utcMinutes = ref(4 * 60)
const playSpeed = ref(10)
const playing = ref(false)
const focusCenter = ref<FocusCenter>('sun')
const activeCameraMode = ref<CameraMode>('overview')
const solarVisible = ref(false)
const cityKey = ref('beijing')
const rayCount = ref(3)
const lightIntensity = ref(1.25)
const nightBrightness = ref(1.55)
const cityLightStrength = ref(2.45)

const dataPanelVisible = ref(true)
const formulaPanelVisible = ref(true)
const legendVisible = ref(true)
const subsolarChartVisible = ref(true)
const miniCameraVisible = ref(false)
const miniCameraMode = ref<MiniCameraMode>('front')

const miniCameraModes = [
  { value: 'front', label: '前·昼半球' },
  { value: 'back', label: '后·夜半球' },
  { value: 'left', label: '左·晨线' },
  { value: 'right', label: '右·昏线' },
  { value: 'top', label: '上·北极' },
  { value: 'bottom', label: '下·南极' },
] as const

const selectedPoint = reactive({
  name: '北京',
  lat: 39.9,
  lng: 116.4,
})

const layers = reactive({
  grid: true,
  longitudeLines: true,
  latitudeLines: true,
  longitudeLabels: false,
  latitudeLabels: false,
  latitudeNightArc: false,
  terminator: true,
  sunRays: true,
  equator: false,
  ecliptic: false,
  tiltAngle: false,
  zones: false,
  tropics: true,
  orbit: true,
  subsolar: true,
  axisArrow: true,
  orbitDirection: true,
  rotationDirection: true,
})

const terms: Term[] = [
  { name: '春分', date: '2026-03-20' },
  { name: '夏至', date: '2026-06-21' },
  { name: '秋分', date: '2026-09-23' },
  { name: '冬至', date: '2026-12-22' },
]

const cities: City[] = [
  { key: 'beijing', name: '北京', lat: 39.9, lng: 116.4 },
  { key: 'shanghai', name: '上海', lat: 31.23, lng: 121.47 },
  { key: 'guangzhou', name: '广州', lat: 23.13, lng: 113.26 },
  { key: 'singapore', name: '新加坡', lat: 1.35, lng: 103.82 },
  { key: 'sydney', name: '悉尼', lat: -33.87, lng: 151.21 },
  { key: 'tromso', name: '特罗姆瑟', lat: 69.65, lng: 18.96 },
  { key: 'arctic', name: '北极圈示例', lat: 66.56, lng: 0 },
]

const DEG = Math.PI / 180
const RAD = 180 / Math.PI
const EARTH_R = 0.56
const SUN_R = 0.76
const ORBIT_R = 4.05
const AXIAL_TILT = 23.44
// 极昼/极夜临界点加一点容差，避免北极圈 66.56° + 夏至赤纬 23.437° 这种浮点误差被误判成非极昼。
const POLAR_EPS = 0.0015
// 公转方向改为逆时针后，夏至位置从右侧换到左侧；
// 地轴倾斜方向也必须同步取反，保证夏至北半球朝向太阳、冬至北半球背向太阳。
const AXIAL_TILT_ROTATION = -AXIAL_TILT * DEG

const ORBIT_START_DAY = 80
const ORBIT_START_THETA = -Math.PI / 2
// 从当前默认视角看，日期增加时公转应为逆时针：春分 → 夏至 → 秋分 → 冬至。
const ORBIT_DIR = -1

let earthRenderer: THREE.WebGLRenderer | null = null
let earthScene: THREE.Scene | null = null
let earthCamera: THREE.PerspectiveCamera | null = null
let miniCamera: THREE.PerspectiveCamera | null = null
let miniRenderer: THREE.WebGLRenderer | null = null
let miniResizeObserver: ResizeObserver | null = null
let lastMiniRenderTime = 0
let earthControls: OrbitControls | null = null
let orbitLayer: THREE.Group | null = null
let animatedOrbitLayer: THREE.Group | null = null
let dynamicTerminatorGroup: THREE.Group | null = null
let dynamicDawnLine: THREE.Line | null = null
let dynamicDuskLine: THREE.Line | null = null
let latitudeLightMaterials: THREE.ShaderMaterial[] = []
let dynamicSunRayGroup: THREE.Group | null = null
let dynamicSunRayItems: Array<{ line: THREE.Line; arrow: THREE.Mesh }> = []
let dynamicSubsolarGroup: THREE.Group | null = null
let dynamicSubsolarDot: THREE.Mesh | null = null
let dynamicSubsolarRing: THREE.Mesh | null = null
let dynamicSubsolarLabel: THREE.Sprite | null = null
let dynamicSubsolarRayLine: THREE.Line | null = null
let dynamicSubsolarArrow: THREE.Mesh | null = null
let dynamicSubsolarHit: THREE.Mesh | null = null
let obliquityAngleGroup: THREE.Group | null = null
let dynamicRayCount = -1
let earthSystem: THREE.Group | null = null
let earthGuideLayer: THREE.Group | null = null
let tiltGroup: THREE.Group | null = null
let spinGroup: THREE.Group | null = null
let globeLayer: THREE.Group | null = null
let earthSphere: THREE.Mesh | null = null
let earthMaterial: THREE.ShaderMaterial | null = null
let cachedSunTexture: THREE.Texture | null = null
let earthResize: ResizeObserver | null = null
const rendererSize = new THREE.Vector2()
let earthRendererResizeDirty = true
let miniRendererResizeDirty = true
let lastEarthCssWidth = 0
let lastEarthCssHeight = 0
let lastEarthViewportFitKey = ''
let lastMiniCssWidth = 0
let lastMiniCssHeight = 0
const miniEarthPos = new THREE.Vector3()
const miniSunPos = new THREE.Vector3()
const miniAxisDir = new THREE.Vector3()
const miniSunDir = new THREE.Vector3()
const miniViewDir = new THREE.Vector3()
const miniTargetPos = new THREE.Vector3()
const miniCameraUp = new THREE.Vector3()
const miniQuat = new THREE.Quaternion()

let pointerDownAt = { x: 0, y: 0 }
const pointer = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
let raf = 0
let lastTime = 0
let autoOrbitDay = 172
let runtimeUtcMinutes = 4 * 60
let lastAutoDateSync = 0
let suppressSceneUpdate = false
let cameraTweenToken = 0
let orbitTweenToken = 0
let tweenOrbitVisualDay: number | null = null

const dateObj = computed(() => {
  const date = new Date(`${dateValue.value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? new Date('2026-06-21T00:00:00Z') : date
})

const dayNo = computed(() => dayOfYear(dateObj.value))

const orbitDay = computed({
  get: () => dayNo.value,
  set: value => setDateByDay(Math.round(value)),
})

const activeTerm = computed(() => {
  let result = terms[0]
  let min = 999
  terms.forEach(term => {
    const d = dayOfYear(new Date(`${term.date}T00:00:00Z`))
    const delta = Math.min(Math.abs(d - dayNo.value), 365 - Math.abs(d - dayNo.value))
    if (delta < min) {
      min = delta
      result = term
    }
  })
  return result
})

const seasonCompareTip = computed(() => {
  const tips: Record<string, string> = {
    春分: '春分附近：太阳直射赤道，全球昼夜接近等长，是对比夏至和冬至昼长差异的基准。',
    夏至: '夏至附近：太阳直射北回归线，北半球昼长夜短，北极圈内出现极昼。',
    秋分: '秋分附近：太阳再次直射赤道，全球昼夜接近等长，可与春分对比太阳高度变化。',
    冬至: '冬至附近：太阳直射南回归线，北半球昼短夜长，北极圈内出现极夜。',
  }
  return tips[activeTerm.value!.name] || '拖动公转位置，观察太阳直射点、昼夜长短和晨昏线倾斜方向的同步变化。'
})

const distanceMisconceptionTip = computed(
  () => '四季差异主要不是由地球离太阳远近决定，而是由地轴倾斜造成的太阳直射点移动、正午太阳高度和昼夜长短变化决定。',
)

const dayNightRatio = computed(() => {
  const info = dayLengthInfo(selectedPoint.lat, solar.value.declination)
  const dayHours = info.type === 'polar-day' ? 24 : info.type === 'polar-night' ? 0 : info.dayLength
  const nightHours = 24 - dayHours
  return {
    dayHours,
    nightHours,
    dayText: formatDuration(dayHours),
    nightText: formatDuration(nightHours),
    dayPercent: clamp((dayHours / 24) * 100, 0, 100),
    nightPercent: clamp((nightHours / 24) * 100, 0, 100),
  }
})

const formulaRows = computed(() => {
  const n = dayNo.value
  const phi = selectedPoint.lat
  const lambda = selectedPoint.lng
  const delta = solar.value.declination
  const rawDelta = rawSolarDeclination(n)
  const teachingDelta = teachingTermDeclination(n)
  const eot = equationOfTime(n)
  const solarTime = solar.value.solarTimeValue
  const hourAngle = (solarTime - 720) / 4
  const dayInfo = dayLengthInfo(phi, delta)
  const dayLengthDynamic =
    dayInfo.type === 'normal'
      ? `cosH₀=-tan(${phi.toFixed(2)}°)×tan(${delta.toFixed(1)}°)，H₀=${dayInfo.h0.toFixed(1)}°，L=2×${dayInfo.h0.toFixed(1)}÷15=${solar.value.dayLengthText}`
      : dayInfo.type === 'polar-day'
        ? `cosH₀≤-1，当前纬度进入极昼，L=${solar.value.dayLengthText}`
        : `cosH₀≥1，当前纬度进入极夜，L=${solar.value.dayLengthText}`

  return [
    {
      name: '太阳直射纬度 δ',
      desc: 'δ 表示太阳直射点所在的纬度，n 表示一年中的第几天。四个节气日按课堂教学标准校准到赤道或回归线，便于演示。',
      formula: 'δ≈23.44°×sin[360°×(284+n)/365]',
      dynamic:
        teachingDelta === null
          ? `n=${n}，δ≈23.44°×sin[360°×(284+${n})/365]=${signedDeg(delta)}`
          : `n=${n}，近似公式 δ≈${signedDeg(rawDelta)}，节气教学显示校准为 ${signedDeg(delta)}`,
    },
    {
      name: '地方太阳时 Tₛ',
      desc: 'Tₛ 表示观测点按太阳位置计算的时间，λ 是经度，E 是时差方程修正值。太阳到达当地正南或正北附近时接近 12:00。',
      formula: 'Tₛ=UTC+λ×4min+E',
      dynamic: `UTC=${formatClock(utcMinutes.value)}，λ=${lambda.toFixed(2)}°，E=${eot.toFixed(1)}min，Tₛ=${solar.value.solarTimeText}`,
    },
    {
      name: '太阳时角 ω',
      desc: 'ω 表示太阳相对当地正午的角距离。负值表示上午，0° 表示当地正午，正值表示下午。',
      formula: 'ω=(Tₛ-12:00)×15°/h',
      dynamic: `Tₛ=${solar.value.solarTimeText}，ω=(${formatClock(solarTime)}-12:00)×15°/h=${signedDeg(hourAngle)}`,
    },
    {
      name: '太阳高度角 h',
      desc: 'h 表示太阳在地平线以上的高度角。h 越大，太阳越高；h 小于 0° 时，太阳位于地平线以下。',
      formula: 'sin h=sinφ·sinδ+cosφ·cosδ·cosω',
      dynamic: `φ=${signedDeg(phi)}，δ=${signedDeg(delta)}，ω=${signedDeg(hourAngle)}，h=${signedDeg(solar.value.altitude)}`,
    },
    {
      name: '正午太阳高度 H',
      desc: 'H 表示当地正午时太阳达到的最大高度。φ 是观测点纬度，δ 是太阳直射纬度，二者越接近，正午太阳越高。',
      formula: 'H=90°-|φ-δ|',
      dynamic: `H=90°-|${phi.toFixed(2)}°-${delta.toFixed(1)}°|=${signedDeg(solar.value.noonAltitude)}`,
    },
    {
      name: '昼长 L',
      desc: 'L 表示一天中太阳位于地平线以上的时间。H₀ 是日出到正午对应的时角，用它可以换算出白昼长度。',
      formula: 'cosH₀=-tanφ·tanδ，L=2H₀/15',
      dynamic: dayLengthDynamic,
    },
  ]
})

const subsolarChartGridLines = computed(() => [
  { label: '+23.4°', y: chartY(23.44), main: false },
  { label: '0°', y: chartY(0), main: true },
  { label: '-23.4°', y: chartY(-23.44), main: false },
])

const subsolarTrendLine = computed(() => {
  const points: string[] = []
  for (let day = 1; day <= 365; day += 4) {
    points.push(`${chartX(day).toFixed(1)},${chartY(solarDeclination(day)).toFixed(1)}`)
  }
  points.push(`${chartX(365).toFixed(1)},${chartY(solarDeclination(365)).toFixed(1)}`)
  return points.join(' ')
})

const currentSubsolarChartPoint = computed(() => ({
  x: chartX(dayNo.value),
  y: chartY(solar.value.declination),
}))

const orbitAngle = computed(() => orbitThetaByDay(dayNo.value))

const solar = computed(() =>
  calcSolarData({
    date: dateObj.value,
    utcMinutes: utcMinutes.value,
    lat: selectedPoint.lat,
    lng: selectedPoint.lng,
  }),
)

const localSolarMinutes = computed({
  get: () => solar.value.solarTimeValue,
  set: value => {
    utcMinutes.value = utcFromLocalSolarMinutes(Number(value), dayNo.value)
  },
})

const localSolarSliderValue = computed(() => {
  const value = localSolarMinutes.value
  // 让滑块可以顺畅走到 24:00，避免 Element Plus Slider 在 max=1439 时把播放卡回 23:59。
  return value > 1439.5 ? 1440 : value
})

function handleLocalSolarSliderInput(value: number | number[]) {
  const raw = Array.isArray(value) ? value[0] : value
  playing.value = false

  const next = Number(raw) >= 1440 ? 0 : clamp(Number(raw), 0, 1440)
  localSolarMinutes.value = next
  runtimeUtcMinutes = utcMinutes.value
  updateAnimatedOrbitFrame(visualOrbitDay(), runtimeUtcMinutes)
}

watch([dateValue, rayCount, lightIntensity, nightBrightness, cityLightStrength, () => selectedPoint.lat, () => selectedPoint.lng], () => {
  if (!playing.value && !suppressSceneUpdate) updateEarthScene()
})

// 静态图层需要重建 Mesh。播放演示时也要立即响应，
// 否则赤道面、黄道面、地球五带、夹角标注等按钮只会改变状态，不会重新创建场景对象。
watch(
  () => [
    layers.longitudeLines,
    layers.latitudeLines,
    layers.longitudeLabels,
    layers.latitudeLabels,
    layers.equator,
    layers.ecliptic,
    layers.tiltAngle,
    layers.zones,
    layers.tropics,
    layers.orbit,
    layers.axisArrow,
    layers.orbitDirection,
    layers.rotationDirection,
  ],
  () => {
    updateEarthScene()
  },
)

// 动态图层本身由 updateAnimatedOrbitFrame 每帧更新；这里补一次，
// 确保暂停状态下切换晨昏线、太阳光、直射点时也立刻同步。
watch(
  () => [layers.terminator, layers.sunRays, layers.subsolar, layers.latitudeNightArc],
  () => {
    updateAnimatedOrbitFrame(visualOrbitDay(), runtimeUtcMinutes)
  },
)

watch(utcMinutes, value => {
  if (playing.value) return

  runtimeUtcMinutes = value
  updateAnimatedOrbitFrame(visualOrbitDay(), runtimeUtcMinutes)
})

watch(miniCameraVisible, () => {
  nextTick(() => {
    resizeMiniCameraRenderer(true)
    lastMiniRenderTime = 0
  })
})

// 太阳视运动联动开关会改变右侧舞台布局。
// 切换后必须等 DOM 尺寸稳定，再同步 WebGL drawingBuffer 和相机；
// 否则平板端容易出现“canvas 实际尺寸还按旧布局，场景中心跑到右下角”的错觉。
watch(solarVisible, async () => {
  await nextTick()
  requestAnimationFrame(() => {
    lastEarthViewportFitKey = ''
    resizeEarth(true)
    resizeMiniCameraRenderer(true)
  })
})

onMounted(async () => {
  await nextTick()
  initEarthScene()
  updateEarthScene()
  autoOrbitDay = dayNo.value
  runtimeUtcMinutes = utcMinutes.value
  lastTime = performance.now()
  animate(lastTime)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  disposeEarthScene()
})

function orbitThetaByDay(day: number) {
  return ORBIT_START_THETA + ORBIT_DIR * ((day - ORBIT_START_DAY) / 365) * Math.PI * 2
}

function orbitTangentByDay(day: number) {
  const theta = orbitThetaByDay(day)
  return new THREE.Vector3(-Math.sin(theta) * ORBIT_DIR, 0, Math.cos(theta) * ORBIT_DIR).normalize()
}

function runtimeLocalSolarMinutes(day = playing.value ? autoOrbitDay : dayNo.value) {
  return wrapMinutes(runtimeUtcMinutes + selectedPoint.lng * 4 + equationOfTime(day))
}

function utcFromLocalSolarMinutes(localMinutes: number, day = playing.value ? autoOrbitDay : dayNo.value) {
  return wrapMinutes(localMinutes - selectedPoint.lng * 4 - equationOfTime(day))
}

function visualOrbitDay() {
  const baseDay = playing.value ? autoOrbitDay : dayNo.value
  // 公转日期进度跟随界面展示的“地方太阳时”，不是 UTC。
  // 否则北京这种东经点位会在 UTC 跨日时，也就是地方太阳时早上 7 点多就提前加一天。
  return baseDay + runtimeLocalSolarMinutes(baseDay) / 1440
}

function dateFromDay(day: number) {
  // 小数日没有真正跨过 24:00 前，仍然属于当天；不能 round，round 会在中午后提前切到下一天。
  const safeDay = clamp(Math.floor(day), 1, 365)
  return new Date(Date.UTC(dateObj.value.getUTCFullYear(), 0, safeDay))
}

function initEarthScene() {
  if (!earthRef.value || earthRenderer) return

  earthScene = new THREE.Scene()
  earthScene.fog = new THREE.Fog(0x020714, 13, 36)

  earthCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  earthCamera.position.set(5.9, 3.25, 6.3)
  miniCamera = new THREE.PerspectiveCamera(42, 16 / 10, 0.05, 100)

  earthRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  earthRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
  earthRenderer.setSize(earthRef.value.clientWidth, earthRef.value.clientHeight, true)
  earthRenderer.setClearColor(0x000000, 0)

  // 关键修复：主 WebGL canvas 必须使用父容器的 CSS 尺寸。
  // 平板端 DPR 较高时，如果 setSize(..., false) 或 scoped CSS 没命中动态 canvas，
  // canvas 会按 drawingBuffer 尺寸显示，导致画布中心落到容器右下角，太阳系整体偏移。
  const earthCanvas = earthRenderer.domElement
  earthCanvas.className = 'earth-main-canvas'
  earthCanvas.style.position = 'absolute'
  earthCanvas.style.inset = '0'
  earthCanvas.style.display = 'block'
  earthCanvas.style.width = '100%'
  earthCanvas.style.height = '100%'
  earthRef.value.appendChild(earthCanvas)
  initMiniCameraRenderer()

  earthControls = new OrbitControls(earthCamera, earthRenderer.domElement)
  earthControls.enableDamping = true
  earthControls.dampingFactor = 0.07
  earthControls.enablePan = true
  earthControls.minDistance = 2.1
  earthControls.maxDistance = 16
  earthControls.target.set(0, 0, 0)
  earthControls.update()

  earthScene.add(new THREE.AmbientLight(0x8bb7ff, 0.24))
  earthScene.add(createStarField())

  orbitLayer = new THREE.Group()
  animatedOrbitLayer = new THREE.Group()
  earthSystem = new THREE.Group()
  earthGuideLayer = new THREE.Group()
  tiltGroup = new THREE.Group()
  spinGroup = new THREE.Group()
  globeLayer = new THREE.Group()

  earthScene.add(orbitLayer, animatedOrbitLayer, earthSystem)
  earthSystem.add(earthGuideLayer)
  earthSystem.add(tiltGroup)
  tiltGroup.add(spinGroup)
  spinGroup.add(globeLayer)

  const textureLoader = new THREE.TextureLoader()

  const texture = textureLoader.load(earthTextureDataUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = earthRenderer.capabilities.getMaxAnisotropy()

  const nightTexture = textureLoader.load(earthNightTextureDataUrl)
  nightTexture.colorSpace = THREE.SRGBColorSpace
  nightTexture.anisotropy = earthRenderer.capabilities.getMaxAnisotropy()

  cachedSunTexture = textureLoader.load(sunTextureDataUrl)
  cachedSunTexture.colorSpace = THREE.SRGBColorSpace
  cachedSunTexture.anisotropy = earthRenderer.capabilities.getMaxAnisotropy()

  earthMaterial = createEarthMaterial(texture, nightTexture)
  earthSphere = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 128, 128), earthMaterial)
  spinGroup.add(earthSphere)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.045, 96, 96),
    new THREE.MeshBasicMaterial({
      color: 0x63f3ff,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  )
  spinGroup.add(atmosphere)

  earthRenderer.domElement.addEventListener('pointerdown', event => {
    pointerDownAt = { x: event.clientX, y: event.clientY }
  })
  earthRenderer.domElement.addEventListener('pointerup', pickEarthPoint)

  earthResize = new ResizeObserver(resizeEarth as unknown as ResizeObserverCallback)
  earthResize.observe(earthRef.value)
  resizeEarth(true)
  setCamera('overview')
}

function updateEarthScene() {
  if (!earthScene || !orbitLayer || !earthSystem || !earthGuideLayer || !tiltGroup || !spinGroup || !globeLayer) return

  clearGroup(orbitLayer)
  clearGroup(earthGuideLayer)
  clearGroup(globeLayer)

  const theta = orbitAngle.value
  const earthPos = new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
  earthSystem.position.copy(earthPos)

  // 太阳在世界中心；地球沿轨道公转，地球本体绕自身地轴自西向东自转。
  const earthToSunWorld = earthPos.clone().multiplyScalar(-1).normalize()

  tiltGroup.rotation.z = AXIAL_TILT_ROTATION
  // 地球自西向东真实自转。直射点展示由世界空间高亮光线负责，不再强行扭转地球贴图。
  spinGroup.rotation.y = (utcMinutes.value / 1440) * Math.PI * 2

  earthMaterial?.uniforms.sunDir!.value.copy(earthToSunWorld)

  orbitLayer.add(createSun())
  orbitLayer.add(createOrbitTrack())

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2 * lightIntensity.value)
  sunLight.position.set(0, 0, 0)
  sunLight.target.position.copy(earthPos)
  orbitLayer.add(sunLight, sunLight.target)

  if (layers.ecliptic) orbitLayer.add(createEclipticPlane())

  if (obliquityAngleGroup) {
    earthSystem.remove(obliquityAngleGroup)
    clearGroup(obliquityAngleGroup)
    obliquityAngleGroup = null
  }
  if (layers.tiltAngle) {
    obliquityAngleGroup = createObliquityAngleMarker()
    earthSystem.add(obliquityAngleGroup)
  }

  if (layers.axisArrow) earthGuideLayer.add(createAxisDirectionArrow())

  const localSun = earthToSunWorld.clone().applyQuaternion(spinGroup.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize()

  // 经纬线默认展示；经度线 / 纬度线 / 经度标注 / 纬度标注可分别控制。
  if (layers.longitudeLines || layers.latitudeLines || layers.longitudeLabels || layers.latitudeLabels) globeLayer.add(createLatLngGrid())
  if (layers.equator) globeLayer.add(createEquatorPlane())
  if (layers.zones) globeLayer.add(createHeatZones())
  if (layers.rotationDirection) globeLayer.add(createRotationDirectionArrows())
  if (layers.tropics) globeLayer.add(createTropics())

  const selected = latLngToVector(selectedPoint.lat, selectedPoint.lng, EARTH_R * 1.012)
  globeLayer.add(createMarker(selected, 0x38e8ff, selectedPoint.name))

  updateAnimatedOrbitFrame(visualOrbitDay(), runtimeUtcMinutes)
  updateControlsTarget()
}

function ensureAnimatedOrbitObjects() {
  if (!animatedOrbitLayer) return

  if (!dynamicTerminatorGroup) {
    dynamicTerminatorGroup = new THREE.Group()

    dynamicDawnLine = createTerminatorHalfLine(0x38e8ff, 0.86) // 晨线：蓝色，进入白昼
    dynamicDuskLine = createTerminatorHalfLine(0xff9f1c, 0.9) // 昏线：橙色，进入黑夜

    dynamicTerminatorGroup.add(dynamicDawnLine, dynamicDuskLine)
    animatedOrbitLayer.add(dynamicTerminatorGroup)
  }

  if (!dynamicSunRayGroup) {
    dynamicSunRayGroup = new THREE.Group()
    animatedOrbitLayer.add(dynamicSunRayGroup)
  }

  if (!dynamicSubsolarGroup) {
    dynamicSubsolarGroup = new THREE.Group()

    dynamicSubsolarDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
      }),
    )

    dynamicSubsolarRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.032, 0.0035, 8, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
        depthWrite: false,
      }),
    )

    dynamicSubsolarLabel = labelSprite('直射点', '#ffd166', 0.072, new THREE.Vector3())

    dynamicSubsolarRayLine = lineNoDepth([new THREE.Vector3(), new THREE.Vector3()], 0xfff1a8, 0.92)
    dynamicSubsolarArrow = createRayArrow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0xfff1a8, 0.92)
    dynamicSubsolarHit = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
        depthWrite: false,
      }),
    )

    dynamicSubsolarGroup.add(
      dynamicSubsolarRayLine,
      dynamicSubsolarArrow,
      dynamicSubsolarHit,
      dynamicSubsolarDot,
      dynamicSubsolarRing,
      dynamicSubsolarLabel,
    )
    animatedOrbitLayer.add(dynamicSubsolarGroup)
  }
}

function createTerminatorHalfLine(color: number, opacity = 0.86) {
  const points = Array.from({ length: 97 }, () => new THREE.Vector3())
  const lineObj = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
    }),
  )
  lineObj.renderOrder = 7
  return lineObj
}

function setTerminatorLinePoints(lineObj: THREE.Line, points: THREE.Vector3[]) {
  const position = (lineObj.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    position.setXYZ(i, p.x, p.y, p.z)
  }
  position.needsUpdate = true
  ;(lineObj.geometry as THREE.BufferGeometry).computeBoundingSphere()
}

function ensureDynamicSunRays(count: number) {
  if (!dynamicSunRayGroup) return
  const total = count + 2
  if (dynamicRayCount === total && dynamicSunRayItems.length === total) return

  clearGroup(dynamicSunRayGroup)
  dynamicSunRayItems = []
  dynamicRayCount = total

  for (let i = 0; i < total; i++) {
    const isSide = i >= count
    const color = isSide ? 0xffe4a0 : 0xffd166
    const opacity = isSide ? 0.24 : 0.36
    const item = {
      line: lineNoDepth([new THREE.Vector3(), new THREE.Vector3()], color, opacity),
      arrow: createRayArrow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), color, opacity),
    }
    dynamicSunRayGroup.add(item.line, item.arrow)
    dynamicSunRayItems.push(item)
  }
}

function setLinePoints(lineObj: THREE.Line, start: THREE.Vector3, end: THREE.Vector3) {
  const position = (lineObj.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute
  position.setXYZ(0, start.x, start.y, start.z)
  position.setXYZ(1, end.x, end.y, end.z)
  position.needsUpdate = true
  ;(lineObj.geometry as THREE.BufferGeometry).computeBoundingSphere()
}

function setArrowBetween(arrow: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, tipOffset = 0.07) {
  const direction = end.clone().sub(start).normalize()
  arrow.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction))
  arrow.position.copy(end.clone().sub(direction.clone().multiplyScalar(tipOffset)))
}

function updateDynamicSunRays(earthPos: THREE.Vector3) {
  if (!dynamicSunRayGroup) return
  dynamicSunRayGroup.visible = !!layers.sunRays
  if (!layers.sunRays) return

  const dir = earthPos.clone().normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(dir, up).normalize()
  const count = Math.max(1, rayCount.value)
  const half = (count - 1) / 2

  ensureDynamicSunRays(count)

  for (let i = 0; i < count; i++) {
    const offset = (i - half) * 0.16
    const start = dir
      .clone()
      .multiplyScalar(SUN_R * 0.88)
      .add(up.clone().multiplyScalar(offset))
    const end = earthPos
      .clone()
      .sub(dir.clone().multiplyScalar(EARTH_R * 1.25))
      .add(up.clone().multiplyScalar(offset))
    const opacity = i === Math.round(half) ? 0.72 : 0.36
    const item = dynamicSunRayItems[i]
    if (!item) continue
    const isCenterRay = i === Math.round(half)
    ;(item.line.material as THREE.LineBasicMaterial).opacity = opacity
    ;(item.arrow.material as THREE.MeshBasicMaterial).opacity = opacity
    item.arrow.visible = !isCenterRay
    setLinePoints(item.line, start, end)
    if (!isCenterRay) setArrowBetween(item.arrow, start, end)
  }

  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const i = count + sideIndex
    const side = right.clone().multiplyScalar((sideIndex === 0 ? -1 : 1) * 0.2)
    const start = dir
      .clone()
      .multiplyScalar(SUN_R * 0.92)
      .add(side)
    const end = earthPos
      .clone()
      .sub(dir.clone().multiplyScalar(EARTH_R * 1.28))
      .add(side)
    const item = dynamicSunRayItems[i]
    if (!item) continue
    setLinePoints(item.line, start, end)
    setArrowBetween(item.arrow, start, end)
  }
}

function updateDynamicTerminator(earthPos: THREE.Vector3, earthToSunWorld: THREE.Vector3) {
  if (!dynamicTerminatorGroup || !dynamicDawnLine || !dynamicDuskLine) return

  dynamicTerminatorGroup.visible = !!layers.terminator
  if (!layers.terminator) return

  // 晨昏线是过地心、法线指向太阳方向的大圆，位于世界空间，不跟地球贴图自转。
  // 按地球自转方向拆成两半：
  // - 晨线：地表点随自转进入白昼，蓝色
  // - 昏线：地表点随自转进入黑夜，橙色
  const sunDir = earthToSunWorld.clone().normalize()
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(tiltGroup!.getWorldQuaternion(new THREE.Quaternion())).normalize()

  // a 是昏线半圆的中心方向，-a 是晨线半圆中心方向。
  let a = new THREE.Vector3().crossVectors(axis, sunDir)
  if (a.lengthSq() < 0.0001) a = new THREE.Vector3(1, 0, 0).cross(sunDir)
  if (a.lengthSq() < 0.0001) a = new THREE.Vector3(0, 0, 1)
  a.normalize()

  const b = new THREE.Vector3().crossVectors(sunDir, a).normalize()
  const steps = 96
  const dawnPoints: THREE.Vector3[] = []
  const duskPoints: THREE.Vector3[] = []

  // 昏线：地表点从白昼进入黑夜。
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / steps
    const dir = a
      .clone()
      .multiplyScalar(Math.cos(t))
      .add(b.clone().multiplyScalar(Math.sin(t)))
      .normalize()
    duskPoints.push(earthPos.clone().add(dir.multiplyScalar(EARTH_R * 1.012)))
  }

  // 晨线：地表点从黑夜进入白昼。
  for (let i = 0; i <= steps; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / steps
    const dir = a
      .clone()
      .multiplyScalar(Math.cos(t))
      .add(b.clone().multiplyScalar(Math.sin(t)))
      .normalize()
    dawnPoints.push(earthPos.clone().add(dir.multiplyScalar(EARTH_R * 1.014)))
  }

  setTerminatorLinePoints(dynamicDawnLine, dawnPoints)
  setTerminatorLinePoints(dynamicDuskLine, duskPoints)
}

function updateLatitudeLineLighting(earthToSunWorld: THREE.Vector3) {
  if (!latitudeLightMaterials.length) return

  latitudeLightMaterials.forEach(material => {
    material.uniforms.sunDir!.value.copy(earthToSunWorld)
    material.uniforms.nightArcEnabled!.value = layers.latitudeNightArc ? 1 : 0
  })
}

function createLightAwareLatitudeLine(points: THREE.Vector3[], options: { isEquator?: boolean } = {}) {
  const isEquator = !!options.isEquator
  const material = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(-1, 0, 0) },
      dayColor: { value: new THREE.Color(isEquator ? 0x9af5ff : 0x7dd3fc) },
      nightColor: { value: new THREE.Color(isEquator ? 0xf0abfc : 0xd946ef) },
      nightArcEnabled: { value: layers.latitudeNightArc ? 1 : 0 },
      dayOpacity: { value: isEquator ? 0.64 : 0.3 },
      nightOpacity: { value: isEquator ? 0.9 : 0.78 },
    },
    vertexShader: `
      uniform vec3 sunDir;
      varying float vLight;
      void main() {
        vec3 worldNormal = normalize(mat3(modelMatrix) * position);
        vLight = dot(worldNormal, normalize(sunDir));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 dayColor;
      uniform vec3 nightColor;
      uniform float nightArcEnabled;
      uniform float dayOpacity;
      uniform float nightOpacity;
      varying float vLight;
      void main() {
        float nightMix = (1.0 - smoothstep(-0.08, 0.12, vLight)) * nightArcEnabled;
        vec3 color = mix(dayColor, nightColor, nightMix);
        float alpha = mix(dayOpacity, nightOpacity, nightMix);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  })

  latitudeLightMaterials.push(material)
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material)
}

function updateDynamicSubsolar(earthPos: THREE.Vector3, earthToSunWorld: THREE.Vector3) {
  if (
    !dynamicSubsolarGroup ||
    !dynamicSubsolarDot ||
    !dynamicSubsolarRing ||
    !dynamicSubsolarLabel ||
    !dynamicSubsolarRayLine ||
    !dynamicSubsolarArrow ||
    !dynamicSubsolarHit
  )
    return

  dynamicSubsolarGroup.visible = !!layers.subsolar
  if (!layers.subsolar) return

  const normal = earthToSunWorld.clone().normalize()
  const subsolarWorld = earthPos.clone().add(normal.clone().multiplyScalar(EARTH_R * 1.075))
  const start = normal.clone().multiplyScalar(SUN_R * 0.94)
  const end = subsolarWorld.clone().sub(normal.clone().multiplyScalar(0.035))

  setLinePoints(dynamicSubsolarRayLine, start, end)
  setArrowBetween(dynamicSubsolarArrow, start, end)

  dynamicSubsolarHit.position.copy(subsolarWorld)
  dynamicSubsolarDot.position.copy(subsolarWorld)

  dynamicSubsolarRing.position.copy(subsolarWorld.clone().add(normal.clone().multiplyScalar(0.008)))
  dynamicSubsolarRing.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal))

  dynamicSubsolarLabel.position.copy(subsolarWorld.clone().add(normal.clone().multiplyScalar(0.14)))
}
function updateAnimatedOrbitFrame(day: number, utc = runtimeUtcMinutes) {
  if (!earthSystem || !tiltGroup || !spinGroup || !earthMaterial || !animatedOrbitLayer) return

  ensureAnimatedOrbitObjects()

  const theta = orbitThetaByDay(day)
  const earthPos = new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
  const earthToSunWorld = earthPos.clone().multiplyScalar(-1).normalize()

  earthSystem.position.copy(earthPos)

  // 北半球夏至日，北极圈应朝向太阳；冬至日应背向太阳。
  tiltGroup.rotation.z = AXIAL_TILT_ROTATION

  // 自转每帧执行，并按太阳直射经度对齐昼夜面。
  const frameSolar = calcSolarData({
    date: dateFromDay(day),
    utcMinutes: utc,
    lat: selectedPoint.lat,
    lng: selectedPoint.lng,
  })

  const invTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -AXIAL_TILT_ROTATION)
  const sunInTiltLocal = earthToSunWorld.clone().applyQuaternion(invTilt).normalize()
  const sunLngInTiltLocal = Math.atan2(-sunInTiltLocal.z, sunInTiltLocal.x) * RAD
  spinGroup.rotation.y = (sunLngInTiltLocal - frameSolar.subsolarLng) * DEG

  earthMaterial.uniforms.sunDir!.value.copy(earthToSunWorld)
  earthMaterial.uniforms.lightIntensity!.value = lightIntensity.value
  earthMaterial.uniforms.nightBrightness!.value = nightBrightness.value
  earthMaterial.uniforms.cityLightStrength!.value = cityLightStrength.value

  updateDynamicTerminator(earthPos, earthToSunWorld)
  updateLatitudeLineLighting(earthToSunWorld)
  updateDynamicSunRays(earthPos)
  updateDynamicSubsolar(earthPos, earthToSunWorld)

  if (focusCenter.value === 'earth' && earthControls) {
    earthControls.target.copy(earthPos)
  }
}

function createEarthMaterial(texture: THREE.Texture, nightTexture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      nightMap: { value: nightTexture },
      lightIntensity: { value: lightIntensity.value },
      nightBrightness: { value: nightBrightness.value },
      cityLightStrength: { value: cityLightStrength.value },
      sunDir: { value: new THREE.Vector3(-1, 0, 0) },
      nightTint: { value: new THREE.Color(0x08204a) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D nightMap;
      uniform float lightIntensity;
      uniform float nightBrightness;
      uniform float cityLightStrength;
      uniform vec3 sunDir;
      uniform vec3 nightTint;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vec3 tex = texture2D(map, vUv).rgb;
        vec3 nightLights = texture2D(nightMap, vUv).rgb;

        float light = dot(normalize(vWorldNormal), normalize(sunDir));
        float day = smoothstep(-0.04, 0.18, light);
        float night = 1.0 - smoothstep(-0.16, 0.06, light);
        float twilight = 1.0 - smoothstep(0.00, 0.18, abs(light));

        vec3 dayColor = tex * (0.52 + 0.86 * lightIntensity * max(light, 0.0));
        vec3 nightBase = tex * 0.18 * nightBrightness + nightTint * 0.42;
        vec3 cityWarm = nightLights * vec3(1.25, 1.08, 0.82);
        vec3 emissiveCity = cityWarm * cityLightStrength * night;
        vec3 nightColor = nightBase + emissiveCity;

        vec3 color = mix(nightColor, dayColor, day);
        color += vec3(1.0, 0.58, 0.18) * twilight * 0.18;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

function createSun() {
  const group = new THREE.Group()

  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_R, 64, 64),
    new THREE.MeshBasicMaterial(cachedSunTexture ? { map: cachedSunTexture, color: 0xffffff } : { color: 0xff9f1c }),
  )
  group.add(outer)

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('#ffd166'),
      color: 0xffd166,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  glow.scale.set(SUN_R * 3.35, SUN_R * 3.35, 1)
  group.add(glow)

  group.add(labelSprite('太阳', '#ffd166', 0.22, new THREE.Vector3(0, SUN_R + 0.42, 0)))
  return group
}

function createOrbitTrack() {
  const group = new THREE.Group()

  if (layers.orbit) {
    group.add(line(circlePoints(ORBIT_R, 360, 0), 0x8aa3c5, 0.42))

    const termMarks = [
      { name: '春分', day: 79, color: 0x38e8ff },
      { name: '夏至', day: 172, color: 0xffd166 },
      { name: '秋分', day: 266, color: 0xff8fb3 },
      { name: '冬至', day: 356, color: 0x8dd8ff },
    ]

    termMarks.forEach(mark => {
      const t = orbitThetaByDay(mark.day)
      const pos = new THREE.Vector3(Math.cos(t) * ORBIT_R, 0, Math.sin(t) * ORBIT_R)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 18, 18), new THREE.MeshBasicMaterial({ color: mark.color }))
      dot.position.copy(pos)
      group.add(dot)
      const labelPos = pos
        .clone()
        .add(pos.clone().normalize().multiplyScalar(0.58))
        .add(new THREE.Vector3(0, 0.34, 0))
      group.add(labelSprite(mark.name, `#${mark.color.toString(16).padStart(6, '0')}`, 0.16, labelPos))
    })
  }

  if (layers.orbitDirection) group.add(createOrbitDirectionArrows())

  const theta = orbitAngle.value
  const earthPos = new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 18, 18), new THREE.MeshBasicMaterial({ color: 0x9af5ff }))
  dot.position.copy(earthPos)
  group.add(dot)
  group.add(labelSprite('地球', '#dff8ff', 0.19, earthPos.clone().add(new THREE.Vector3(0, 0.84, 0))))
  return group
}

function createSunRays(earthPos: THREE.Vector3) {
  const group = new THREE.Group()
  const dir = earthPos.clone().normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(dir, up).normalize()
  const count = Math.max(1, rayCount.value)
  const half = (count - 1) / 2

  // 太阳直射主光线的上方、下方摆放几条平行光束；每条尾端增加箭头，指向地球受光面。
  for (let i = 0; i < count; i++) {
    const offset = (i - half) * 0.16
    const start = dir
      .clone()
      .multiplyScalar(SUN_R * 0.88)
      .add(up.clone().multiplyScalar(offset))
    const end = earthPos
      .clone()
      .sub(dir.clone().multiplyScalar(EARTH_R * 1.25))
      .add(up.clone().multiplyScalar(offset))
    const opacity = i === Math.round(half) ? 0.72 : 0.36
    group.add(line([start, end], 0xffd166, opacity))
    if (i !== Math.round(half)) group.add(createRayArrow(start, end, 0xffd166, opacity))
  }

  // 侧向辅助光束，增强“平行太阳光”感。
  for (let i = -1; i <= 1; i += 2) {
    const side = right.clone().multiplyScalar(i * 0.2)
    const start = dir
      .clone()
      .multiplyScalar(SUN_R * 0.92)
      .add(side)
    const end = earthPos
      .clone()
      .sub(dir.clone().multiplyScalar(EARTH_R * 1.28))
      .add(side)
    group.add(line([start, end], 0xffe4a0, 0.24))
    group.add(createRayArrow(start, end, 0xffe4a0, 0.24))
  }
  return group
}

function createWorldSubsolarMarker(position: THREE.Vector3, normal: THREE.Vector3) {
  const group = new THREE.Group()
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
    }),
  )
  dot.position.copy(position)
  group.add(dot)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.036, 0.0035, 8, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      depthTest: true,
      depthWrite: false,
    }),
  )
  ring.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize()))
  ring.position.copy(position.clone().add(normal.clone().multiplyScalar(0.008)))
  group.add(ring)

  group.add(labelSprite('直射点', '#ffd166', 0.078, position.clone().add(normal.clone().multiplyScalar(0.18))))
  return group
}
function createSubsolarRay(subsolarWorld: THREE.Vector3) {
  const group = new THREE.Group()
  const sunCenter = new THREE.Vector3(0, 0, 0)
  const dir = subsolarWorld.clone().sub(sunCenter).normalize()
  const start = dir.clone().multiplyScalar(SUN_R * 0.94)
  const end = subsolarWorld.clone().sub(dir.clone().multiplyScalar(0.035))

  group.add(lineNoDepth([start, end], 0xfff1a8, 0.92))
  group.add(createRayArrow(start, end, 0xfff1a8, 0.92))

  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
    }),
  )
  hit.position.copy(subsolarWorld)
  group.add(hit)
  return group
}

function createRayArrow(start: THREE.Vector3, end: THREE.Vector3, color: number, opacity = 0.7, radius = 0.045, height = 0.14, tipOffset = 0.07) {
  const direction = end.clone().sub(start).normalize()
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 18),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  )
  arrow.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction))
  arrow.position.copy(end.clone().sub(direction.clone().multiplyScalar(tipOffset)))
  return arrow
}

function createOrbitDirectionArrows() {
  const group = new THREE.Group()
  const days = [35, 125, 215, 305]

  days.forEach((day, index) => {
    const theta = orbitThetaByDay(day)
    const pos = new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
    const tangent = orbitTangentByDay(day)
    const start = pos.clone().sub(tangent.clone().multiplyScalar(0.12))
    const end = pos.clone().add(tangent.clone().multiplyScalar(0.18))
    group.add(lineNoDepth([start, end], 0x9af5ff, 0.68))
    group.add(createRayArrow(start, end, 0x9af5ff, 0.86))

    if (index === 0) {
      group.add(alwaysLabelSprite('公转方向', '#9af5ff', 0.118, pos.clone().add(new THREE.Vector3(0.1, 0.36, 0.1))))
    }
  })

  return group
}

function createAxisDirectionArrow() {
  const group = new THREE.Group()
  const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), AXIAL_TILT_ROTATION).normalize()
  const start = axis.clone().multiplyScalar(-EARTH_R * 1.34)
  const end = axis.clone().multiplyScalar(EARTH_R * 1.92)
  const lineObj = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start, end]),
    new THREE.LineBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false,
    }),
  )
  lineObj.renderOrder = 42
  group.add(lineObj)

  const northArrow = createRayArrow(axis.clone().multiplyScalar(EARTH_R * 1.2), end, 0xa5b4fc, 0.95)
  northArrow.renderOrder = 43
  group.add(northArrow)

  const southDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xa5b4fc, transparent: true, opacity: 0.88, depthTest: true, depthWrite: false }),
  )
  southDot.position.copy(start)
  southDot.renderOrder = 43
  group.add(southDot)

  const northLabel = alwaysLabelSprite('地轴指向北极星附近', '#c7d2fe', 0.082, end.clone().add(new THREE.Vector3(0.16, 0.08, 0)))
  const axisLabel = alwaysLabelSprite(
    '地轴',
    '#c7d2fe',
    0.066,
    axis
      .clone()
      .multiplyScalar(EARTH_R * 1.32)
      .add(new THREE.Vector3(0.12, -0.03, 0)),
  )
  ;[northLabel, axisLabel].forEach(sprite => {
    sprite.renderOrder = 44
    const material = sprite.material as THREE.SpriteMaterial
    material.depthTest = false
    material.depthWrite = false
  })
  group.add(northLabel, axisLabel)
  return group
}

function createSubsolarAnnualTrack() {
  const group = new THREE.Group()
  const points: THREE.Vector3[] = []

  for (let day = 1; day <= 365; day += 3) {
    const lat = solarDeclination(day)
    const lng = normalizeLng(-180 + ((day - 1) / 364) * 360)
    points.push(latLngToVector(lat, lng, EARTH_R * 1.112))
  }

  const track = line(points, 0xfff1a8, 0.92)
  track.renderOrder = 20
  group.add(track)

  const termTrackMarks = [
    { name: '春分直射赤道', day: 79, color: 0x38e8ff },
    { name: '夏至直射北回归线', day: 172, color: 0xffd166 },
    { name: '秋分直射赤道', day: 266, color: 0xff8fb3 },
    { name: '冬至直射南回归线', day: 356, color: 0x8dd8ff },
  ]

  termTrackMarks.forEach(mark => {
    const lat = solarDeclination(mark.day)
    const lng = normalizeLng(-180 + ((mark.day - 1) / 364) * 360)
    const pos = latLngToVector(lat, lng, EARTH_R * 1.128)
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 18, 14),
      new THREE.MeshBasicMaterial({ color: mark.color, transparent: true, opacity: 0.96, depthWrite: false }),
    )
    dot.position.copy(pos)
    dot.renderOrder = 21
    group.add(dot)
  })

  group.add(alwaysLabelSprite('直射点全年迁移轨迹', '#fff1a8', 0.086, latLngToVector(4, -116, EARTH_R * 1.18)))
  return group
}

function createRotationDirectionArrows() {
  const group = new THREE.Group()
  const lngList = [-150, -90, -30, 30, 90, 150]

  lngList.forEach((lng, index) => {
    const theta = lng * DEG
    const pos = latLngToVector(0, lng, EARTH_R * 1.128)
    const tangent = new THREE.Vector3(-Math.sin(theta), 0, -Math.cos(theta)).normalize()
    const start = pos.clone().sub(tangent.clone().multiplyScalar(0.032))
    const end = pos.clone().add(tangent.clone().multiplyScalar(0.078))
    group.add(lineNoDepth([start, end], 0x2ec4b6, 0.62))
    group.add(createRayArrow(start, end, 0x2ec4b6, 0.86, 0.022, 0.07, 0.034))

    if (index === 1) {
      group.add(alwaysLabelSprite('自西向东自转', '#6fffe9', 0.064, latLngToVector(10, lng, EARTH_R * 1.18)))
    }
  })

  return group
}

function createEclipticPlane() {
  const group = new THREE.Group()
  const plane = new THREE.Mesh(
    new THREE.CircleGeometry(ORBIT_R * 1.18, 180),
    new THREE.MeshBasicMaterial({
      color: 0x5b7cff,
      transparent: true,
      opacity: 0.075,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  plane.rotation.x = -Math.PI / 2
  group.add(plane)
  return group
}

function createEquatorPlane() {
  const group = new THREE.Group()
  const plane = new THREE.Mesh(
    new THREE.CircleGeometry(EARTH_R * 1.46, 128),
    new THREE.MeshBasicMaterial({
      color: 0x18f0d2,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  plane.rotation.x = -Math.PI / 2
  group.add(plane)
  return group
}

function createHeatZones() {
  const group = new THREE.Group()
  const zoneBandRadius = EARTH_R * 1.018
  const zoneBoundaryRadius = EARTH_R * 1.026
  const zoneLabelRadius = EARTH_R * 1.065
  const zones = [
    { min: 66.56, max: 89.8, text: '北寒带', color: 0x009dff, opacity: 0.52, labelLat: 76 },
    { min: 23.44, max: 66.56, text: '北温带', color: 0x00d084, opacity: 0.48, labelLat: 45 },
    { min: -23.44, max: 23.44, text: '热带', color: 0xffb000, opacity: 0.54, labelLat: 0 },
    { min: -66.56, max: -23.44, text: '南温带', color: 0x00d084, opacity: 0.48, labelLat: -45 },
    { min: -89.8, max: -66.56, text: '南寒带', color: 0x009dff, opacity: 0.52, labelLat: -76 },
  ]

  zones.forEach(zone => {
    group.add(createLatitudeBand(zone.min, zone.max, zone.color, zone.opacity, zoneBandRadius))
    group.add(
      alwaysLabelSprite(zone.text, `#${zone.color.toString(16).padStart(6, '0')}`, 0.118, latLngToVector(zone.labelLat, -132, zoneLabelRadius)),
    )
  })
  ;[-66.56, -23.44, 0, 23.44, 66.56].forEach(lat => {
    const points: THREE.Vector3[] = []
    for (let lng = -180; lng <= 180; lng += 3) points.push(latLngToVector(lat, lng, zoneBoundaryRadius))
    group.add(line(points, lat === 0 ? 0xffffff : 0xf8fbff, lat === 0 ? 0.95 : 0.78))
  })

  return group
}

function createLatitudeBand(latMin: number, latMax: number, color: number, opacity: number, radius = EARTH_R * 1.018) {
  const latSegments = 14
  const lngSegments = 180
  const vertices: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= latSegments; i++) {
    const lat = latMin + ((latMax - latMin) * i) / latSegments
    for (let j = 0; j <= lngSegments; j++) {
      const lng = -180 + (360 * j) / lngSegments
      const v = latLngToVector(lat, lng, radius)
      vertices.push(v.x, v.y, v.z)
    }
  }

  const row = lngSegments + 1
  for (let i = 0; i < latSegments; i++) {
    for (let j = 0; j < lngSegments; j++) {
      const a = i * row + j
      const b = a + row
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  )
  mesh.renderOrder = 12
  return mesh
}

function createObliquityAngleMarker() {
  const group = new THREE.Group()

  // 从地球中心出发表示黄赤交角：
  // 白色中心点为地心；蓝色线在黄道面 / 轨道面上；黄色线在赤道面上。
  // 两条线的共同起点都在地心，夹角弧线围绕地心标出 23.44°。
  const angle = AXIAL_TILT_ROTATION
  const lineLen = EARTH_R * 1.5
  const arcRadius = EARTH_R * 0.42
  const eclipticDir = new THREE.Vector3(1, 0, 0)
  const equatorDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize()

  const makeOverlayLine = (points: THREE.Vector3[], color: number, opacity = 1, width = 1) => {
    const obj = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        linewidth: width,
      }),
    )
    obj.renderOrder = 46
    return obj
  }

  const makeDashedGuide = (dir: THREE.Vector3, color: number) => {
    const points = [dir.clone().multiplyScalar(-EARTH_R * 0.28), dir.clone().multiplyScalar(lineLen)]
    return makeOverlayLine(points, color, 0.28)
  }

  const makeDot = (position: THREE.Vector3, color: number, size = 0.018, opacity = 0.98) => {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(size, 18, 14),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
      }),
    )
    dot.position.copy(position)
    dot.renderOrder = 48
    return dot
  }

  const makeLabel = (text: string, color: string, scale: number, position: THREE.Vector3) => {
    const sprite = alwaysLabelSprite(text, color, scale, position)
    sprite.renderOrder = 49
    const material = sprite.material as THREE.SpriteMaterial
    material.depthTest = false
    material.depthWrite = false
    return sprite
  }

  const center = new THREE.Vector3(0, 0, 0)
  const eclipticEnd = eclipticDir.clone().multiplyScalar(lineLen)
  const equatorEnd = equatorDir.clone().multiplyScalar(lineLen)

  group.add(makeDashedGuide(eclipticDir, 0x5b7cff))
  group.add(makeDashedGuide(equatorDir, 0xffd166))
  group.add(makeOverlayLine([center, eclipticEnd], 0x5b7cff, 1))
  group.add(makeOverlayLine([center, equatorEnd], 0xffd166, 1))

  const arc: THREE.Vector3[] = []
  for (let i = 0; i <= 56; i++) {
    const t = (angle * i) / 56
    arc.push(new THREE.Vector3(Math.cos(t) * arcRadius, Math.sin(t) * arcRadius, 0))
  }
  group.add(makeOverlayLine(arc, 0xfff1a8, 1))

  group.add(makeDot(center, 0xffffff, 0.022, 1))
  group.add(makeDot(eclipticEnd, 0x5b7cff, 0.018, 0.96))
  group.add(makeDot(equatorEnd, 0xffd166, 0.018, 0.96))

  const midAngle = angle / 2
  const degreePos = new THREE.Vector3(Math.cos(midAngle) * (arcRadius + 0.18), Math.sin(midAngle) * (arcRadius + 0.18), 0)
  group.add(makeLabel('23.44°', '#ffd166', 0.106, degreePos))
  group.add(makeLabel('黄道面 / 轨道面', '#9aa8ff', 0.074, eclipticEnd.clone().add(new THREE.Vector3(0.18, -0.07, 0))))
  group.add(makeLabel('赤道面', '#ffd166', 0.074, equatorEnd.clone().add(new THREE.Vector3(0.18, 0.08, 0))))

  return group
}

function createLatLngGrid() {
  const group = new THREE.Group()
  const radius = EARTH_R * 1.024

  latitudeLightMaterials = []

  const addGridLabel = (text: string, position: THREE.Vector3, color = '#9af5ff') => {
    const sprite = alwaysLabelSprite(text, color, 0.046, position)
    sprite.renderOrder = 18
    const material = sprite.material as THREE.SpriteMaterial
    material.depthTest = true
    material.depthWrite = false
    return sprite
  }

  // 纬线默认展示；纬度线、纬度文字、夜弧效果可以分别控制。
  for (let lat = -75; lat <= 75; lat += 15) {
    const isEquator = lat === 0

    if (layers.latitudeLines) {
      const points: THREE.Vector3[] = []
      for (let lng = -180; lng <= 180; lng += 3) points.push(latLngToVector(lat, lng, radius))
      const lineObj = createLightAwareLatitudeLine(points, { isEquator })
      lineObj.renderOrder = 12
      group.add(lineObj)
    }

    if (layers.latitudeLabels) {
      const labelPos = latLngToVector(lat, 0, EARTH_R * 1.108)
      group.add(addGridLabel(formatGridLat(lat), labelPos, isEquator ? '#ffd166' : '#9af5ff'))
    }
  }

  // 经线默认展示；经度线和经度文字可以分别控制。
  for (let lng = -180; lng < 180; lng += 15) {
    const isPrime = lng === 0

    if (layers.longitudeLines) {
      const points: THREE.Vector3[] = []
      for (let lat = -88; lat <= 88; lat += 3) points.push(latLngToVector(lat, lng, radius))
      const lineObj = line(points, isPrime ? 0x9af5ff : 0x7dd3fc, isPrime ? 0.5 : 0.22)
      lineObj.renderOrder = 11
      group.add(lineObj)
    }

    if (layers.longitudeLabels) {
      const labelPos = latLngToVector(0, lng, EARTH_R * 1.115)
      group.add(addGridLabel(formatGridLng(lng), labelPos, isPrime ? '#ffd166' : '#9af5ff'))
    }
  }

  return group
}

function formatGridLat(lat: number) {
  if (lat === 0) return '0°'
  return `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`
}

function formatGridLng(lng: number) {
  const value = normalizeLng(lng)
  if (Math.abs(value) < 0.01) return '0°'
  if (Math.abs(value) === 180) return '180°'
  return `${Math.abs(value)}°${value > 0 ? 'E' : 'W'}`
}

function createTerminator(localSun: THREE.Vector3) {
  const group = new THREE.Group()
  const up = Math.abs(localSun.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const a = new THREE.Vector3().crossVectors(localSun, up).normalize()
  const b = new THREE.Vector3().crossVectors(localSun, a).normalize()
  const points: THREE.Vector3[] = []

  for (let i = 0; i <= 260; i++) {
    const t = (i / 260) * Math.PI * 2
    points.push(
      a
        .clone()
        .multiplyScalar(Math.cos(t) * EARTH_R * 1.04)
        .add(b.clone().multiplyScalar(Math.sin(t) * EARTH_R * 1.04)),
    )
  }

  group.add(line(points, 0xffd166, 0.92))

  const twilight = new THREE.Mesh(
    new THREE.TorusGeometry(EARTH_R * 1.04, 0.014, 8, 200),
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.075,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  twilight.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), localSun.clone().normalize()))
  group.add(twilight)
  return group
}

function createTropics() {
  const group = new THREE.Group()
  const list = [
    { lat: 23.44, text: '北回归线', color: 0xffd166 },
    { lat: -23.44, text: '南回归线', color: 0xffd166 },
    { lat: 66.56, text: '北极圈', color: 0xa5b4fc },
    { lat: -66.56, text: '南极圈', color: 0xa5b4fc },
  ]

  list.forEach(item => {
    const points: THREE.Vector3[] = []
    for (let lng = -180; lng <= 180; lng += 4) points.push(latLngToVector(item.lat, lng, EARTH_R * 1.035))
    group.add(line(points, item.color, 0.56))
    group.add(labelSprite(item.text, `#${item.color.toString(16).padStart(6, '0')}`, 0.16, latLngToVector(item.lat, 130, EARTH_R * 1.15)))
  })
  return group
}

function createMarker(position: THREE.Vector3, color: number, _text: string, scaleFactor = 1) {
  const group = new THREE.Group()
  const normal = position.clone().normalize()

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.022 * scaleFactor, 20, 16),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.96,
      depthTest: true,
      depthWrite: false,
    }),
  )
  ball.position.copy(position.clone().add(normal.clone().multiplyScalar(0.008)))
  group.add(ball)

  return group
}

function pickEarthPoint(event: PointerEvent) {
  if (!earthRenderer || !earthCamera || !earthSphere) return
  // 只有先激活“自选点”，点击地球才会更新定位；默认北京/城市点不会被误点覆盖。
  if (cityKey.value !== '') return
  const moved = Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y)
  if (moved > 5) return

  const rect = earthRenderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, earthCamera)
  const hits = raycaster.intersectObject(earthSphere)
  if (!hits.length) return

  const local = hits[0]!.point.clone()
  earthSphere.worldToLocal(local)
  local.normalize()

  selectedPoint.name = '自选点'
  selectedPoint.lat = clamp(Math.asin(local.y) * RAD, -89.8, 89.8)
  selectedPoint.lng = normalizeLng(Math.atan2(-local.z, local.x) * RAD)
  cityKey.value = ''
  // 点击地球后直接刷新静态标记层，让蓝色定位小球立刻跳到新位置。
  updateEarthScene()
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function cancelCameraTween() {
  cameraTweenToken += 1
}

function animateCameraTo(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3, duration = 760) {
  if (!earthCamera || !earthControls) return

  const token = ++cameraTweenToken
  const startTime = performance.now()
  const startPos = earthCamera.position.clone()
  const startTarget = earthControls.target.clone()

  const tick = () => {
    if (token !== cameraTweenToken || !earthCamera || !earthControls) return

    const t = clamp((performance.now() - startTime) / duration, 0, 1)
    const k = easeInOutCubic(t)

    earthCamera.position.lerpVectors(startPos, targetPosition, k)
    earthControls.target.lerpVectors(startTarget, targetLookAt, k)
    earthControls.update()

    if (t < 1) requestAnimationFrame(tick)
  }

  tick()
}

function getCameraPose(mode: CameraMode) {
  if (mode === 'overview') {
    const target = new THREE.Vector3(0, 0, 0)
    return {
      focus: 'sun' as FocusCenter,
      target,
      position: new THREE.Vector3(5.9, 3.25, 6.3),
    }
  }

  if (mode === 'north') {
    const target = getEarthWorldPosition()
    return {
      focus: 'earth' as FocusCenter,
      target,
      position: target.clone().add(new THREE.Vector3(0, 3.6, 0.01)),
    }
  }

  if (mode === 'ecliptic') {
    const target = new THREE.Vector3(0, 0, 0)
    return {
      focus: 'sun' as FocusCenter,
      target,
      position: new THREE.Vector3(5.7, 0.62, 6.1),
    }
  }

  const target = getEarthWorldPosition()
  return {
    focus: 'earth' as FocusCenter,
    target,
    position: target.clone().add(new THREE.Vector3(1.7, 1.02, 2.0)),
  }
}

function setCamera(mode: CameraMode) {
  if (!earthCamera || !earthControls) return

  activeCameraMode.value = mode
  const pose = getCameraPose(mode)
  focusCenter.value = pose.focus
  animateCameraTo(pose.position, pose.target)
}

function setFocusCenter(center: FocusCenter) {
  focusCenter.value = center
  updateControlsTarget(true)
}

function updateControlsTarget(jump = false) {
  if (!earthControls || !earthCamera) return

  const target = focusCenter.value === 'sun' ? new THREE.Vector3(0, 0, 0) : getEarthWorldPosition()

  if (jump) {
    const offset = focusCenter.value === 'sun' ? new THREE.Vector3(5.9, 3.25, 6.3) : new THREE.Vector3(1.7, 1.02, 2.0)
    animateCameraTo(target.clone().add(offset), target)
    return
  }

  earthControls.target.copy(target)
  earthControls.update()
}

function getEarthWorldPosition(day = visualOrbitDay()) {
  const theta = orbitThetaByDay(day)
  return new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
}

function normalizeVisualDay(day: number) {
  let result = day
  while (result < 1) result += 365
  while (result > 366) result -= 365
  return result
}

function nearestVisualDayTarget(fromDay: number, targetDay: number) {
  let target = targetDay + runtimeUtcMinutes / 1440
  while (target - fromDay > 182.5) target -= 365
  while (target - fromDay < -182.5) target += 365
  return target
}

function animateOrbitToDay(targetDay: number, onComplete?: () => void) {
  const token = ++orbitTweenToken
  const startTime = performance.now()
  const startDay = tweenOrbitVisualDay ?? visualOrbitDay()
  const endDay = nearestVisualDayTarget(startDay, targetDay)
  const duration = 1150
  let lastEarthPos = getEarthWorldPosition(startDay)

  const tick = () => {
    if (token !== orbitTweenToken) return

    const t = clamp((performance.now() - startTime) / duration, 0, 1)
    const k = easeInOutCubic(t)
    tweenOrbitVisualDay = normalizeVisualDay(startDay + (endDay - startDay) * k)

    if (focusCenter.value === 'earth' && earthControls && earthCamera) {
      const currentEarthPos = getEarthWorldPosition(tweenOrbitVisualDay)
      const delta = currentEarthPos.clone().sub(lastEarthPos)
      earthCamera.position.add(delta)
      earthControls.target.copy(currentEarthPos)
      earthControls.update()
      lastEarthPos = currentEarthPos
    }

    if (t < 1) {
      requestAnimationFrame(tick)
    } else {
      tweenOrbitVisualDay = null
      onComplete?.()
    }
  }

  tick()
}

function animate(now: number) {
  const dt = Math.min(0.06, (now - lastTime) / 1000 || 0.016)
  lastTime = now

  if (playing.value) {
    // 公转日期由“地方太阳时”决定：界面上的自转时间从 23:59 走到 00:00，才增加一天。
    // 不能用 UTC 跨日判断，否则北京会在 UTC 00:00，也就是地方太阳时早上 7 点多提前加一天。
    const addMinutes = dt * 6 * playSpeed.value
    const currentLocalMinutes = runtimeLocalSolarMinutes(autoOrbitDay)
    const nextLocalRaw = currentLocalMinutes + addMinutes
    const passedDays = Math.floor(nextLocalRaw / 1440)
    const nextLocalMinutes = wrapMinutes(nextLocalRaw)

    if (passedDays > 0) {
      autoOrbitDay += passedDays
      while (autoOrbitDay > 365) autoOrbitDay -= 365
      setDateByDay(Math.floor(autoOrbitDay), false)
    }

    runtimeUtcMinutes = utcFromLocalSolarMinutes(nextLocalMinutes, autoOrbitDay)
    utcMinutes.value = runtimeUtcMinutes
    updateAnimatedOrbitFrame(autoOrbitDay + nextLocalMinutes / 1440, runtimeUtcMinutes)
  } else {
    updateAnimatedOrbitFrame(tweenOrbitVisualDay ?? visualOrbitDay(), runtimeUtcMinutes)
  }

  earthControls?.update()
  renderEarthFrame(now)
  raf = requestAnimationFrame(animate)
}

function initMiniCameraRenderer() {
  if (!miniCameraCanvasRef.value || miniRenderer) return

  miniRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35))
  miniRenderer.setClearColor(0x041322, 1)

  // 副相机 canvas 也必须让 CSS 尺寸严格等于外部容器。
  // 平板端 DPR 较高时，如果只改 drawingBuffer、不改 canvas CSS 尺寸，
  // 副相机场景中心会偏到右下角，现象和主场景之前一致。
  const miniCanvas = miniRenderer.domElement
  miniCanvas.className = 'mini-camera-canvas'
  miniCanvas.style.position = 'absolute'
  miniCanvas.style.inset = '0'
  miniCanvas.style.display = 'block'
  miniCanvas.style.width = '100%'
  miniCanvas.style.height = '100%'
  miniCameraCanvasRef.value.appendChild(miniCanvas)

  miniResizeObserver = new ResizeObserver(() => resizeMiniCameraRenderer())
  miniResizeObserver.observe(miniCameraCanvasRef.value)
  resizeMiniCameraRenderer(true)
}

function resizeMiniCameraRenderer(immediate = false) {
  miniRendererResizeDirty = true
  if (immediate) syncMiniRendererSize()
}

function syncMiniRendererSize() {
  if (!miniRenderer || !miniCameraCanvasRef.value || !miniCamera) return

  const width = Math.max(1, Math.floor(miniCameraCanvasRef.value.clientWidth))
  const height = Math.max(1, Math.floor(miniCameraCanvasRef.value.clientHeight))

  if (!miniRendererResizeDirty && width === lastMiniCssWidth && height === lastMiniCssHeight) return

  miniRendererResizeDirty = false
  lastMiniCssWidth = width
  lastMiniCssHeight = height

  miniRenderer.setSize(width, height, true)

  const miniCanvas = miniRenderer.domElement
  miniCanvas.style.position = 'absolute'
  miniCanvas.style.inset = '0'
  miniCanvas.style.display = 'block'
  miniCanvas.style.width = `${width}px`
  miniCanvas.style.height = `${height}px`

  miniCamera.aspect = width / Math.max(1, height)
  miniCamera.updateProjectionMatrix()
}

function renderEarthFrame(now = performance.now()) {
  if (!earthRenderer || !earthScene || !earthCamera) return

  syncEarthRendererSize()

  earthRenderer.getSize(rendererSize)
  const width = rendererSize.x
  const height = rendererSize.y

  earthRenderer.autoClear = true
  earthRenderer.setScissorTest(false)
  earthRenderer.setViewport(0, 0, width, height)
  earthRenderer.setClearColor(0x000000, 0)
  earthRenderer.render(earthScene, earthCamera)

  renderMiniCameraFrame(now)
}

function renderMiniCameraFrame(now = performance.now()) {
  if (!miniCameraVisible.value || !miniRenderer || !earthScene || !miniCamera) return

  // 副相机跟随主循环渲染，尺寸变化在当前 RAF 内提交，避免 resize 黑闪。
  lastMiniRenderTime = now
  syncMiniRendererSize()
  syncMiniCamera()
  miniRenderer.clear(true, true, true)
  miniRenderer.render(earthScene, miniCamera)
}

function syncMiniCamera(immediate = false) {
  if (!miniCamera || !earthSystem) return

  earthSystem.getWorldPosition(miniEarthPos)
  miniSunPos.set(0, 0, 0)

  const axisSource = tiltGroup || earthSystem
  axisSource.getWorldQuaternion(miniQuat)
  miniAxisDir.set(0, 1, 0).applyQuaternion(miniQuat).normalize()

  // 从地球指向太阳；前方相机放在太阳侧，看到受光半球。
  miniSunDir.copy(miniSunPos).sub(miniEarthPos).normalize()
  const distance = EARTH_R * 3.35

  switch (miniCameraMode.value) {
    case 'front':
      miniViewDir.copy(miniSunDir)
      break
    case 'back':
      miniViewDir.copy(miniSunDir).multiplyScalar(-1)
      break
    case 'left':
      miniViewDir.copy(miniSunDir).cross(miniAxisDir).normalize()
      break
    case 'right':
      miniViewDir.copy(miniAxisDir).cross(miniSunDir).normalize()
      break
    case 'top':
      miniViewDir.copy(miniAxisDir)
      break
    case 'bottom':
      miniViewDir.copy(miniAxisDir).multiplyScalar(-1)
      break
  }

  if (miniViewDir.lengthSq() < 0.0001) miniViewDir.set(0, 0, 1)
  miniTargetPos.copy(miniEarthPos).addScaledVector(miniViewDir.normalize(), distance)

  if (miniCameraMode.value === 'top' || miniCameraMode.value === 'bottom') {
    miniCameraUp.copy(miniSunDir).projectOnPlane(miniAxisDir).normalize()
    if (miniCameraUp.lengthSq() < 0.0001) miniCameraUp.set(1, 0, 0)
    miniCamera.up.copy(miniCameraUp)
  } else {
    miniTargetPos.addScaledVector(miniAxisDir, EARTH_R * 0.36)
    miniCamera.up.copy(miniAxisDir)
  }

  if (immediate || miniCamera.position.lengthSq() < 0.0001) {
    miniCamera.position.copy(miniTargetPos)
  } else {
    miniCamera.position.lerp(miniTargetPos, 0.28)
  }
  miniCamera.lookAt(miniEarthPos)
}

function termDay(term: Term) {
  return dayOfYear(new Date(`${term.date}T00:00:00Z`))
}

function isTermActive(term: Term) {
  return Math.abs(dayNo.value - termDay(term)) <= 1
}

function setLocalSolarTime(hour: number) {
  localSolarMinutes.value = clamp(hour, 0, 23.999) * 60
  runtimeUtcMinutes = utcMinutes.value
  updateAnimatedOrbitFrame(visualOrbitDay(), runtimeUtcMinutes)
}

function jumpToSunrise() {
  const dayInfo = dayLengthInfo(selectedPoint.lat, solar.value.declination)
  if (dayInfo.type !== 'normal') return
  localSolarMinutes.value = 720 - dayInfo.h0 * 4
  runtimeUtcMinutes = utcMinutes.value
  updateAnimatedOrbitFrame(visualOrbitDay(), runtimeUtcMinutes)
}

function jumpToSunset() {
  const dayInfo = dayLengthInfo(selectedPoint.lat, solar.value.declination)
  if (dayInfo.type !== 'normal') return
  localSolarMinutes.value = 720 + dayInfo.h0 * 4
  runtimeUtcMinutes = utcMinutes.value
  updateAnimatedOrbitFrame(visualOrbitDay(), runtimeUtcMinutes)
}

function applyLessonPreset(key: LessonPresetKey) {
  const presetMap: Record<LessonPresetKey, { name: string; lat: number; lng: number; date: string; cityKey: string; solarHour: number }> = {
    beijingSummerNoon: { name: '北京', lat: 39.9, lng: 116.4, date: '2026-06-21', cityKey: 'beijing', solarHour: 12 },
    beijingWinterNoon: { name: '北京', lat: 39.9, lng: 116.4, date: '2026-12-22', cityKey: 'beijing', solarHour: 12 },
    equatorEquinoxNoon: { name: '赤道观测点', lat: 0, lng: 0, date: '2026-03-20', cityKey: '', solarHour: 12 },
    arcticSummerNoon: { name: '北极圈示例', lat: 66.56, lng: 0, date: '2026-06-21', cityKey: 'arctic', solarHour: 12 },
    arcticWinterNoon: { name: '北极圈示例', lat: 66.56, lng: 0, date: '2026-12-22', cityKey: 'arctic', solarHour: 12 },
  }

  const preset = presetMap[key]
  const targetDay = dayOfYear(new Date(`${preset.date}T00:00:00Z`))

  playing.value = false
  suppressSceneUpdate = true

  cityKey.value = preset.cityKey
  selectedPoint.name = preset.name
  selectedPoint.lat = preset.lat
  selectedPoint.lng = preset.lng
  localSolarMinutes.value = preset.solarHour * 60
  runtimeUtcMinutes = utcMinutes.value

  animateOrbitToDay(targetDay, () => {
    dateValue.value = preset.date
    autoOrbitDay = targetDay
    // 日期落定后再按目标日期校准地方太阳时，避免时差方程仍按旧日期计算。
    localSolarMinutes.value = preset.solarHour * 60
    runtimeUtcMinutes = utcMinutes.value
    suppressSceneUpdate = false
    updateEarthScene()
    updateControlsTarget(true)
  })
}

function setTerm(term: Term) {
  const targetDay = dayOfYear(new Date(`${term.date}T00:00:00Z`))
  playing.value = false
  suppressSceneUpdate = true

  animateOrbitToDay(targetDay, () => {
    dateValue.value = term.date
    autoOrbitDay = targetDay
    runtimeUtcMinutes = utcMinutes.value
    suppressSceneUpdate = false
    updateEarthScene()
  })
}

function setDateByDay(day: number, syncAuto = true) {
  const safeDay = clamp(day, 1, 365)
  const date = new Date(Date.UTC(dateObj.value.getUTCFullYear(), 0, safeDay))
  dateValue.value = date.toISOString().slice(0, 10)

  if (syncAuto) {
    autoOrbitDay = safeDay
    // 手动拖动公转日期时，回到当天 0 点。
    localSolarMinutes.value = 0
    runtimeUtcMinutes = utcMinutes.value
    updateEarthScene()
  }
}

function chartX(day: number) {
  return 34 + ((clamp(day, 1, 365) - 1) / 364) * 234
}

function chartY(declination: number) {
  return 14 + ((23.44 - clamp(declination, -23.44, 23.44)) / 46.88) * 102
}

function formatOrbitDayLabel(day: number) {
  const date = new Date(Date.UTC(dateObj.value.getUTCFullYear(), 0, clamp(Math.round(day), 1, 365)))
  return `${Math.round(day)} / ${String(date.getUTCMonth() + 1).padStart(2, '0')}月${String(date.getUTCDate()).padStart(2, '0')}日`
}

function selectCustomPoint() {
  cityKey.value = ''
  selectedPoint.name = '自选点'
}

function selectCity(city: City) {
  cityKey.value = city.key
  selectedPoint.name = city.name
  selectedPoint.lat = city.lat
  selectedPoint.lng = city.lng

  // 演示播放中 watch 会跳过 updateEarthScene，
  // 所以切换城市时主动刷新一次地球表面的观测点 Mesh。
  updateEarthScene()
}

function applyCity() {
  const city = cities.find(item => item.key === cityKey.value)
  if (!city) return
  selectCity(city)
}

function resetAll() {
  dateValue.value = '2026-06-21'
  autoOrbitDay = 172
  localSolarMinutes.value = 0
  runtimeUtcMinutes = utcMinutes.value
  playSpeed.value = 10
  lightIntensity.value = 1.25
  nightBrightness.value = 1.55
  cityLightStrength.value = 2.45
  layers.equator = false
  layers.ecliptic = false
  layers.tiltAngle = false
  layers.zones = false
  layers.axisArrow = true
  layers.orbitDirection = true
  layers.rotationDirection = true
  playing.value = false
  focusCenter.value = 'sun'
  selectedPoint.name = '北京'
  selectedPoint.lat = 39.9
  selectedPoint.lng = 116.4
  cityKey.value = 'beijing'
  setCamera('overview')
}

function resizeEarth(immediate = false) {
  earthRendererResizeDirty = true
  miniRendererResizeDirty = true

  // ResizeObserver 只标记尺寸脏，不直接 setSize。
  // 真正的 WebGL drawingBuffer resize 放到 render loop 的同一帧里完成，
  // 避免窗口拖动时反复清空主画布造成闪烁。
  if (immediate) {
    syncEarthRendererSize()
    syncMiniRendererSize()
  }
}

function syncEarthRendererSize() {
  if (!earthRef.value || !earthRenderer || !earthCamera) return

  const width = Math.max(1, Math.floor(earthRef.value.clientWidth))
  const height = Math.max(1, Math.floor(earthRef.value.clientHeight))

  if (!earthRendererResizeDirty && width === lastEarthCssWidth && height === lastEarthCssHeight) return

  earthRendererResizeDirty = false
  lastEarthCssWidth = width
  lastEarthCssHeight = height

  // 关键修复：第三个参数必须为 true，让 three 同步 canvas 的 CSS 尺寸。
  // 否则高 DPR 平板端 canvas 会以更大的 drawingBuffer 尺寸参与布局，
  // 父容器裁切左上角后，场景中心就会看起来跑到右下角。
  earthRenderer.setSize(width, height, true)
  syncEarthCanvasCssSize(width, height)

  earthCamera.aspect = width / Math.max(1, height)
  earthCamera.updateProjectionMatrix()
  fitOverviewCameraToEarthViewport(width, height)
}

function syncEarthCanvasCssSize(width: number, height: number) {
  if (!earthRenderer) return

  const canvas = earthRenderer.domElement
  canvas.className = 'earth-main-canvas'
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.display = 'block'
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.style.maxWidth = '100%'
  canvas.style.maxHeight = '100%'
}

function fitOverviewCameraToEarthViewport(width: number, height: number) {
  if (!earthCamera || !earthControls) return
  if (focusCenter.value !== 'sun' || activeCameraMode.value !== 'overview') return

  const aspect = width / Math.max(1, height)
  const compact = width < 780 || height < 540
  const veryWide = aspect > 1.82
  const lowHeight = height < 500
  const key = `${compact ? 'compact' : 'normal'}-${veryWide ? 'wide' : 'std'}-${lowHeight ? 'low' : 'high'}-${Math.round(aspect * 10)}`

  // 只在容器形态发生明显变化时重置相机，避免用户正常拖拽视角时每帧被抢回。
  if (key === lastEarthViewportFitKey) return
  lastEarthViewportFitKey = key

  const position = compact || veryWide || lowHeight
    ? new THREE.Vector3(6.85, 3.85, 7.25)
    : new THREE.Vector3(5.9, 3.25, 6.3)

  earthCamera.fov = compact || lowHeight ? 46 : 42
  earthCamera.position.copy(position)
  earthControls.target.set(0, 0, 0)
  earthCamera.updateProjectionMatrix()
  earthControls.update()
}

function disposeEarthScene() {
  earthResize?.disconnect()
  earthResize = null
  earthControls?.dispose()
  earthControls = null
  miniResizeObserver?.disconnect()
  miniResizeObserver = null
  if (miniRenderer?.domElement?.parentNode) miniRenderer.domElement.parentNode.removeChild(miniRenderer.domElement)
  miniRenderer?.dispose()
  miniRenderer = null
  if (earthRenderer?.domElement?.parentNode) earthRenderer.domElement.parentNode.removeChild(earthRenderer.domElement)
  earthRenderer?.dispose()
  earthRenderer = null
  miniCamera = null
  earthScene = null
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

function createStarField() {
  const group = new THREE.Group()

  const makeStars = (count: number, radiusMin: number, radiusMax: number, size: number, opacity: number) => {
    const positions: number[] = []
    const colors: number[] = []

    for (let i = 0; i < count; i++) {
      const r = radiusMin + Math.random() * (radiusMax - radiusMin)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))

      const warm = Math.random() > 0.78
      const strong = Math.random() > 0.9
      colors.push(strong ? 1.0 : warm ? 1.0 : 0.78, strong ? 0.96 : warm ? 0.86 : 0.92, strong ? 0.82 : warm ? 0.64 : 1.0)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size,
      transparent: true,
      opacity,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    return new THREE.Points(geo, mat)
  }

  group.add(makeStars(1800, 18, 44, 0.038, 0.92))
  group.add(makeStars(280, 22, 52, 0.072, 0.96))

  const nebula = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('#38e8ff'),
      color: 0x38e8ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  nebula.position.set(-13.5, 6.2, -24)
  nebula.scale.set(14.5, 8.2, 1)
  group.add(nebula)

  const goldNebula = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('#ffd166'),
      color: 0xffd166,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  goldNebula.position.set(15.2, -4.2, -27)
  goldNebula.scale.set(11.5, 7.2, 1)
  group.add(goldNebula)

  return group
}

function line(points: THREE.Vector3[], color: number, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
}

function lineNoDepth(points: THREE.Vector3[], color: number, opacity = 1) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
    }),
  )
}

function circlePoints(radius: number, count: number, y = 0) {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(t) * radius, y, Math.sin(t) * radius))
  }
  return points
}

function latLngToVector(lat: number, lng: number, radius: number) {
  const phi = lat * DEG
  const theta = lng * DEG

  // 与 THREE.SphereGeometry 默认 UV 贴图对齐：
  // 0° 经线在 +X，90°E 在 -Z，180° 在 -X。
  // 之前用 x=sin(lng), z=cos(lng)，会整体偏转约 90°，上海会跑到非洲附近。
  return new THREE.Vector3(Math.cos(phi) * Math.cos(theta) * radius, Math.sin(phi) * radius, -Math.cos(phi) * Math.sin(theta) * radius)
}

function alwaysLabelSprite(text: string, color = '#fff', scale = 0.1, position = new THREE.Vector3()) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 24
  const paddingX = 16
  const paddingY = 8
  ctx.font = `900 ${fontSize}px "Microsoft YaHei", Arial`

  const width = Math.max(92, Math.ceil(ctx.measureText(text).width + paddingX * 2))
  const height = 52
  canvas.width = width
  canvas.height = height

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(3, 12, 25, .72)'
  roundRect(ctx, 4, 7, width - 8, height - 14, 12)
  ctx.fill()

  ctx.strokeStyle = color
  ctx.globalAlpha = 0.72
  ctx.lineWidth = 2
  roundRect(ctx, 4, 7, width - 8, height - 14, 12)
  ctx.stroke()

  ctx.globalAlpha = 1
  ctx.font = `900 ${fontSize}px "Microsoft YaHei", Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(0,0,0,.72)'
  ctx.fillStyle = color
  ctx.strokeText(text, width / 2, height / 2)
  ctx.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    }),
  )
  const aspect = width / height
  sprite.position.copy(position)
  sprite.scale.set(scale * aspect * 1.35, scale * 0.86, 1)
  return sprite
}

function labelSprite(text: string, color = '#fff', scale = 0.13, position = new THREE.Vector3()) {
  const visibleSeasonLabels = new Set(['春分', '夏至', '秋分', '冬至'])
  if (!visibleSeasonLabels.has(text)) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
      }),
    )
    sprite.visible = false
    sprite.position.copy(position)
    sprite.scale.set(0.001, 0.001, 1)
    return sprite
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 24
  const paddingX = 16
  const paddingY = 8
  ctx.font = `900 ${fontSize}px "Microsoft YaHei", Arial`

  const width = Math.max(92, Math.ceil(ctx.measureText(text).width + paddingX * 2))
  const height = 52
  canvas.width = width
  canvas.height = height

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(3, 12, 25, .72)'
  roundRect(ctx, 4, 7, width - 8, height - 14, 12)
  ctx.fill()

  ctx.strokeStyle = color
  ctx.globalAlpha = 0.72
  ctx.lineWidth = 2
  roundRect(ctx, 4, 7, width - 8, height - 14, 12)
  ctx.stroke()

  ctx.globalAlpha = 1
  ctx.font = `900 ${fontSize}px "Microsoft YaHei", Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(0,0,0,.72)'
  ctx.fillStyle = color
  ctx.strokeText(text, width / 2, height / 2)
  ctx.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    }),
  )
  const aspect = width / height
  sprite.position.copy(position)
  sprite.scale.set(scale * aspect * 1.35, scale * 0.86, 1)
  return sprite
}

function glowTexture(color = '#ffffff') {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.2, color)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
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

function calcSolarData(input: { date: Date; utcMinutes: number; lat: number; lng: number }) {
  const doy = dayOfYear(input.date)
  const declination = solarDeclination(doy)
  const eot = equationOfTime(doy)

  const subsolarLat = declination
  const subsolarLng = normalizeLng((720 - input.utcMinutes - eot) / 4)

  const localMean = wrapMinutes(input.utcMinutes + input.lng * 4)
  const solarTime = wrapMinutes(input.utcMinutes + input.lng * 4 + eot)
  const hourAngle = (solarTime - 720) / 4

  const altitude = altitudeFromHourAngle(input.lat, declination, hourAngle)
  const azimuth = azimuthFromHourAngle(input.lat, declination, hourAngle)
  const noonAltitude = 90 - Math.abs(input.lat - declination)
  const dayInfo = dayLengthInfo(input.lat, declination)

  let sunriseText = '极夜'
  let sunsetText = '极夜'
  let dayLengthText = '0小时'
  let nightLengthText = '24小时'
  let pointStatusText = altitude >= 0 ? '白天' : '夜晚'

  if (dayInfo.type === 'polar-day') {
    sunriseText = '极昼'
    sunsetText = '极昼'
    dayLengthText = '24小时'
    nightLengthText = '0小时'
    pointStatusText = '极昼'
  } else if (dayInfo.type === 'polar-night') {
    pointStatusText = '极夜'
  } else if (dayInfo.type === 'normal') {
    // 与 sun 组件 / App.vue 统一：日出日落显示地方太阳时，不再混入时差方程。
    const sunriseSolar = 720 - dayInfo.h0 * 4
    const sunsetSolar = 720 + dayInfo.h0 * 4
    sunriseText = formatClock(sunriseSolar)
    sunsetText = formatClock(sunsetSolar)
    dayLengthText = formatDuration(dayInfo.dayLength)
    nightLengthText = formatDuration(24 - dayInfo.dayLength)
  }

  return {
    declination,
    subsolarLat,
    subsolarLng,
    altitude,
    azimuth,
    noonAltitude,
    solarTimeValue: solarTime,
    solarTimeText: formatClock(solarTime),
    sunriseText,
    sunsetText,
    dayLengthText,
    nightLengthText,
    pointStatusText,
    localMeanText: formatClock(localMean),
  }
}

function rawSolarDeclination(doy: number) {
  return 23.44 * Math.sin(DEG * ((360 * (284 + doy)) / 365))
}

function teachingTermDeclination(doy: number) {
  const rounded = Math.round(doy)
  const termDeclinationMap: Record<number, number> = {
    79: 0, // 春分：直射赤道
    172: AXIAL_TILT, // 夏至：直射北回归线
    266: 0, // 秋分：直射赤道
    356: -AXIAL_TILT, // 冬至：直射南回归线
  }

  return termDeclinationMap[rounded] ?? null
}

function solarDeclination(doy: number) {
  return teachingTermDeclination(doy) ?? rawSolarDeclination(doy)
}

function equationOfTime(doy: number) {
  const b = DEG * ((360 * (doy - 81)) / 364)
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

function altitudeFromHourAngle(lat: number, dec: number, h: number) {
  const latRad = lat * DEG
  const decRad = dec * DEG
  const hRad = h * DEG
  const sinAlt = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hRad)
  return Math.asin(clamp(sinAlt, -1, 1)) * RAD
}

function azimuthFromHourAngle(lat: number, dec: number, h: number) {
  const latRad = lat * DEG
  const decRad = dec * DEG
  const hRad = h * DEG
  const az = Math.atan2(Math.sin(hRad), Math.cos(hRad) * Math.sin(latRad) - Math.tan(decRad) * Math.cos(latRad)) + Math.PI
  return normalizeDegree(az * RAD)
}

function dayLengthInfo(lat: number, dec: number) {
  const cosH0 = -Math.tan(lat * DEG) * Math.tan(dec * DEG)

  // 加容差：北极圈 / 南极圈在夏至、冬至临界点附近，避免 23.437° 这类近似误差造成“差几秒不是极昼/极夜”。
  if (cosH0 <= -1 + POLAR_EPS) return { type: 'polar-day' as const, h0: 180, dayLength: 24 }
  if (cosH0 >= 1 - POLAR_EPS) return { type: 'polar-night' as const, h0: 0, dayLength: 0 }

  const h0 = Math.acos(clamp(cosH0, -1, 1)) * RAD
  return { type: 'normal' as const, h0, dayLength: (2 * h0) / 15 }
}

function dayOfYear(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.floor((current - start) / 86400000)
}

function formatClock(minutes: number) {
  if (!Number.isFinite(minutes)) return '--:--:--'
  const totalSeconds = Math.round(wrapMinutes(minutes) * 60) % 86400
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDuration(hours: number) {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}小时${String(m).padStart(2, '0')}分`
}

function formatLat(lat: number) {
  if (Math.abs(lat) < 0.01) return '0.00°'
  return `${lat > 0 ? '北纬' : '南纬'}${Math.abs(lat).toFixed(2)}°`
}

function formatLng(lng: number) {
  const value = normalizeLng(lng)
  if (Math.abs(value) < 0.01) return '0.00°'
  return `${value > 0 ? '东经' : '西经'}${Math.abs(value).toFixed(2)}°`
}

function signedDeg(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}°`
}

function normalizeLng(lng: number) {
  let value = ((((lng + 180) % 360) + 360) % 360) - 180
  if (value === -180) value = 180
  return value
}

function normalizeDegree(value: number) {
  return ((value % 360) + 360) % 360
}

function wrapMinutes(value: number) {
  return ((value % 1440) + 1440) % 1440
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
</script>

<style scoped>
.earth-orbit-lab {
  --cyan: #38e8ff;
  --cyan2: #16d9e3;
  --gold: #ffd166;
  --orange: #ff9f1c;
  --pink: #ff6fd8;
  --panel: rgba(7, 20, 36, 0.88);
  --panel2: rgba(7, 18, 33, 0.72);
  --line: rgba(117, 219, 255, 0.18);
  --line2: rgba(117, 219, 255, 0.34);
  --text: #e8f8ff;
  --muted: rgba(226, 246, 255, 0.62);
  width: 100%;
  height: 100vh;
  min-height: 720px;
  overflow: hidden;
  color: var(--text);
  background:
    radial-gradient(circle at 18% 35%, rgba(46, 196, 182, 0.2), transparent 30%),
    radial-gradient(circle at 86% 12%, rgba(255, 111, 216, 0.1), transparent 26%), linear-gradient(180deg, #06101d 0%, #081927 62%, #030813 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.earth-orbit-lab *,
.earth-orbit-lab *::before,
.earth-orbit-lab *::after {
  box-sizing: border-box;
}

.lab-header {
  height: 58px;
  margin: 8px 10px 0;
  padding: 0 12px;
  border: 1px solid rgba(117, 219, 255, 0.26);
  border-radius: 18px;
  background: linear-gradient(90deg, rgba(11, 33, 50, 0.96), rgba(7, 16, 33, 0.9)), linear-gradient(135deg, rgba(56, 232, 255, 0.12), transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.3);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-sun {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: radial-gradient(circle at 30% 24%, #fff9bf, transparent 18%), radial-gradient(circle, #ffd166 0%, #ff9f1c 62%, #f97316 100%);
  box-shadow: 0 0 28px rgba(255, 209, 102, 0.52);
}

.brand-sub {
  color: #9af5ff;
  font-size: 9px;
  letter-spacing: 0.24em;
  font-weight: 900;
}

.brand-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 2px;
}

.brand h1 {
  margin: 0;
  font-size: 16px;
  line-height: 1.1;
  text-shadow: 0 0 14px rgba(56, 232, 255, 0.24);
}

.edition-tag {
  height: 20px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
  line-height: 18px;
  white-space: nowrap;
}

.edition-tag.standard {
  border: 1px solid rgba(117, 219, 255, 0.42);
  background: rgba(5, 20, 38, 0.72);
  color: #9af5ff;
  box-shadow: 0 0 14px rgba(56, 232, 255, 0.12);
}

.edition-tag.advanced {
  border: 1px solid rgba(255, 209, 102, 0.74);
  background: linear-gradient(135deg, rgba(255, 209, 102, 0.26), rgba(56, 232, 255, 0.12));
  color: #fff1b8;
  box-shadow: 0 0 14px rgba(255, 209, 102, 0.18);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.page {
  height: calc(100vh - 66px);
  min-height: 640px;
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 10px 10px;
}

.left-panel {
  min-height: 0;
  padding-right: 2px;
  overflow-y: auto;
}

.left-panel::-webkit-scrollbar {
  width: 0;
}

.panel-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(9, 25, 44, 0.9), rgba(5, 13, 27, 0.84));
  box-shadow: inset 0 0 22px rgba(56, 232, 255, 0.035);
  padding: 10px;
  margin-bottom: 9px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
  font-weight: 900;
  font-size: 12px;
  color: #eafcff;
}

.panel-title i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 13px rgba(255, 209, 102, 0.55);
}

.control-center-card {
  border-color: rgba(255, 209, 102, 0.28);
  background: linear-gradient(180deg, rgba(14, 31, 48, 0.96), rgba(7, 18, 34, 0.88));
}

.control-center-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.term-compare-tip {
  margin-top: 9px;
  padding: 8px 9px;
  border-left: 3px solid var(--gold);
  border-radius: 10px;
  background: rgba(255, 209, 102, 0.08);
  display: grid;
  gap: 4px;
}

.term-compare-tip b {
  color: #fff1b8;
  font-size: 11px;
}

.term-compare-tip span {
  color: rgba(226, 246, 255, 0.72);
  font-size: 10px;
  line-height: 1.45;
}

.lesson-preset-card {
  border-color: rgba(56, 232, 255, 0.22);
}

.misconception-tip {
  margin-top: 9px;
  padding: 8px 9px;
  border-radius: 10px;
  border: 1px solid rgba(255, 159, 28, 0.18);
  background: rgba(255, 159, 28, 0.07);
  display: grid;
  gap: 4px;
}

.misconception-tip b {
  color: #ffd166;
  font-size: 11px;
}

.misconception-tip span {
  color: rgba(226, 246, 255, 0.72);
  font-size: 10px;
  line-height: 1.45;
}

.light-control-grid {
  margin-top: 0;
}

.city-button-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}

.city-button-grid :deep(.el-button) {
  width: 100%;
  min-width: 0;
  margin-left: 0 !important;
  padding: 0 4px;
}

:deep(.el-button) {
  border-color: rgba(117, 219, 255, 0.22) !important;
  background: rgba(5, 20, 38, 0.58) !important;
  color: rgba(232, 248, 255, 0.86) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.025);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

:deep(.el-button:hover),
:deep(.el-button:focus) {
  border-color: rgba(56, 232, 255, 0.58) !important;
  background: rgba(10, 42, 67, 0.78) !important;
  color: #eaffff !important;
  box-shadow:
    0 0 0 1px rgba(56, 232, 255, 0.2),
    0 8px 18px rgba(0, 0, 0, 0.18);
  transform: translateY(-1px);
}

:deep(.el-button--primary) {
  border-color: rgba(56, 232, 255, 0.72) !important;
  background: linear-gradient(135deg, rgba(22, 217, 227, 0.86), rgba(46, 196, 182, 0.68)) !important;
  color: #031522 !important;
  font-weight: 800;
}

:deep(.el-button--primary:hover),
:deep(.el-button--primary:focus) {
  border-color: rgba(154, 245, 255, 0.95) !important;
  background: linear-gradient(135deg, rgba(91, 241, 255, 0.94), rgba(46, 196, 182, 0.82)) !important;
  color: #00131d !important;
}

:deep(.el-button--warning) {
  border-color: rgba(255, 209, 102, 0.76) !important;
  background: linear-gradient(135deg, rgba(255, 209, 102, 0.88), rgba(255, 159, 28, 0.7)) !important;
  color: #261300 !important;
  font-weight: 800;
}

:deep(.el-button--warning:hover),
:deep(.el-button--warning:focus) {
  border-color: rgba(255, 231, 157, 0.95) !important;
  background: linear-gradient(135deg, rgba(255, 226, 137, 0.96), rgba(255, 178, 55, 0.84)) !important;
  color: #1b0d00 !important;
}

.button-grid,
.layer-grid {
  display: grid;
  gap: 7px;
}

.button-grid.three {
  grid-template-columns: repeat(3, 1fr);
}

.button-grid.two,
.button-grid.four,
.layer-grid {
  grid-template-columns: repeat(2, 1fr);
}

.mini-control-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 7px;
  margin-top: 9px;
}

.mini-control-card {
  min-width: 0;
  border: 1px solid rgba(117, 219, 255, 0.14);
  border-radius: 12px;
  background: rgba(3, 12, 25, 0.46);
  padding: 7px 8px 4px;
}

.mini-control-card.wide,
.mini-control-card.layer-slider {
  grid-column: 1 / -1;
}

.mini-control-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: -5px;
}

.mini-control-head span,
.field span,
.location-card span,
.location-card em,
.floating-card span,
.mini-data span {
  color: var(--muted);
  font-size: 10px;
}

.mini-control-head b {
  color: var(--gold);
  font-size: 11px;
  white-space: nowrap;
}

.field {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.location-card {
  margin-top: 8px;
  border: 1px solid rgba(56, 232, 255, 0.18);
  background: rgba(13, 38, 62, 0.46);
  border-radius: 12px;
  padding: 9px;
  display: grid;
  gap: 4px;
}

.location-card b {
  color: #9af5ff;
  font-size: 15px;
}

.location-card em {
  font-style: normal;
}

.stage-zone {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.stage-zone.split {
  grid-template-columns: minmax(0, 1.18fr) minmax(390px, 0.86fr);
}

.world-stage,
.solar-lite-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(117, 219, 255, 0.22);
  border-radius: 22px;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 18%, rgba(56, 232, 255, 0.2), transparent 30%),
    radial-gradient(circle at 80% 20%, rgba(255, 209, 102, 0.12), transparent 26%),
    radial-gradient(circle at 46% 54%, rgba(69, 232, 255, 0.12), transparent 36%),
    radial-gradient(circle at 20% 84%, rgba(46, 196, 182, 0.14), transparent 32%),
    linear-gradient(135deg, rgba(1, 5, 18, 0.98), rgba(4, 18, 36, 0.94) 48%, rgba(2, 8, 22, 0.98));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.025),
    0 24px 70px rgba(0, 0, 0, 0.36);
}

.canvas-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.canvas-host canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.floating-card {
  position: absolute;
  z-index: 5;
  border: 1px solid rgba(117, 219, 255, 0.18);
  border-radius: 14px;
  background: rgba(4, 13, 28, 0.7);
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.2);
  padding: 10px;
  pointer-events: none;
}

.observer-card {
  left: 14px;
  top: 14px;
  width: 348px;
}

.tip-card {
  right: 14px;
  top: 14px;
  width: 210px;
}

.legend-card {
  left: 14px;
  bottom: 14px;
  width: 230px;
}

.legend-list {
  display: grid;
  gap: 7px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(226, 246, 255, 0.78);
  font-size: 10px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
  display: inline-block;
}

.legend-dot.observer {
  background: #38e8ff;
  box-shadow: 0 0 12px rgba(56, 232, 255, 0.62);
}

.legend-line {
  width: 28px;
  height: 0;
  flex: 0 0 auto;
  display: inline-block;
  border-top: 3px solid currentColor;
  border-radius: 999px;
}

.legend-line.dawn {
  color: #38e8ff;
  box-shadow: 0 0 10px rgba(56, 232, 255, 0.45);
}

.legend-line.dusk {
  color: #ff9f1c;
  box-shadow: 0 0 10px rgba(255, 159, 28, 0.45);
}

.subsolar-chart-card {
  right: 14px;
  bottom: 14px;
  width: 302px;
}

.observer-subsolar-chart {
  margin-top: 9px;
  border-radius: 12px;
  background: rgba(17, 39, 65, 0.52);
  border: 1px solid rgba(117, 219, 255, 0.14);
  padding: 8px;
}

.mini-camera-ui {
  position: absolute;
  right: 18px;
  bottom: 18px;
  width: clamp(260px, 30%, 390px);
  aspect-ratio: 16 / 9.9;
  z-index: 6;
  border-radius: 16px;
  overflow: hidden;
  background: transparent;
  border: 1px solid rgba(46, 196, 182, 0.72);
  transform: translateZ(0);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.26),
    inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.mini-camera-canvas-host {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
}

.mini-camera-canvas-host canvas,
.mini-camera-canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

:deep(.mini-camera-canvas) {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
}

.mini-camera-select-row {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 108px;
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.mini-camera-select {
  width: 100%;
}

.mini-camera-select :deep(.el-select__wrapper) {
  min-height: 26px;
  border-radius: 999px;
  background: rgba(5, 25, 45, 0.82);
  box-shadow: 0 0 0 1px rgba(120, 220, 255, 0.36) inset;
}

.mini-camera-select :deep(.el-select__selected-item),
.mini-camera-select :deep(.el-select__placeholder) {
  color: rgba(230, 250, 255, 0.96);
  font-size: 11px;
  font-weight: 900;
}

.subsolar-chart {
  width: 100%;
  height: 142px;
  display: block;
}

.chart-grid-line {
  stroke: rgba(226, 246, 255, 0.18);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.chart-grid-line.main {
  stroke: rgba(56, 232, 255, 0.28);
  stroke-dasharray: none;
}

.chart-y-label,
.chart-x-label,
.chart-current-text {
  fill: rgba(226, 246, 255, 0.68);
  font-size: 9px;
  font-weight: 800;
}

.chart-trend-line {
  fill: none;
  stroke: #ffd166;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 5px rgba(255, 209, 102, 0.42));
}

.chart-current-dot {
  fill: #38e8ff;
  stroke: #ffffff;
  stroke-width: 1.5;
  filter: drop-shadow(0 0 6px rgba(56, 232, 255, 0.72));
}

.float-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.float-head b {
  font-size: 12px;
  color: #ffffff;
}

.tip-card p {
  margin: 0;
  color: rgba(226, 246, 255, 0.7);
  font-size: 11px;
  line-height: 1.55;
}

.mini-data {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 7px;
}

.mini-data div {
  border-radius: 11px;
  background: rgba(17, 39, 65, 0.7);
  padding: 8px;
  display: grid;
  gap: 3px;
}

.mini-data b {
  color: #fff;
  font-size: 11px;
  font-weight: 900;
}

.highlight b {
  color: var(--gold);
  text-shadow: 0 0 10px rgba(255, 209, 102, 0.24);
}

.day-night-card {
  margin-top: 9px;
  border-radius: 12px;
  background: rgba(17, 39, 65, 0.56);
  border: 1px solid rgba(117, 219, 255, 0.14);
  padding: 8px;
}

.day-night-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.day-night-head b {
  color: #ffffff;
  font-size: 11px;
}

.day-night-head span,
.day-night-axis span {
  color: rgba(226, 246, 255, 0.62);
  font-size: 10px;
}

.day-night-bar {
  height: 9px;
  border-radius: 999px;
  overflow: hidden;
  display: flex;
  background: rgba(4, 12, 24, 0.76);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.day-night-bar i {
  height: 100%;
  display: block;
}

.day-night-bar .day {
  background: linear-gradient(90deg, #ffd166, #fff1a8);
}

.day-night-bar .night {
  background: linear-gradient(90deg, #0f2a50, #5b7cff);
}

.day-night-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
}

.formula-card {
  right: 14px;
  top: 14px;
  width: 382px;
  max-height: min(360px, calc(100% - 28px));
  overflow-y: auto;
  overflow-x: hidden;
  pointer-events: auto;
}

.formula-card::-webkit-scrollbar {
  width: 4px;
}

.formula-card::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(117, 219, 255, 0.22);
}

.formula-list {
  display: grid;
  gap: 8px;
}

.formula-line {
  display: grid;
  gap: 4px;
}

.formula-line span {
  color: rgba(226, 246, 255, 0.72);
  font-size: 10px;
  font-weight: 900;
}

.formula-desc {
  margin: 0;
  color: rgba(214, 237, 255, 0.62);
  font-size: 10px;
  line-height: 1.45;
}

.formula-line code {
  display: block;
  color: #ffd166;
  background: rgba(0, 0, 0, 0.24);
  border: 1px solid rgba(255, 209, 102, 0.1);
  border-radius: 9px;
  padding: 7px;
  font-size: 10px;
  white-space: normal;
  line-height: 1.45;
}

.formula-line code.formula-real {
  color: rgba(226, 246, 255, 0.82);
  background: rgba(17, 39, 65, 0.52);
  border-color: rgba(117, 219, 255, 0.12);
}

.big-caption {
  position: absolute;
  left: 50%;
  top: 15%;
  transform: translateX(-50%);
  z-index: 4;
  width: min(660px, 76%);
  text-align: center;
  pointer-events: none;
  text-shadow:
    0 4px 0 rgba(105, 36, 21, 0.35),
    0 0 18px rgba(255, 209, 102, 0.36);
}

.big-caption b {
  display: block;
  color: #fff1b8;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.big-caption span {
  display: block;
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
}

.solar-top {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 12px;
  z-index: 8;
  border: 1px solid rgba(255, 209, 102, 0.24);
  border-radius: 14px;
  background: rgba(4, 13, 28, 0.7);
  backdrop-filter: blur(12px);
  padding: 9px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.solar-top b {
  color: #fff1b8;
  font-size: 12px;
}

.solar-top span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
}

.solar-component {
  width: 100%;
  height: 100%;
}

:deep(.el-button) {
  height: 28px;
  padding: 0 4px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 10px;
  border-color: rgba(117, 219, 255, 0.18);
  background: rgba(10, 26, 47, 0.82);
  color: #dff8ff;
  min-width: 0;
}

:deep(.el-button + .el-button) {
  margin-left: 0 !important;
}

.button-grid :deep(.el-button),
.layer-grid :deep(.el-button) {
  width: 100%;
}

:deep(.el-button--primary) {
  background: linear-gradient(135deg, #2ec4b6, #38e8ff);
  border: none;
  color: #041c24;
}

:deep(.el-button--warning) {
  background: linear-gradient(135deg, #ffd166, #ffb347);
  border: none;
  color: #07111f;
}

:deep(.el-slider) {
  --el-slider-height: 5px;
}

:deep(.el-slider__runway) {
  height: 5px;
  margin: 10px 0 5px;
  background: rgba(226, 246, 255, 0.2);
}

:deep(.el-slider__bar) {
  height: 5px;
  background: linear-gradient(90deg, #2ec4b6, #38e8ff, #ffd166);
}

:deep(.el-slider__button) {
  width: 13px;
  height: 13px;
  border-color: #fff;
  background: #38e8ff;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  min-height: 28px;
  background: rgba(8, 19, 39, 0.82);
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(117, 219, 255, 0.18) inset;
}

:deep(.el-input__inner),
:deep(.el-select__selected-item) {
  color: #e8f7ff;
  font-size: 11px;
}

@media (max-width: 1280px) {
  .page {
    grid-template-columns: 250px minmax(0, 1fr);
  }

  .stage-zone.split {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 0.7fr;
  }

  .tip-card,
  .formula-card,
  .subsolar-chart-card {
    display: none;
  }

  .mini-camera-ui {
    width: 300px;
  }
}

@media (max-width: 960px) {
  .earth-orbit-lab {
    height: auto;
    overflow: auto;
  }

  .page {
    height: auto;
    grid-template-columns: 1fr;
  }

  .stage-zone,
  .stage-zone.split {
    min-height: 760px;
    grid-template-columns: 1fr;
  }

  .world-stage,
  .solar-lite-shell {
    min-height: 520px;
  }

  .bottom-hud {
    grid-template-columns: 1fr;
  }
}
.quick-time-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.quick-time-row .el-button {
  flex: 1;
  margin-left: 0;
}

/* ===================== 平板 / 小屏适配修正 v4 =====================
   目标：
   1. 根页面不出现页面级滚动条，整个课件固定在一屏内。
   2. 左侧控制面板独立滚动，平板端宽度适当缩小。
   3. 右侧主场景容器独立滚动；小屏 / 平板低高度时，地球主场景与太阳视运动上下布局，滚动发生在右侧容器内。
   4. 实时数据、公式、图例浮层压缩，但不直接隐藏公式面板。
*/
.earth-orbit-lab {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.earth-orbit-lab::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.left-panel::-webkit-scrollbar,
.stage-zone::-webkit-scrollbar,
.floating-card::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.left-panel::-webkit-scrollbar-thumb,
.stage-zone::-webkit-scrollbar-thumb,
.floating-card::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(117, 219, 255, 0.32);
}

.left-panel::-webkit-scrollbar-track,
.stage-zone::-webkit-scrollbar-track,
.floating-card::-webkit-scrollbar-track {
  background: rgba(4, 13, 28, 0.18);
}

.page {
  height: calc(100dvh - 74px);
  min-height: 0;
  grid-template-columns: clamp(218px, 16.5vw, 270px) minmax(0, 1fr);
  overflow: hidden;
}

.left-panel {
  height: 100%;
  max-height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 5px;
  scrollbar-width: thin;
  scrollbar-color: rgba(117, 219, 255, 0.28) transparent;
}

/* 原样式把左侧滚动条宽度设成 0，这里覆盖回来，平板端能看出还能继续往下滚。 */
.left-panel::-webkit-scrollbar {
  width: 5px;
}

.stage-zone {
  height: 100%;
  max-height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  align-content: start;
  scrollbar-width: thin;
  scrollbar-color: rgba(117, 219, 255, 0.28) transparent;
}

.world-stage {
  min-height: 560px;
}

.solar-lite-shell {
  min-height: 500px;
}

.observer-card,
.formula-card,
.legend-card {
  pointer-events: auto;
}

.observer-card {
  width: min(348px, calc(100% - 28px));
  max-height: calc(100% - 28px);
  overflow-y: auto;
  overflow-x: hidden;
}

.formula-card {
  width: min(382px, calc(100% - 28px));
  max-height: calc(100% - 28px);
  overflow-y: auto;
  overflow-x: hidden;
}

.legend-card {
  width: min(230px, calc(100% - 28px));
  max-height: calc(100% - 28px);
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 1440px), (max-height: 860px) {
  .lab-header {
    height: 52px;
    margin-top: 6px;
    border-radius: 15px;
  }

  .brand-sun {
    width: 32px;
    height: 32px;
    border-radius: 11px;
  }

  .brand h1 {
    font-size: 15px;
  }

  .brand-sub {
    font-size: 8px;
  }

  .header-actions {
    gap: 6px;
  }

  .header-actions :deep(.el-button) {
    height: 25px;
    padding: 0 8px;
    font-size: 9px;
  }

  .page {
    height: calc(100dvh - 64px);
    min-height: 0;
    grid-template-columns: clamp(206px, 17vw, 238px) minmax(0, 1fr);
    gap: 8px;
    padding: 8px 8px 8px;
  }

  .panel-card {
    padding: 8px;
    margin-bottom: 7px;
    border-radius: 12px;
  }

  .panel-title {
    margin-bottom: 7px;
    font-size: 11px;
  }

  .button-grid,
  .layer-grid,
  .city-button-grid,
  .mini-control-grid {
    gap: 6px;
  }

  .mini-control-card {
    padding: 6px 7px 3px;
  }

  .term-compare-tip,
  .misconception-tip,
  .location-card {
    padding: 7px;
  }

  /* 右侧容器内部上下排列。总高度刻意大于右侧容器高度，滚动只出现在 .stage-zone 内。 */
  .stage-zone.split {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(520px, 64vh) minmax(440px, 54vh);
  }

  .world-stage {
    min-height: 520px;
    min-width: 0;
  }

  .solar-lite-shell {
    min-height: 440px;
    min-width: 0;
  }

  /* 之前 <=1280 直接隐藏公式，这会导致平板看不到；这里强制恢复为缩小版。 */
  .formula-card,
  .subsolar-chart-card {
    display: block;
  }

  .tip-card {
    display: none;
  }

  .observer-card {
    left: 10px;
    top: 10px;
    width: min(300px, calc(100% - 20px));
    max-height: min(420px, calc(100% - 20px));
    padding: 8px;
    border-radius: 12px;
  }

  .formula-card {
    right: 10px;
    top: 10px;
    width: min(310px, calc(100% - 20px));
    max-height: min(390px, calc(100% - 20px));
    padding: 8px;
    border-radius: 12px;
  }

  .legend-card {
    left: 10px;
    bottom: 10px;
    width: 190px;
    max-height: 170px;
    padding: 8px;
    border-radius: 12px;
  }

  .mini-data {
    gap: 5px;
  }

  .mini-data div {
    padding: 6px;
    border-radius: 9px;
  }

  .mini-data b {
    font-size: 10px;
  }

  .day-night-card,
  .observer-subsolar-chart {
    margin-top: 6px;
    padding: 6px;
  }

  .subsolar-chart {
    height: 108px;
  }

  .formula-list {
    gap: 6px;
  }

  .formula-line {
    gap: 3px;
  }

  .formula-desc {
    font-size: 9px;
    line-height: 1.35;
  }

  .formula-line code {
    padding: 6px;
    font-size: 9px;
    line-height: 1.35;
  }

  .float-head {
    margin-bottom: 6px;
  }

  .float-head b {
    font-size: 11px;
  }

  .floating-card span,
  .mini-data span,
  .day-night-head span,
  .day-night-axis span {
    font-size: 9px;
  }
}

@media (max-width: 1180px), (max-height: 760px) {
  .page {
    grid-template-columns: 196px minmax(0, 1fr);
  }

  .stage-zone.split {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(480px, 64vh) minmax(400px, 55vh);
  }

  .world-stage {
    min-height: 480px;
    min-width: 0;
  }

  .solar-lite-shell {
    min-height: 400px;
    min-width: 0;
  }

  .observer-card {
    width: 270px;
    max-height: 350px;
  }

  .formula-card {
    width: 284px;
    max-height: 350px;
  }

  .legend-card {
    width: 172px;
    max-height: 150px;
  }

  /* 高度特别紧张时，实时数据里的年变化小图先收起来，保住关键数据和公式。 */
  .observer-subsolar-chart {
    display: none;
  }

  .day-night-card {
    padding: 6px;
  }
}

@media (max-width: 960px) {
  .earth-orbit-lab {
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
  }

  .lab-header {
    height: 52px;
    min-height: 52px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
  }

  .brand {
    gap: 8px;
  }

  .brand h1 {
    font-size: 13px;
    white-space: nowrap;
  }

  .brand-sub,
  .edition-tag {
    display: none;
  }

  .header-actions {
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    max-width: calc(100vw - 220px);
    padding-bottom: 2px;
  }

  .header-actions :deep(.el-button) {
    flex: 0 0 auto;
  }

  .page {
    height: calc(100dvh - 64px);
    min-height: 0;
    overflow: hidden;
    grid-template-columns: clamp(168px, 26vw, 196px) minmax(0, 1fr);
    gap: 6px;
    padding: 6px;
  }

  .left-panel {
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 4px;
  }

  .panel-card {
    padding: 7px;
    margin-bottom: 6px;
  }

  .panel-title {
    font-size: 10px;
  }

  .stage-zone,
  .stage-zone.split {
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow: auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(470px, 66vh) minmax(390px, 56vh);
  }

  .world-stage {
    min-height: 470px;
    min-width: 0;
  }

  .solar-lite-shell {
    min-height: 390px;
    min-width: 0;
  }

  .observer-card,
  .formula-card,
  .legend-card {
    width: min(280px, calc(100% - 20px));
    max-height: 300px;
  }
}


/* ===================== v5：平板端右侧只做容器内纵向滚动，避免太阳场景被横向裁切 ===================== */
@media (max-width: 1440px), (max-height: 860px) {
  .stage-zone,
  .stage-zone.split {
    overflow-y: auto;
    overflow-x: hidden;
    justify-items: stretch;
  }

  .world-stage,
  .solar-lite-shell {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .canvas-host,
  .solar-component {
    width: 100%;
    min-width: 0;
  }
}


/* ===================== v6：修复桌面端主场景高度只占半屏 + 平板端主视图居中 ===================== */
.stage-zone {
  height: 100%;
  max-height: 100%;
  min-height: 0;
  grid-auto-rows: minmax(0, 1fr);
  align-items: stretch;
}

.stage-zone.split {
  grid-template-columns: minmax(0, 1.18fr) minmax(360px, 0.86fr);
  grid-template-rows: minmax(0, 1fr);
}

.stage-zone > .world-stage,
.stage-zone > .solar-lite-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: none;
}

.stage-zone:not(.split) > .world-stage {
  min-height: 0;
}

@media (max-width: 1440px), (max-height: 860px) {
  .stage-zone,
  .stage-zone.split {
    height: 100%;
    max-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(520px, 64vh) minmax(440px, 54vh);
    align-content: start;
  }

  .stage-zone > .world-stage {
    height: auto;
    min-height: 520px;
  }

  .stage-zone > .solar-lite-shell {
    height: auto;
    min-height: 440px;
  }
}

@media (max-width: 1180px), (max-height: 760px) {
  .stage-zone,
  .stage-zone.split {
    grid-template-rows: minmax(500px, 68vh) minmax(420px, 58vh);
  }

  .stage-zone > .world-stage {
    min-height: 500px;
  }

  .stage-zone > .solar-lite-shell {
    min-height: 420px;
  }
}

@media (min-width: 1441px) and (min-height: 861px) {
  .stage-zone.split > .world-stage,
  .stage-zone.split > .solar-lite-shell {
    height: 100%;
    min-height: 0;
  }
}



/* ===================== v7：容器滚动与主场景居中最终修正 =====================
   核心原则：
   1. 页面本身不滚动；左侧控制栏单独滚动。
   2. 未开启太阳视运动联动时，右侧 3D 主场景必须一屏铺满，不允许 .stage-zone 自己出现滚动条。
   3. 只有开启联动 split 时，右侧容器才在平板/低高度下纵向滚动。
   4. world-stage / canvas-host / canvas 三层都必须严格 100% 跟随父容器，避免 WebGL 画布沿用旧尺寸导致场景中心偏到右下角。
*/
.earth-orbit-lab {
  height: 100dvh !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

.page {
  height: calc(100dvh - 64px) !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

.left-panel {
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

.stage-zone {
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: minmax(0, 1fr) !important;
  align-content: stretch !important;
  align-items: stretch !important;
  justify-items: stretch !important;
  padding-right: 0 !important;
}

.stage-zone:not(.split) {
  overflow: hidden !important;
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: minmax(0, 1fr) !important;
}

.stage-zone:not(.split) > .world-stage {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 100% !important;
  max-height: 100% !important;
}

.world-stage,
.canvas-host,
.canvas-host canvas {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 100% !important;
  max-height: 100% !important;
}

.canvas-host {
  position: absolute !important;
  inset: 0 !important;
}

.canvas-host canvas {
  display: block !important;
}

/* 桌面端打开联动：左右两栏同高铺满。 */
.stage-zone.split {
  overflow: hidden !important;
  grid-template-columns: minmax(0, 1.18fr) minmax(360px, 0.86fr) !important;
  grid-template-rows: minmax(0, 1fr) !important;
}

.stage-zone.split > .world-stage,
.stage-zone.split > .solar-lite-shell {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 100% !important;
  max-height: 100% !important;
}

/* 只有 split + 平板/低高度时，右侧容器允许纵向滚动，上下展示两个 3D 区域。 */
@media (max-width: 1440px), (max-height: 860px) {
  .page {
    height: calc(100dvh - 64px) !important;
    grid-template-columns: clamp(206px, 17vw, 238px) minmax(0, 1fr) !important;
  }

  .stage-zone:not(.split) {
    overflow: hidden !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: minmax(0, 1fr) !important;
  }

  .stage-zone:not(.split) > .world-stage {
    height: 100% !important;
    min-height: 0 !important;
  }

  .stage-zone.split {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: minmax(520px, 64vh) minmax(440px, 54vh) !important;
    align-content: start !important;
    padding-right: 2px !important;
  }

  .stage-zone.split > .world-stage {
    height: auto !important;
    min-height: 520px !important;
  }

  .stage-zone.split > .solar-lite-shell {
    height: auto !important;
    min-height: 440px !important;
  }
}

@media (max-width: 1180px), (max-height: 760px) {
  .page {
    grid-template-columns: 196px minmax(0, 1fr) !important;
  }

  .stage-zone:not(.split) {
    overflow: hidden !important;
    grid-template-rows: minmax(0, 1fr) !important;
  }

  .stage-zone:not(.split) > .world-stage {
    min-height: 0 !important;
    height: 100% !important;
  }

  .stage-zone.split {
    grid-template-rows: minmax(500px, 68vh) minmax(420px, 58vh) !important;
  }

  .stage-zone.split > .world-stage {
    min-height: 500px !important;
  }

  .stage-zone.split > .solar-lite-shell {
    min-height: 420px !important;
  }
}

@media (max-width: 960px) {
  .page {
    height: calc(100dvh - 64px) !important;
    grid-template-columns: clamp(168px, 26vw, 196px) minmax(0, 1fr) !important;
  }

  .stage-zone:not(.split) {
    height: 100% !important;
    overflow: hidden !important;
    grid-template-rows: minmax(0, 1fr) !important;
  }

  .stage-zone:not(.split) > .world-stage {
    height: 100% !important;
    min-height: 0 !important;
  }

  .stage-zone.split {
    height: 100% !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    grid-template-rows: minmax(470px, 66vh) minmax(390px, 56vh) !important;
  }

  .stage-zone.split > .world-stage {
    min-height: 470px !important;
  }

  .stage-zone.split > .solar-lite-shell {
    min-height: 390px !important;
  }
}



/* ===================== v8：主 3D canvas CSS 尺寸强制同步 =====================
   只修父组件主场景 canvas 偏移：
   - 不改 sun.vue；
   - 不改公转 / 自转 / 极昼极夜逻辑；
   - 解决高 DPR 平板端 WebGL canvas 实际显示尺寸大于父容器，导致太阳系中心落在右下角的问题。
*/
.canvas-host {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  contain: layout size paint !important;
}

:deep(.earth-main-canvas) {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
}

</style>
