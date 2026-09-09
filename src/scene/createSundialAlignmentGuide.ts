import * as THREE from 'three'
import { sundialEdgeLight } from '../utils/sundial'

/** 两个平行面的教学示意；仅橙色箭头表示光线，不改变实际太阳位置或阴影计算。 */
export function createSundialAlignmentGuide(skyRadius: number, dialRadius: number) {
  const group = new THREE.Group()
  group.name = 'sundial-alignment-guide'

  const pathPlane = new THREE.Mesh(
    new THREE.CircleGeometry(skyRadius, 128, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x8b6aca, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  )
  pathPlane.name = 'equinox-path-plane'
  group.add(pathPlane)

  const dialPlane = new THREE.Group()
  dialPlane.name = 'dial-plane-extension'
  const outerRadius = dialRadius + 0.55
  dialPlane.add(new THREE.Mesh(
    new THREE.RingGeometry(dialRadius + 0.04, outerRadius, 96),
    new THREE.MeshBasicMaterial({ color: 0x8b6aca, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }),
  ))
  const circle = Array.from({ length: 129 }, (_, index) => {
    const angle = index * Math.PI * 2 / 128
    return new THREE.Vector3(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, 0)
  })
  dialPlane.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(circle),
    new THREE.LineDashedMaterial({ color: 0x65439e, dashSize: 0.13, gapSize: 0.09, transparent: true, opacity: 0.9 }),
  ).computeLineDistances())
  group.add(dialPlane)

  const edgeLight = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 2, 0xffa321, 0.18, 0.1)
  edgeLight.name = 'equinox-edge-light'
  const edgeSpot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc34d }))
  edgeSpot.name = 'sunlit-dial-edge'
  group.add(edgeLight, edgeSpot)

  function update(latitude: number, center: THREE.Vector3, altitude: number, azimuth: number) {
    pathPlane.rotation.x = -latitude * Math.PI / 180
    dialPlane.rotation.copy(pathPlane.rotation)
    dialPlane.position.copy(center)
    const ray = sundialEdgeLight(latitude, altitude, azimuth, center, dialRadius)
    edgeLight.visible = edgeSpot.visible = ray !== null
    if (ray) {
      edgeLight.position.copy(ray.start)
      edgeLight.setDirection(ray.direction)
      edgeSpot.position.copy(ray.edge)
    }
  }

  function dispose() {
    group.traverse(object => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose())
      else mesh.material?.dispose()
    })
    group.removeFromParent()
  }

  return { group, update, dispose }
}
