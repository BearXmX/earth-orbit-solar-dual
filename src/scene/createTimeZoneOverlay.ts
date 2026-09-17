import * as THREE from 'three'
import timeZoneTextureUrl from '../assets/image/time-zone-ranges.svg?inline'

type DateLinePoint = readonly [latitude: number, longitude: number]

/** Local earth-rotation reference: modern teaching-map approximation, not an administrative boundary dataset. */
export const DATE_LINE_SECTIONS: readonly { name: string; dashed: boolean; path: readonly DateLinePoint[] }[] = [
  {
    name: 'north-pacific', dashed: false,
    path: [[90, 180], [75, 180], [68, -168.972], [65.5, -168.972], [53, 170], [48, 180], [-2.509444, 180]],
  },
  {
    name: 'kiribati-samoa', dashed: true,
    path: [
      [-2.509444, 180], [-2.509444, -158.486667], [-0.228056, -158.486667],
      [1.498056, -160.639722], [4.937222, -160.639722], [4.937222, -155.528611],
      [-9.909167, -150.000278], [-11.645278, -150.000278], [-11.645278, -154.566111],
      [-5.842222, -156.080556], [-5.842222, -169.396111], [-9.428333, -170.992778],
      [-11.057222, -171.293889], [-13.968056, -171.003333], [-14.431111, -171.236667], [-15, -172.5],
    ],
  },
  {
    name: 'south-pacific', dashed: false,
    path: [[-15, -172.5], [-45, -172.5], [-51, 180], [-90, 180]],
  },
]

function geographicPoint(latitude: number, longitude: number, radius: number) {
  const phi = latitude * Math.PI / 180
  const lambda = longitude * Math.PI / 180
  return new THREE.Vector3(radius * Math.cos(phi) * Math.cos(lambda), radius * Math.sin(phi), -radius * Math.cos(phi) * Math.sin(lambda))
}

/** Sample short longitude intervals so crossings of ±180° stay in the Pacific. */
export function sampleDateLinePath(path: readonly DateLinePoint[], radius: number) {
  const points: THREE.Vector3[] = []
  for (let index = 0; index < path.length - 1; index++) {
    const [latitude, longitude] = path[index]!
    const [nextLatitude, nextLongitude] = path[index + 1]!
    const longitudeDelta = THREE.MathUtils.euclideanModulo(nextLongitude - longitude + 180, 360) - 180
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nextLatitude - latitude), Math.abs(longitudeDelta)) / 0.75))
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps
      points.push(geographicPoint(latitude + (nextLatitude - latitude) * fraction, longitude + longitudeDelta * fraction, radius))
    }
  }
  const last = path[path.length - 1]
  if (last) points.push(geographicPoint(last[0], last[1], radius))
  return points
}

/** Attach directly to spinGroup. The texture and date line share Earth's geographic registration. */
export function createTimeZoneOverlay(earthRadius: number, manager?: THREE.LoadingManager) {
  const radius = Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1
  const group = new THREE.Group()
  group.name = 'earth-time-zone-overlay'
  const zones = new THREE.Group()
  zones.name = 'theoretical-time-zones'
  zones.userData.description = '24个15°理论时区，不等同现行行政时区'
  const dateLine = new THREE.Group()
  dateLine.name = 'international-date-line'
  dateLine.userData.description = '国际日界线：参考课件采用的现代教学制图近似'
  group.add(zones, dateLine)
  let disposed = false

  const texture = new THREE.TextureLoader(manager).load(timeZoneTextureUrl, loaded => {
    if (disposed) loaded.dispose()
  })
  texture.name = 'Offline theoretical 15-degree time zones'
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 4
  const zoneSurface = new THREE.Mesh(
    // Default SphereGeometry UV: u=.5 is Greenwich (+X), u=.75 is 90°E (-Z).
    new THREE.SphereGeometry(radius * 1.009, 144, 96),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.96,
      depthTest: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false }),
  )
  zoneSurface.name = 'theoretical-time-zone-surface'
  zoneSurface.renderOrder = 13
  zones.add(zoneSurface)

  for (const section of DATE_LINE_SECTIONS) {
    const material = section.dashed
      ? new THREE.LineDashedMaterial({ color: 0xff9b87, dashSize: radius * 0.035, gapSize: radius * 0.020,
        transparent: true, opacity: 1, depthTest: true, depthWrite: false, toneMapped: false })
      : new THREE.LineBasicMaterial({ color: 0xff7972, transparent: true, opacity: 0.98,
        depthTest: true, depthWrite: false, toneMapped: false })
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(sampleDateLinePath(section.path, radius * 1.011)), material)
    line.name = `date-line-${section.name}`
    line.renderOrder = 16
    if (section.dashed) line.computeLineDistances()
    dateLine.add(line)
  }

  function update(visibility: { timeZones: boolean; dateLine: boolean }) {
    if (disposed) return
    zones.visible = visibility.timeZones
    dateLine.visible = visibility.dateLine
    group.visible = visibility.timeZones || visibility.dateLine
  }

  function dispose() {
    if (disposed) return
    disposed = true
    group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose()
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose())
      }
    })
    texture.dispose()
    group.visible = false
    group.removeFromParent()
  }

  update({ timeZones: false, dateLine: false })
  return { group, update, dispose }
}
