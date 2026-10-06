<template>
  <SunLite v-bind="props" @ready="$emit('ready')" @load-error="$emit('loadError', $event)" scene-object="city" />
</template>

<script setup lang="ts">
import SunLite from '../sun.vue'
import { AXIAL_TILT } from '../utils/astronomy'
defineEmits<{ ready: []; loadError: [message: string] }>()

// 城市版独立入口，保留建筑、广告牌和街道场景。
const props = withDefaults(defineProps<{
  axialTilt?: number
  panelBottomInset?: number
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
}>(), { axialTilt: AXIAL_TILT })
</script>
