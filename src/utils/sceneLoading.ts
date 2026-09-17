import { LoadingManager } from 'three'

/** Coordinate decoded textures with each initially visible scene's first prepared frame. */
export function createSceneLoading(requiredScenes: string[], onProgress?: (loaded: number, total: number) => void) {
  const required = new Set(requiredScenes)
  const prepared = new Set<string>()
  const manager = new LoadingManager()
  let assetsReady = true
  let settled = false
  let resolveReady!: () => void
  let rejectReady!: (reason: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  // Mark rejection as observed even if teardown precedes the caller's await.
  // The original ready promise remains rejected for the caller to handle.
  void ready.catch(() => {})

  function detachCallbacks() {
    manager.onStart = undefined
    // Three's type declarations require these hooks to remain callable.
    manager.onLoad = () => {}
    manager.onProgress = () => {}
    manager.onError = () => {}
  }

  function checkReady() {
    if (settled || !assetsReady || [...required].some(name => !prepared.has(name))) return
    settled = true
    detachCallbacks()
    resolveReady()
  }

  function rejectOnce(error: Error) {
    if (settled) return
    settled = true
    detachCallbacks()
    rejectReady(error)
  }

  manager.onStart = (_url, loaded, total) => {
    if (settled) return
    assetsReady = false
    onProgress?.(loaded, total)
  }
  manager.onProgress = (_url, loaded, total) => {
    if (!settled) onProgress?.(loaded, total)
  }
  manager.onLoad = () => {
    if (settled) return
    assetsReady = true
    checkReady()
  }
  manager.onError = () => rejectOnce(new Error('天空或贴图加载失败'))

  function sceneReady(name: string) {
    if (settled || !required.has(name)) return
    prepared.add(name)
    checkReady()
  }

  function fail(message: string) {
    rejectOnce(new Error(message))
  }

  function dispose() {
    const error = new Error('场景加载已取消')
    error.name = 'AbortError'
    rejectOnce(error)
  }

  checkReady()
  return { manager, ready, sceneReady, fail, dispose }
}
