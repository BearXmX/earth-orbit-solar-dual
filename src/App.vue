<template>
  <PageLoading v-if="!pageReady" :title="isAdvanced && solarVisible ? '地球运动与太阳视运动' : '地球自转与公转'" :loaded="loadedResources"
    :total="totalResources" :preparing="preparingScene" :error="loadingError" @retry="reloadPage" />
  <div class="earth-orbit-lab" :inert="!pageReady" :aria-busy="!pageReady"
    :class="{ 'is-initializing': !pageReady, 'is-solar-open': isAdvanced && solarVisible, 'is-splitting': splitDragging }">
    <main class="page">
      <section ref="stageRef" class="stage-zone" :class="{ split: isAdvanced && solarVisible }"
        :style="{ '--split-ratio': splitRatio + '%' }">
        <div class="world-stage">
          <div ref="earthRef" class="canvas-host" :class="{ 'is-picking': pointPickingEnabled, 'is-observing': observerViewEnabled && !observerFlying, 'is-looking': observerLooking }" @pointerdown.capture="startObserverLook"></div>
          <div v-if="!observerViewEnabled && !observerFlying" class="scene-caption"><span>地球运动</span></div>
          <div v-if="observerViewEnabled || observerFlying" class="observer-view-notice" role="status">
            <strong>{{ observerFlying ? observerFlightPhase : selectedPoint.name + ' · 地面观测' }}</strong>
            <span>{{ observerFlying ? (playing ? '正在分段飞行，镜头持续跟随观测点。' : '分段飞行定位中，演示暂时暂停。') : observerSunNotice }}</span>
            <small v-if="!observerFlying">地方真太阳时 {{ solar.solarTimeText }} · 太阳大小为教学放大</small>
            <small v-if="!observerFlying">拖动环视 · {{ observerFollowingSun ? '正在跟随太阳' : '自由环视中' }}</small>
            <button v-if="!observerFlying" type="button" :aria-pressed="observerFollowingSun" @click="followObserverSun">{{ observerFollowingSun ? '跟随太阳' : '看向太阳' }}</button>
            <small v-if="!observerFlying && Math.abs(selectedPoint.lat) > 89.999">极点的方位以所选经线作为参考。</small>
          </div>
          <div v-if="observerFlying" class="observer-flight-veil" :style="{ opacity: observerFlightVeil }"></div>
          <ObserverCompass v-if="observerViewEnabled && !observerFlying" class="observer-compass"
            :heading="observerHeading" :style="{ bottom: (dockClearance + (legendVisible ? 44 : 0)) + 'px' }" />
          <div v-show="legendVisible" class="scene-legend"><span><i class="legend-dot observer"></i>观测点</span><span><i
                class="legend-line equator"></i>赤道</span><span><i class="legend-line dawn"></i>晨线</span><span><i
                class="legend-line dusk"></i>昏线</span><span v-if="layers.latitudeDayArc"><i
                class="legend-line day-arc"></i>昼弧</span><span v-if="layers.latitudeNightArc"><i
                class="legend-line night-arc"></i>夜弧</span></div>
        </div>
        <div v-if="isAdvanced && solarVisible" class="split-handle" role="separator" aria-label="调整两个场景宽度"
          aria-orientation="vertical" tabindex="0" :aria-valuenow="Math.round(splitRatio)" :aria-valuemin="25"
          :aria-valuemax="75" @pointerdown="startSplit" @keydown="handleSplitKey"><i></i></div>
        <div v-if="isAdvanced && solarVisible" class="solar-lite-shell">
          <div class="solar-top"><b>{{ solarSceneObject === 'city' ? '城市' : '日晷' }} · 太阳视运动</b><span>{{
            selectedPoint.name }} · {{ formatOrbitDayLabel(dayNo) }} · {{ solar.solarTimeText }}</span></div>
          <div v-if="solarSceneError" class="solar-scene-error" role="alert">
            <div>
              <strong>太阳视运动暂时无法显示</strong>
              <p>{{ solarSceneError }}。可以重试，或关闭右侧继续使用地球主场景。</p>
              <div class="solar-error-actions"><button type="button" @click="solarSceneError = ''">重试</button><button
                  type="button" @click="solarVisible = false">关闭右侧</button></div>
            </div>
          </div>
          <component v-else :is="solarSceneObject === 'city' ? CitySolarScene : EquatorialSundial" class="solar-component"
            @ready="startup.sceneReady('solar')" @load-error="onSolarLoadError" :axial-tilt="axialTilt"
            :latitude="selectedPoint.lat" :longitude="selectedPoint.lng" :day-of-year="dayNo"
            :solar-time="solar.solarTimeValue" :declination="solar.declination" :altitude="solar.altitude"
            :azimuth="solar.azimuth" :sunrise-text="solar.sunriseText" :sunset-text="solar.sunsetText"
            :day-length-text="solar.dayLengthText" />

        </div>
      </section>
    </main>
    <header class="lab-header">
      <div class="lab-brand"><svg class="brand-sun-icon" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="8" fill="currentColor" />
          <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M20 3v5m0 24v5M3 20h5m24 0h5M8 8l4 4m16 16 4 4M8 32l4-4m16-16 4-4" />
          </g>
        </svg>
        <h1>地球日夜变化与四季交替</h1><span class="edition-tag">{{ editionLabel }}</span>
      </div>
      <nav class="header-actions" aria-label="场景面板">
        <button @click="setCamera('overview')">总览</button>
        <button type="button" aria-haspopup="dialog" :aria-expanded="usageGuideVisible" @click="usageGuideVisible = true">使用说明</button>
        <button :class="{ active: controlsVisible }" :aria-pressed="controlsVisible"
          @click="controlsVisible = !controlsVisible">控制</button>
        <button :class="{ active: dataPanelVisible }" :aria-pressed="dataPanelVisible"
          @click="dataPanelVisible = !dataPanelVisible">数据</button>
        <button :class="{ active: formulaPanelVisible }" :aria-pressed="formulaPanelVisible"
          @click="formulaPanelVisible = !formulaPanelVisible">公式</button>
        <button :class="{ active: miniCameraVisible }" :aria-pressed="miniCameraVisible"
          @click="miniCameraVisible = !miniCameraVisible">副机位</button>
        <button :class="{ active: legendVisible }" :aria-pressed="legendVisible"
          @click="legendVisible = !legendVisible">图例</button>
        <button v-if="isAdvanced" :class="{ active: solarVisible }" :aria-pressed="solarVisible"
          @click="solarVisible = !solarVisible">太阳视运动</button>
        <label v-if="isAdvanced" class="observer-view-toggle"><span>观测点视角</span><el-switch
            :model-value="observerViewEnabled" aria-label="站在观测点看太阳"
            @change="setObserverView(Boolean($event))" /></label>
      </nav>
    </header>
    <UsageGuide v-model="usageGuideVisible" :edition="appEdition" />
    <FloatingPanel :top-inset="128" v-show="controlsVisible" title="场景控制" subtitle="视角 · 观测点 · 显示图层" variant="control"
      v-model:collapsed="controlsCollapsed" :initial-width="304" :initial-top="128"
      :bottom-inset="dockClearance + (legendVisible ? 42 : 0)">
      <aside class="left-panel">
        <section class="panel-card control-center-card">
          <div class="panel-title"><i></i><span>控制中心</span></div>
          <div class="control-center-grid">
            <el-button size="small" :type="focusCenter === 'sun' ? 'primary' : 'default'"
              @click="setFocusCenter('sun')">太阳中心</el-button>
            <el-button size="small" :type="focusCenter === 'earth' ? 'primary' : 'default'"
              @click="setFocusCenter('earth')">地球中心</el-button>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>视图模式</span></div>
          <div class="button-grid two">
            <el-button size="small" @click="setCamera('point')">地球近景</el-button>
            <el-button size="small" @click="setCamera('north')">北极俯视</el-button>
            <el-button size="small" @click="setCamera('ecliptic')">黄道侧视</el-button>
            <el-button size="small" @click="setCamera('overview')">公转总览</el-button>
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
              <el-slider v-model="playSpeed" :min="0.2" :max="100" :step="0.5" :show-tooltip="false" />
            </div>

            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>公转额外加速</span>
                <b>{{ revolutionMultiplier }}x</b>
              </div>
              <el-slider v-model="revolutionMultiplier" :min="1" :max="120" :step="1" :show-tooltip="false" />
              <p class="orbit-speed-hint">约 {{ orbitCycleSeconds }} 秒 / 圈 · 演示加速，设为 1× 取消公转额外加速</p>
            </div>

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
            <el-button v-for="city in cities" :key="city.key" size="small"
              :type="cityKey === city.key ? 'primary' : 'default'" @click="selectCity(city)">
              {{ city.name }}
            </el-button>
          </div>

          <div class="custom-point-control">
            <div class="custom-point-heading"><label for="point-picking-switch">自选点</label><el-switch
                id="point-picking-switch" v-model="pointPickingEnabled"
                :disabled="observerViewEnabled || observerFlying" aria-label="启用地球点选" /></div>
            <p>{{ observerViewEnabled || observerFlying ? '返回地球视角后可开启点选；此处仍可切换城市。' : pointPickingEnabled ?
              '轻点地球选择位置，选好后自动锁定。拖动仍用于旋转。' : '点选已锁定，旋转视角不会改变观测点。' }}</p>
          </div>
          <div class="location-card">
            <b>{{ selectedPoint.name }}</b>
            <span>{{ formatLat(selectedPoint.lat) }} · {{ formatLng(selectedPoint.lng) }}</span>
          </div>
        </section>

        <section class="panel-card observer-guide-controls">
          <div class="section-heading">
            <div class="panel-title"><i></i><span>观测点辅助</span></div><el-switch v-model="allObserverGuidesVisible"
              aria-label="观测点辅助全开全关" active-text="全开"
              :inactive-text="Object.values(observerVisibility).some(Boolean) ? '部分' : '全关'" />
          </div>
          <div class="button-grid two">
            <el-button v-for="item in observerGuideControls" :key="item.key"
              :type="observerVisibility[item.key] ? 'primary' : 'default'" :aria-pressed="observerVisibility[item.key]"
              @click="observerVisibility[item.key] = !observerVisibility[item.key]">{{ item.label }}</el-button>
            <el-button @click="focusObserverGuide">近看高度角</el-button>
          </div>
          <p class="control-note">以观测点的当地水平面为基准；太阳位于地平线下时，高度角为负。</p>
        </section>

        <section class="panel-card">
          <div class="section-heading">
            <div class="panel-title"><i></i><span>显示图层</span></div><el-switch v-model="allLayersVisible"
              aria-label="显示图层全开全关" active-text="全开"
              :inactive-text="Object.values(layers).some(Boolean) ? '部分' : '全关'" />
          </div>

          <div class="layer-grid">
            <el-button size="small" :type="layers.longitudeLines ? 'primary' : 'default'"
              @click="layers.longitudeLines = !layers.longitudeLines">经线</el-button>
            <el-button size="small" :type="layers.latitudeLines ? 'primary' : 'default'"
              @click="layers.latitudeLines = !layers.latitudeLines">纬线</el-button>
            <el-button size="small" :type="layers.longitudeLabels ? 'primary' : 'default'"
              @click="layers.longitudeLabels = !layers.longitudeLabels">经度标注</el-button>
            <el-button size="small" :type="layers.latitudeLabels ? 'primary' : 'default'"
              @click="layers.latitudeLabels = !layers.latitudeLabels">纬度标注</el-button>
            <el-button size="small" :type="layers.latitudeDayArc ? 'primary' : 'default'"
              @click="layers.latitudeDayArc = !layers.latitudeDayArc">纬线昼弧</el-button>
            <el-button size="small" :type="layers.latitudeNightArc ? 'primary' : 'default'"
              @click="layers.latitudeNightArc = !layers.latitudeNightArc">纬线夜弧</el-button>
            <el-button size="small" :type="layers.terminator ? 'primary' : 'default'"
              @click="layers.terminator = !layers.terminator">晨昏线</el-button>
            <el-button size="small" :type="layers.sunRays ? 'primary' : 'default'"
              @click="layers.sunRays = !layers.sunRays">平行光线</el-button>
            <el-button size="small" :type="layers.equator ? 'primary' : 'default'"
              @click="layers.equator = !layers.equator">赤道面</el-button>
            <el-button size="small" :type="layers.ecliptic ? 'primary' : 'default'"
              @click="layers.ecliptic = !layers.ecliptic">黄道面</el-button>
            <el-button size="small" :type="layers.tiltAngle ? 'primary' : 'default'"
              @click="layers.tiltAngle = !layers.tiltAngle">夹角标注</el-button>
            <el-button size="small" :type="layers.zones ? 'primary' : 'default'"
              @click="layers.zones = !layers.zones">地球五带</el-button>
            <el-button size="small" :type="layers.tropics ? 'primary' : 'default'"
              @click="layers.tropics = !layers.tropics">回归线与极圈</el-button>
            <el-button size="small" :type="layers.orbit ? 'primary' : 'default'"
              @click="layers.orbit = !layers.orbit">公转轨道</el-button>
            <el-button size="small" :type="layers.subsolar ? 'primary' : 'default'"
              @click="layers.subsolar = !layers.subsolar">直射点</el-button>
            <el-button size="small" :type="layers.axisArrow ? 'primary' : 'default'"
              @click="layers.axisArrow = !layers.axisArrow">地轴箭头</el-button>
            <el-button size="small" :type="layers.orbitDirection ? 'primary' : 'default'"
              @click="layers.orbitDirection = !layers.orbitDirection">公转方向</el-button>
            <el-button size="small" :type="layers.rotationDirection ? 'primary' : 'default'"
              @click="layers.rotationDirection = !layers.rotationDirection">自转方向</el-button>
          </div>
          <p v-if="layers.latitudeDayArc || layers.latitudeNightArc" class="control-note">昼弧为金色，夜弧为蓝色，均包含 0° 赤道；关闭“纬线”可单独观察弧段。</p>
          <div class="map-overlay-controls">
            <div class="custom-point-heading"><label for="noon-altitude-switch">正午太阳高度</label><el-switch
                id="noon-altitude-switch" v-model="layers.noonAltitude" aria-label="正午太阳高度" /></div>
            <p class="control-note">显示正午子午线、每隔 10° 的纬度刻度，以及各纬度的正午高度读数。</p>
            <div class="custom-point-heading"><label for="date-line-switch">国际日界线</label><el-switch
                id="date-line-switch" v-model="layers.dateLine" aria-label="国际日界线" /></div>
            <div class="custom-point-heading"><label for="time-zones-switch">理论时区划分</label><el-switch
                id="time-zones-switch" v-model="layers.timeZones" aria-label="理论时区划分贴图" /></div>
            <p class="control-note">每区 15°，展示理论时区；不等同于现行行政时区。日界线采用教学近似折线。</p>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-title"><i></i><span>光线控制</span></div>
          <div class="sun-glow-control">
            <div class="custom-point-heading"><label for="sun-beam-switch">太阳光辉 · 覆盖昼半球</label><el-switch
                id="sun-beam-switch" v-model="sunBeamVisible" aria-label="太阳照向地球的光辉" /></div>
            <el-slider v-model="sunBeamStrength" :min="0" :max="2" :step="0.1" :disabled="!sunBeamVisible"
              aria-label="太阳光辉强度" />
          </div>
          <div class="sun-glow-control">
            <div class="custom-point-heading"><label for="sun-glow-switch">太阳光晕</label><el-switch id="sun-glow-switch"
                v-model="sunGlowVisible" aria-label="太阳光晕" /></div>
            <el-slider v-model="sunGlowStrength" :min="0" :max="2" :step="0.1" :disabled="!sunGlowVisible"
              aria-label="太阳光晕强度" />
          </div>
          <div class="mini-control-grid light-control-grid">
            <div class="mini-control-card wide">
              <div class="mini-control-head">
                <span>平行光线数量</span>
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
    </FloatingPanel>
    <FloatingPanel :top-inset="128" v-show="dataPanelVisible" title="观测点实时数据" anchor="top-right"
      :anchor-index="rightPanelIndex('data')" :subtitle="selectedPoint.name" :initial-right="14" :initial-top="128"
      :initial-width="304" :initial-height="dataPanelInitialHeight" :bottom-inset="dockClearance" closeable
      @close="dataPanelVisible = false">
      <div class="observer-card">
        <p class="data-model-note">时间均为地方真太阳时。日出日落按太阳中心高度 0° 计算，未计大气折射与太阳视半径。</p>
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
          <div v-if="!solar.horizonOnly" class="day-night-bar">
            <i class="day" :style="{ width: `${dayNightRatio.dayPercent}%` }"></i>
            <i class="night" :style="{ width: `${dayNightRatio.nightPercent}%` }"></i>
          </div>
          <div v-if="!solar.horizonOnly" class="day-night-axis">
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
            <line v-for="line in subsolarChartGridLines" :key="line.label" x1="53" x2="268" :y1="line.y" :y2="line.y"
              class="chart-grid-line" :class="line.main ? 'main' : ''" />
            <text v-for="line in subsolarChartGridLines" :key="`${line.label}-text`" x="4" :y="line.y + 3"
              class="chart-y-label">
              {{ line.label }}
            </text>
            <polyline :points="subsolarTrendLine" class="chart-trend-line" />
            <circle :cx="currentSubsolarChartPoint.x" :cy="currentSubsolarChartPoint.y" r="4"
              class="chart-current-dot" />
            <text :x="currentSubsolarChartPoint.x + 7" :y="currentSubsolarChartPoint.y - 7"
              class="chart-current-text">当前</text>
            <text x="53" y="137" class="chart-x-label">1月</text>
            <text x="146" y="137" class="chart-x-label">年中</text>
            <text x="246" y="137" class="chart-x-label">12月</text>
          </svg>
        </div>
      </div>
    </FloatingPanel>
    <FloatingPanel :top-inset="128" v-show="formulaPanelVisible" title="动态公式" anchor="top-right"
      :anchor-index="rightPanelIndex('formula')" subtitle="实时参数代入" v-model:collapsed="formulaCollapsed"
      :initial-right="14" :initial-top="128" :initial-width="352" :initial-height="430" :bottom-inset="dockClearance"
      closeable @close="formulaPanelVisible = false">
      <div class="formula-card">
        <p class="data-model-note">教学年采用2026年分至日期（北京时间），并以整日作为季节锚点；不表示精确交节瞬间。角度代入三角函数时需保持单位一致。</p>
        <div class="formula-list">
          <div v-for="item in formulaRows" :key="item.name" class="formula-line">
            <span>{{ item.name }}</span>
            <p class="formula-desc">{{ item.desc }}</p>
            <code class="formula-real">{{ item.formula }}</code>
            <code>{{ item.dynamic }}</code>
          </div>
        </div>
      </div>
    </FloatingPanel>
    <FloatingPanel :top-inset="128" v-show="layers.noonAltitude" title="正午太阳高度" anchor="top-right"
      :anchor-index="rightPanelIndex('noon')" :subtitle="formatOrbitDayLabel(dayNo)" :initial-right="14"
      :initial-top="128" :initial-width="368" :initial-height="550" :bottom-inset="dockClearance"
      closeable @close="layers.noonAltitude = false">
      <NoonAltitudePanel :declination="solar.declination" :terms="terms"
        :active-term="terms.find(term => Math.abs(sceneDay - termDay(term)) < 0.01)?.name || ''"
        @select-term="setTerm" @focus="focusNoonAltitude" />
    </FloatingPanel>
    <FloatingPanel :top-inset="128" v-show="miniCameraVisible" title="副机位" anchor="top-right"
      :anchor-index="rightPanelIndex('mini')" subtitle="独立观察地球" class="mini-camera-panel" :min-width="320"
      :initial-right="14" :initial-top="128" :initial-width="460" :initial-height="380" :bottom-inset="dockClearance"
      closeable @close="miniCameraVisible = false">
      <template #header-meta>
        <div class="mini-camera-select-row" @pointerdown.stop @click.stop @wheel.stop>
          <el-select v-model="miniCameraMode" size="small" class="mini-camera-select"
            popper-class="mini-camera-select-popper"><el-option v-for="item in miniCameraModes" :key="item.value"
              :label="item.label" :value="item.value" /></el-select>
        </div>
      </template>
      <div ref="miniCameraUiRef" class="mini-camera-ui">
        <div ref="miniCameraCanvasRef" class="mini-camera-canvas-host"></div>

      </div>
    </FloatingPanel>
    <footer class="timeline-dock" aria-label="运动控制轴">
      <div class="timeline-scroll">
        <button class="master-play" :aria-label="playing ? '全部暂停' : '开始演示'" :title="playing ? '全部暂停' : '恢复演示'"
          @click="toggleAllMotion">{{ playing ? 'Ⅱ' : '▶' }}</button>
        <div class="timeline-channel orbit-channel">
          <div class="channel-head"><button class="channel-play" :aria-pressed="revolutionPlaying"
              @click="toggleMotion('revolution')">{{ revolutionPlaying ? 'Ⅱ' : '▶' }} 公转</button><strong>{{
                formatOrbitDayLabel(orbitDay) }}</strong><span>{{ revolutionMultiplier }}× 加速</span></div>
          <el-slider v-model="orbitDay" aria-label="公转日期" :min="1" :max="365" :step="1" :show-tooltip="false" />
          <div class="season-ticks"><button v-for="term in terms" :key="term.name"
              :style="{ left: ((termDay(term) - 1) / 364 * 100) + '%' }"
              :class="{ active: isTermActive(term) }" @click="setTerm(term)">{{ term.name }}</button></div>
        </div>
        <div class="timeline-channel rotation-channel">
          <div class="channel-head"><button class="channel-play" :aria-pressed="rotationPlaying"
              @click="toggleMotion('rotation')">{{ rotationPlaying ? 'Ⅱ' : '▶' }} 自转</button><strong>{{
                solar.solarTimeText
              }}</strong><span>{{ selectedPoint.name }} · 地方太阳时</span></div>
          <el-slider :model-value="localSolarSliderValue" aria-label="地方太阳时" :min="0" :max="1440" :step="5"
            :show-tooltip="false" @input="handleLocalSolarSliderInput" />
          <div class="time-ticks"><button v-for="hour in [6, 12, 18]" :key="hour" type="button"
              :style="{ left: (hour / 24 * 100) + '%' }" :aria-label="`定位到地方太阳时 ${hour}:00`"
              @click="handleLocalSolarSliderInput(hour * 60)">{{ hour }}:00</button></div>
        </div>
        <div class="timeline-channel tilt-channel">
          <div class="channel-head"><span class="channel-label">黄赤交角</span><strong>{{ obliquityLabel }}</strong></div>
          <el-slider v-model="obliquityMinutes" :min="0" :max="MAX_OBLIQUITY_MINUTES" :step="IS_DECIMAL_ANGLE ? 6 : 1" :show-tooltip="false"
            aria-label="黄赤交角" :aria-valuetext="obliquityLabel" />
          <div class="tilt-actions"><span>0° — {{ AXIAL_TILT_LABEL }}</span><button
              @click="obliquityMinutes = MAX_OBLIQUITY_MINUTES">恢复 {{ AXIAL_TILT_LABEL }}</button></div>
        </div>
      </div>
      <p v-if="revolutionOnly" class="reverse-notice" role="status">仅公转、不自转时，地方太阳时会倒退，公转日期继续向前；这是独立停转演示产生的相对运动。</p>
    </footer>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import earthTextureDataUrl from '@/assets/image/Material.002_diffuse.jpg?inline'
import earthNightTextureDataUrl from '@/assets/image/Earth_emissive.jpg?inline'
import sunTextureDataUrl from '@/assets/image/sun.png?inline'
import EquatorialSundial from './components/EquatorialSundial.vue'
import CitySolarScene from './components/CitySolarScene.vue'
import FloatingPanel from './components/FloatingPanel.vue'
import ObserverCompass from './components/ObserverCompass.vue'
import PageLoading from './components/PageLoading.vue'
import UsageGuide from './components/UsageGuide.vue'
import NoonAltitudePanel from './components/NoonAltitudePanel.vue'
import { createSceneLoading } from './utils/sceneLoading'
import { prepareSceneTextures } from './scene/prepareSceneTextures'
import { clearObjectChildren } from './scene/disposeSceneResources'
import { appEdition, isAdvancedEdition, solarSceneObject, editionLabel } from './utils/edition'
import { createNebulaSkybox } from './scene/createNebulaSkybox'
import { createEarthAppearance } from './scene/createEarthAppearance'
import { createObliquityHelper } from './scene/createObliquityHelper'
import { AXIAL_TILT as DEFAULT_AXIAL_TILT, AXIAL_TILT_LABEL, MAX_OBLIQUITY_MINUTES, IS_DECIMAL_ANGLE, formatDegreesMinutes, formatSignedDegreesMinutes } from './utils/astronomy'
import { declinationAtDay, orbitAngleAtDay, solarLongitudeAtDay } from './utils/earthOrbit'
import { createObserverGuide } from './scene/createObserverGuide'
import { createNoonAltitudeGuide } from './scene/createNoonAltitudeGuide'
import './styles/lab.css'
import { createTerminator } from './scene/createTerminator'
import { createSunGlow } from './scene/createSunGlow'
import { createSunBeam } from './scene/createSunBeam'
import { createTimeZoneOverlay } from './scene/createTimeZoneOverlay'
import { createObserverSurfaceScene } from './scene/createObserverSurfaceScene'
import { createObserverFlight, observerBasis, OBSERVER_FLIGHT_DURATION } from './utils/observerFlight'
import { createPointPickGesture, followMovingCenter, verticalSunRaySegments } from './utils/sceneInteraction'
import { advanceEarthMotion, rotationFromSolarMinutes, solarMinutesFromRotation, wrapOrbitDay } from './utils/earthMotion'

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

const isAdvanced = computed(() => isAdvancedEdition)
const solarVisible = ref(false)
const pageReady = ref(false)
const loadedResources = ref(0)
const totalResources = ref(5)
const preparingScene = ref(false)
const loadingError = ref('')
const solarSceneError = ref('')
let appDisposed = false
const startup = createSceneLoading(isAdvancedEdition && solarVisible.value ? ['earth', 'solar'] : ['earth'], (loaded, total) => {
  loadedResources.value = loaded
  totalResources.value = Math.max(5, total)
})
function reloadPage() { window.location.reload() }
function onSolarLoadError(message: string) {
  if (appDisposed) return
  if (pageReady.value) {
    solarSceneError.value = message
    return
  }
  startup.fail(message)
  loadingError.value = message
  pageReady.value = false
}

const earthRef = ref<HTMLDivElement | null>(null)
const miniCameraUiRef = ref<HTMLDivElement | null>(null)
const miniCameraCanvasRef = ref<HTMLDivElement | null>(null)

const obliquityMinutes = ref(MAX_OBLIQUITY_MINUTES)
const axialTilt = computed(() => obliquityMinutes.value / 60)
const polarCircle = computed(() => 90 - axialTilt.value)
const axialTiltRotation = computed(() => -axialTilt.value * Math.PI / 180)
const obliquityLabel = computed(() => formatDegreesMinutes(axialTilt.value))
const sceneDay = ref(172)
const dateValue = ref('2026-06-21')
const utcMinutes = ref(4 * 60)
const DEFAULT_PLAY_SPEED = 40
const playSpeed = ref(DEFAULT_PLAY_SPEED)
const DEFAULT_REVOLUTION_MULTIPLIER = 60
const revolutionMultiplier = ref(DEFAULT_REVOLUTION_MULTIPLIER)
const orbitCycleSeconds = computed(() => Math.round((365 * 1440) / (6 * playSpeed.value * revolutionMultiplier.value)))
const rotationPlaying = ref(false)
const revolutionPlaying = ref(false)
const revolutionOnly = computed(() => revolutionPlaying.value && !rotationPlaying.value)
const playing = computed({
  get: () => rotationPlaying.value || revolutionPlaying.value,
  set: value => {
    rotationPlaying.value = value
    revolutionPlaying.value = value
  },
})
const focusCenter = ref<FocusCenter>('sun')
const activeCameraMode = ref<CameraMode>('overview')
const controlsVisible = ref(true)
const usageGuideVisible = ref(false)
const controlsCollapsed = ref(false)
const pointPickingEnabled = ref(false)
const sunGlowVisible = ref(true)
const sunGlowStrength = ref(1)
const sunBeamVisible = ref(true)
const sunBeamStrength = ref(1)
const observerViewEnabled = ref(false)
const observerLooking = ref(false)
const observerHeading = ref(0)
const observerSunInView = ref(false)
const observerSunProjection = new THREE.Vector3()
const observerFollowingSun = ref(true)
let stopObserverLook: (() => void) | null = null
const observerFlying = ref(false)
const observerFlightPhase = ref('')
const observerFlightProgress = ref(0)
const observerFlightVeil = computed(() => observerFlying.value ? Math.max(0, 1 - Math.abs(observerFlightProgress.value - 0.94) / 0.06) : 0)
const dockClearance = ref(136)
const viewportHeight = ref(window.innerHeight)
const dataPanelInitialHeight = computed(() => Math.min(380, Math.max(160, viewportHeight.value - 128 - dockClearance.value - 68)))
function syncViewportInsets() {
  viewportHeight.value = window.innerHeight
  dockClearance.value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-clearance')) || 136
}
const formulaCollapsed = ref(true)
const stageRef = ref<HTMLElement | null>(null)
const splitRatio = ref(56)
const splitDragging = ref(false)

function startSplit(event: PointerEvent) {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  splitDragging.value = true
  const move = (e: PointerEvent) => {
    const bounds = stageRef.value?.getBoundingClientRect()
    if (bounds) splitRatio.value = Math.min(75, Math.max(25, (e.clientX - bounds.left) / bounds.width * 100))
  }
  const stop = () => {
    splitDragging.value = false
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('pointercancel', stop)
    handle.removeEventListener('lostpointercapture', stop)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
  handle.addEventListener('lostpointercapture', stop)
}
function handleSplitKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  splitRatio.value = event.key === 'Home' ? 25 : event.key === 'End' ? 75 : Math.max(25, Math.min(75, splitRatio.value + (event.key === 'ArrowLeft' ? -2 : 2)))
}
const cityKey = ref('beijing')
const rayCount = ref(5)
const lightIntensity = ref(1.25)
const nightBrightness = ref(1)
const cityLightStrength = ref(2.45)

const dataPanelVisible = ref(false)
const formulaPanelVisible = ref(false)
const legendVisible = ref(false)
const miniCameraVisible = ref(false)
const miniCameraMode = ref<MiniCameraMode>('front')
const rightPanelOrder = computed(() => [dataPanelVisible.value ? 'data' : '', formulaPanelVisible.value ? 'formula' : '', miniCameraVisible.value ? 'mini' : '', layers.noonAltitude ? 'noon' : ''].filter(Boolean))
function rightPanelIndex(panel: string) { return Math.max(0, rightPanelOrder.value.indexOf(panel)) }

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
  longitudeLines: true,
  latitudeLines: true,
  longitudeLabels: false,
  latitudeLabels: false,
  latitudeDayArc: false,
  latitudeNightArc: false,
  noonAltitude: false,
  timeZones: false,
  dateLine: false,
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

const observerVisibility = reactive({ ripple: true, normal: false, sunRay: false, horizon: false, altitude: false })
const observerGuideControls = [
  { key: 'ripple', label: '观测点水波纹' },
  { key: 'normal', label: '地球法线' },
  { key: 'sunRay', label: '太阳光延长线' },
  { key: 'horizon', label: '当地地平面' },
  { key: 'altitude', label: '太阳高度角' },
] as const

const allLayersVisible = computed({
  get: () => Object.values(layers).every(Boolean),
  set: value => { (Object.keys(layers) as Array<keyof typeof layers>).forEach(key => { layers[key] = value }) },
})
const allObserverGuidesVisible = computed({
  get: () => Object.values(observerVisibility).every(Boolean),
  set: value => { (Object.keys(observerVisibility) as Array<keyof typeof observerVisibility>).forEach(key => { observerVisibility[key] = value }) },
})

const terms: Term[] = [
  { name: '春分', date: '2026-03-20' },
  { name: '夏至', date: '2026-06-21' },
  { name: '秋分', date: '2026-09-23' },
  { name: '冬至', date: '2026-12-22' },
]

const cities = computed<City[]>(() => [
  { key: 'beijing', name: '北京', lat: 39.9, lng: 116.4 },
  { key: 'shanghai', name: '上海', lat: 31.23, lng: 121.47 },
  { key: 'xiamen', name: '厦门', lat: 24.48, lng: 118.08 },
  { key: 'guangzhou', name: '广州', lat: 23.13, lng: 113.26 },
  { key: 'singapore', name: '新加坡', lat: 1.35, lng: 103.82 },
  { key: 'sydney', name: '悉尼', lat: -33.87, lng: 151.21 },
  { key: 'tromso', name: '特罗姆瑟', lat: 69.65, lng: 18.96 },
  { key: 'arctic', name: '北极圈示例', lat: polarCircle.value, lng: 0 },
])

const DEG = Math.PI / 180
const RAD = 180 / Math.PI
const EARTH_R = 0.56
const SUN_R = 0.76
const ORBIT_R = 4.05
// 极昼/极夜临界点留少量容差，避免角度运算的浮点误差。
const POLAR_EPS = 1e-10
// 公转方向改为逆时针后，夏至位置从右侧换到左侧；
// 地轴倾斜方向也必须同步取反，保证夏至北半球朝向太阳、冬至北半球背向太阳。

// 从当前默认视角看，日期增加时公转应为逆时针：春分 → 夏至 → 秋分 → 冬至。
const ORBIT_DIR = -1

let earthRenderer: THREE.WebGLRenderer | null = null
let earthCompilePromise: Promise<unknown> | null = null
let earthDisposalPending = false
let earthScene: THREE.Scene | null = null
let earthCamera: THREE.PerspectiveCamera | null = null
let miniCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null
let miniPerspectiveCamera: THREE.PerspectiveCamera | null = null
let miniPolarCamera: THREE.OrthographicCamera | null = null
let nebulaSky: ReturnType<typeof createNebulaSkybox> | null = null
let obliquityHelper: ReturnType<typeof createObliquityHelper> | null = null
let observerGuide: ReturnType<typeof createObserverGuide> | null = null
let noonAltitudeGuide: ReturnType<typeof createNoonAltitudeGuide> | null = null
const observerWorldPoint = new THREE.Vector3()
const observerWorldNormal = new THREE.Vector3()
let miniRenderer: THREE.WebGLRenderer | null = null
let miniResizeObserver: ResizeObserver | null = null
let lastMiniRenderTime = 0
let earthControls: OrbitControls | null = null
let orbitLayer: THREE.Group | null = null
let animatedOrbitLayer: THREE.Group | null = null
let terminatorVisual: ReturnType<typeof createTerminator> | null = null
let sunGlow: ReturnType<typeof createSunGlow> | null = null
let sunBeam: ReturnType<typeof createSunBeam> | null = null
let timeZoneOverlay: ReturnType<typeof createTimeZoneOverlay> | null = null
let observerSurface: ReturnType<typeof createObserverSurfaceScene> | null = null
let observerFlight: ReturnType<typeof createObserverFlight> | null = null
let observerFlightStarted = 0
let observerFlightReturning = false
let observerFlightPointKey = ''
let flightMotion: { rotation: boolean; revolution: boolean } | null = null
let flightMotionChange = false
let observerReturnView: { position: THREE.Vector3; target: THREE.Vector3; focus: FocusCenter; mode: CameraMode; fov: number; controlsVisible: boolean } | null = null
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

const pointPickGesture = createPointPickGesture()
const lastFollowEarthPosition = new THREE.Vector3()
let followPositionInitialized = false
let cameraTween: {
  started: number; duration: number; followsEarth: boolean;
  startPosition: THREE.Vector3; endPosition: THREE.Vector3; startTarget: THREE.Vector3; endTarget: THREE.Vector3
} | null = null
const pointer = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
let raf = 0
let lastTime = 0
let autoOrbitDay = 172
let runtimeUtcMinutes = 4 * 60
let runtimeSpinRadians = rotationFromSolarMinutes(sunLongitudeAtDay(autoOrbitDay), runtimeUtcMinutes + equationOfTime(172))
let suppressSceneUpdate = false
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
  if (axialTilt.value < 1e-6) return '当前倾角为0°，全年太阳直射赤道；除两极的地平线临界状态外，几何昼夜各约12小时。'
  const tips: Record<string, string> = {
    春分: '本模型春分日太阳直射赤道，除两极外几何昼夜等长；两极太阳中心沿地平线运行。',
    夏至: '夏至附近：太阳直射北回归线，北半球昼长夜短，北极圈内出现极昼。',
    秋分: '本模型秋分日太阳再次直射赤道，除两极外几何昼夜等长；可与春分对比路径。',
    冬至: '冬至附近：太阳直射南回归线，北半球昼短夜长，北极圈内出现极夜。',
  }
  return tips[activeTerm.value!.name] || '拖动公转位置，观察太阳直射点、昼夜长短和晨昏线倾斜方向的同步变化。'
})

const distanceMisconceptionTip = computed(() => axialTilt.value < 1e-6
  ? '当前黄赤交角为0°，本模型全年赤纬为0°，不再出现由地轴倾斜造成的昼长季节变化。'
  : '四季主要由地轴倾斜和公转共同造成：太阳直射纬度、正午太阳高度和昼夜长短随季节变化。图中日地距离和球体大小均为示意。')

const dayNightRatio = computed(() => {
  const info = dayLengthInfo(selectedPoint.lat, solar.value.declination)
  const dayHours = info.type === 'polar-day' ? 24 : info.type === 'polar-night' ? 0 : info.dayLength
  const nightHours = 24 - dayHours
  return {
    dayHours,
    nightHours,
    dayText: solar.value.horizonOnly ? '地平线临界' : formatDuration(dayHours),
    nightText: solar.value.horizonOnly ? '地平线临界' : formatDuration(nightHours),
    dayPercent: clamp((dayHours / 24) * 100, 0, 100),
    nightPercent: clamp((nightHours / 24) * 100, 0, 100),
  }
})

const observerSunNotice = computed(() => {
  const h = solar.value.altitude
  if (solar.value.horizonOnly) return '太阳中心沿地平线运行 · 临界状态'
  if (Math.abs(h) < 1e-6) return '太阳中心位于地平线上'
  return h > 0 ? (observerSunInView.value ? '太阳在当前视野内 · 高度 ' : '太阳在地平线上方、视野外 · 高度 ') + signedDeg(h) : '太阳在地平线下方 · 中心高度 ' + signedDeg(h)
})

const formulaRows = computed(() => {
  const n = dayNo.value
  const phi = selectedPoint.lat
  const lambda = selectedPoint.lng
  const delta = solar.value.declination
  const seasonAngle = normalizeDegree((-orbitThetaByDay(sceneDay.value) - Math.PI / 2) * RAD)
  const eot = equationOfTime(n)
  const solarTime = solar.value.solarTimeValue
  const hourAngle = (solarTime - 720) / 4
  const dayInfo = dayLengthInfo(phi, delta)
  const dayLengthDynamic = solar.value.horizonOnly ? '太阳全天沿地平线运行，不存在普通的日出、日落时刻。' :
    dayInfo.type === 'normal'
      ? `cosH₀=-tan(${signedDeg(phi)})×tan(${signedDeg(delta)})，H₀=${formatDegreesMinutes(dayInfo.h0)}，L=2×${formatDegreesMinutes(dayInfo.h0)}÷(15°/小时)=${solar.value.dayLengthText}`
      : Math.abs(phi) > 89.999
        ? `极点处太阳中心高度为${signedDeg(solar.value.altitude)}，${dayInfo.type === 'polar-day' ? '全天在地平线上方' : '全天在地平线下方'}，L=${solar.value.dayLengthText}`
        : dayInfo.type === 'polar-day'
          ? `cosH₀≤-1，当前纬度进入极昼，L=${solar.value.dayLengthText}`
          : `cosH₀≥1，当前纬度进入极夜，L=${solar.value.dayLengthText}`

  return [
    {
      name: '太阳直射纬度 δ',
      desc: 'δ 为太阳直射点纬度，ε 为当前黄赤交角，λ☉ 为从春分点起算的太阳黄经。按本模型的地轴和公转位置计算。',
      formula: 'δ=arcsin(sinε·sinλ☉)',
      dynamic: `ε=${obliquityLabel.value}，λ☉=${formatDegreesMinutes(seasonAngle)}，δ=${signedDeg(delta)}`,
    },
    {
      name: '地方太阳时 Tₛ',
      desc: 'Tₛ 为地方真太阳时，λ 为经度（东经为正），E 为真太阳时减平太阳时的近似时差；UTC 为模型推算值。太阳上中天对应 Tₛ=12:00。',
      formula: 'Tₛ=UTC+λ×(4 min/°)+E（按24小时取模）',
      dynamic: `推算UTC=${formatClock(utcMinutes.value)}，λ=${formatSignedDegreesMinutes(lambda)}，E=${eot.toFixed(1)}min，Tₛ=${solar.value.solarTimeText}`,
    },
    {
      name: '太阳时角 ω',
      desc: 'ω 为太阳时角，按地方真太阳时计：负值为上午，0° 为上中天，正值为下午；与是否处于白昼分开判断。',
      formula: 'ω=(Tₛ〔小时〕−12)×15°',
      dynamic: `Tₛ=${solar.value.solarTimeText}，ω=(${(solarTime / 60).toFixed(4)}−12)×15°=${signedDeg(hourAngle)}`,
    },
    {
      name: '太阳高度角 h',
      desc: 'h 表示太阳在地平线以上的高度角。h 越大，太阳越高；h 小于 0° 时，太阳位于地平线以下。',
      formula: 'sin h=sinφ·sinδ+cosφ·cosδ·cosω',
      dynamic: `φ=${signedDeg(phi)}，δ=${signedDeg(delta)}，ω=${signedDeg(hourAngle)}，h=${signedDeg(solar.value.altitude)}`,
    },
    {
      name: '正午太阳高度 H',
      desc: '按当天赤纬固定的模型，H 为上中天时的太阳中心高度。φ 为纬度，δ 为太阳直射纬度；H 为负时，正午太阳仍在地平线下。',
      formula: 'H=90°-|φ-δ|',
      dynamic: `H=90°-|${signedDeg(phi)}-${signedDeg(delta)}|=${signedDeg(solar.value.noonAltitude)}`,
    },
    {
      name: '昼长 L',
      desc: 'L 为太阳中心在地平线上方的时长。H₀ 为几何日出、日落时的时角绝对值（度），未计大气折射与太阳视半径。',
      formula: 'cosH₀=-tanφ·tanδ（两极另判），L=2H₀/(15°/小时)',
      dynamic: dayLengthDynamic,
    },
  ]
})

const subsolarChartGridLines = computed(() => [
  { label: `+${AXIAL_TILT_LABEL}`, y: chartY(DEFAULT_AXIAL_TILT), main: false },
  { label: '0°', y: chartY(0), main: true },
  { label: `-${AXIAL_TILT_LABEL}`, y: chartY(-DEFAULT_AXIAL_TILT), main: false },
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
    runtimeUtcMinutes = utcMinutes.value
    runtimeSpinRadians = rotationFromSolarMinutes(sunLongitudeAtDay(autoOrbitDay), Number(value), selectedPoint.lng)
  },
})

const localSolarSliderValue = computed(() => {
  const value = localSolarMinutes.value
  // 让滑块可以顺畅走到 24:00，避免 Element Plus Slider 在 max=1439 时把播放卡回 23:59。
  return value > 1439.5 ? 1440 : value
})

function handleLocalSolarSliderInput(value: number | number[]) {
  const raw = Array.isArray(value) ? value[0] : value
  cancelOrbitTransition()
  rotationPlaying.value = false
  if (flightMotion) flightMotion.rotation = false

  const next = Number(raw) >= 1440 ? 0 : clamp(Number(raw), 0, 1440)
  localSolarMinutes.value = next
  runtimeUtcMinutes = utcMinutes.value
  updateAnimatedOrbitFrame(visualOrbitDay())
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
    layers.latitudeDayArc,
    layers.latitudeNightArc,
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
  () => [layers.terminator, layers.sunRays, layers.subsolar, layers.latitudeDayArc, layers.latitudeNightArc, layers.noonAltitude],
  () => {
    updateAnimatedOrbitFrame(visualOrbitDay())
  },
)

watch(utcMinutes, value => {
  if (playing.value) return

  runtimeUtcMinutes = value
  runtimeSpinRadians = rotationFromSolarMinutes(sunLongitudeAtDay(autoOrbitDay), value + equationOfTime(dayNo.value))
  updateAnimatedOrbitFrame(visualOrbitDay())
})

watch(obliquityMinutes, () => {
  // 倾角改变时保留日期、自转相位及播放状态，太阳时由新的赤道坐标系重新求得。
  if (cityKey.value === 'arctic') selectedPoint.lat = polarCircle.value
  syncTimeFromMotion()
  updateEarthScene()
})

watch(miniCameraVisible, () => {
  nextTick(() => {
    resizeMiniCameraRenderer(true)
    lastMiniRenderTime = 0
  })
})

watch([rotationPlaying, revolutionPlaying], () => {
  // A deliberate playback change while flying replaces the saved playback state.
  if (observerFlying.value && !flightMotionChange) flightMotion = null
}, { flush: 'sync' })

// 太阳视运动联动开关会改变右侧舞台布局。
// 切换后必须等 DOM 尺寸稳定，再同步 WebGL drawingBuffer 和相机；
// 否则平板端容易出现“canvas 实际尺寸还按旧布局，场景中心跑到右下角”的错觉。
watch(solarVisible, async () => {
  if (solarVisible.value) solarSceneError.value = ''
  if (!solarVisible.value && observerViewEnabled.value) setObserverView(false)
  await nextTick()
  requestAnimationFrame(() => {
    resizeEarth(true)
    resizeMiniCameraRenderer(true)
  })
})

onMounted(async () => {
  await nextTick()
  if (appDisposed) return
  syncViewportInsets()
  window.addEventListener('resize', syncViewportInsets)
  try {
    initEarthScene()
    updateEarthScene()
    if (!earthRenderer || !earthScene || !earthCamera) throw new Error('地球场景初始化失败，请重新加载。')
    autoOrbitDay = dayNo.value
    runtimeUtcMinutes = utcMinutes.value
    // All image requests are now registered; the solar scene reports its first frame separately.
    startup.sceneReady('earth')
    await startup.ready
    if (appDisposed) return
    preparingScene.value = true
    await nextTick()
    if (appDisposed) return
    prepareSceneTextures(earthRenderer, earthScene)
    await compileInitialEarthScene()
    if (appDisposed) return
    renderEarthFrame()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    if (appDisposed) return
    lastTime = performance.now()
    animate(lastTime)
    pageReady.value = true
  } catch (error) {
    if (appDisposed) return
    startup.fail('场景初始化失败，请重新加载。')
    disposeEarthScene()
    loadingError.value = error instanceof Error ? error.message : '场景初始化失败，请重新加载。'
    console.error('场景加载失败', error)
  }
})

onBeforeUnmount(() => {
  stopObserverLook?.()
  appDisposed = true
  startup.dispose()
  window.removeEventListener('resize', syncViewportInsets)
  pointPickGesture.cancel()
  orbitTweenToken++
  cancelAnimationFrame(raf)
  disposeEarthScene()
})

function orbitThetaByDay(day: number) {
  return orbitAngleAtDay(day)
}

function orbitTangentByDay(day: number) {
  const theta = orbitThetaByDay(day)
  return new THREE.Vector3(-Math.sin(theta) * ORBIT_DIR, 0, Math.cos(theta) * ORBIT_DIR).normalize()
}

function utcFromLocalSolarMinutes(localMinutes: number, day = dayNo.value) {
  return wrapMinutes(localMinutes - selectedPoint.lng * 4 - equationOfTime(Math.floor(day)))
}

function visualOrbitDay() {
  return autoOrbitDay
}

function sunLongitudeAtDay(day: number) {
  return solarLongitudeAtDay(day, axialTilt.value)
}

function syncTimeFromMotion() {
  const greenwichSolarMinutes = solarMinutesFromRotation(sunLongitudeAtDay(autoOrbitDay), runtimeSpinRadians)
  runtimeUtcMinutes = wrapMinutes(greenwichSolarMinutes - equationOfTime(dayNo.value))
  utcMinutes.value = runtimeUtcMinutes
}

function cancelOrbitTransition() {
  orbitTweenToken++
  tweenOrbitVisualDay = null
  suppressSceneUpdate = false
}

function toggleMotion(motion: 'rotation' | 'revolution') {
  cancelOrbitTransition()
  const enabled = motion === 'rotation' ? rotationPlaying : revolutionPlaying
  enabled.value = !enabled.value
}

let lastMotionCombination = { rotation: true, revolution: true }
function toggleAllMotion() {
  cancelOrbitTransition()
  if (playing.value) {
    lastMotionCombination = { rotation: rotationPlaying.value, revolution: revolutionPlaying.value }
    playing.value = false
  } else {
    rotationPlaying.value = lastMotionCombination.rotation
    revolutionPlaying.value = lastMotionCombination.revolution
  }
}

function initEarthScene() {
  if (!earthRef.value || earthRenderer) return

  earthScene = new THREE.Scene()

  earthCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  earthCamera.position.set(5.9, 3.25, 6.3)
  miniPerspectiveCamera = new THREE.PerspectiveCamera(42, 16 / 10, 0.05, 100)
  miniPolarCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100)
  miniCamera = miniPerspectiveCamera

  earthRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  earthRenderer.outputColorSpace = THREE.SRGBColorSpace
  earthRenderer.toneMapping = THREE.ACESFilmicToneMapping
  earthRenderer.toneMappingExposure = 1
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
  earthControls.maxDistance = 60
  earthControls.target.set(0, 0, 0)
  earthControls.update()

  earthScene.add(new THREE.AmbientLight(0x8bb7ff, 0.24))
  nebulaSky = createNebulaSkybox(startup.manager)
  earthScene.add(nebulaSky.mesh)
  observerGuide = createObserverGuide(EARTH_R)
  earthScene.add(observerGuide.group)
  noonAltitudeGuide = createNoonAltitudeGuide(EARTH_R)
  earthScene.add(noonAltitudeGuide.group)
  terminatorVisual = createTerminator(EARTH_R)
  earthScene.add(terminatorVisual.group)
  sunGlow = createSunGlow(SUN_R)
  earthScene.add(sunGlow.group)
  sunBeam = createSunBeam(SUN_R, EARTH_R)
  earthScene.add(sunBeam.group)

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

  const textureLoader = new THREE.TextureLoader(startup.manager)

  const texture = textureLoader.load(earthTextureDataUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = earthRenderer.capabilities.getMaxAnisotropy()

  const nightTexture = textureLoader.load(earthNightTextureDataUrl)
  nightTexture.colorSpace = THREE.SRGBColorSpace
  nightTexture.anisotropy = earthRenderer.capabilities.getMaxAnisotropy()

  cachedSunTexture = textureLoader.load(sunTextureDataUrl)
  cachedSunTexture.colorSpace = THREE.SRGBColorSpace
  cachedSunTexture.anisotropy = earthRenderer.capabilities.getMaxAnisotropy()

  const appearance = createEarthAppearance(texture, nightTexture, EARTH_R)
  earthMaterial = appearance.material
  earthSphere = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 128, 128), earthMaterial)
  spinGroup.add(earthSphere)
  timeZoneOverlay = createTimeZoneOverlay(EARTH_R, startup.manager)
  spinGroup.add(timeZoneOverlay.group)

  spinGroup.add(appearance.atmosphere)

  earthControls.addEventListener('start', cancelCameraTween)
  earthRenderer.domElement.addEventListener('pointerdown', event => {
    pointPickGesture.start(event.pointerId, event.clientX, event.clientY, event.timeStamp,
      pointPickingEnabled.value && event.isPrimary && event.button === 0)
  })
  earthRenderer.domElement.addEventListener('pointermove', event => {
    pointPickGesture.move(event.pointerId, event.clientX, event.clientY)
  })
  earthRenderer.domElement.addEventListener('pointercancel', () => pointPickGesture.cancel())
  earthRenderer.domElement.addEventListener('pointerup', pickEarthPoint)

  earthResize = new ResizeObserver(() => resizeEarth())
  earthResize.observe(earthRef.value)
  resizeEarth(true)
  setCamera('overview')
}

function updateEarthScene() {
  if (!earthScene || !orbitLayer || !earthSystem || !earthGuideLayer || !tiltGroup || !spinGroup || !globeLayer) return

  clearGroup(orbitLayer)
  clearGroup(earthGuideLayer)
  clearGroup(globeLayer)
  latitudeLightMaterials = []

  const theta = orbitAngle.value
  const earthPos = new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
  earthSystem.position.copy(earthPos)
  earthGuideLayer.add(labelSprite('地球', '#dff8ff', 0.19, new THREE.Vector3(0, 0.84, 0)))

  // 太阳在世界中心；地球沿轨道公转，地球本体绕自身地轴自西向东自转。
  const earthToSunWorld = earthPos.clone().multiplyScalar(-1).normalize()

  tiltGroup.rotation.z = axialTiltRotation.value
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

  if (obliquityHelper) {
    earthSystem.remove(obliquityHelper.group)
    obliquityHelper.dispose()
    obliquityHelper = null
  }
  if (layers.tiltAngle) {
    obliquityHelper = createObliquityHelper(EARTH_R, axialTilt.value * DEG)
    earthSystem.add(obliquityHelper.group)
  }

  if (layers.axisArrow) earthGuideLayer.add(createAxisDirectionArrow())

  // 赤道也使用同一昼夜判定；关闭普通纬线后，仍可独立观察昼弧或夜弧。
  if (layers.longitudeLines || layers.latitudeLines || layers.latitudeDayArc || layers.latitudeNightArc || layers.equator || layers.longitudeLabels || layers.latitudeLabels) globeLayer.add(createLatLngGrid())
  if (layers.equator) globeLayer.add(createEquatorPlane())
  if (layers.zones) globeLayer.add(createHeatZones())
  if (layers.rotationDirection) globeLayer.add(createRotationDirectionArrows())
  if (layers.tropics) globeLayer.add(createTropics())

  const selected = latLngToVector(selectedPoint.lat, selectedPoint.lng, EARTH_R * 1.012)
  globeLayer.add(createMarker(selected, 0x38e8ff, selectedPoint.name))

  updateAnimatedOrbitFrame(visualOrbitDay())
}

function ensureAnimatedOrbitObjects() {
  if (!animatedOrbitLayer) return

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

function ensureDynamicSunRays(count: number) {
  if (!dynamicSunRayGroup) return
  const total = count
  if (dynamicRayCount === total && dynamicSunRayItems.length === total) return

  clearGroup(dynamicSunRayGroup)
  dynamicSunRayItems = []
  dynamicRayCount = total

  for (let i = 0; i < total; i++) {
    const color = 0xffda8e
    const opacity = 0.65
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
    ; (lineObj.geometry as THREE.BufferGeometry).computeBoundingSphere()
}

function setArrowBetween(arrow: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, tipOffset = 0.07) {
  const direction = end.clone().sub(start).normalize()
  arrow.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction))
  arrow.position.copy(end.clone().sub(direction.clone().multiplyScalar(tipOffset)))
}

function updateDynamicSunRays(earthPos: THREE.Vector3) {
  if (!dynamicSunRayGroup) return
  dynamicSunRayGroup.visible = layers.sunRays
  if (!layers.sunRays) return
  const rays = verticalSunRaySegments(earthPos, EARTH_R, SUN_R, rayCount.value)
  ensureDynamicSunRays(rays.length)
  rays.forEach(({ start, end }, index) => {
    const item = dynamicSunRayItems[index]!
    const opacity = index === Math.floor(rays.length / 2) ? 0.9 : 0.65
      ; (item.line.material as THREE.LineBasicMaterial).opacity = opacity
      ; (item.arrow.material as THREE.MeshBasicMaterial).opacity = opacity
    setLinePoints(item.line, start, end)
    setArrowBetween(item.arrow, start, end, 0.1)
  })
}

function updateLatitudeLineLighting(earthToSunWorld: THREE.Vector3) {
  if (!latitudeLightMaterials.length) return

  latitudeLightMaterials.forEach(material => {
    material.uniforms.sunDir!.value.copy(earthToSunWorld)
    material.uniforms.dayArcEnabled!.value = layers.latitudeDayArc ? 1 : 0
    material.uniforms.nightArcEnabled!.value = layers.latitudeNightArc ? 1 : 0
  })
}

function createLightAwareLatitudeLine(points: THREE.Vector3[], options: { isEquator?: boolean } = {}) {
  const isEquator = !!options.isEquator
  const material = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(-1, 0, 0) },
      baseColor: { value: new THREE.Color(isEquator ? 0xf0646b : 0x7dd3fc) },
      dayColor: { value: new THREE.Color(0xffd166) },
      nightColor: { value: new THREE.Color(0x78a9ff) },
      dayArcEnabled: { value: layers.latitudeDayArc ? 1 : 0 },
      nightArcEnabled: { value: layers.latitudeNightArc ? 1 : 0 },
      baseOpacity: { value: layers.latitudeLines || (isEquator && layers.equator) ? (isEquator ? 1 : 0.66) : 0 },
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
      uniform vec3 baseColor;
      uniform vec3 dayColor;
      uniform vec3 nightColor;
      uniform float dayArcEnabled;
      uniform float nightArcEnabled;
      uniform float baseOpacity;
      varying float vLight;
      void main() {
        // 以太阳中心位于当地地平线上方/下方划分昼夜，边界轻微抗锯齿。
        float lit = smoothstep(-0.003, 0.003, vLight);
        float dayMix = lit * dayArcEnabled;
        float nightMix = (1.0 - lit) * nightArcEnabled;
        float arcMix = dayMix + nightMix;
        float baseAlpha = baseOpacity * (1.0 - arcMix);
        float alpha = baseAlpha + arcMix;
        if (alpha < 0.001) discard;
        vec3 color = (baseColor * baseAlpha + dayColor * dayMix + nightColor * nightMix) / alpha;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
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
  const start = normal.clone().multiplyScalar(-SUN_R * 1.005)
  const end = subsolarWorld.clone().sub(normal.clone().multiplyScalar(0.035))

  setLinePoints(dynamicSubsolarRayLine, start, end)
  setArrowBetween(dynamicSubsolarArrow, start, end)

  dynamicSubsolarHit.position.copy(subsolarWorld)
  dynamicSubsolarDot.position.copy(subsolarWorld)

  dynamicSubsolarRing.position.copy(subsolarWorld.clone().add(normal.clone().multiplyScalar(0.008)))
  dynamicSubsolarRing.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal))

  dynamicSubsolarLabel.position.copy(subsolarWorld.clone().add(normal.clone().multiplyScalar(0.14)))
}
function updateAnimatedOrbitFrame(day: number) {
  if (!earthSystem || !tiltGroup || !spinGroup || !earthMaterial || !animatedOrbitLayer) return

  sceneDay.value = day
  ensureAnimatedOrbitObjects()

  const theta = orbitThetaByDay(day)
  const earthPos = new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
  const earthToSunWorld = earthPos.clone().multiplyScalar(-1).normalize()

  earthSystem.position.copy(earthPos)

  // 北半球夏至日，北极圈应朝向太阳；冬至日应背向太阳。
  tiltGroup.rotation.z = axialTiltRotation.value

  spinGroup.rotation.y = runtimeSpinRadians

  earthMaterial.uniforms.sunDir!.value.copy(earthToSunWorld)
  earthMaterial.uniforms.lightIntensity!.value = lightIntensity.value
  earthMaterial.uniforms.nightBrightness!.value = nightBrightness.value
  earthMaterial.uniforms.cityLightStrength!.value = cityLightStrength.value

  const axisDirection = new THREE.Vector3(Math.sin(-axialTiltRotation.value), Math.cos(axialTiltRotation.value), 0)
  terminatorVisual?.update(earthPos, earthToSunWorld, axisDirection, layers.terminator)
  noonAltitudeGuide?.update(earthPos, earthToSunWorld, axisDirection, layers.noonAltitude)
  sunGlow?.update(sunGlowVisible.value, sunGlowStrength.value)
  sunBeam?.update(earthPos, sunBeamVisible.value, sunBeamStrength.value)
  timeZoneOverlay?.update({ timeZones: layers.timeZones, dateLine: layers.dateLine })
  updateLatitudeLineLighting(earthToSunWorld)
  updateDynamicSunRays(earthPos)
  updateDynamicSubsolar(earthPos, earthToSunWorld)

  spinGroup.updateWorldMatrix(true, false)
  observerWorldPoint.copy(latLngToVector(selectedPoint.lat, selectedPoint.lng, EARTH_R * 1.006)).applyMatrix4(spinGroup.matrixWorld)
  observerWorldNormal.copy(observerWorldPoint).sub(earthPos).normalize()
  observerGuide?.update({
    point: observerWorldPoint,
    normal: observerWorldNormal,
    sunDirection: earthToSunWorld,
    altitude: solar.value.altitude,
    time: performance.now(),
    visibility: observerVisibility,
  })

  if (focusCenter.value === 'earth' && earthControls && earthCamera && !cameraTween && !observerViewEnabled.value && !observerFlying.value && followPositionInitialized) {
    followMovingCenter(earthCamera.position, earthControls.target, lastFollowEarthPosition, earthPos)
  }
  lastFollowEarthPosition.copy(earthPos)
  followPositionInitialized = true
  if (observerViewEnabled.value || observerFlying.value) updateObserverCamera(performance.now())
  else stepCameraTween(performance.now())
}

function createSun() {
  const group = new THREE.Group()

  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_R, 64, 64),
    new THREE.MeshBasicMaterial(cachedSunTexture ? { map: cachedSunTexture, color: 0xffffff } : { color: 0xff9f1c }),
  )
  group.add(outer)

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
  const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), axialTiltRotation.value).normalize()
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

  const northLabel = alwaysLabelSprite('地轴北端 · 指向北天极', '#c7d2fe', 0.082, end.clone().add(new THREE.Vector3(0.16, 0.08, 0)))
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
      color: 0xf0646b,
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
  const zoneBandRadius = EARTH_R * 1.0015
  const zoneBoundaryRadius = EARTH_R * 1.026
  const zoneLabelRadius = EARTH_R * 1.065
  const zones = [
    { min: polarCircle.value, max: 89.8, text: '北寒带', color: 0x009dff, opacity: 0.52, labelLat: 76 },
    { min: axialTilt.value, max: polarCircle.value, text: '北温带', color: 0x00d084, opacity: 0.48, labelLat: 45 },
    { min: -axialTilt.value, max: axialTilt.value, text: '热带', color: 0xffb000, opacity: 0.54, labelLat: 0 },
    { min: -polarCircle.value, max: -axialTilt.value, text: '南温带', color: 0x00d084, opacity: 0.48, labelLat: -45 },
    { min: -89.8, max: -polarCircle.value, text: '南寒带', color: 0x009dff, opacity: 0.52, labelLat: -76 },
  ]

  zones.filter(zone => zone.max - zone.min > 0.001).forEach(zone => {
    group.add(createLatitudeBand(zone.min, zone.max, zone.color, zone.opacity, zoneBandRadius))
    group.add(
      alwaysLabelSprite(zone.text, `#${zone.color.toString(16).padStart(6, '0')}`, 0.118, latLngToVector((zone.min + zone.max) / 2, -132, zoneLabelRadius)),
    )
  })
    ;[...new Set([-polarCircle.value, -axialTilt.value, 0, axialTilt.value, polarCircle.value])].filter(lat => Math.abs(lat) < 89.99).forEach(lat => {
      if (lat !== 0) {
        group.add(dashedLatitudeLine(lat, zoneBoundaryRadius, 0xf8fbff, 0.78))
        return
      }
      const points: THREE.Vector3[] = []
      for (let lng = -180; lng <= 180; lng += 3) points.push(latLngToVector(lat, lng, zoneBoundaryRadius))
      group.add(line(points, 0xf0646b, 0.98))
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

function createLatLngGrid() {
  const group = new THREE.Group()
  const radius = EARTH_R * 1.004

  latitudeLightMaterials = []

  const addGridLabel = (text: string, position: THREE.Vector3, color = '#9af5ff') => {
    const sprite = alwaysLabelSprite(text, color, 0.046, position)
    sprite.renderOrder = 18
    const material = sprite.material as THREE.SpriteMaterial
    material.depthTest = true
    material.depthWrite = false
    return sprite
  }

  // 包含 0° 赤道，普通纬线、昼弧与夜弧可独立控制。
  for (let lat = -75; lat <= 75; lat += 15) {
    const isEquator = lat === 0

    if (layers.latitudeLines || layers.latitudeDayArc || layers.latitudeNightArc || (isEquator && layers.equator)) {
      const points: THREE.Vector3[] = []
      for (let lng = -180; lng <= 180; lng += 3) points.push(latLngToVector(lat, lng, isEquator ? EARTH_R * 1.006 : radius))
      const lineObj = createLightAwareLatitudeLine(points, { isEquator })
      lineObj.name = `latitude-${lat}`
      lineObj.renderOrder = isEquator ? 13 : 12
      group.add(lineObj)
    }

    if (layers.latitudeLabels) {
      const labelPos = latLngToVector(lat, 0, EARTH_R * 1.108)
      const label = addGridLabel(formatGridLat(lat), labelPos, isEquator ? '#f0646b' : '#9af5ff')
      label.name = `latitude-label-${lat}`
      group.add(label)
    }
  }

  // 特殊纬度不受“回归线与极圈”线条开关影响；倾角变化时重新定位和更新度数。
  if (layers.latitudeLabels) {
    const marked = Array.from({ length: 11 }, (_, index) => -75 + index * 15)
    for (const lat of [-polarCircle.value, -axialTilt.value, axialTilt.value, polarCircle.value]) {
      if (marked.some(value => Math.abs(value - lat) < 1e-7)) continue
      marked.push(lat)
      const color = Math.abs(lat) > 45 ? '#c0caff' : '#ffd166'
      const label = addGridLabel(formatGridLat(lat), latLngToVector(lat, 35, EARTH_R * 1.13), color)
      label.name = `latitude-label-${lat}`
      group.add(label)
    }
  }

  // 经线默认展示；经度线和经度文字可以分别控制。
  for (let lng = -180; lng < 180; lng += 15) {
    const isPrime = lng === 0

    if (layers.longitudeLines) {
      const points: THREE.Vector3[] = []
      for (let lat = -88; lat <= 88; lat += 3) points.push(latLngToVector(lat, lng, radius))
      const lineObj = line(points, isPrime ? 0x9af5ff : 0x7dd3fc, isPrime ? 0.85 : 0.66)
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
  const degrees = Number.isInteger(lat) ? `${Math.abs(lat)}°` : currentLatitudeLabel(lat)
  return `${degrees}${lat > 0 ? 'N' : 'S'}`
}

function formatGridLng(lng: number) {
  const value = normalizeLng(lng)
  if (Math.abs(value) < 0.01) return '0°'
  if (Math.abs(value) === 180) return '180°'
  return `${Math.abs(value)}°${value > 0 ? 'E' : 'W'}`
}

function createTropics() {
  const group = new THREE.Group()
  const list = [
    { lat: axialTilt.value, text: '北回归线', color: 0xffd166 },
    { lat: -axialTilt.value, text: '南回归线', color: 0xffd166 },
    { lat: polarCircle.value, text: '北极圈', color: 0xa5b4fc },
    { lat: -polarCircle.value, text: '南极圈', color: 0xa5b4fc },
  ]

  list.filter(item => Math.abs(item.lat) > 0.001 && Math.abs(item.lat) < 89.99).forEach(item => {
    group.add(dashedLatitudeLine(item.lat, EARTH_R * 1.007, item.color, 0.92))
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
  if (observerViewEnabled.value || observerFlying.value) return
  if (!earthRenderer || !earthCamera || !earthSphere) return
  const intentionalClick = pointPickGesture.finish(event.pointerId, event.clientX, event.clientY, event.timeStamp)
  if (!pointPickingEnabled.value || !intentionalClick || event.button !== 0 || !event.isPrimary) return

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
  pointPickingEnabled.value = false
  // 点击地球后直接刷新静态标记层，让蓝色定位小球立刻跳到新位置。
  updateEarthScene()
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function cancelCameraTween() {
  cameraTween = null
}

function currentObserverBasis() {
  return observerBasis(selectedPoint.lat, selectedPoint.lng, runtimeSpinRadians, axialTiltRotation.value, getEarthWorldPosition())
}

function pauseForObserverFlight() {
  if (!flightMotion) flightMotion = { rotation: rotationPlaying.value, revolution: revolutionPlaying.value }
  flightMotionChange = true
  playing.value = false
  flightMotionChange = false
}

function resumeAfterObserverFlight() {
  const motion = flightMotion
  flightMotion = null
  if (!motion) return
  flightMotionChange = true
  rotationPlaying.value = motion.rotation
  revolutionPlaying.value = motion.revolution
  flightMotionChange = false
}

function syncObserverLook() {
  if (!observerSurface) return
  const look = observerSurface.getLook()
  observerHeading.value = look.heading
  observerFollowingSun.value = look.followingSun
  const sun = observerSurface.scene.getObjectByName('observer-apparent-sun')
  if (sun) {
    observerSunProjection.copy(sun.position).project(observerSurface.camera)
    observerSunInView.value = sun.visible && Math.abs(observerSunProjection.x) <= 1 && Math.abs(observerSunProjection.y) <= 1 && observerSunProjection.z >= -1 && observerSunProjection.z <= 1
  } else observerSunInView.value = false
}

function followObserverSun() {
  if (!observerSurface || observerFlying.value) return
  observerSurface.followSun()
  syncObserverLook()
}

function startObserverLook(event: PointerEvent) {
  if (!observerViewEnabled.value || observerFlying.value || !observerSurface || event.button !== 0 || !event.isPrimary) return
  stopObserverLook?.()
  event.preventDefault()
  event.stopPropagation()
  const host = event.currentTarget as HTMLElement
  const surface = observerSurface
  const initial = surface.getLook()
  const startX = event.clientX
  const startY = event.clientY
  const sensitivity = 100 / Math.max(240, host.clientHeight)
  let moved = false
  host.setPointerCapture(event.pointerId)
  observerLooking.value = true
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return
    const dx = next.clientX - startX
    const dy = next.clientY - startY
    if (!moved && Math.hypot(dx, dy) < 3) return
    moved = true
    surface.setLook(initial.heading - dx * sensitivity, initial.pitch + dy * sensitivity)
    syncObserverLook()
  }
  const end = (next: PointerEvent) => { if (next.pointerId === event.pointerId) stop() }
  const stop = () => {
    host.removeEventListener('pointermove', move)
    host.removeEventListener('pointerup', end)
    host.removeEventListener('pointercancel', end)
    host.removeEventListener('lostpointercapture', end)
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId)
    observerLooking.value = false
    stopObserverLook = null
  }
  host.addEventListener('pointermove', move)
  host.addEventListener('pointerup', end)
  host.addEventListener('pointercancel', end)
  host.addEventListener('lostpointercapture', end)
  stopObserverLook = stop
}

watch([observerViewEnabled, observerFlying], () => {
  stopObserverLook?.()
  if (observerViewEnabled.value && observerFlying.value) observerSurface?.followSun()
})

function beginObserverFlight(returning = false) {
  if (!earthCamera || !earthControls || !observerReturnView) return
  cancelCameraTween()
  const center = getEarthWorldPosition()
  let position = earthCamera.position.clone()
  let orientation = earthCamera.quaternion.clone()
  let fov = earthCamera.fov
  if (returning) {
    const anchor = observerReturnView.focus === 'earth' ? center : new THREE.Vector3()
    position = observerReturnView.position.clone().add(anchor)
    const target = observerReturnView.target.clone().add(anchor)
    orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)))
    fov = observerReturnView.fov
  }
  observerFlight = createObserverFlight(EARTH_R, position, orientation, fov, center)
  observerFlightPointKey = `${selectedPoint.lat}|${selectedPoint.lng}`
  observerFlightReturning = returning
  observerFlightStarted = performance.now()
  observerFlightProgress.value = returning ? 1 : 0
  observerFlying.value = true
  earthControls.enabled = false
  earthCamera.near = 0.00005
  earthCamera.updateProjectionMatrix()
  pointPickingEnabled.value = false
  pauseForObserverFlight()
}

function setObserverView(enabled: boolean) {
  if (!earthCamera || !earthControls || !isAdvancedEdition) return
  if (enabled) {
    if (observerViewEnabled.value) return
    if (observerFlying.value) finishObserverView()
    cancelOrbitTransition()
    const anchor = focusCenter.value === 'earth' ? getEarthWorldPosition() : new THREE.Vector3()
    observerReturnView = {
      position: earthCamera.position.clone().sub(anchor), target: earthControls.target.clone().sub(anchor),
      focus: focusCenter.value, mode: activeCameraMode.value, fov: earthCamera.fov, controlsVisible: controlsVisible.value,
    }
    observerSurface ??= createObserverSurfaceScene(cachedSunTexture!)
    observerViewEnabled.value = true
    controlsVisible.value = false
    beginObserverFlight()
  } else {
    if (!observerViewEnabled.value) return
    observerViewEnabled.value = false
    // An interrupted arrival returns safely to the saved view; a completed arrival flies back in stages.
    if (observerFlying.value) finishObserverView()
    else beginObserverFlight(true)
  }
}

function finishObserverView() {
  observerViewEnabled.value = false
  observerFlying.value = false
  observerFlight = null
  observerFlightProgress.value = 0
  if (earthCamera && earthControls) {
    // OrbitControls applies residual damping before clearing it. Flush first, then restore the saved pose.
    earthCamera.up.set(0, 1, 0)
    earthControls.enableDamping = false
    earthControls.update()
    const saved = observerReturnView
    if (saved) {
      const anchor = saved.focus === 'earth' ? getEarthWorldPosition() : new THREE.Vector3()
      earthCamera.position.copy(saved.position).add(anchor)
      earthControls.target.copy(saved.target).add(anchor)
      focusCenter.value = saved.focus
      activeCameraMode.value = saved.mode
      controlsVisible.value = saved.controlsVisible
      earthCamera.fov = saved.fov
    }
    earthCamera.up.set(0, 1, 0)
    earthCamera.near = 0.1
    earthCamera.updateProjectionMatrix()
    earthControls.update()
    earthControls.enableDamping = true
    earthControls.enabled = true
    lastFollowEarthPosition.copy(getEarthWorldPosition())
  }
  observerReturnView = null
  resumeAfterObserverFlight()
}

function updateObserverCamera(now: number) {
  if (!earthCamera || !earthControls) return
  // City changes may synchronously rebuild the scene before Vue's asynchronous watchers run.
  // Capture the old camera pose before sampling the new observer's frame.
  if (observerViewEnabled.value && observerFlightPointKey !== `${selectedPoint.lat}|${selectedPoint.lng}`) beginObserverFlight()
  const basis = currentObserverBasis()
  const elapsed = observerFlying.value ? now - observerFlightStarted : OBSERVER_FLIGHT_DURATION
  const sampleTime = observerFlightReturning && observerFlying.value ? OBSERVER_FLIGHT_DURATION - elapsed : elapsed
  const pose = observerFlight?.sample(basis, solar.value.altitude, solar.value.azimuth, sampleTime)
  if (pose) {
    earthCamera.position.copy(pose.position)
    earthCamera.quaternion.copy(pose.quaternion)
    earthCamera.fov = pose.fov
    earthCamera.near = Math.min(0.1, Math.max(0.00005, (pose.position.distanceTo(basis.center) - EARTH_R) * 0.1))
    earthCamera.updateProjectionMatrix()
    observerFlightProgress.value = pose.progress
    observerFlightPhase.value = observerFlightReturning
      ? pose.progress > 0.7 ? '正在离开地面' : pose.progress > 0.36 ? '正在升空' : '正在返回原视角'
      : pose.phase
  }
  if (observerFlying.value && elapsed >= OBSERVER_FLIGHT_DURATION) {
    if (observerFlightReturning) finishObserverView()
    else {
      observerFlying.value = false
      observerFlightPhase.value = ''
      resumeAfterObserverFlight()
    }
  }
}

function animateCameraTo(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3, duration = 760) {
  if (!earthCamera || !earthControls) return
  const followsEarth = focusCenter.value === 'earth'
  const anchor = followsEarth ? getEarthWorldPosition() : new THREE.Vector3()
  cameraTween = {
    started: performance.now(), duration, followsEarth,
    startPosition: earthCamera.position.clone().sub(anchor), endPosition: targetPosition.clone().sub(anchor),
    startTarget: earthControls.target.clone().sub(anchor), endTarget: targetLookAt.clone().sub(anchor),
  }
}

function stepCameraTween(now: number) {
  if (!cameraTween || !earthCamera || !earthControls) return
  const t = clamp((now - cameraTween.started) / cameraTween.duration, 0, 1)
  const fraction = easeInOutCubic(t)
  const anchor = cameraTween.followsEarth ? getEarthWorldPosition() : new THREE.Vector3()
  earthCamera.position.lerpVectors(cameraTween.startPosition, cameraTween.endPosition, fraction).add(anchor)
  earthControls.target.lerpVectors(cameraTween.startTarget, cameraTween.endTarget, fraction).add(anchor)
  if (t >= 1) cameraTween = null
}

function getCameraPose(mode: CameraMode) {
  if (mode === 'overview') {
    const target = new THREE.Vector3(0, 0, 0)
    return {
      focus: 'sun' as FocusCenter,
      target,
      position: new THREE.Vector3(5.9, 3.25, 6.3).normalize().multiplyScalar(overviewFitDistance()),
    }
  }

  if (mode === 'north') {
    const target = getEarthWorldPosition()
    return {
      focus: 'earth' as FocusCenter,
      target,
      position: target.clone().add(new THREE.Vector3(Math.sin(-axialTiltRotation.value), Math.cos(axialTiltRotation.value), 0).multiplyScalar(3.6)).add(new THREE.Vector3(0, 0, 0.01)),
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
  if (observerViewEnabled.value || observerFlying.value) finishObserverView()

  activeCameraMode.value = mode
  const pose = getCameraPose(mode)
  focusCenter.value = pose.focus
  animateCameraTo(pose.position, pose.target)
}

function focusNoonAltitude() {
  if (!earthCamera || !earthControls) return
  if (observerViewEnabled.value || observerFlying.value) finishObserverView()
  const target = getEarthWorldPosition()
  const axis = new THREE.Vector3(Math.sin(-axialTiltRotation.value), Math.cos(axialTiltRotation.value), 0)
  const view = target.clone().negate().normalize().projectOnPlane(axis).normalize()
  focusCenter.value = 'earth'
  activeCameraMode.value = 'point'
  const halfAngle = Math.min(earthCamera.fov * DEG / 2, Math.atan(Math.tan(earthCamera.fov * DEG / 2) * earthCamera.aspect))
  const distance = Math.max(EARTH_R * 4, EARTH_R * 1.75 / Math.sin(halfAngle))
  animateCameraTo(target.clone().addScaledVector(view, distance), target)
}

function focusObserverGuide() {
  if (!earthCamera || !earthControls) return
  if (observerViewEnabled.value || observerFlying.value) finishObserverView()
  Object.assign(observerVisibility, { normal: true, sunRay: true, horizon: true, altitude: true })
  updateAnimatedOrbitFrame(visualOrbitDay())
  const normal = observerWorldNormal.clone()
  const sun = getEarthWorldPosition().normalize().negate()
  const horizontal = sun.clone().addScaledVector(normal, -sun.dot(normal))
  if (horizontal.lengthSq() < 1e-8) horizontal.set(0, 0, 1).addScaledVector(normal, -normal.z)
  if (horizontal.lengthSq() < 1e-8) horizontal.set(1, 0, 0)
  horizontal.normalize()
  const side = new THREE.Vector3().crossVectors(horizontal, normal).normalize()
  const view = normal.addScaledVector(horizontal, 0.5).addScaledVector(side, 0.65).normalize()
  const target = getEarthWorldPosition()
  focusCenter.value = 'earth'
  activeCameraMode.value = 'point'
  animateCameraTo(target.clone().addScaledVector(view, EARTH_R * 4.5), target)
}

function setFocusCenter(center: FocusCenter) {
  setCamera(center === 'sun' ? 'overview' : 'point')
}

function getEarthWorldPosition(day = visualOrbitDay()) {
  const theta = orbitThetaByDay(day)
  return new THREE.Vector3(Math.cos(theta) * ORBIT_R, 0, Math.sin(theta) * ORBIT_R)
}

function normalizeVisualDay(day: number) {
  return wrapOrbitDay(day)
}

function nearestVisualDayTarget(fromDay: number, targetDay: number) {
  let target = targetDay
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

  const tick = () => {
    if (token !== orbitTweenToken) return

    const t = clamp((performance.now() - startTime) / duration, 0, 1)
    const k = easeInOutCubic(t)
    tweenOrbitVisualDay = normalizeVisualDay(startDay + (endDay - startDay) * k)
    autoOrbitDay = tweenOrbitVisualDay
    setDateByDay(Math.floor(autoOrbitDay), false)
    syncTimeFromMotion()


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
    const next = advanceEarthMotion(
      { orbitDay: autoOrbitDay, spinRadians: runtimeSpinRadians },
      (dt * 6 * playSpeed.value) / 1440,
      { rotation: rotationPlaying.value, revolution: revolutionPlaying.value },
      revolutionMultiplier.value,
    )
    autoOrbitDay = next.orbitDay
    runtimeSpinRadians = next.spinRadians
    setDateByDay(Math.floor(autoOrbitDay), false)
    syncTimeFromMotion()
    updateAnimatedOrbitFrame(autoOrbitDay)
  } else {
    updateAnimatedOrbitFrame(tweenOrbitVisualDay ?? visualOrbitDay())
  }

  if (!observerViewEnabled.value && !observerFlying.value) earthControls?.update()
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
  miniRenderer.outputColorSpace = THREE.SRGBColorSpace
  miniRenderer.toneMapping = THREE.ACESFilmicToneMapping
  miniRenderer.toneMappingExposure = 1
  miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35))
  miniRenderer.setClearColor(0x17151b, 1)

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

  const aspect = width / Math.max(1, height)
  if (miniCamera instanceof THREE.OrthographicCamera) {
    const halfHeight = EARTH_R * 1.16 / Math.min(aspect, 1)
    miniCamera.left = -halfHeight * aspect
    miniCamera.right = halfHeight * aspect
    miniCamera.top = halfHeight
    miniCamera.bottom = -halfHeight
  } else miniCamera.aspect = aspect
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
  observerGuide?.updateForCamera(earthCamera, height)
  noonAltitudeGuide?.updateForCamera(earthCamera, height)
  obliquityHelper?.updateForCamera(earthCamera, layers.tiltAngle, height)
  if (observerSurface && (observerViewEnabled.value || observerFlying.value) && (!observerFlying.value || observerFlightProgress.value >= 0.94)) {
    observerSurface.update({ altitude: solar.value.altitude, azimuth: solar.value.azimuth, solarMinutes: solar.value.solarTimeValue, aspect: width / Math.max(1, height) })
    syncObserverLook()
    earthRenderer.render(observerSurface.scene, observerSurface.camera)
  } else {
    // Close to the surface, teaching labels and marker spheres would otherwise engulf the camera.
    // Hide them only for this pass; the independent globe camera retains its selected layers.
    const closeFlight = observerFlying.value && observerFlightProgress.value > 0.7
    const hidden = closeFlight ? [globeLayer, earthGuideLayer, observerGuide?.group, animatedOrbitLayer,
      timeZoneOverlay?.group, terminatorVisual?.group, obliquityHelper?.group, noonAltitudeGuide?.group].filter((item): item is THREE.Group => !!item)
      .map(group => ({ group, visible: group.visible })) : []
    hidden.forEach(({ group }) => { group.visible = false })
    earthRenderer.render(earthScene, earthCamera)
    hidden.forEach(({ group, visible }) => { group.visible = visible })
  }

  renderMiniCameraFrame(now)
}

function renderMiniCameraFrame(now = performance.now()) {
  if (!miniCameraVisible.value || !miniRenderer || !earthScene || !miniCamera) return

  // 副相机跟随主循环渲染，尺寸变化在当前 RAF 内提交，避免 resize 黑闪。
  lastMiniRenderTime = now
  const camera = miniCameraMode.value === 'top' || miniCameraMode.value === 'bottom' ? miniPolarCamera : miniPerspectiveCamera
  if (camera && camera !== miniCamera) {
    miniCamera = camera
    miniRendererResizeDirty = true
  }
  syncMiniRendererSize()
  syncMiniCamera()
  miniRenderer.clear(true, true, true)
  observerGuide?.updateForCamera(miniCamera, lastMiniCssHeight)
  noonAltitudeGuide?.updateForCamera(miniCamera, lastMiniCssHeight)
  obliquityHelper?.updateForCamera(miniCamera, layers.tiltAngle, lastMiniCssHeight)
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

  if (immediate || miniCamera instanceof THREE.OrthographicCamera || miniCamera.position.lengthSq() < 0.0001) {
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

function applyLessonPreset(key: LessonPresetKey) {
  const presetMap: Record<LessonPresetKey, { name: string; lat: number; lng: number; date: string; cityKey: string; solarHour: number }> = {
    beijingSummerNoon: { name: '北京', lat: 39.9, lng: 116.4, date: '2026-06-21', cityKey: 'beijing', solarHour: 12 },
    beijingWinterNoon: { name: '北京', lat: 39.9, lng: 116.4, date: '2026-12-22', cityKey: 'beijing', solarHour: 12 },
    equatorEquinoxNoon: { name: '赤道观测点', lat: 0, lng: 0, date: '2026-03-20', cityKey: '', solarHour: 12 },
    arcticSummerNoon: { name: '北极圈示例', lat: polarCircle.value, lng: 0, date: '2026-06-21', cityKey: 'arctic', solarHour: 12 },
    arcticWinterNoon: { name: '北极圈示例', lat: polarCircle.value, lng: 0, date: '2026-12-22', cityKey: 'arctic', solarHour: 12 },
  }

  const preset = presetMap[key]
  pointPickingEnabled.value = false
  const targetDay = dayOfYear(new Date(`${preset.date}T00:00:00Z`))

  playing.value = false
  flightMotion = null
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
    if (!observerViewEnabled.value && !observerFlying.value) setFocusCenter(focusCenter.value)
  })
}

function setTerm(term: Term) {
  const targetDay = dayOfYear(new Date(`${term.date}T00:00:00Z`))
  revolutionPlaying.value = false
  if (flightMotion) flightMotion.revolution = false
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
  if (syncAuto) {
    cancelOrbitTransition()
    revolutionPlaying.value = false
    if (flightMotion) flightMotion.revolution = false
  }
  const safeDay = clamp(day, 1, 365)
  const date = new Date(Date.UTC(dateObj.value.getUTCFullYear(), 0, safeDay))
  dateValue.value = date.toISOString().slice(0, 10)

  if (syncAuto) {
    autoOrbitDay = safeDay
    syncTimeFromMotion()
    updateEarthScene()
  }
}

function chartX(day: number) {
  return 53 + ((clamp(day, 1, 365) - 1) / 364) * 215
}

function chartY(declination: number) {
  return 14 + ((DEFAULT_AXIAL_TILT - clamp(declination, -DEFAULT_AXIAL_TILT, DEFAULT_AXIAL_TILT)) / (2 * DEFAULT_AXIAL_TILT)) * 102
}

function formatOrbitDayLabel(day: number) {
  const date = new Date(Date.UTC(dateObj.value.getUTCFullYear(), 0, clamp(Math.round(day), 1, 365)))
  return `${Math.round(day)} / ${String(date.getUTCMonth() + 1).padStart(2, '0')}月${String(date.getUTCDate()).padStart(2, '0')}日`
}


function selectCity(city: City) {
  pointPickingEnabled.value = false
  cityKey.value = city.key
  selectedPoint.name = city.name
  selectedPoint.lat = city.lat
  selectedPoint.lng = city.lng

  // 演示播放中 watch 会跳过 updateEarthScene，
  // 所以切换城市时主动刷新一次地球表面的观测点 Mesh。
  updateEarthScene()
}

function applyCity() {
  const city = cities.value.find(item => item.key === cityKey.value)
  if (!city) return
  selectCity(city)
}

function resetAll() {
  if (observerViewEnabled.value || observerFlying.value) finishObserverView()
  pointPickingEnabled.value = false
  sunGlowVisible.value = true
  sunGlowStrength.value = 1
  sunBeamVisible.value = true
  sunBeamStrength.value = 1
  rayCount.value = 5
  obliquityMinutes.value = MAX_OBLIQUITY_MINUTES
  dateValue.value = '2026-06-21'
  autoOrbitDay = 172
  localSolarMinutes.value = 0
  runtimeUtcMinutes = utcMinutes.value
  playSpeed.value = DEFAULT_PLAY_SPEED
  revolutionMultiplier.value = DEFAULT_REVOLUTION_MULTIPLIER
  lightIntensity.value = 1.25
  nightBrightness.value = 1
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

function overviewFitDistance(aspect = earthCamera?.aspect ?? 1, fov = earthCamera?.fov ?? 42) {
  const halfFov = fov * DEG / 2
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * aspect))
  return Math.max(10, (ORBIT_R + EARTH_R) / Math.sin(limitingFov) * 1.06)
}

let lastOverviewFitDistance = 0
function fitOverviewCameraToEarthViewport(width: number, height: number) {
  if (!earthCamera || !earthControls) return
  const observing = observerViewEnabled.value || observerFlying.value
  const saved = observing ? observerReturnView : null
  // The flight widens its own FOV. Keep overview framing tied to the saved camera instead.
  const fitDistance = overviewFitDistance(width / Math.max(1, height), saved?.fov ?? earthCamera.fov)
  const previous = lastOverviewFitDistance
  lastOverviewFitDistance = fitDistance
  earthCamera.far = Math.max(100, fitDistance * 2.5)
  earthControls.maxDistance = Math.max(32, fitDistance * 2)
  earthCamera.updateProjectionMatrix()
  if (observing) {
    if (saved?.focus === 'sun' && saved.mode === 'overview' && previous > 0 && fitDistance !== previous) {
      // Reframe the eventual return view while preserving the user's pan, direction and zoom ratio.
      saved.position.sub(saved.target).multiplyScalar(fitDistance / previous).add(saved.target)
      if (observerFlying.value && observerFlightReturning && observerFlight) {
        const orientation = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(saved.position, saved.target, new THREE.Vector3(0, 1, 0)),
        )
        observerFlight = createObserverFlight(EARTH_R, saved.position, orientation, saved.fov, getEarthWorldPosition())
      }
    }
    return
  }
  if (focusCenter.value !== 'sun' || activeCameraMode.value !== 'overview') return
  // Resize changes framing while preserving the user's orbit direction and zoom ratio.
  if (previous > 0) {
    if (cameraTween && !cameraTween.followsEarth) {
      // Rebase the transition at its current pose; keep its centered destination.
      const destination = cameraTween.endPosition.clone().sub(cameraTween.endTarget)
        .multiplyScalar(fitDistance / previous).add(cameraTween.endTarget)
      const target = cameraTween.endTarget.clone()
      const remaining = Math.max(160, cameraTween.duration - (performance.now() - cameraTween.started))
      animateCameraTo(destination, target, remaining)
    } else {
      earthCamera.position.sub(earthControls.target).multiplyScalar(fitDistance / previous).add(earthControls.target)
    }
  } else {
    earthCamera.position.set(5.9, 3.25, 6.3).normalize().multiplyScalar(fitDistance)
  }
  earthControls.update()
}

async function compileInitialEarthScene() {
  if (appDisposed || !earthRenderer || !earthScene || !earthCamera) return
  const pending = earthRenderer.compileAsync(earthScene, earthCamera)
  earthCompilePromise = pending
  try {
    await pending
  } finally {
    if (earthCompilePromise === pending) earthCompilePromise = null
    if (earthDisposalPending) {
      earthDisposalPending = false
      disposeEarthScene()
    }
  }
}

function disposeEarthScene() {
  // Stop DOM activity immediately, but keep compiling programs/materials alive until
  // Three's asynchronous readiness poll completes. Renderer.dispose clears that poll's properties.
  earthResize?.disconnect()
  earthResize = null
  earthControls?.dispose()
  earthControls = null
  miniResizeObserver?.disconnect()
  miniResizeObserver = null
  if (miniRenderer?.domElement?.parentNode) miniRenderer.domElement.parentNode.removeChild(miniRenderer.domElement)
  if (earthRenderer?.domElement?.parentNode) earthRenderer.domElement.parentNode.removeChild(earthRenderer.domElement)
  if (earthCompilePromise) {
    earthDisposalPending = true
    return
  }
  observerSurface?.dispose()
  observerSurface = null
  observerFlight = null
  timeZoneOverlay?.dispose()
  timeZoneOverlay = null
  sunBeam?.dispose()
  sunBeam = null
  terminatorVisual?.dispose()
  terminatorVisual = null
  sunGlow?.dispose()
  sunGlow = null
  cameraTween = null
  observerGuide?.dispose()
  observerGuide = null
  noonAltitudeGuide?.dispose()
  noonAltitudeGuide = null
  nebulaSky?.mesh.removeFromParent()
  nebulaSky?.dispose()
  nebulaSky = null
  obliquityHelper?.group.removeFromParent()
  obliquityHelper?.dispose()
  obliquityHelper = null
  miniRenderer?.dispose()
  miniRenderer = null
  earthRenderer?.dispose()
  earthRenderer = null
  miniCamera = null
  miniPerspectiveCamera = null
  miniPolarCamera = null
  if (earthScene) clearGroup(earthScene)
  cachedSunTexture?.dispose()
  cachedSunTexture = null
  earthMaterial = null
  earthScene = null
}

function clearGroup(group: THREE.Object3D) {
  // Sun texture is shared with the ground view and survives layer rebuilds.
  // The scene teardown releases it after both views have been disposed.
  clearObjectChildren(group, {
    preserveTextures: cachedSunTexture ? new Set([cachedSunTexture]) : undefined,
    retainRoot: group === earthScene ? null : earthScene,
  })
}

function line(points: THREE.Vector3[], color: number, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
}

function dashedLatitudeLine(lat: number, radius: number, color: number, opacity: number) {
  const points: THREE.Vector3[] = []
  for (let lng = -180; lng <= 180; lng += 3) points.push(latLngToVector(lat, lng, radius))
  const material = new THREE.LineDashedMaterial({ color, transparent: true, opacity })
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material)
  ring.computeLineDistances()

  // 整圈使用整数段虚线，让接缝闭合，并保持五带边界与回归线、极圈的间隙对齐。
  const distances = ring.geometry.getAttribute('lineDistance')
  const dashCount = Math.abs(lat) > 45 ? 24 : 48
  const period = distances.getX(distances.count - 1) / dashCount
  material.dashSize = period * 0.6
  material.gapSize = period * 0.4
  return ring
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
  const declination = solarDeclination(sceneDay.value)
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
  const horizonOnly = Math.abs(input.lat) > 89.999 && Math.abs(declination) < 1e-7

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

  if (horizonOnly) {
    sunriseText = sunsetText = '沿地平线'
    dayLengthText = nightLengthText = '地平线临界'
    pointStatusText = '太阳沿地平线运行'
  }
  return {
    horizonOnly,
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

function solarDeclination(doy: number) {
  return declinationAtDay(doy, axialTilt.value)
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

  // 极圈临界状态留少量容差，避免角度运算误差造成极昼/极夜判断跳动。
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
  if (!Number.isFinite(hours)) return '—'
  const totalMinutes = Math.round(clamp(hours, 0, 24) * 60)
  return `${Math.floor(totalMinutes / 60)}小时${String(totalMinutes % 60).padStart(2, '0')}分`
}

function formatLat(lat: number) {
  if (formatDegreesMinutes(Math.abs(lat)) === formatDegreesMinutes(0)) return formatDegreesMinutes(0)
  return `${lat > 0 ? '北纬' : '南纬'}${currentLatitudeLabel(lat)}`
}

function formatLng(lng: number) {
  const value = normalizeLng(lng)
  if (formatDegreesMinutes(Math.abs(value)) === formatDegreesMinutes(0)) return formatDegreesMinutes(0)
  return `${value > 0 ? '东经' : '西经'}${formatDegreesMinutes(Math.abs(value))}`
}

function currentLatitudeLabel(value: number) {
  return formatDegreesMinutes(Math.abs(value))
}
function signedDeg(value: number) {
  return formatSignedDegreesMinutes(value)
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
