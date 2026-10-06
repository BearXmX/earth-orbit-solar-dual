<template>
  <section ref="panelRef" class="floating-panel"
    :class="[`variant-${variant}`, { collapsed, resizing, 'resize-from-right': resizeFromRight }]"
    :aria-label="title" :style="panelStyle" @pointerdown.capture="bringToFront">
    <header class="floating-panel-head" :class="{ draggable }" @pointerdown="startDrag">
      <div class="floating-panel-title">
        <div class="floating-panel-title-line">
          <slot name="title-prefix"></slot>
          <span class="floating-panel-title-label" :title="title">{{ title }}</span>
        </div>
        <span v-if="subtitle" class="floating-panel-subtitle">{{ subtitle }}</span>
      </div>
      <div class="floating-panel-actions">
        <slot v-if="!collapsed" name="header-meta"></slot>
        <button type="button" class="panel-action" :aria-label="collapsed ? `展开${title}` : `收起${title}`"
          :title="collapsed ? `展开${title}` : `收起${title}`" :aria-expanded="!collapsed"
          @pointerdown.stop @click.stop="toggleCollapsed">
          <svg class="panel-fold-icon" :class="{ folded: collapsed }" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 14.5 12 8.5l6 6" />
            <path class="fold-guide" d="M8.5 18h7" />
          </svg>
        </button>
        <button v-if="closeable" type="button" class="panel-action panel-close" :aria-label="`关闭${title}`"
          :title="`关闭${title}`" @pointerdown.stop @click.stop="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </div>
    </header>
    <div v-show="!collapsed" class="floating-panel-content">
      <slot></slot>
    </div>
    <button v-if="resizable && !collapsed" type="button" class="floating-panel-resize"
      title="拖动调整面板大小，也可使用方向键" :aria-label="`调整${title}大小`"
      @pointerdown.stop.prevent="startResize" @keydown="resizeWithKeyboard">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m8 16 8-8M10 8h6v6M8 10v6h6" />
      </svg>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'

type PanelVariant = 'header' | 'control' | 'data' | 'track'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  variant?: PanelVariant
  anchor?: 'free' | 'top-right'
  anchorIndex?: number
  initialTop?: number
  initialBottom?: number
  initialLeft?: number
  initialRight?: number
  initialWidth?: number
  initialHeight?: number
  topInset?: number
  bottomInset?: number
  collapsed?: boolean
  initialCollapsed?: boolean
  draggable?: boolean
  resizable?: boolean
  closeable?: boolean
  minWidth?: number
  minHeight?: number
}>(), {
  subtitle: '',
  variant: 'data',
  anchor: 'free',
  anchorIndex: 0,
  topInset: 12,
  initialCollapsed: false,
  draggable: true,
  resizable: true,
  closeable: false,
})

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  close: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const positioned = ref(false)
const internalCollapsed = ref(props.initialCollapsed)
const instance = getCurrentInstance()
const isCollapsedControlled = Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, 'collapsed')
const collapsed = computed({
  get: () => isCollapsedControlled ? (props.collapsed ?? internalCollapsed.value) : internalCollapsed.value,
  set: (value: boolean) => {
    internalCollapsed.value = value
    emit('update:collapsed', value)
  },
})
const resizing = ref(false)
const panelZIndex = ref(44)
const position = reactive({ x: 14, y: 12 })
const size = reactive({ width: 0, height: 0 })
const desiredSize = reactive({ width: 0, height: 0 })
const relativePosition = reactive({ x: 0, y: 0 })
const bottomInset = computed(() => props.bottomInset ?? (props.variant === 'control' ? 140 : 10))
const resizeFromRight = computed(() => typeof window === 'undefined'
  || position.x + size.width * 0.5 <= window.innerWidth * 0.5)
const panelStyle = computed<CSSProperties>(() => ({
  left: `${position.x}px`,
  top: `${position.y}px`,
  width: `${collapsed.value ? Math.min(size.width || 220, props.variant === 'header' ? 260 : 210) : size.width}px`,
  height: collapsed.value ? undefined : `${size.height}px`,
  zIndex: panelZIndex.value,
  visibility: positioned.value ? 'visible' : 'hidden',
}))

let manuallyResized = false
let manuallyPositioned = false
let dragState: { pointerId: number; startX: number; startY: number; x: number; y: number } | null = null
let resizeState: { pointerId: number; startX: number; startY: number; x: number; width: number; height: number; fromRight: boolean } | null = null
let previousCursor = ''
let previousUserSelect = ''

function getVariantDefaults() {
  switch (props.variant) {
    case 'header': return { width: 500, height: 100, top: 12, minWidth: 260, minHeight: 80 }
    case 'control': return {
      width: 280, height: Math.max(160, window.innerHeight - (props.initialTop ?? 130) - bottomInset.value),
      top: 130, minWidth: 240, minHeight: 160,
    }
    case 'track': return { width: 620, height: 360, top: 76, minWidth: 300, minHeight: 200 }
    default: return { width: 360, height: 250, top: 76, minWidth: 240, minHeight: 160 }
  }
}

function getMinimumSize() {
  const defaults = getVariantDefaults()
  return { width: props.minWidth ?? defaults.minWidth, height: props.minHeight ?? defaults.minHeight }
}

function followsAnchor() {
  return props.anchor === 'top-right' && !manuallyPositioned
}

function getAnchorTop() {
  const index = Math.max(0, props.anchorIndex)
  const top = Math.max(props.topInset, props.initialTop ?? getVariantDefaults().top) + index * 68
  return Math.min(top, Math.max(props.topInset, window.innerHeight - bottomInset.value - 48))
}

function applyAnchorPosition() {
  const current = getPanelSize()
  const right = (props.initialRight ?? 14) + Math.max(0, props.anchorIndex) * 18
  Object.assign(position, clampPosition(window.innerWidth - current.width - right, getAnchorTop()))
  updateRelativePosition()
}

function fitSizeToViewport() {
  size.width = Math.min(desiredSize.width, Math.max(1, window.innerWidth - 20))
  const availableTop = followsAnchor() ? getAnchorTop() : props.topInset
  size.height = Math.min(desiredSize.height, Math.max(48, window.innerHeight - availableTop - bottomInset.value))
}

function getPanelSize() {
  return collapsed.value
    ? { width: panelRef.value?.offsetWidth || 210, height: panelRef.value?.offsetHeight || 48 }
    : { width: size.width, height: size.height }
}

function getBounds() {
  const current = getPanelSize()
  return {
    minX: 10, maxX: Math.max(10, window.innerWidth - current.width - 10),
    minY: props.topInset, maxY: Math.max(props.topInset, window.innerHeight - current.height - bottomInset.value),
  }
}

function clampPosition(x: number, y: number) {
  const bounds = getBounds()
  return {
    x: Math.max(bounds.minX, Math.min(x, bounds.maxX)),
    y: Math.max(bounds.minY, Math.min(y, bounds.maxY)),
  }
}

function updateRelativePosition() {
  const bounds = getBounds()
  const rangeX = bounds.maxX - bounds.minX
  const rangeY = bounds.maxY - bounds.minY
  if (rangeX > 0) relativePosition.x = Math.max(0, Math.min(1, (position.x - bounds.minX) / rangeX))
  if (rangeY > 0) relativePosition.y = Math.max(0, Math.min(1, (position.y - bounds.minY) / rangeY))
}

function applyRelativePosition() {
  if (!positioned.value) return
  if (!manuallyResized && props.variant === 'control' && props.initialHeight === undefined) {
    desiredSize.height = getVariantDefaults().height
  }
  fitSizeToViewport()
  if (followsAnchor()) {
    applyAnchorPosition()
    return
  }
  const bounds = getBounds()
  position.x = bounds.minX + (bounds.maxX - bounds.minX) * relativePosition.x
  position.y = bounds.minY + (bounds.maxY - bounds.minY) * relativePosition.y
}

async function setInitialPosition() {
  const defaults = getVariantDefaults()
  desiredSize.width = props.initialWidth ?? defaults.width
  desiredSize.height = props.initialHeight ?? defaults.height
  fitSizeToViewport()
  await nextTick()
  if (followsAnchor()) {
    applyAnchorPosition()
    positioned.value = true
    return
  }
  const current = getPanelSize()
  const defaultLeft = props.variant === 'header' || props.variant === 'control' ? 14 : undefined
  const x = props.initialLeft ?? (props.initialRight !== undefined
    ? window.innerWidth - current.width - props.initialRight
    : defaultLeft ?? window.innerWidth - current.width - 18)
  const y = props.initialBottom === undefined
    ? props.initialTop ?? defaults.top
    : window.innerHeight - current.height - props.initialBottom
  Object.assign(position, clampPosition(x, y))
  updateRelativePosition()
  positioned.value = true
}

function bringToFront() {
  const highest = Array.from(document.querySelectorAll<HTMLElement>('.floating-panel'))
    .filter(panel => panel !== panelRef.value)
    .reduce((value, panel) => Math.max(value, Number.parseInt(window.getComputedStyle(panel).zIndex, 10) || 44), 44)
  if (panelZIndex.value <= highest) panelZIndex.value = highest + 1
}

function toggleCollapsed() { collapsed.value = !collapsed.value }

function startInteraction(cursor: string) {
  previousCursor = document.body.style.cursor
  previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = cursor
  document.body.style.userSelect = 'none'
  window.addEventListener('blur', stopPanelInteraction)
}

function endInteraction() {
  document.body.style.cursor = previousCursor
  document.body.style.userSelect = previousUserSelect
  window.removeEventListener('blur', stopPanelInteraction)
}

function stopPanelInteraction() {
  endDrag()
  endResize()
}

function startDrag(event: PointerEvent) {
  if (!props.draggable || event.button !== 0 || event.isPrimary === false || dragState || resizeState) return
  if ((event.target as Element).closest('button, input, select, textarea, a, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"], .el-select, [data-panel-no-drag]')) return
  event.preventDefault()
  dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: position.x, y: position.y }
  startInteraction('grabbing')
  window.addEventListener('pointermove', moveDrag)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function moveDrag(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return
  if (Math.abs(event.clientX - dragState.startX) + Math.abs(event.clientY - dragState.startY) > 2) manuallyPositioned = true
  Object.assign(position, clampPosition(dragState.x + event.clientX - dragState.startX,
    dragState.y + event.clientY - dragState.startY))
}

function endDrag(event?: PointerEvent) {
  if (event && dragState && event.pointerId !== dragState.pointerId) return
  if (dragState) { updateRelativePosition(); endInteraction() }
  dragState = null
  window.removeEventListener('pointermove', moveDrag)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function startResize(event: PointerEvent) {
  if (event.button !== 0 || event.isPrimary === false || dragState || resizeState) return
  resizeState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: position.x,
    width: size.width, height: size.height, fromRight: resizeFromRight.value }
  resizing.value = true
  startInteraction(resizeState.fromRight ? 'nwse-resize' : 'nesw-resize')
  window.addEventListener('pointermove', moveResize)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
}

function applyResize(width: number, height: number, fromRight: boolean, originalX: number, originalWidth: number) {
  const minimum = getMinimumSize()
  const rightEdge = originalX + originalWidth
  const maxWidth = Math.max(1, fromRight ? window.innerWidth - originalX - 10 : rightEdge - 10)
  const maxHeight = Math.max(48, window.innerHeight - position.y - bottomInset.value)
  size.width = Math.min(maxWidth, Math.max(minimum.width, width))
  size.height = Math.min(maxHeight, Math.max(minimum.height, height))
  position.x = fromRight ? originalX : rightEdge - size.width
  desiredSize.width = size.width
  desiredSize.height = size.height
  manuallyResized = true
}

function moveResize(event: PointerEvent) {
  if (!resizeState || event.pointerId !== resizeState.pointerId) return
  const dx = (event.clientX - resizeState.startX) * (resizeState.fromRight ? 1 : -1)
  applyResize(resizeState.width + dx, resizeState.height + event.clientY - resizeState.startY,
    resizeState.fromRight, resizeState.x, resizeState.width)
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const step = event.shiftKey ? 32 : 12
  const dx = (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) * (resizeFromRight.value ? 1 : -1)
  const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0
  applyResize(size.width + dx, size.height + dy, resizeFromRight.value, position.x, size.width)
  updateRelativePosition()
}

function endResize(event?: PointerEvent) {
  if (event && resizeState && event.pointerId !== resizeState.pointerId) return
  if (resizeState) { updateRelativePosition(); endInteraction() }
  resizeState = null
  resizing.value = false
  window.removeEventListener('pointermove', moveResize)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
}

function handleViewportResize() { nextTick(applyRelativePosition) }

watch(() => [props.topInset, bottomInset.value], handleViewportResize)
watch(() => [props.anchor, props.anchorIndex, props.initialTop, props.initialRight], () => {
  if (followsAnchor()) handleViewportResize()
})
watch(collapsed, async (isCollapsed) => {
  const previousY = position.y
  await nextTick()
  if (followsAnchor()) {
    fitSizeToViewport()
    applyAnchorPosition()
    if (!isCollapsed) bringToFront()
    return
  }
  const bounds = getBounds()
  position.x = bounds.minX + (bounds.maxX - bounds.minX) * relativePosition.x
  position.y = Math.max(bounds.minY, Math.min(previousY, bounds.maxY))
  updateRelativePosition()
  if (!isCollapsed) bringToFront()
})

onMounted(() => {
  setInitialPosition()
  window.addEventListener('resize', handleViewportResize)
})
onUnmounted(() => {
  endDrag()
  endResize()
  window.removeEventListener('resize', handleViewportResize)
})
</script>

<style scoped>
.floating-panel {
  --panel-accent: #e0c89f;
  --panel-text: #f1f0ed;
  --panel-muted: #afb5bb;
  --panel-border: rgba(232, 234, 237, .18);
  position: fixed;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  box-sizing: border-box;
  overflow: hidden;
  color: var(--panel-text);
  pointer-events: auto;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(33, 35, 39, .86), rgba(16, 18, 22, .88));
  box-shadow: 0 18px 48px rgba(0, 0, 0, .34), inset 0 1px 0 rgba(255, 255, 255, .07);
  backdrop-filter: blur(22px) saturate(120%);
  -webkit-backdrop-filter: blur(22px) saturate(120%);
}
.variant-header { --panel-accent: #e9ddc6; }
.variant-track { --panel-accent: #b9d4e2; }
.floating-panel-head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 54px;
  box-sizing: border-box;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(228, 231, 236, .13);
  background: linear-gradient(115deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, .012));
  user-select: none;
  touch-action: none;
}
.variant-header .floating-panel-head { min-height: 42px; padding-block: 7px; }
.floating-panel-head.draggable { cursor: grab; }
.floating-panel-head.draggable:active { cursor: grabbing; }
.floating-panel-title { display: grid; gap: 3px; min-width: 0; }
.floating-panel-title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.floating-panel-title-label {
  overflow: hidden;
  color: var(--panel-accent);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-panel-subtitle {
  overflow: hidden;
  color: var(--panel-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-panel-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; touch-action: manipulation; }
.panel-action {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid rgba(215, 220, 226, .2);
  border-radius: 8px;
  color: var(--panel-accent);
  background: rgba(239, 243, 248, .045);
  font-family: inherit;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}
.panel-action:hover { color: #f1dfbd; background: rgba(223, 200, 158, .12); }
.panel-close:hover { color: #eef6fc; background: rgba(186, 211, 229, .12); }
.panel-action svg, .floating-panel-resize svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.panel-fold-icon { transition: transform .16s ease; }
.panel-fold-icon.folded { transform: rotate(180deg); }
.fold-guide { opacity: .38; }
.floating-panel-content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(193, 202, 212, .4) transparent;
}
.variant-control .floating-panel-content {
  overflow-x: hidden;
  overflow-y: auto;
}
.floating-panel-resize {
  position: absolute;
  z-index: 2;
  left: 4px;
  bottom: 4px;
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  padding: 0;
  border: 1px solid rgba(220, 226, 235, .16);
  border-radius: 8px;
  color: #b9c7d2;
  background: rgba(20, 23, 28, .88);
  cursor: nesw-resize;
  touch-action: none;
}
.floating-panel-resize:hover { color: #ecd5ac; background: rgba(47, 44, 39, .94); }
.resize-from-right .floating-panel-resize { left: auto; right: 4px; cursor: nwse-resize; }
.resize-from-right .floating-panel-resize svg { transform: scaleX(-1); }
.panel-action:focus-visible, .floating-panel-resize:focus-visible { outline: 2px solid var(--panel-accent); outline-offset: -2px; }
.collapsed { grid-template-rows: auto; height: auto; }
.collapsed .floating-panel-head { min-height: 42px; border-bottom: 0; }
.collapsed .floating-panel-subtitle { display: none; }
</style>
