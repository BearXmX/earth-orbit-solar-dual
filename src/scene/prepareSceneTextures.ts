import * as THREE from 'three'

/** Upload decoded images and canvas textures before revealing the first scene frame. */
export function prepareSceneTextures(renderer: Pick<THREE.WebGLRenderer, 'initTexture'>, scene: THREE.Object3D) {
  const textures = new Set<THREE.Texture>()
  const collect = (value: unknown) => {
    if (value instanceof THREE.Texture) textures.add(value)
    else if (Array.isArray(value)) value.forEach(item => { if (item instanceof THREE.Texture) textures.add(item) })
  }
  scene.traverse(object => {
    const materials = (object as THREE.Mesh).material
    if (!materials) return
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      Object.values(material).forEach(collect)
      if (material instanceof THREE.ShaderMaterial) Object.values(material.uniforms).forEach(uniform => collect(uniform.value))
    }
  })
  if (scene instanceof THREE.Scene) { collect(scene.background); collect(scene.environment) }
  // Traverse includes hidden layers, so a first toggle cannot reveal an unloaded map.
  textures.forEach(texture => renderer.initTexture(texture))
  return textures.size
}
