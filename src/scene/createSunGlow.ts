import * as THREE from 'three'

/** A soft inner corona and broad outer halo; independent of illumination strength. */
export function createSunGlow(radius: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255,247,213,1)')
  gradient.addColorStop(0.32, 'rgba(255,221,153,.65)')
  gradient.addColorStop(0.53, 'rgba(255,190,91,.24)')
  gradient.addColorStop(0.8, 'rgba(244,151,60,.055)')
  gradient.addColorStop(1, 'rgba(244,151,60,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const group = new THREE.Group()
  const layers = [{ scale: 3.5, opacity: 0.72 }, { scale: 6.5, opacity: 0.23 }].map(def => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, opacity: def.opacity,
      blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, toneMapped: false,
    }))
    sprite.scale.setScalar(radius * def.scale)
    group.add(sprite)
    return { sprite, opacity: def.opacity }
  })
  return {
    group,
    update(visible: boolean, strength: number) {
      group.visible = visible && strength > 0
      layers.forEach(({ sprite, opacity }) => { sprite.material.opacity = opacity * THREE.MathUtils.clamp(strength, 0, 2) })
    },
    dispose() {
      group.removeFromParent()
      layers.forEach(({ sprite }) => sprite.material.dispose())
      texture.dispose()
    },
  }
}
