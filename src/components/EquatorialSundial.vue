<template>
  <SunLite v-bind="props" @ready="$emit('ready')" @load-error="$emit('loadError', $event)" scene-object="sundial" />
</template>

<script setup lang="ts">
import SunLite from '../sun.vue'
import { AXIAL_TILT } from '../utils/astronomy'
defineEmits<{ ready: []; loadError: [message: string] }>()

// 复用原太阳视运动组件，以日晷替换建筑，并移除广告牌、街道和路灯。
const props = withDefaults(defineProps<{
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
}>(), { axialTilt: AXIAL_TILT })
</script>
