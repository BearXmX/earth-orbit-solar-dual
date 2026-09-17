import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { LoadingManager } from 'three'

const source = await readFile(new URL('../src/utils/sceneLoading.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from 'three'/g, `from '${import.meta.resolve('three')}'`)
const { createSceneLoading } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)

async function remainsPending(promise) {
  let settled = false
  promise.then(() => { settled = true }, () => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false, 'loading must not finish before all required work completes')
}

test('decoded images do not finish loading before both advanced scenes report prepared frames', async () => {
  const loading = createSceneLoading(['earth', 'solar'])
  assert.ok(loading.manager instanceof LoadingManager)
  loading.manager.itemStart('earth-day')
  loading.manager.itemStart('sky')
  loading.manager.itemEnd('earth-day')
  loading.manager.itemEnd('sky')
  await remainsPending(loading.ready)
  loading.sceneReady('solar')
  loading.sceneReady('solar')
  loading.sceneReady('unrelated-scene')
  await remainsPending(loading.ready)
  loading.sceneReady('earth')
  await loading.ready
})

test('prepared scenes continue waiting until the last image finishes and expose actual item progress', async () => {
  const progress = []
  const loading = createSceneLoading(['earth', 'solar'], (loaded, total) => progress.push([loaded, total]))
  loading.manager.itemStart('sky')
  loading.manager.itemStart('earth-day')
  loading.sceneReady('earth')
  loading.sceneReady('solar')
  await remainsPending(loading.ready)
  loading.manager.itemEnd('sky')
  await remainsPending(loading.ready)
  loading.manager.itemEnd('earth-day')
  await loading.ready
  assert.deepEqual(progress, [[0, 1], [1, 2], [2, 2]])
})

test('a second image batch resets readiness while a scene is still preparing', async () => {
  const loading = createSceneLoading(['earth', 'solar'])
  loading.manager.itemStart('earth-day')
  loading.manager.itemEnd('earth-day')
  loading.sceneReady('earth')
  loading.manager.itemStart('sky')
  loading.sceneReady('solar')
  await remainsPending(loading.ready)
  loading.manager.itemEnd('sky')
  await loading.ready
})

test('standard edition needs only Earth and supports synchronous scenes without images', async () => {
  const loading = createSceneLoading(['earth'])
  loading.sceneReady('earth')
  await loading.ready
  const withImages = createSceneLoading(['earth'])
  withImages.manager.itemStart('earth-day')
  withImages.sceneReady('earth')
  await remainsPending(withImages.ready)
  withImages.manager.itemEnd('earth-day')
  await withImages.ready
  await createSceneLoading([]).ready
})

test('actual App startup hides the solar scene in all three editions and waits only for Earth plus all textures', async () => {
  const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.ts', parse(appSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const names = ['solarVisible', 'loadedResources', 'totalResources', 'startup']
  // Keep actual declaration order, so moving startup before solarVisible is also caught.
  const declarations = tree.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)))
  assert.equal(declarations.length, names.length, 'App must expose its actual initial visibility, progress, and startup declarations')
  const initialization = ts.transpileModule(declarations.map(statement => statement.getText(tree)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const initializeApp = new Function('isAdvancedEdition', 'ref', 'createSceneLoading', `${initialization}\nreturn { solarVisible, startup };`)

  for (const { edition, isAdvanced } of [
    { edition: 'standard', isAdvanced: false },
    { edition: 'sundial', isAdvanced: true },
    { edition: 'city', isAdvanced: true },
  ]) {
    const { solarVisible, startup } = initializeApp(isAdvanced, value => ({ value }), createSceneLoading)
    try {
      assert.equal(solarVisible.value, false, `${edition}: solar should not mount by default`)
      startup.manager.itemStart('earth-day')
      startup.manager.itemStart('nebula-sky')
      startup.sceneReady('earth')
      await remainsPending(startup.ready)
      startup.manager.itemEnd('earth-day')
      await remainsPending(startup.ready)
      let completed = false
      startup.ready.then(() => { completed = true }, () => {})
      startup.manager.itemEnd('nebula-sky')
      await Promise.resolve()
      assert.equal(completed, true, `${edition}: Earth and textures are ready; the unmounted solar scene must not block startup`)
      await startup.ready
    } finally { startup.dispose() }
  }
})

test('actual App isolates a later solar-scene failure without hiding the ready Earth scene', async () => {
  const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.ts', parse(appSource).descriptor.scriptSetup.content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'onSolarLoadError')
  assert.ok(declaration)
  const code = ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const ready of [true, false]) {
    const pageReady = { value: ready }
    const loadingError = { value: '' }
    const solarSceneError = { value: '' }
    const failures = []
    const setup = new Function('appDisposed', 'pageReady', 'loadingError', 'solarSceneError', 'startup', `${code}\nreturn onSolarLoadError;`)
    const startup = { fail: message => failures.push(message) }
    setup(false, pageReady, loadingError, solarSceneError, startup)('Solar context failed')
    assert.equal(pageReady.value, ready)
    assert.equal(solarSceneError.value, ready ? 'Solar context failed' : '')
    assert.equal(loadingError.value, ready ? '' : 'Solar context failed')
    assert.deepEqual(failures, ready ? [] : ['Solar context failed'])
    setup(true, pageReady, loadingError, solarSceneError, startup)('Late error after unmount')
    assert.equal(solarSceneError.value, ready ? 'Solar context failed' : '')
    assert.equal(loadingError.value, ready ? '' : 'Solar context failed')
  }
})

test('an image error stays rejected when Three subsequently calls itemEnd and all scenes become ready', async () => {
  const progress = []
  const loading = createSceneLoading(['earth', 'solar'], (...counts) => progress.push(counts))
  loading.manager.itemStart('broken-sky')
  loading.manager.itemStart('earth-day')
  const savedOnLoad = loading.manager.onLoad
  const savedOnProgress = loading.manager.onProgress
  loading.manager.itemError('broken-sky')
  loading.manager.itemEnd('broken-sky')
  loading.manager.itemEnd('earth-day')
  loading.sceneReady('earth')
  loading.sceneReady('solar')
  savedOnLoad()
  savedOnProgress('late-event', 2, 2)
  await assert.rejects(loading.ready, { message: '天空或贴图加载失败' })
  assert.deepEqual(progress, [[0, 1]], 'failed loading must not publish later success progress')
})

test('explicit initialization failures preserve their message and cannot be overwritten', async () => {
  const loading = createSceneLoading(['earth'])
  loading.fail('此设备无法创建 WebGL 场景')
  loading.fail('later failure')
  loading.sceneReady('earth')
  loading.dispose()
  await assert.rejects(loading.ready, { message: '此设备无法创建 WebGL 场景' })
})

test('dispose cancels pending loading without unhandled rejection or late progress callbacks', async () => {
  const progress = []
  const loading = createSceneLoading(['earth'], (...counts) => progress.push(counts))
  loading.manager.itemStart('sky')
  const savedStart = loading.manager.onStart
  const savedLoad = loading.manager.onLoad
  const savedProgress = loading.manager.onProgress
  const savedError = loading.manager.onError
  loading.dispose()
  loading.dispose()
  // Attach the consumer only on the next event-loop turn to cover unmount-before-await.
  await new Promise(resolve => setImmediate(resolve))
  savedStart('late-image', 0, 2)
  savedProgress('late-image', 1, 2)
  savedLoad()
  savedError('late-error')
  loading.manager.itemEnd('sky')
  loading.sceneReady('earth')
  await assert.rejects(loading.ready, { name: 'AbortError', message: '场景加载已取消' })
  assert.deepEqual(progress, [[0, 1]])
  assert.equal(loading.manager.onStart, undefined)
  assert.equal(typeof loading.manager.onProgress, 'function')
  assert.equal(typeof loading.manager.onLoad, 'function')
  assert.equal(typeof loading.manager.onError, 'function')
})

test('successful completion is final and repeated ready, fail, or dispose calls are harmless', async () => {
  const loading = createSceneLoading(['earth', 'earth'])
  loading.sceneReady('earth')
  await loading.ready
  loading.sceneReady('earth')
  loading.fail('late failure')
  loading.dispose()
  loading.manager.itemStart('later-optional-texture')
  loading.manager.itemError('later-optional-texture')
  loading.manager.itemEnd('later-optional-texture')
  await loading.ready
})
