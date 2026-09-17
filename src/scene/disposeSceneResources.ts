import * as THREE from 'three'

export interface ResourceCleanupOptions {
  /** Textures owned outside this tree, such as the main scene's cached solar map. */
  preserveTextures?: ReadonlySet<THREE.Texture>
  /** After detaching a branch, keep any resources still referenced by this tree. */
  retainRoot?: THREE.Object3D | null
}

// ArrowHelper, like Sprite, shares default geometry across independent scenes.
const sharedArrowGeometry = (() => {
  const arrow = new THREE.ArrowHelper()
  const geometry = new Set([arrow.line.geometry, arrow.cone.geometry])
  for (const object of [arrow.line, arrow.cone]) {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
  }
  return geometry
})()

function collectResources(roots: readonly THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const shadows = new Set<THREE.LightShadow>()
  const visited = new Set<object>()
  const collectTexture = (value: unknown) => {
    if (value instanceof THREE.Texture) textures.add(value)
    else if (value && typeof value === 'object' && !visited.has(value)) {
      visited.add(value)
      if (Array.isArray(value)) value.forEach(collectTexture)
      else Object.values(value).forEach(collectTexture)
    }
  }
  for (const root of roots) root.traverse(object => {
    const drawable = object as THREE.Mesh
    if (!(object instanceof THREE.Sprite) && drawable.geometry && !sharedArrowGeometry.has(drawable.geometry)) {
      geometries.add(drawable.geometry)
    }
    if (drawable.material) for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) {
      if (materials.has(material)) continue
      materials.add(material)
      // Standard materials bind maps directly; shader uniforms can hold arrays or structs.
      Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value) })
      if (material instanceof THREE.ShaderMaterial) Object.values(material.uniforms).forEach(uniform => collectTexture(uniform.value))
    }
    const shadow = (object as THREE.DirectionalLight).shadow
    if (shadow) shadows.add(shadow)
    if (object instanceof THREE.Scene) {
      collectTexture(object.background)
      collectTexture(object.environment)
    }
  })
  return { geometries, materials, textures, shadows }
}

function disposeTrees(roots: readonly THREE.Object3D[], options: ResourceCleanupOptions) {
  const removed = collectResources(roots)
  const retained = collectResources(options.retainRoot ? [options.retainRoot] : [])
  removed.textures.forEach(texture => {
    if (!retained.textures.has(texture) && !options.preserveTextures?.has(texture)) texture.dispose()
  })
  removed.materials.forEach(material => { if (!retained.materials.has(material)) material.dispose() })
  removed.geometries.forEach(geometry => { if (!retained.geometries.has(geometry)) geometry.dispose() })
  removed.shadows.forEach(shadow => { if (!retained.shadows.has(shadow)) shadow.dispose() })
}

/** Dispose an already detached/retired tree. Its object hierarchy is left unchanged. */
export function disposeObjectResources(root: THREE.Object3D, options: ResourceCleanupOptions = {}) {
  disposeTrees([root], options)
}

/** Remove children, then free their resources once while protecting remaining scene users. */
export function clearObjectChildren(group: THREE.Object3D, options: ResourceCleanupOptions = {}) {
  const children = [...group.children]
  group.clear()
  disposeTrees(children, options)
}
