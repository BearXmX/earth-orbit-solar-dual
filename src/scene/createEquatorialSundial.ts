import * as THREE from 'three'
import { equatorialShadow, polarAxis } from '../utils/sundial'

/** 仅创建日晷模型；相机、天空、太阳路径和场景灯光继续由 sun.vue 管理。 */
export function createEquatorialSundial(renderer: THREE.WebGLRenderer) {
  const group = new THREE.Group()
  group.name = 'equatorial-sundial-model'
  group.scale.setScalar(0.7)
  const DIAL_RADIUS = 2
  const PIN_LENGTH = 1.3
  const PLATE_FACE_Z = 0.056
  const FACE_Z = 0.061
  const CENTER = new THREE.Vector3(0, 2.35, 0)
  let dial: THREE.Group
  let support: THREE.Group
  let needleShadow: THREE.Mesh

  function label(text: string, color = '#e4f5ff', width = 1.2) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.font = '600 48px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = '#071725'
    ctx.lineWidth = 7
    ctx.strokeText(text, 256, 64)
    ctx.fillStyle = color
    ctx.fillText(text, 256, 64)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
    sprite.scale.set(width, width / 4, 1)
    return sprite
  }

  function dialTexture(back: boolean) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1024
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = back ? '#d7e4e4' : '#efe0bd'
    ctx.fillRect(0, 0, 1024, 1024)
    ctx.translate(512, 512)
    for (const r of [492, 475, 349, 110]) {
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.strokeStyle = '#927344'
      ctx.lineWidth = r > 470 ? 5 : 2
      ctx.stroke()
    }
    for (let quarter = 0; quarter < 96; quarter++) {
      const hour = quarter / 4
      const angle = (hour - 12) * Math.PI / 12
      const x = (back ? 1 : -1) * Math.sin(angle)
      const y = Math.cos(angle)
      const major = quarter % 4 === 0
      ctx.beginPath()
      ctx.moveTo(x * (major ? 350 : 450), y * (major ? 350 : 450))
      ctx.lineTo(x * 474, y * 474)
      ctx.lineWidth = major ? 3 : 1.5
      ctx.strokeStyle = '#705638'
      ctx.stroke()
      if (major) {
        ctx.font = '600 42px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#3e3628'
        ctx.fillText(String(hour), x * 409, y * 409)
      }
    }
    ctx.font = '600 29px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#705638'
    ctx.fillText(back ? '朝南天极面' : '朝北天极面', 0, -165)
    ctx.font = '24px "Microsoft YaHei", sans-serif'
    ctx.fillText('地方太阳时', 0, 195)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer!.capabilities.getMaxAnisotropy()
    return texture
  }

  function createDial() {
    dial = new THREE.Group()
    dial.name = 'equatorial-dial-face'
    dial.position.copy(CENTER)
    group.add(dial)
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(DIAL_RADIUS, DIAL_RADIUS, 0.11, 128), new THREE.MeshStandardMaterial({ color: 0xb99b5c, metalness: 0.55, roughness: 0.38 }))
    edge.rotation.x = Math.PI / 2
    dial.add(edge)
    for (const face of [1, -1]) {
      const plate = new THREE.Mesh(new THREE.CircleGeometry(DIAL_RADIUS, 128), new THREE.MeshStandardMaterial({ map: dialTexture(face < 0), roughness: 0.8 }))
      plate.position.z = face * PLATE_FACE_Z
      if (face < 0) plate.rotation.y = Math.PI
      dial.add(plate)
    }
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, PIN_LENGTH * 2, 20), new THREE.MeshStandardMaterial({ color: 0x634a24, metalness: 0.7, roughness: 0.3 }))
    needle.rotation.x = Math.PI / 2
    dial.add(needle)
    const axisLabel = label('晷针 ∥ 地轴', '#ffe2a2', 1.6)
    axisLabel.position.set(0, 0.22, PIN_LENGTH + 0.35)
    dial.add(axisLabel)

    const shadowGeometry = new THREE.BufferGeometry()
    shadowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3))
    needleShadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ color: 0x141c26, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false }))
    needleShadow.name = 'equatorial-gnomon-shadow'
    needleShadow.frustumCulled = false
    dial.add(needleShadow)

    support = new THREE.Group()
    group.add(support)
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.08, 0.18, 64), new THREE.MeshStandardMaterial({ color: 0x516779, roughness: 0.8 }))
    foot.position.y = 0.15
    support.add(foot)
    // 支架位于盘缘外，给冬季下表面的针影留出观察空间。
    for (const x of [-2.15, 2.15]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, CENTER.y - 0.1, 16), new THREE.MeshStandardMaterial({ color: 0x8c784f, metalness: 0.45, roughness: 0.4 }))
      post.position.set(x, CENTER.y / 2, 0)
      support.add(post)
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.35, 12), post.material)
      arm.rotation.z = Math.PI / 2
      arm.position.set(Math.sign(x) * 2.04, CENTER.y, 0)
      support.add(arm)
    }
  }


  createDial()
  group.traverse(object => {
    if (object instanceof THREE.Mesh && object !== needleShadow) object.castShadow = true
  })

  function update(latitude: number, altitude: number, azimuth: number) {
    const phi = latitude * Math.PI / 180
    dial.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, Math.cos(phi), -Math.sin(phi)),
      polarAxis(latitude),
    ))
    const projection = equatorialShadow(latitude, altitude, azimuth, DIAL_RADIUS, PIN_LENGTH - PLATE_FACE_Z)
    needleShadow.visible = projection.status === 'readable'
    if (!projection.endpoint) return
    const length = Math.hypot(projection.endpoint.x, projection.endpoint.y)
    // 给影线宽度留出圆周余量，避免矩形的两个外角越出晷面。
    const scale = length ? Math.min(1, Math.sqrt(DIAL_RADIUS ** 2 - 0.027 ** 2) / length) : 1
    const x = projection.endpoint.x * scale
    const y = projection.endpoint.y * scale
    const dx = length ? -projection.endpoint.y / length * 0.027 : 0
    const dy = length ? projection.endpoint.x / length * 0.027 : 0
    const z = FACE_Z * projection.face
    const positions = needleShadow.geometry.getAttribute('position') as THREE.BufferAttribute
    const vertices = [[dx, dy], [-dx, -dy], [x - dx, y - dy], [dx, dy], [x - dx, y - dy], [x + dx, y + dy]]
    vertices.forEach(([vx, vy], i) => positions.setXYZ(i, vx!, vy!, z))
    positions.needsUpdate = true
  }

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()
    group.traverse(object => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) geometries.add(mesh.geometry)
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material)
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
      }
    })
    textures.forEach(texture => texture.dispose())
    materials.forEach(material => material.dispose())
    geometries.forEach(geometry => geometry.dispose())
    group.removeFromParent()
  }

  return {
    group, update, dispose,
    radius: DIAL_RADIUS * group.scale.x,
    centerHeight: CENTER.y * group.scale.y,
    getCenter: () => dial.getWorldPosition(new THREE.Vector3()),
  }
}
