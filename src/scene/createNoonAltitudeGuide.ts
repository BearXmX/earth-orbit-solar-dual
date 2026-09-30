import * as THREE from 'three'
import { formatDegreesMinutes } from '../utils/astronomy'

const DEG = Math.PI / 180
export const NOON_ALTITUDE_LATITUDES: readonly number[] = Object.freeze(
  Array.from({ length: 19 }, (_, index) => -90 + index * 10),
)

/** Shared globe/panel readings; the subsolar latitude is listed separately at 90 degrees. */
export function noonAltitudeSamples(declination: number) {
  if (!Number.isFinite(declination) || Math.abs(declination) > 90) return []
  return NOON_ALTITUDE_LATITUDES.map(latitude => {
    const altitude = 90 - Math.abs(latitude - declination)
    return { latitude, altitude: Math.abs(altitude) < 1e-10 ? 0 : altitude }
  })
}

export interface NoonAltitudeSample {
  latitude: number
  /** Solar-centre altitude at upper culmination; negative values remain negative. */
  altitude: number
  /** World-space outward surface normal on the noon half of the meridian. */
  normal: THREE.Vector3
}

function normalized(input: THREE.Vector3) {
  return [input.x, input.y, input.z].every(Number.isFinite) && input.lengthSq() > 1e-20
    ? input.clone().normalize() : null
}

/**
 * The noon meridian follows the Sun and geographic axis, never the rotating globe texture.
 * At a pole, "noon" is the limiting meridian position; its altitude is still well defined.
 */
export function noonAltitudeFrame(sunDirection: THREE.Vector3, axisDirection: THREE.Vector3) {
  const sun = normalized(sunDirection)
  const axis = normalized(axisDirection)
  if (!sun || !axis) return null
  const sineDeclination = THREE.MathUtils.clamp(axis.dot(sun), -1, 1)
  const declination = Math.asin(sineDeclination) / DEG
  const equatorial = sun.clone().addScaledVector(axis, -sineDeclination)
  const uniqueMeridian = equatorial.lengthSq() > 1e-16
  if (!uniqueMeridian) {
    // Outside this lesson's tilt range, a polar Sun makes every meridian equivalent.
    equatorial.set(Math.abs(axis.x) < 0.8 ? 1 : 0, Math.abs(axis.x) < 0.8 ? 0 : 1, 0)
      .addScaledVector(axis, -equatorial.dot(axis))
  }
  equatorial.normalize()
  const sideways = new THREE.Vector3().crossVectors(axis, equatorial).normalize()
  const samples: NoonAltitudeSample[] = noonAltitudeSamples(declination).map(({ latitude, altitude }) => {
    return {
      latitude,
      altitude,
      normal: equatorial.clone().multiplyScalar(Math.cos(latitude * DEG))
        .addScaledVector(axis, Math.sin(latitude * DEG)).normalize(),
    }
  })
  const subsolar: NoonAltitudeSample = { latitude: declination, altitude: 90, normal: sun.clone() }
  return { sun, axis, equatorial, sideways, declination, uniqueMeridian, samples, subsolar }
}

function createSubsolarLabel() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return null
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = '700 46px "Microsoft YaHei", Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.lineWidth = 6
  context.strokeStyle = '#16242deb'
  context.fillStyle = '#ffe4a5'
  context.strokeText('90°', 64, 33)
  context.fillText('90°', 64, 33)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false })
  const sprite = new THREE.Sprite(material)
  sprite.name = 'noon-subsolar-altitude-label'
  sprite.center.set(0.5, -0.35)
  sprite.renderOrder = 25
  sprite.userData.text = '90°'
  return { sprite, texture, material }
}

function createLatitudeLabel(latitude: number, index: number) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  // Keep uploaded texture dimensions fixed as the Sun moves; only update its pixels when text changes.
  canvas.width = 512
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return null
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.name = `noon-latitude-${latitude}-label`
  sprite.renderOrder = 26
  sprite.visible = false
  const positions = new THREE.Float32BufferAttribute(new Float32Array(6), 3)
  const leader = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', positions),
    new THREE.LineBasicMaterial({ color: '#d2deea', transparent: true, opacity: 0.58, depthTest: false, depthWrite: false, toneMapped: false }))
  leader.name = `noon-latitude-${latitude}-leader`
  leader.renderOrder = 25
  leader.frustumCulled = false
  leader.visible = false
  const normal = new THREE.Vector3()
  let previousText = ''
  let contentWidth = 512
  function setAltitude(altitude: number) {
    const location = latitude === 0 ? '0°' : `${Math.abs(latitude)}°${latitude > 0 ? 'N' : 'S'}`
    const text = `${location} · H ${formatDegreesMinutes(altitude)}`
    if (text === previousText) return
    previousText = text
    sprite.userData.text = text
    context!.clearRect(0, 0, canvas.width, canvas.height)
    context!.font = '600 40px "Microsoft YaHei", Arial, sans-serif'
    context!.textAlign = 'left'
    context!.textBaseline = 'middle'
    context!.lineJoin = 'round'
    context!.lineWidth = 7
    context!.strokeStyle = '#101b26f5'
    context!.fillStyle = altitude < 0 ? '#b9d5f3' : '#ffebc2'
    contentWidth = Math.min(512, Math.ceil((context!.measureText?.(text).width ?? text.length * 24) + 22))
    context!.strokeText(text, 10, 33)
    context!.fillText(text, 10, 33)
    texture.repeat.x = contentWidth / canvas.width
    texture.needsUpdate = true
  }
  return { latitude, side: index % 2 ? 1 : -1, normal, sprite, texture, material, leader, positions, setAltitude, get contentWidth() { return contentWidth } }
}

type LabelRect = { left: number; top: number; right: number; bottom: number }
function overlaps(a: LabelRect, b: LabelRect) {
  const gap = 4
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap
}

/**
 * A surface ribbon, 10-degree latitude dots and a distinct subsolar ring.
 * Latitude readings use alternating callouts; the panel retains every value when a small view cannot.
 * Attach to earthScene; all update vectors are world-space, with Sun direction pointing outward.
 */
export function createNoonAltitudeGuide(earthRadius: number) {
  const radius = Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1
  const surfaceRadius = radius * 1.018
  const group = new THREE.Group()
  group.name = 'noon-altitude-guide'
  group.matrixAutoUpdate = false
  group.visible = false

  const dayColor = new THREE.Color('#f5d08a')
  const nightColor = new THREE.Color('#9dbfe8')
  const horizonColor = new THREE.Color('#e5eff1')
  const segments = 180
  const ribbonPositions = new THREE.Float32BufferAttribute(new Float32Array((segments + 1) * 6), 3)
  const ribbonColors = new THREE.Float32BufferAttribute(new Float32Array((segments + 1) * 6), 3)
  const ribbonGeometry = new THREE.BufferGeometry()
    .setAttribute('position', ribbonPositions).setAttribute('color', ribbonColors)
  const indices: number[] = []
  for (let index = 0; index < segments; index++) {
    const vertex = index * 2
    indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2)
  }
  ribbonGeometry.setIndex(indices)
  const ribbonMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    depthTest: true, depthWrite: false, toneMapped: false,
  })
  const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial)
  ribbon.name = 'noon-meridian-ribbon'
  ribbon.renderOrder = 20
  group.add(ribbon)

  const dotGeometry = new THREE.SphereGeometry(radius * 0.011, 12, 8)
  const dotMaterials = [dayColor, nightColor, horizonColor].map(color => new THREE.MeshBasicMaterial({
    color, depthTest: true, depthWrite: false, toneMapped: false,
  }))
  const dots = NOON_ALTITUDE_LATITUDES.map(latitude => {
    const dot = new THREE.Mesh(dotGeometry, dotMaterials[0]!)
    dot.name = `noon-latitude-${latitude}`
    dot.userData.latitude = latitude
    dot.renderOrder = 21
    group.add(dot)
    return dot
  })

  const subsolar = new THREE.Group()
  subsolar.name = 'noon-subsolar-marker'
  const subsolarMaterial = new THREE.MeshBasicMaterial({
    color: '#ffe4a5', side: THREE.DoubleSide, depthTest: true, depthWrite: false, toneMapped: false,
  })
  const ringGeometry = new THREE.RingGeometry(radius * 0.033, radius * 0.043, 48)
  const ring = new THREE.Mesh(ringGeometry, subsolarMaterial)
  ring.name = 'noon-subsolar-ring'
  ring.renderOrder = 23
  const centerGeometry = new THREE.SphereGeometry(radius * 0.015, 16, 10)
  const center = new THREE.Mesh(centerGeometry, subsolarMaterial)
  center.name = 'noon-subsolar-dot'
  center.renderOrder = 24
  subsolar.add(ring, center)
  group.add(subsolar)
  const label = createSubsolarLabel()
  if (label) {
    label.sprite.scale.set(radius * 0.25, radius * 0.125, 1)
    group.add(label.sprite)
  }
  const latitudeLabels = NOON_ALTITUDE_LATITUDES.map(createLatitudeLabel).filter(
    (item): item is NonNullable<ReturnType<typeof createLatitudeLabel>> => item !== null,
  )
  latitudeLabels.forEach(item => group.add(item.sprite, item.leader))

  const worldMatrix = new THREE.Matrix4()
  const inverseParent = new THREE.Matrix4()
  const normal = new THREE.Vector3()
  const edge = new THREE.Vector3()
  const forward = new THREE.Vector3(0, 0, 1)
  const lastSun = new THREE.Vector3()
  const lastCenter = new THREE.Vector3()
  const cameraPosition = new THREE.Vector3()
  const cameraDirection = new THREE.Vector3()
  const labelPosition = new THREE.Vector3()
  const projectedPosition = new THREE.Vector3()
  const projectedCenter = new THREE.Vector3()
  const calloutPosition = new THREE.Vector3()
  const lineEndpoint = new THREE.Vector3()
  let disposed = false

  function update(earthCenter: THREE.Vector3, sunDirection: THREE.Vector3, axisDirection: THREE.Vector3, visible: boolean) {
    if (disposed) return
    if (!visible) { group.visible = false; return }
    const frame = noonAltitudeFrame(sunDirection, axisDirection)
    if (!frame || ![earthCenter.x, earthCenter.y, earthCenter.z].every(Number.isFinite)) {
      group.visible = false
      return
    }
    worldMatrix.makeTranslation(earthCenter.x, earthCenter.y, earthCenter.z)
    if (group.parent) {
      group.parent.updateWorldMatrix(true, false)
      group.matrix.multiplyMatrices(inverseParent.copy(group.parent.matrixWorld).invert(), worldMatrix)
    } else group.matrix.copy(worldMatrix)
    group.matrixWorldNeedsUpdate = true

    // A narrow surface ribbon has consistent geometric width even where WebGL line width is fixed.
    const halfWidth = 0.2 * DEG
    for (let index = 0; index <= segments; index++) {
      const latitude = 90 - index * 180 / segments
      normal.copy(frame.equatorial).multiplyScalar(Math.cos(latitude * DEG))
        .addScaledVector(frame.axis, Math.sin(latitude * DEG))
      const altitude = 90 - Math.abs(latitude - frame.declination)
      const color = altitude < -1e-8 ? nightColor : Math.abs(altitude) <= 1e-8 ? horizonColor : dayColor
      for (const side of [0, 1]) {
        edge.copy(normal).multiplyScalar(Math.cos(halfWidth))
          .addScaledVector(frame.sideways, (side === 0 ? -1 : 1) * Math.sin(halfWidth)).multiplyScalar(surfaceRadius)
        ribbonPositions.setXYZ(index * 2 + side, edge.x, edge.y, edge.z)
        ribbonColors.setXYZ(index * 2 + side, color.r, color.g, color.b)
      }
    }
    ribbonPositions.needsUpdate = true
    ribbonColors.needsUpdate = true
    ribbonGeometry.computeBoundingSphere()
    dots.forEach((dot, index) => {
      const sample = frame.samples[index]!
      dot.position.copy(sample.normal).multiplyScalar(surfaceRadius)
      dot.userData.altitude = sample.altitude
      dot.material = dotMaterials[sample.altitude < -1e-8 ? 1 : Math.abs(sample.altitude) <= 1e-8 ? 2 : 0]!
      // The 90-degree marker replaces a coincident ordinary dot at equinox or a multiple-of-ten declination.
      dot.visible = Math.abs(sample.latitude - frame.declination) > 1e-7
    })
    latitudeLabels.forEach(item => {
      const sample = frame.samples[(item.latitude + 90) / 10]!
      item.normal.copy(sample.normal)
      item.setAltitude(sample.altitude)
    })
    subsolar.position.copy(frame.subsolar.normal).multiplyScalar(radius * 1.025)
    subsolar.quaternion.setFromUnitVectors(forward, frame.subsolar.normal)
    subsolar.userData.latitude = frame.declination
    subsolar.userData.altitude = 90
    if (label) label.sprite.position.copy(frame.sun).multiplyScalar(radius * 1.04)
    lastSun.copy(frame.sun)
    lastCenter.copy(earthCenter)
    group.visible = true
  }

  function updateForCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, viewportHeight: number) {
    if (disposed) return
    latitudeLabels.forEach(item => { item.sprite.visible = false; item.leader.visible = false })
    if (!group.visible || !(viewportHeight > 0)) { if (label) label.sprite.visible = false; return }
    camera.updateWorldMatrix(true, false)
    camera.getWorldPosition(cameraPosition)
    const orthographic = camera instanceof THREE.OrthographicCamera
    if (orthographic) camera.getWorldDirection(cameraDirection).negate()
    else cameraDirection.copy(cameraPosition).sub(lastCenter)
    const facesCamera = (normal: THREE.Vector3) => cameraDirection.dot(normal) > (orthographic ? 0 : radius)
    const onScreen = (point: THREE.Vector3) => point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1
    const pixelsToWorld = (point: THREE.Vector3) => orthographic
      ? (camera.top - camera.bottom) / camera.zoom / viewportHeight
      : -labelPosition.copy(point).applyMatrix4(camera.matrixWorldInverse).z * 2 * Math.tan(camera.fov * DEG / 2) / camera.zoom / viewportHeight
    const aspect = orthographic ? (camera.right - camera.left) / (camera.top - camera.bottom) : camera.aspect
    const viewportWidth = viewportHeight * aspect
    const reserved: LabelRect[] = []
    if (label) {
      label.sprite.getWorldPosition(calloutPosition)
      projectedPosition.copy(calloutPosition).project(camera)
      label.sprite.visible = facesCamera(lastSun) && onScreen(projectedPosition)
      if (label.sprite.visible) {
        const height = pixelsToWorld(calloutPosition) * 26
        label.sprite.scale.set(height * 2, height, 1)
        const x = (projectedPosition.x + 1) * viewportWidth / 2
        const y = (1 - projectedPosition.y) * viewportHeight / 2
        reserved.push({ left: x - 26, right: x + 26, top: y - 26 * 1.35, bottom: y - 26 * 0.35 })
      }
    }
    // A 40px canvas font rendered on a 22.4px-high sprite reads as 14px text.
    const labelHeight = 22.4
    const edgePadding = 8
    const rowGap = labelHeight + 5
    projectedCenter.copy(lastCenter)
    const globePixelRadius = radius / Math.max(1e-8, pixelsToWorld(projectedCenter))
    const maximumShift = Math.max(54, Math.min(150, globePixelRadius * 0.9))
    const candidates = latitudeLabels.flatMap(item => {
      if (!facesCamera(item.normal)) return []
      calloutPosition.copy(lastCenter).addScaledVector(item.normal, radius * 1.04)
      projectedPosition.copy(calloutPosition).project(camera)
      if (!onScreen(projectedPosition)) return []
      const width = item.contentWidth / 64 * labelHeight
      if (width > viewportWidth - edgePadding * 2) return []
      const x = (projectedPosition.x + 1) * viewportWidth / 2
      const y = (1 - projectedPosition.y) * viewportHeight / 2
      const left = THREE.MathUtils.clamp(item.side > 0 ? x + 15 : x - width - 15, edgePadding, viewportWidth - edgePadding - width)
      return [{ item, width, left, x, y, centerY: y, z: projectedPosition.z, worldPerPixel: pixelsToWorld(calloutPosition) }]
    })
    // Spread each alternating column before the final collision check, preserving point-to-label leaders.
    for (const side of [-1, 1]) {
      const column = candidates.filter(candidate => candidate.item.side === side).sort((a, b) => a.y - b.y)
      let previousY = edgePadding - labelHeight / 2 - 5
      for (const candidate of column) {
        candidate.centerY = Math.max(candidate.y, previousY + rowGap)
        previousY = candidate.centerY
      }
      let nextY = viewportHeight - edgePadding + labelHeight / 2 + 5
      for (const candidate of [...column].reverse()) {
        candidate.centerY = Math.min(candidate.centerY, nextY - rowGap)
        nextY = candidate.centerY
      }
    }
    candidates.sort((a, b) => a.y - b.y)
    for (const candidate of candidates) {
      const { item, width, left, x, y, z, worldPerPixel } = candidate
      let rect: LabelRect | undefined
      for (const offset of [0, -rowGap, rowGap, -2 * rowGap, 2 * rowGap, -3 * rowGap, 3 * rowGap]) {
        const centerY = candidate.centerY + offset
        const proposed = { left, right: left + width, top: centerY - labelHeight / 2, bottom: centerY + labelHeight / 2 }
        if (proposed.top < edgePadding || proposed.bottom > viewportHeight - edgePadding || Math.abs(centerY - y) > maximumShift) continue
        if (!reserved.some(previous => overlaps(proposed, previous))) { rect = proposed; break }
      }
      if (!rect) continue
      reserved.push(rect)
      const centerX = (rect.left + rect.right) / 2
      const centerY = (rect.top + rect.bottom) / 2
      calloutPosition.set(centerX / viewportWidth * 2 - 1, 1 - centerY / viewportHeight * 2, z).unproject(camera).sub(lastCenter)
      item.sprite.position.copy(calloutPosition)
      item.sprite.scale.set(worldPerPixel * width, worldPerPixel * labelHeight, 1)
      item.sprite.visible = true
      const endX = x < centerX ? rect.left - 3 : rect.right + 3
      lineEndpoint.set(endX / viewportWidth * 2 - 1, 1 - centerY / viewportHeight * 2, z).unproject(camera).sub(lastCenter)
      item.positions.setXYZ(0, item.normal.x * surfaceRadius, item.normal.y * surfaceRadius, item.normal.z * surfaceRadius)
      item.positions.setXYZ(1, lineEndpoint.x, lineEndpoint.y, lineEndpoint.z)
      item.positions.needsUpdate = true
      item.leader.visible = true
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    ribbonGeometry.dispose()
    ribbonMaterial.dispose()
    dotGeometry.dispose()
    dotMaterials.forEach(material => material.dispose())
    ringGeometry.dispose()
    centerGeometry.dispose()
    subsolarMaterial.dispose()
    label?.texture.dispose()
    label?.material.dispose()
    latitudeLabels.forEach(item => {
      item.texture.dispose()
      item.material.dispose()
      item.leader.geometry.dispose()
      item.leader.material.dispose()
    })
    group.removeFromParent()
    group.visible = false
  }

  return { group, update, updateForCamera, dispose }
}
