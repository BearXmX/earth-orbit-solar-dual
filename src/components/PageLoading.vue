<template>
  <div class="page-loading" :class="{ 'has-error': error }" role="status" aria-live="polite" :aria-busy="!error">
    <div class="loading-content">
      <svg class="loading-orbit" viewBox="0 0 96 96" aria-hidden="true">
        <circle class="loading-orbit-track" cx="48" cy="48" r="35" />
        <circle class="loading-sun" cx="48" cy="48" r="13" />
        <g class="loading-planet"><circle cx="48" cy="13" r="5" /></g>
      </svg>
      <h1>{{ title }}</h1>
      <p>{{ error || phase }}</p>
      <template v-if="!error">
        <div class="loading-meter" aria-hidden="true"><i :style="{ width: progress + '%' }"></i></div>
        <small>{{ preparing ? '正在准备首帧画面' : loaded > 0 ? `已加载 ${loaded} / ${total} 项图像资源` : '正在读取本地天空和纹理' }}</small>
      </template>
      <button v-else type="button" @click="$emit('retry')">重新加载</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ title: string; loaded: number; total: number; preparing: boolean; error: string }>()
defineEmits<{ retry: [] }>()
const phase = computed(() => props.preparing ? '资源已就绪，正在准备场景…' : '正在加载天空背景与贴图…')
const progress = computed(() => props.preparing ? 96 : props.total > 0 ? Math.max(4, Math.min(90, props.loaded / props.total * 90)) : 4)
</script>

<style scoped>
.page-loading { position: fixed; inset: 0; z-index: 100000; display: grid; place-items: center; padding: 28px; background: radial-gradient(ellipse at 50% 40%, #1e222a, #0d1016 70%); color: #eceae6; }
.loading-content { width: min(360px, 100%); text-align: center; }
.loading-orbit { width: 96px; height: 96px; margin-bottom: 22px; }
.loading-orbit-track { fill: none; stroke: #a7b8c42e; stroke-width: 1; }
.loading-sun { fill: #dfc79e; }
.loading-planet { fill: #b5cfdf; transform-origin: 48px 48px; animation: loading-orbit 4s linear infinite; }
h1 { font-size: 20px; font-weight: 600; line-height: 1.5; letter-spacing: .04em; }
p { min-height: 24px; margin: 14px 0 22px; color: #b6bfc9; font-size: 14px; line-height: 1.8; }
.loading-meter { height: 3px; overflow: hidden; border-radius: 3px; background: #ffffff14; }
.loading-meter i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #b5cfdf, #dfc79e); transition: width .25s; }
small { display: block; margin-top: 12px; font-size: 12px; color: #8894a3; }
button { border: 1px solid #dfc79e66; border-radius: 8px; padding: 9px 20px; background: #dfc79e15; color: #ecd9b8; cursor: pointer; }
.has-error .loading-planet { animation-play-state: paused; }
@keyframes loading-orbit { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loading-planet { animation: none; } .loading-meter i { transition: none; } }
</style>
