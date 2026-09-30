<template>
  <div class="noon-readings">
    <div class="noon-terms" aria-label="二分二至正午高度对比">
      <button v-for="term in terms" :key="term.name" type="button" :class="{ active: activeTerm === term.name }"
        :aria-pressed="activeTerm === term.name" @click="$emit('selectTerm', term)">{{ term.name }}</button>
    </div>
    <div class="noon-subsolar">
      <div><span>太阳直射纬度</span><strong>{{ subsolarLatitude }}</strong></div>
      <div><span>直射点正午高度</span><strong>{{ formatDegreesMinutes(90) }}</strong></div>
    </div>
    <button class="noon-focus" type="button" @click="$emit('focus')">近看正午子午线</button>
    <p class="noon-explanation">金色线标出当前正午子午线，刻度每隔 10° 纬度。下表为各纬度各自地方正午的高度，非同一时刻的全球高度。</p>
    <table class="noon-table">
      <caption>H = 90° − |纬度 − 直射纬度|</caption>
      <thead><tr><th scope="col">纬度</th><th scope="col">北半球 H</th><th scope="col">南半球 H</th></tr></thead>
      <tbody>
        <tr class="noon-equator"><th scope="row">赤道 0°</th><td colspan="2">{{ formatDegreesMinutes(equatorAltitude) }}</td></tr>
        <tr v-for="row in rows" :key="row.latitude">
          <th scope="row">{{ row.latitude }}°</th>
          <td :class="{ 'below-horizon': row.north < -1e-7 }">{{ formatDegreesMinutes(row.north) }}</td>
          <td :class="{ 'below-horizon': row.south < -1e-7 }">{{ formatDegreesMinutes(row.south) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="noon-explanation noon-footnote">负值表示正午太阳仍在地平线下；0° 表示太阳中心位于地平线上。</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatDegreesMinutes } from '../utils/astronomy'
import { noonAltitudeSamples } from '../scene/createNoonAltitudeGuide'

const props = defineProps<{
  declination: number
  terms: { name: string; date: string }[]
  activeTerm: string
}>()
defineEmits<{ selectTerm: [term: { name: string; date: string }]; focus: [] }>()

const samples = computed(() => noonAltitudeSamples(props.declination))
const equatorAltitude = computed(() => samples.value.find(sample => sample.latitude === 0)!.altitude)
const rows = computed(() => samples.value.filter(sample => sample.latitude > 0).sort((a, b) => a.latitude - b.latitude).map(north => ({
  latitude: north.latitude,
  north: north.altitude,
  south: samples.value.find(sample => sample.latitude === -north.latitude)!.altitude,
})))
const subsolarLatitude = computed(() => formatDegreesMinutes(Math.abs(props.declination)) === formatDegreesMinutes(0)
  ? `赤道 ${formatDegreesMinutes(0)}`
  : `${props.declination > 0 ? '北纬' : '南纬'}${formatDegreesMinutes(Math.abs(props.declination))}`)
</script>

<style scoped>
.noon-readings { padding: 14px 14px 24px; }
.noon-terms { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.noon-terms button, .noon-focus { border: 1px solid #d4c4a43b; border-radius: 7px; padding: 6px; color: #d1d7de; background: #ffffff06; cursor: pointer; font: inherit; font-size: 12px; }
.noon-terms button.active { color: #efdbb5; border-color: #d5bb8170; background: #d5bb8126; }
.noon-subsolar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 12px 0 10px; }
.noon-subsolar > div { padding: 10px; border: 1px solid #d9c5a031; border-radius: 8px; background: #ddc38c09; }
.noon-subsolar span { display: block; color: #aeb9c5; font-size: 11px; margin-bottom: 6px; }
.noon-subsolar strong { color: #f0d9a8; font-size: 15px; font-variant-numeric: tabular-nums; }
.noon-focus { width: 100%; color: #c2deec; border-color: #b5cfdf40; }
.noon-focus:hover, .noon-terms button:hover { background: #d5bb8118; }
.noon-explanation { margin: 11px 0; font-size: 11px; line-height: 1.65; color: #aab5c1; }
.noon-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
.noon-table caption { padding: 0 0 9px; color: #d7c49e; font-size: 12px; }
.noon-table th, .noon-table td { padding: 6px 3px; border-bottom: 1px solid #d1dbe316; }
.noon-table thead th { color: #aebdc9; font-weight: 500; background: #c9d7e809; }
.noon-table tbody th { color: #bdc9d2; font-weight: 500; }
.noon-table td { color: #e5dbbf; }
.noon-table .below-horizon { color: #9fc4ea; }
.noon-equator { background: #e2c59008; }
.noon-footnote { margin-bottom: 0; }
</style>
