import * as THREE from 'three'

function normalized(input: THREE.Vector3) {
  return [input.x, input.y, input.z].every(Number.isFinite) && input.lengthSq() > 1e-20
    ? input.clone().normalize() : null
}

/** Geographic eastward rotation decides dawn/dusk, independently of playback switches. */
export function terminatorFrame(sunDirection: THREE.Vector3, axisDirection: THREE.Vector3) {
  const sun = normalized(sunDirection)
  const axis = normalized(axisDirection)
  if (!sun || !axis) return null
  const duskCenter = new THREE.Vector3().crossVectors(axis, sun)
  const crossingStrength = duskCenter.length()
  if (crossingStrength > 1e-8) duskCenter.divideScalar(crossingStrength)
  else {
    duskCenter.set(Math.abs(sun.y) < 0.9 ? 0 : 1, Math.abs(sun.y) < 0.9 ? 1 : 0, 0).cross(sun).normalize()
  }
  return {
    sun, axis, crossingStrength,
    duskCenter,
    dawnCenter: duskCenter.clone().negate(),
    junction: new THREE.Vector3().crossVectors(sun, duskCenter).normalize(),
  }
}

/** All update arguments are world-space; sunDirection points from Earth toward the Sun. */
export function createTerminator(earthRadius: number) {
  const radius = Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1
  const group = new THREE.Group()
  group.name = 'earth-terminator'
  group.matrixAutoUpdate = false
  group.visible = false
  const uniforms = {
    earthCenter: { value: new THREE.Vector3() },
    sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    axisDirection: { value: new THREE.Vector3(0, 1, 0) },
    crossingStrength: { value: 1 },
    dawnColor: { value: new THREE.Color('#91dff4') },
    duskColor: { value: new THREE.Color('#ffc36b') },
    stationaryColor: { value: new THREE.Color('#c6dbe1') },
  }
  const material = new THREE.ShaderMaterial({
    name: 'Surface dawn and dusk with subtle halo',
    uniforms,
    vertexShader: `
      uniform vec3 earthCenter;
      varying vec3 vRelativePosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vRelativePosition = worldPosition.xyz - earthCenter;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform vec3 axisDirection;
      uniform float crossingStrength;
      uniform vec3 dawnColor;
      uniform vec3 duskColor;
      uniform vec3 stationaryColor;
      varying vec3 vRelativePosition;
      void main() {
        vec3 normal = normalize(vRelativePosition);
        float sunlight = dot(normal, sunDirection);
        float distanceToBoundary = abs(sunlight);
        // A fine core remains legible in overview and does not balloon on close-up.
        float pixelWidth = max(fwidth(sunlight), 0.0002);
        float innerWidth = max(pixelWidth * 0.40, 0.00055);
        float outerWidth = max(pixelWidth * 1.25, 0.0014);
        float core = 1.0 - smoothstep(innerWidth, outerWidth, distanceToBoundary);
        float halo = (1.0 - smoothstep(outerWidth, pixelWidth * 4.6 + 0.0028, distanceToBoundary)) * 0.22;
        float alpha = core * 0.96 + (1.0 - core) * halo;
        if (alpha < 0.008) discard;

        // d(n·s)/dt = (axis × n)·s: positive enters daylight, negative enters night.
        float dawnSignal = dot(cross(axisDirection, normal), sunDirection);
        float normalizedSignal = dawnSignal / max(crossingStrength, 0.000001);
        vec3 boundaryColor = mix(duskColor, dawnColor, smoothstep(-0.035, 0.035, normalizedSignal));
        // When the spin axis points at the Sun, rotation does not cross this boundary.
        float hasCrossing = smoothstep(0.000001, 0.00001, crossingStrength);
        boundaryColor = mix(stationaryColor, boundaryColor, hasCrossing);
        gl_FragColor = vec4(boundaryColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  })
  // The shell is close enough to read as a surface boundary while avoiding z-fighting.
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.005, 128, 64), material)
  surface.name = 'earth-terminator-surface'
  surface.renderOrder = 15
  group.add(surface)
  const worldMatrix = new THREE.Matrix4()
  const inverseParent = new THREE.Matrix4()
  let disposed = false

  function update(earthCenter: THREE.Vector3, sunDirection: THREE.Vector3, axisDirection: THREE.Vector3, visible: boolean) {
    if (disposed) return
    const frame = terminatorFrame(sunDirection, axisDirection)
    if (!frame || ![earthCenter.x, earthCenter.y, earthCenter.z].every(Number.isFinite)) {
      group.visible = false
      return
    }
    uniforms.earthCenter.value.copy(earthCenter)
    uniforms.sunDirection.value.copy(frame.sun)
    uniforms.axisDirection.value.copy(frame.axis)
    uniforms.crossingStrength.value = frame.crossingStrength
    worldMatrix.makeTranslation(earthCenter.x, earthCenter.y, earthCenter.z)
    if (group.parent) {
      group.parent.updateWorldMatrix(true, false)
      group.matrix.multiplyMatrices(inverseParent.copy(group.parent.matrixWorld).invert(), worldMatrix)
    } else group.matrix.copy(worldMatrix)
    group.matrixWorldNeedsUpdate = true
    group.visible = visible
  }

  function dispose() {
    if (disposed) return
    disposed = true
    surface.geometry.dispose()
    material.dispose()
    group.removeFromParent()
    group.visible = false
  }

  return { group, update, dispose }
}
