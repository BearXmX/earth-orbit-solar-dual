import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { computed, nextTick, reactive, ref } from 'vue'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

const source = parse(await readFile(new URL('../src/components/FloatingPanel.vue', import.meta.url), 'utf8')).descriptor.scriptSetup.content
const tree = ts.createSourceFile('FloatingPanel.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const variables = tree.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
const names = ['panelRef', 'positioned', 'resizing', 'panelZIndex', 'position', 'size', 'desiredSize', 'relativePosition',
  'bottomInset', 'resizeFromRight', 'manuallyResized', 'manuallyPositioned', 'dragState', 'resizeState', 'previousCursor', 'previousUserSelect']
const code = ts.transpileModule([
  'return function createPanel(window, document, options = {}) {',
  'const props = { variant: "data", anchor: "free", anchorIndex: 0, topInset: 128, bottomInset: 136, initialTop: 128, initialWidth: 360, initialHeight: 250, draggable: true, ...options };',
  'const collapsed = ref(false); const emit = () => {};',
  ...names.map(name => `let ${variables.find(node => node.name.getText(tree) === name).getText(tree)};`),
  ...tree.statements.filter(ts.isFunctionDeclaration).map(node => node.getText(tree)),
  'return { position, size, resizing, setInitialPosition, startDrag, moveDrag, endDrag, startResize, moveResize, endResize, resizeWithKeyboard };',
  '}',
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const createPanel = new Function('computed', 'nextTick', 'reactive', 'ref', code)(computed, nextTick, reactive, ref)

async function setup(options = {}) {
  const window = Object.assign(new EventTarget(), { innerWidth: 1200, innerHeight: 900 })
  const document = { body: { style: { cursor: 'crosshair', userSelect: 'text' } } }
  const panel = createPanel(window, document, options)
  await panel.setInitialPosition()
  const pointer = (type, pointerId, x = 0, y = 0) => Object.assign(new Event(type, { cancelable: true }), {
    pointerId, clientX: x, clientY: y, button: 0,
  })
  const start = (method, id, x = 0, y = 0) => panel[method]({
    pointerId: id, clientX: x, clientY: y, button: 0,
    target: { closest: () => null }, preventDefault() {},
  })
  const send = (type, id, x = 0, y = 0) => window.dispatchEvent(pointer(type, id, x, y))
  const key = key => panel.resizeWithKeyboard({ key, shiftKey: false, preventDefault() {} })
  return { panel, window, document, start, send, key }
}

test('左右侧面板的键盘缩放均沿手柄方向移动，并保持另一侧边缘固定', async () => {
  for (const left of [14, 826]) {
    const { panel, key } = await setup({ initialLeft: left })
    const right = panel.position.x + panel.size.width
    key('ArrowLeft')
    assert.equal(panel.size.width, left < 600 ? 348 : 372)
    assert.equal(left < 600 ? panel.position.x : panel.position.x + panel.size.width, left < 600 ? left : right)
    key('ArrowRight')
    assert.equal(panel.size.width, 360)
    assert.equal(panel.position.x, left)
  }
})

test('拖动只响应发起操作的指针；其他手指抬起不会结束，窗口失焦后恢复原光标', async () => {
  const { panel, start, send, window, document } = await setup({ initialLeft: 100 })
  start('startDrag', 1, 100, 130)
  send('pointermove', 2, 400, 300)
  assert.equal(panel.position.x, 100)
  send('pointerup', 2)
  send('pointermove', 1, 180, 150)
  assert.equal(panel.position.x, 180)
  assert.equal(document.body.style.cursor, 'grabbing')
  window.dispatchEvent(new Event('blur'))
  assert.equal(document.body.style.cursor, 'crosshair')
  assert.equal(document.body.style.userSelect, 'text')
  send('pointermove', 1, 500, 300)
  assert.equal(panel.position.x, 180)
})

test('缩放忽略其他指针，取消与卸载清理后不再响应移动', async () => {
  const { panel, start, send, document } = await setup({ initialLeft: 100 })
  start('startResize', 3, 460, 378)
  send('pointermove', 4, 700, 500)
  assert.equal(panel.size.width, 360)
  send('pointercancel', 4)
  assert.equal(panel.resizing.value, true)
  send('pointermove', 3, 480, 388)
  assert.equal(panel.size.width, 380)
  assert.equal(panel.size.height, 260)
  send('pointercancel', 3)
  assert.equal(panel.resizing.value, false)
  assert.equal(document.body.style.userSelect, 'text')
  start('startResize', 5)
  panel.endDrag()
  panel.endResize()
  send('pointermove', 5, 200, 200)
  assert.equal(panel.size.width, 380)
  assert.equal(document.body.style.cursor, 'crosshair')
})
