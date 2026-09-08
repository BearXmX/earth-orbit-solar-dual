import { Vector3 } from 'three'

/** 从正北方向南观察，正面展示北半球日晷的朝北刻度面。 */
export function southFacingSolarCameraPosition(mode = 'normal') {
  if (mode === 'veryCompact') return new Vector3(0, 10, 18)
  if (mode === 'compact') return new Vector3(0, 9.5, 17)
  return new Vector3(0, 9, 17)
}

export function southFacingSolarCameraTarget(mode = 'normal') {
  return new Vector3(0, mode === 'veryCompact' ? 2 : mode === 'compact' ? 1.8 : 1.5, 0)
}
