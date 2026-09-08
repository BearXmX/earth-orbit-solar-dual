<template>
  <SunLite v-bind="props" scene-object="sundial" />
</template>

<script setup lang="ts">
import SunLite from '../sun.vue'

// 复用原太阳视运动组件，以日晷替换建筑，并移除广告牌、街道和路灯。
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
</script>
