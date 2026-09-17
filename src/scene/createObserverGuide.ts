import * as THREE from 'three'
import { formatSignedDegreesMinutes } from '../utils/astronomy'

export interface ObserverGuideVisibility {
  ripple: boolean
  normal: boolean
  sunRay: boolean
  horizon: boolean
  altitude: boolean
}

export interface ObserverGuideState {
  /** World-space surface position; the guide does not infer the scaled Sun position. */
  point: THREE.Vector3
  normal: THREE.Vector3
  /** World-space unit direction pointing toward the Sun, opposite incoming photons. */
  sunDirection: THREE.Vector3
  altitude: number
  /** Animation timestamp in milliseconds, e.g. requestAnimationFrame's timestamp. */
  time: number
  visibility: ObserverGuideVisibility
}

type GuideCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera
type LabelKind = 'normal' | 'sunRay' | 'horizon' | 'altitude'

function safeDirection(input: THREE.Vector3, fallback: THREE.Vector3) {
  return Number.isFinite(input.x) && Number.isFinite(input.y) && Number.isFinite(input.z) && input.lengthSq() > 1e-20
    ? input.clone().normalize() : fallback.clone()
}

/** The tangent-plane basis remains finite when azimuth is undefined at zenith/nadir. */
export function observerGuideFrame(normal: THREE.Vector3, sunDirection: THREE.Vector3) {
  const up = safeDirection(normal, new THREE.Vector3(0, 1, 0))
  const sun = safeDirection(sunDirection, up)
  const sine = THREE.MathUtils.clamp(up.dot(sun), -1, 1)
  const horizontal = sun.clone().addScaledVector(up, -sine)
  if (horizontal.lengthSq() < 1e-14) {
    horizontal.set(Math.abs(up.y) < 0.9 ? 0 : 1, Math.abs(up.y) < 0.9 ? 1 : 0, 0)
    horizontal.addScaledVector(up, -horizontal.dot(up))
  }
  horizontal.normalize()
  return { up, sun, horizontal, sideways: new THREE.Vector3().crossVectors(horizontal, up).normalize(), altitude: Math.asin(sine) }
}

function createLabel(kind: LabelKind, initialText: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 76
  const context = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color: 0xffffff, transparent: true, depthTest: false,
    depthWrite: false, toneMapped: false, sizeAttenuation: false,
  }))
  sprite.name = `observer-${kind}-label`
  sprite.renderOrder = 34
  sprite.frustumCulled = false
  const leaderPositions = new THREE.Float32BufferAttribute(new Float32Array(6), 3)
  const leader = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', leaderPositions),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.48, depthTest: false, depthWrite: false, toneMapped: false }),
  )
  leader.name = `observer-${kind}-label-leader`
  leader.renderOrder = 33
  leader.frustumCulled = false
  const anchor = new THREE.Vector3()
  let previousText = ''
  let contentWidth = 256
  function setText(text: string) {
    if (text === previousText) return
    previousText = text
    sprite.userData.text = text
    if (!context) return
    context.font = '600 48px "Microsoft YaHei", sans-serif'
    contentWidth = Math.min(canvas.width, Math.ceil((context.measureText(text)?.width ?? text.length * 26) + 30))
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    context.lineWidth = 7
    context.strokeStyle = 'rgba(4, 20, 22, 0.95)'
    context.strokeText(text, contentWidth / 2, 39)
    context.fillStyle = color
    context.fillText(text, contentWidth / 2, 39)
    texture.repeat.x = contentWidth / canvas.width
    texture.needsUpdate = true
  }
  setText(initialText)
  return { kind, sprite, leader, leaderPositions, anchor, texture, setText, get contentWidth() { return contentWidth }, canvas }
}

/** Attach to the main world scene. All incoming vectors are world-space and remain unmodified. */
export function createObserverGuide(earthRadius: number) {
  const radius = Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1
  const length = radius * 0.78
  const arcRadius = radius * 0.36
  const group = new THREE.Group()
  group.name = 'observer-guide'
  // Keeping a world transform makes the contract valid even if the parent scene has a transform.
  group.matrixAutoUpdate = false
  const parts = {
    ripple: new THREE.Group(), normal: new THREE.Group(), sunRay: new THREE.Group(),
    horizon: new THREE.Group(), altitude: new THREE.Group(),
  }
  for (const [name, part] of Object.entries(parts)) {
    part.name = `observer-${name}`
    group.add(part)
  }
  const visibility: ObserverGuideVisibility = { ripple: false, normal: false, sunRay: false, horizon: false, altitude: false }
  const worldPoint = new THREE.Vector3()
  const worldNormal = new THREE.Vector3(0, 1, 0)
  const basis = new THREE.Matrix4()
  const worldMatrix = new THREE.Matrix4()
  const inverseParent = new THREE.Matrix4()
  const unitScale = new THREE.Vector3(1, 1, 1)
  const orientation = new THREE.Quaternion()
  let hasState = false
  let disposed = false

  const rippleRings = Array.from({ length: 3 }, (_, index) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.038, radius * 0.048, 64),
      new THREE.MeshBasicMaterial({ color: 0x75ebd1, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    )
    ring.name = `observer-ripple-${index}`
    ring.rotation.x = -Math.PI / 2
    ring.position.y = radius * (0.004 + index * 0.0006)
    ring.userData.phase = index / 3
    parts.ripple.add(ring)
    return ring
  })

  function makeArrow(color: number, name: string) {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), length, color, radius * 0.075, radius * 0.038)
    // ArrowHelper shares its default geometries; own clones keep disposal local to this guide.
    arrow.line.geometry = arrow.line.geometry.clone()
    arrow.cone.geometry = arrow.cone.geometry.clone()
    arrow.name = name
    return arrow
  }
  const normalArrow = makeArrow(0x76e3c6, 'observer-normal-arrow')
  const sunArrow = makeArrow(0xffcb69, 'observer-incoming-sun-arrow')
  parts.normal.add(normalArrow)
  parts.sunRay.add(sunArrow)

  function makeDashed(points: THREE.Vector3[], color: number, name: string) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({
      color, dashSize: radius * 0.045, gapSize: radius * 0.028, transparent: true, opacity: 0.88,
      depthTest: false, depthWrite: false, toneMapped: false,
    }))
    line.name = name
    line.computeLineDistances()
    return line
  }
  const nightRay = makeDashed([new THREE.Vector3(), new THREE.Vector3(length, 0, 0)], 0xb6b3f4, 'observer-night-ray')
  parts.sunRay.add(nightRay)
  const horizonLine = makeDashed([
    new THREE.Vector3(-length * 0.52, 0, 0), new THREE.Vector3(length * 1.08, 0, 0),
  ], 0xc5e4dc, 'observer-horizon-line')
  const horizonPlane = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.41, 64), new THREE.MeshBasicMaterial({
    color: 0x60c2b1, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
    depthTest: false, depthWrite: false, toneMapped: false,
  }))
  horizonPlane.name = 'observer-horizon-plane'
  horizonPlane.rotation.x = -Math.PI / 2
  horizonPlane.position.y = radius * 0.002
  horizonPlane.renderOrder = 28
  const horizonRim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.407, radius * 0.411, 64), new THREE.MeshBasicMaterial({
    color: 0x88d9c8, transparent: true, opacity: 0.53, side: THREE.DoubleSide,
    depthTest: false, depthWrite: false, toneMapped: false,
  }))
  horizonRim.rotation.copy(horizonPlane.rotation)
  horizonRim.position.copy(horizonPlane.position)
  horizonRim.name = 'observer-horizon-rim'
  parts.horizon.add(horizonPlane, horizonRim, horizonLine)

  const segments = 64
  const arcPositions = new THREE.Float32BufferAttribute(new Float32Array((segments + 1) * 3), 3)
  const arcMaterial = new THREE.LineDashedMaterial({ color: 0xffca66, dashSize: radius * 0.04, gapSize: 0,
    depthTest: false, depthWrite: false, toneMapped: false })
  const arc = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', arcPositions), arcMaterial)
  arc.name = 'observer-altitude-arc'
  arc.frustumCulled = false
  const sectorPositions = new THREE.Float32BufferAttribute(new Float32Array(segments * 9), 3)
  const sectorMaterial = new THREE.MeshBasicMaterial({ color: 0xffca66, transparent: true, opacity: 0.19,
    side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false })
  const sector = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', sectorPositions), sectorMaterial)
  sector.name = 'observer-altitude-sector'
  sector.frustumCulled = false
  sector.renderOrder = 29
  parts.altitude.add(arc, sector)

  const angleLabel = createLabel('altitude', 'h = 0°00′', '#ffdb8a')
  const normalLabel = createLabel('normal', '地表法线', '#85ebd0')
  const sunLabel = createLabel('sunRay', '太阳平行光', '#ffdb8a')
  const horizonLabel = createLabel('horizon', '当地水平面', '#cae4dd')
  const labels = [angleLabel, normalLabel, sunLabel, horizonLabel]
  normalLabel.anchor.set(-radius * 0.045, length * 1.04, 0)
  horizonLabel.anchor.set(length * 0.45, -radius * 0.045, -radius * 0.25)
  labels.forEach(label => group.add(label.sprite, label.leader))
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      if (!rippleRings.includes(object as typeof rippleRings[number])) {
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
          material.depthTest = false
          material.depthWrite = false
          material.toneMapped = false
        })
      }
      if (object.renderOrder === 0) object.renderOrder = 30
    }
  })

  function update(state: ObserverGuideState) {
    if (disposed) return
    if (![state.point.x, state.point.y, state.point.z].every(Number.isFinite)) { group.visible = false; hasState = false; return }
    const frame = observerGuideFrame(state.normal, state.sunDirection)
    worldPoint.copy(state.point)
    worldNormal.copy(frame.up)
    basis.makeBasis(frame.horizontal, frame.up, frame.sideways)
    orientation.setFromRotationMatrix(basis)
    worldMatrix.compose(worldPoint, orientation, unitScale)
    if (group.parent) {
      group.parent.updateWorldMatrix(true, false)
      group.matrix.multiplyMatrices(inverseParent.copy(group.parent.matrixWorld).invert(), worldMatrix)
    } else group.matrix.copy(worldMatrix)
    group.matrixWorldNeedsUpdate = true
    group.updateWorldMatrix(false, true)
    Object.assign(visibility, state.visibility)
    for (const key of Object.keys(parts) as (keyof ObserverGuideVisibility)[]) parts[key].visible = !!visibility[key]
    labels.forEach(label => { label.sprite.visible = !!visibility[label.kind]; label.leader.visible = false })
    hasState = true
    group.visible = Object.values(visibility).some(Boolean)

    const timestamp = Number.isFinite(state.time) ? state.time : 0
    rippleRings.forEach((ring, index) => {
      const progress = THREE.MathUtils.euclideanModulo(timestamp * 0.00042 + index / 3, 1)
      ring.scale.setScalar(0.82 + progress * 2.35)
      ring.material.opacity = Math.pow(1 - progress, 1.55) * 0.52
    })
    const night = frame.altitude < -1e-6
    const localSun = new THREE.Vector3(Math.cos(frame.altitude), Math.sin(frame.altitude), 0)
    sunArrow.position.copy(localSun).multiplyScalar(length)
    sunArrow.setDirection(localSun.clone().negate())
    sunArrow.visible = !night
    nightRay.rotation.z = frame.altitude
    nightRay.visible = night
    arcMaterial.color.setHex(night ? 0xb6b3f4 : 0xffca66)
    arcMaterial.gapSize = night ? radius * 0.026 : 0
    sectorMaterial.color.copy(arcMaterial.color)
    arc.visible = sector.visible = Math.abs(frame.altitude) > 1e-8
    for (let i = 0; i <= segments; i++) {
      const angle = frame.altitude * i / segments
      const x = Math.cos(angle) * arcRadius
      const y = Math.sin(angle) * arcRadius
      arcPositions.setXYZ(i, x, y, 0)
      if (i < segments) {
        const nextAngle = frame.altitude * (i + 1) / segments
        sectorPositions.setXYZ(i * 3, 0, 0, 0)
        sectorPositions.setXYZ(i * 3 + 1, x, y, 0)
        sectorPositions.setXYZ(i * 3 + 2, Math.cos(nextAngle) * arcRadius, Math.sin(nextAngle) * arcRadius, 0)
      }
    }
    arcPositions.needsUpdate = true
    sectorPositions.needsUpdate = true
    arc.computeLineDistances()
    sunLabel.setText(night ? '太阳方向延长线' : '太阳平行光')
    sunLabel.anchor.copy(localSun).multiplyScalar(length * 0.91).add(new THREE.Vector3(radius * 0.045, radius * 0.05, 0))
    const halfAngle = frame.altitude / 2
    angleLabel.anchor.set(Math.cos(halfAngle) * arcRadius * 1.16, Math.sin(halfAngle) * arcRadius * 1.16, radius * 0.018)
    const actualAltitude = THREE.MathUtils.radToDeg(frame.altitude)
    // Parent values may be rounded; never let a mismatched readout override parallel-ray geometry.
    const displayedAltitude = Number.isFinite(state.altitude) && Math.abs(state.altitude - actualAltitude) < 1e-5
      ? state.altitude : actualAltitude
    angleLabel.setText(`h = ${formatSignedDegreesMinutes(displayedAltitude)}`)
    group.userData.altitude = actualAltitude
    labels.forEach(label => label.sprite.position.copy(label.anchor))
  }

  const toCamera = new THREE.Vector3()
  const projected = new THREE.Vector3()
  const labelLocal = new THREE.Vector3()
  function updateForCamera(camera: GuideCamera, viewportHeight = 720) {
    if (disposed || !hasState || !Object.values(visibility).some(Boolean) || viewportHeight <= 0) { group.visible = false; return }
    camera.updateWorldMatrix(true, false)
    if (camera instanceof THREE.OrthographicCamera) camera.getWorldDirection(toCamera).negate()
    else camera.getWorldPosition(toCamera).sub(worldPoint).normalize()
    // Negative-altitude helpers may overlay the near surface, never the far hemisphere.
    group.visible = worldNormal.dot(toCamera) > 0.005
    if (!group.visible) return
    group.updateWorldMatrix(true, false)
    const height = Math.max(viewportHeight, 1)
    const projection = camera.projectionMatrix.elements
    const width = height * projection[5]! / projection[0]!
    const worldPerPixel = 2 / (height * projection[5]!)
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    for (const label of labels) {
      const emphasis = label.kind === 'altitude'
      label.sprite.visible = !!visibility[label.kind] && (emphasis || height >= 220)
      label.leader.visible = false
      if (!label.sprite.visible) continue
      const pixelHeight = (THREE.MathUtils.clamp(height * 0.016, 14, 21) + (emphasis ? 2 : 0)) * 1.5
      const pixelWidth = Math.min(pixelHeight * label.contentWidth / label.canvas.height, Math.max(1, width - 24))
      label.sprite.scale.set(pixelWidth * worldPerPixel, pixelHeight * worldPerPixel, 1)
      projected.copy(label.anchor).applyMatrix4(group.matrixWorld).project(camera)
      if (projected.z < -1 || projected.z > 1) { label.sprite.visible = false; continue }
      const anchorX = (projected.x + 1) * width / 2
      const anchorY = (1 - projected.y) * height / 2
      const x = THREE.MathUtils.clamp(anchorX + 10, pixelWidth / 2 + 10, width - pixelWidth / 2 - 10)
      const baseY = THREE.MathUtils.clamp(anchorY - 16, pixelHeight / 2 + 12, height - pixelHeight / 2 - 16)
      let y = baseY
      for (const offset of [0, -30, 30, -60, 60, -90, 90]) {
        y = THREE.MathUtils.clamp(baseY + offset, pixelHeight / 2 + 12, height - pixelHeight / 2 - 16)
        if (!boxes.some(box => Math.abs(box.x - x) < (box.w + pixelWidth) / 2 + 6 && Math.abs(box.y - y) < (box.h + pixelHeight) / 2 + 5)) break
      }
      boxes.push({ x, y, w: pixelWidth, h: pixelHeight })
      labelLocal.set(x / width * 2 - 1, 1 - y / height * 2, projected.z).unproject(camera)
      group.worldToLocal(labelLocal)
      label.sprite.position.copy(labelLocal)
      label.leader.visible = Math.hypot(x - anchorX, y - anchorY) > 16
      label.leaderPositions.setXYZ(0, label.anchor.x, label.anchor.y, label.anchor.z)
      label.leaderPositions.setXYZ(1, labelLocal.x, labelLocal.y, labelLocal.z)
      label.leaderPositions.needsUpdate = true
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        if (!(object instanceof THREE.Sprite)) geometries.add(object.geometry)
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material))
      }
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    labels.forEach(label => label.texture.dispose())
    group.removeFromParent()
    group.visible = false
  }

  group.visible = false
  return { group, update, updateForCamera, dispose }
}
