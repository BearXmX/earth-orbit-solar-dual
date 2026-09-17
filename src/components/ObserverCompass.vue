<template>
  <aside class="observer-compass" aria-label="观测点视角方位">
    <div class="compass-heading"><span>方位罗盘</span><small>北起顺时针</small></div>
    <svg class="compass-face" viewBox="0 0 220 220" role="img" :aria-label="description">
      <title>{{ description }}</title>
      <circle class="compass-rim" cx="110" cy="110" r="100" />
      <circle class="compass-inner-ring" cx="110" cy="110" r="61" />
      <g class="compass-ticks" aria-hidden="true">
        <line v-for="tick in ticks" :key="tick.bearing"
          :class="{ major: tick.bearing % 45 === 0, north: tick.bearing === 0 }"
          :x1="tick.inner.x" :y1="tick.inner.y" :x2="tick.outer.x" :y2="tick.outer.y" />
      </g>
      <g class="compass-labels" aria-hidden="true">
        <text v-for="direction in directions" :key="direction.key"
          :class="{ cardinal: direction.bearing % 90 === 0, north: direction.key === 'N' }"
          :x="direction.position.x" :y="direction.position.y" text-anchor="middle" dominant-baseline="central">
          <tspan :x="direction.position.x" dy="-4">{{ direction.label }}</tspan>
          <tspan class="compass-bearing" :x="direction.position.x" dy="14">{{ direction.bearing }}°</tspan>
        </text>
      </g>
      <g v-if="defined" class="heading-pointer" aria-hidden="true">
        <path class="pointer-stem" d="M110 103V77" />
        <path class="pointer-arrow" d="m110 57 9 24-9-5-9 5Z" />
      </g>
      <circle class="compass-pivot" cx="110" cy="110" r="5" aria-hidden="true" />
      <path class="compass-tail" d="M110 124v9" aria-hidden="true" />
    </svg>
    <div class="compass-readout">
      <strong>{{ defined ? directionLabel : '朝向未定' }}</strong>
      <span>{{ defined ? angleLabel : '—' }}</span>
    </div>
    <p class="compass-caption">{{ defined ? '上方为当前朝向' : '方位未定 · 暂以北向朝上' }}</p>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { COMPASS_DIRECTIONS, compassDirection, compassPoint, formatCompassHeading, normalizeCompassHeading } from '../utils/compass'

const props = withDefaults(defineProps<{
  /** 当前观察朝向：北为0°、东为90°，顺时针增加。 */
  heading: number
  /** 天顶/天底等方位不确定状态可传false。 */
  azimuthDefined?: boolean
}>(), { azimuthDefined: true })

const defined = computed(() => props.azimuthDefined && Number.isFinite(props.heading))
const heading = computed(() => defined.value ? normalizeCompassHeading(props.heading) : 0)
const angleLabel = computed(() => formatCompassHeading(heading.value))
const directionLabel = computed(() => compassDirection(heading.value).label)
const directions = computed(() => COMPASS_DIRECTIONS.map(direction => ({
  ...direction,
  position: compassPoint(direction.bearing, heading.value, 70),
})))
const ticks = computed(() => Array.from({ length: 24 }, (_, index) => {
  const bearing = index * 15
  return {
    bearing,
    inner: compassPoint(bearing, heading.value, bearing % 45 === 0 ? 87 : 91),
    outer: compassPoint(bearing, heading.value, 96),
  }
}))
const allDirections = COMPASS_DIRECTIONS.map(direction => `${direction.label}${direction.bearing}°`).join('、')
const description = computed(() => `${defined.value
  ? `当前朝向${directionLabel.value}${angleLabel.value}，罗盘上方代表当前朝向，文字保持正立`
  : '当前方位角未确定，隐藏朝向箭头，暂以北向朝上'}。八方位：${allDirections}。`)
</script>

<style scoped>
.observer-compass {
  width: 220px;
  max-width: 100%;
  box-sizing: border-box;
  padding: 11px 12px 10px;
  color: #e6e3dc;
  border: 1px solid rgba(227, 227, 228, .19);
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(33, 35, 40, .88), rgba(15, 18, 23, .9));
  box-shadow: 0 10px 28px rgba(0, 0, 0, .25), inset 0 1px rgba(255, 255, 255, .05);
  backdrop-filter: blur(18px) saturate(105%);
  -webkit-backdrop-filter: blur(18px) saturate(105%);
  user-select: none;
  pointer-events: none;
}
.compass-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.compass-heading > span { color: #ddc9a4; font-size: 12px; font-weight: 600; }
.compass-heading small { color: #8f9aa7; font-size: 10px; }
.compass-face { display: block; width: 100%; height: auto; margin: 4px 0 0; overflow: visible; }
.compass-rim { fill: rgba(9, 12, 17, .3); stroke: rgba(213, 221, 231, .17); stroke-width: 1; }
.compass-inner-ring { fill: rgba(205, 214, 224, .018); stroke: rgba(213, 221, 231, .08); stroke-width: 1; }
.compass-ticks line { stroke: #7e8997; stroke-width: 1; opacity: .62; }
.compass-ticks .major { stroke: #c6c4bd; stroke-width: 1.5; opacity: .82; }
.compass-ticks .north { stroke: #e8a394; opacity: 1; }
.compass-labels text { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 12px; font-weight: 500; fill: #acbac7; paint-order: stroke; stroke: #171b21; stroke-width: 2.5px; stroke-linejoin: round; }
.compass-labels .cardinal { font-size: 15px; font-weight: 650; fill: #d8d4ca; }
.compass-labels .north { fill: #edb0a0; }
.compass-labels .compass-bearing { font-size: 11px; font-weight: 500; fill: #a4b9c9; }
.compass-labels .north .compass-bearing { fill: #d6a899; }
.pointer-stem { fill: none; stroke: #d9c299; stroke-width: 2; stroke-linecap: round; }
.pointer-arrow { fill: #e3cc9f; stroke: #f0dfbd; stroke-width: .8; stroke-linejoin: round; }
.compass-pivot { fill: #c4d8e5; stroke: #1e2730; stroke-width: 2; }
.compass-tail { fill: none; stroke: #768392; stroke-width: 1.3; stroke-linecap: round; opacity: .5; }
.compass-readout { display: flex; align-items: baseline; justify-content: center; gap: 11px; margin-top: 1px; line-height: 1.5; }
.compass-readout strong { color: #e5d0aa; font-size: 14px; font-weight: 600; }
.compass-readout > span { color: #ccdce7; font-size: 15px; font-variant-numeric: tabular-nums; }
.compass-caption { margin: 3px 0 0; color: #8e9aa8; font-size: 10px; line-height: 1.5; text-align: center; }
@media (max-width: 620px) {
  .observer-compass { width: 176px; padding: 9px 10px; border-radius: 13px; }
  .compass-heading > span { font-size: 11px; }
  .compass-heading small { font-size: 9px; }
  .compass-readout strong { font-size: 12px; }
  .compass-readout > span { font-size: 13px; }
  .compass-caption { font-size: 9px; }
}
</style>
