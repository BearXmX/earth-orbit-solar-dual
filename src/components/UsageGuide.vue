<template>
  <el-dialog v-model="visible" class="usage-guide-dialog" modal-class="usage-guide-overlay" title="使用说明"
    width="min(1120px, calc(100vw - 32px))" align-center append-to-body destroy-on-close :z-index="12000">
    <template #header="{ titleId, titleClass }">
      <div class="usage-guide-heading">
        <span class="usage-guide-book" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1m0-14c3-2 6-2 9-1v14c-3-1-6-1-9 1m0-14v14" />
          </svg>
        </span>
        <div class="usage-guide-title-block">
          <div class="usage-guide-title-line">
            <h2 :id="titleId" :class="titleClass">使用说明</h2>
            <span class="usage-guide-edition">{{ editionName }}</span>
          </div>
          <p>{{ isAdvanced ? '从地球运动到当地天空，让两个视角一起解释变化。' : '调整运动、时间和地点，观察昼夜变化与四季交替。' }}</p>
        </div>
      </div>
    </template>

    <div class="usage-guide-body">
      <section v-for="section in commonSections" :key="section.title" class="usage-guide-section">
        <div class="usage-section-heading">
          <h3>{{ section.title }}</h3>
          <span>{{ section.description }}</span>
        </div>
        <div class="usage-card-grid">
          <article v-for="card in section.cards" :key="card.title" class="usage-card">
            <h4><span class="usage-card-marker" aria-hidden="true"></span>{{ card.title }}</h4>
            <p>{{ card.description }}</p>
            <span class="usage-card-hint">{{ card.hint }}</span>
          </article>
        </div>
      </section>

      <section v-if="isAdvanced" class="usage-guide-section usage-advanced-section">
        <div class="usage-section-heading">
          <h3>联动观察</h3>
          <span>{{ editionName }}专属</span>
        </div>
        <div class="usage-card-grid">
          <article class="usage-card">
            <h4><span class="usage-card-marker" aria-hidden="true"></span>左右场景一起看</h4>
            <p>默认显示地球主场景，点击顶部“太阳视运动”打开右侧。太阳路径随观测点、日期、地方太阳时和黄赤交角同步变化；右侧视角可独立拖动。</p>
            <span class="usage-card-hint">拖动中间分隔条调整宽度，再次点击按钮可收起右侧</span>
          </article>
          <article class="usage-card">
            <h4><span class="usage-card-marker" aria-hidden="true"></span>站在观测点环视</h4>
            <p>打开“观测点视角”后，镜头分段飞到当地地面。拖动可环视，点击“看向太阳”恢复跟随；八方位指北针显示实际朝向，关闭开关返回原视角。</p>
            <span class="usage-card-hint">飞行时暂停演示，落地后恢复原播放状态</span>
          </article>
          <article class="usage-card usage-edition-card">
            <div class="usage-edition-card-label">
              <span>{{ edition === 'sundial' ? '日晷观察' : '城市观察' }}</span>
              <h4>{{ edition === 'sundial' ? '看清受光面与针影' : '用地面阴影理解太阳位置' }}</h4>
            </div>
            <div v-if="edition === 'sundial'" class="usage-edition-card-copy">
              <p>晷针平行地轴，晷面平行赤道面。不同季节可能需要查看另一面，可拖动场景观察当前受光面的针影。</p>
              <p>春秋分阳光沿盘缘掠过，晷面没有可读针影，地面仍可能有影子。打开“晷面平行示意”，可比较晷面与春秋分轨迹所在平面的关系。</p>
            </div>
            <div v-else class="usage-edition-card-copy">
              <p>结合建筑物、太阳轨迹和地面阴影，比较太阳高度、方位及影子随日期、时间和地点的变化。</p>
              <p>拖动右侧场景可从不同方向观察；广告牌与右下角数据同步显示当前观测信息。</p>
            </div>
          </article>
        </div>
      </section>

      <section class="usage-guide-notes">
        <div class="usage-section-heading">
          <h3>读数说明</h3>
          <span>理解模型的计算口径</span>
        </div>
        <ul>
          <li><b>时间与日出日落</b>界面时间为地方真太阳时。日出日落按太阳中心高度 0° 计算，未计大气折射与太阳视半径。</li>
          <li><b>极昼与极夜</b>极昼、极夜没有普通的日出、日落时刻；极点春秋分可能显示太阳中心全天沿地平线运行的临界状态。</li>
          <li><b>独立停转</b>只公转、不自转时，地方太阳时会倒退，公转日期继续向前；这是独立停转演示产生的相对运动。</li>
          <li><b>教学示意</b>球体大小、日地距离及播放倍速经过调整。教学年采用 2026 年分至日期（北京时间），以整日作为季节锚点，不表示精确交节瞬间。</li>
        </ul>
      </section>
    </div>

    <template #footer>
      <div class="usage-guide-footer">
        <div class="usage-guide-footer-meta">
          <span class="usage-guide-copyright">版权所属：码上教育你</span>
          <span><kbd>Esc</kbd> 关闭说明，回到场景</span>
        </div>
        <el-button type="primary" @click="visible = false">开始探索</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppEdition } from '../utils/edition'

const props = defineProps<{ edition: AppEdition }>()
const visible = defineModel<boolean>({ default: false })
const isAdvanced = computed(() => props.edition !== 'standard')
const editionName = computed(() => props.edition === 'standard' ? '标准版' : props.edition === 'city' ? '进阶城市版' : '进阶日晷版')

const commonSections = [
  {
    title: '场景与演示',
    description: '先选择视角，再调整运动与时间',
    cards: [
      {
        title: '调整观察视角',
        description: '拖动场景旋转，使用滚轮或双指缩放。顶部“总览”回到公转总览；控制面板可切换太阳中心、地球中心、地球近景等视角。',
        hint: '想重新找到地球时，可点击“地球近景”',
      },
      {
        title: '分别控制自转与公转',
        description: '底部“自转”“公转”按钮可独立启停。用总播放按钮暂停后，再次播放会恢复暂停前的组合；控制面板可调节演示速度和公转额外加速。',
        hint: '可只看自转、只看公转，也可同时演示',
      },
      {
        title: '定位日期与地方太阳时',
        description: '拖动日期会调整公转位置并暂停公转，点击分至日可定位对应日期。拖动地方太阳时，或点击 6:00、12:00、18:00，可暂停自转并定位到指定时间。',
        hint: '底部还可调整黄赤交角：0°～23°26′',
      },
      {
        title: '选择你的观测地点',
        description: '在控制面板选择北京、上海、厦门等地点，或打开“自选点”后轻点地球。选好后自动锁定；拖动旋转视角不会改变点位。',
        hint: '重新开启“自选点”即可换一个位置',
      },
    ],
  },
  {
    title: '数据与辅助',
    description: '把空间关系与观测读数对照起来',
    cards: [
      {
        title: '打开需要的辅助图层',
        description: '“显示图层”和“观测点辅助”可逐项开关，也可全开、全关。纬线昼弧为金色、夜弧为蓝色，均包含 0° 赤道；还可结合太阳高度角、地表法线和当地地平面观察。',
        hint: '昼弧、夜弧独立开关，关闭普通纬线后也可显示',
      },
      {
        title: '安排浮动面板',
        description: '顶部按钮控制“控制”“数据”“公式”“副机位”“图例”的显隐。拖动面板标题栏移动，点击折叠图标收起，拖动角落手柄调整大小；副机位方向在其标题栏切换。',
        hint: '公式默认收起，展开后可看实时参数代入',
      },
    ],
  },
]
</script>

<style>
.usage-guide-overlay {
  background: #03060bc9;
  backdrop-filter: blur(8px);
}

.usage-guide-dialog.el-dialog {
  box-sizing: border-box;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid #d7e0ea30;
  border-radius: 20px;
  background: linear-gradient(130deg, #272b32f7, #191d24fb 70%);
  box-shadow: 0 28px 100px #0009;
  --el-dialog-title-font-size: 24px;
}

.usage-guide-dialog .el-dialog__header {
  flex: 0 0 auto;
  margin: 0;
  padding: 25px 58px 23px 30px;
  border-bottom: 1px solid #d9e1ed1c;
}

.usage-guide-heading {
  display: flex;
  align-items: center;
  gap: 17px;
}

.usage-guide-book {
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  height: 48px;
  color: #dfc797;
  border: 1px solid #dfc79742;
  border-radius: 13px;
  background: #dfc7970e;
}

.usage-guide-book svg {
  width: 27px;
  height: 27px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.usage-guide-title-block {
  min-width: 0;
}

.usage-guide-title-line {
  display: flex;
  align-items: center;
  gap: 13px;
  flex-wrap: wrap;
}

.usage-guide-title-line h2 {
  margin: 0;
  color: #f2f0eb;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
}

.usage-guide-edition {
  padding: 3px 10px;
  border: 1px solid #b4d8e331;
  border-radius: 6px;
  color: #bad7e1;
  background: #9ccbd00a;
  font-size: 12px;
  line-height: 20px;
}

.usage-guide-title-block>p {
  margin: 6px 0 0;
  color: #aeb7c3;
  font-size: 13px;
  line-height: 1.7;
}

.usage-guide-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #69748370 transparent;
}

.usage-guide-body {
  padding: 25px 30px 28px;
  color: #bec7d2;
  font-size: 14px;
  line-height: 1.8;
}

.usage-guide-section {
  margin-bottom: 26px;
}

.usage-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 5px 14px;
  margin-bottom: 12px;
}

.usage-section-heading h3 {
  margin: 0;
  color: #e8dfcd;
  font-size: 15px;
  font-weight: 600;
}

.usage-section-heading>span {
  color: #929ead;
  font-size: 12px;
}

.usage-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}

.usage-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px 20px 16px;
  border: 1px solid #c8d5e51b;
  border-radius: 12px;
  background: #dce5f005;
}

.usage-card h4 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 9px;
  color: #e7ecf1;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
}

.usage-card-marker {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 2px;
  background: #a9cbd6;
  box-shadow: 0 0 0 4px #a9cbd60b;
}

.usage-card p {
  margin: 0;
  overflow-wrap: anywhere;
}

.usage-card-hint {
  margin-top: auto;
  padding-top: 12px;
  color: #96a7b8;
  font-size: 12px;
  line-height: 1.7;
}

.usage-advanced-section .usage-card-marker {
  background: #dfc797;
}

.usage-edition-card {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(170px, 0.75fr) minmax(0, 2fr);
  gap: 20px;
  padding: 20px;
  border-color: #d7c29e2d;
  background: #d7c29e07;
}

.usage-edition-card-label>span {
  display: block;
  margin-bottom: 8px;
  color: #cbb994;
  font-size: 12px;
}

.usage-edition-card-label h4 {
  color: #ebdcc0;
}

.usage-edition-card-copy p+p {
  margin-top: 8px;
}

.usage-guide-notes {
  padding: 18px 20px;
  border: 1px solid #d7c29e26;
  border-radius: 12px;
  background: #12171d40;
}

.usage-guide-notes ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px 27px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.usage-guide-notes li {
  color: #aab5c2;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.usage-guide-notes li b {
  display: block;
  margin-bottom: 3px;
  color: #cdd6df;
  font-weight: 500;
}

.usage-guide-dialog .el-dialog__footer {
  flex: 0 0 auto;
  padding: 15px 30px;
  border-top: 1px solid #d9e1ed1c;
}

.usage-guide-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
}

.usage-guide-footer-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 20px;
  min-width: 0;
  color: #8f9aaa;
  font-size: 12px;
}

.usage-guide-copyright {
  color: #c4cbd4;
}

.usage-guide-footer kbd {
  margin-right: 5px;
  padding: 2px 5px;
  border: 1px solid #c7d1df2b;
  border-radius: 4px;
  color: #b8c3ce;
  font: inherit;
}

.usage-guide-footer .el-button--primary {
  flex-shrink: 0;
  min-width: 106px;
  height: 38px;
  margin: 0;
  border-color: #e1ceaa;
  border-radius: 8px;
  background: #d8c39b;
  color: #292a2b;
  font-weight: 600;
}

.usage-guide-footer .el-button--primary:hover {
  border-color: #f0dfbd;
  background: #e8d5b1;
}

.usage-guide-dialog .el-dialog__headerbtn {
  top: 14px;
  right: 14px;
}

.usage-guide-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #b7c2ce;
}

.usage-guide-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #f1dcb4;
}

@media (max-width: 720px) {
  .usage-guide-dialog.el-dialog {
    max-height: calc(100vh - 24px);
    max-height: calc(100dvh - 24px);
    border-radius: 15px;
  }

  .usage-guide-dialog .el-dialog__header {
    padding: 19px 45px 18px 20px;
  }

  .usage-guide-heading {
    gap: 12px;
  }

  .usage-guide-book {
    flex-basis: 39px;
    height: 39px;
    border-radius: 10px;
  }

  .usage-guide-book svg {
    width: 23px;
    height: 23px;
  }

  .usage-guide-title-line {
    gap: 7px 10px;
  }

  .usage-guide-title-line h2 {
    font-size: 21px;
  }

  .usage-guide-title-block>p {
    font-size: 12px;
  }

  .usage-guide-body {
    padding: 19px 18px 21px;
    font-size: 13px;
  }

  .usage-card-grid,
  .usage-guide-notes ul {
    grid-template-columns: 1fr;
  }

  .usage-card {
    padding: 16px;
  }

  .usage-edition-card {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .usage-edition-card-label>span {
    margin-bottom: 5px;
  }

  .usage-guide-dialog .el-dialog__footer {
    padding: 13px 20px;
  }

  .usage-guide-notes {
    padding: 16px;
  }
}

@media (max-width: 420px) {
  .usage-guide-book {
    display: none;
  }

  .usage-guide-footer-meta {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
