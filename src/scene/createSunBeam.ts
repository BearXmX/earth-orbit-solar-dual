import * as THREE from 'three'

/** Parallel sunlight fills Earth's projected disc and wraps its illuminated hemisphere. */
export function createSunBeam(sunRadius: number, earthRadius: number) {
  const group = new THREE.Group()
  group.name = 'sun-earth-directional-beam'
  group.visible = false
  const sunBoundary = Math.max(0, sunRadius) * 1.045
  const radius = Math.max(0, earthRadius)
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 64, 16, true)
  const hemisphereGeometry = new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2)
  const volume = new THREE.Group()
  volume.name = 'sun-beam-disc-volume'
  group.add(volume)
  const hemispheres: THREE.Mesh[] = []
  const materials: THREE.ShaderMaterial[] = []
  const sharedUniforms = {
    uStrength: { value: 1 },
    uEarthCenter: { value: new THREE.Vector3() },
    uSunDirection: { value: new THREE.Vector3(-1, 0, 0) },
    uEarthRadius: { value: radius },
  }
  const direction = new THREE.Vector3()
  const localAxis = new THREE.Vector3(0, 1, 0)
  let disposed = false

  // A full-width parallel bundle, not a narrowing spotlight aimed only at the subsolar point.
  for (const layer of [{ width: 1.075, opacity: 0.060 }, { width: 1.035, opacity: 0.052 }, { width: 0.98, opacity: 0.042 }]) {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...sharedUniforms, uOpacity: { value: layer.opacity } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: `
        varying float vProgress;
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        void main() {
          vProgress = uv.y;
          vViewNormal = normalize(normalMatrix * normal);
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform float uStrength;
        uniform float uOpacity;
        uniform vec3 uEarthCenter;
        uniform vec3 uSunDirection;
        uniform float uEarthRadius;
        varying float vProgress;
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        float beamAirMask(vec3 relative, vec3 sunlight, float radius) {
          return step(radius * 1.002, length(relative)) * step(0.0, dot(relative, sunlight));
        }
        void main() {
          if (beamAirMask(vWorldPosition - uEarthCenter, uSunDirection, uEarthRadius) < 0.5) discard;
          vec3 viewDirection = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-vViewPosition);
          float softSides = pow(abs(dot(normalize(vViewNormal), viewDirection)), 0.7);
          float startFade = smoothstep(0.0, 0.10, vProgress);
          float endFade = 1.0 - smoothstep(0.985, 1.0, vProgress);
          float alpha = uOpacity * uStrength * softSides * startFade * endFade;
          if (alpha < 0.001) discard;
          vec3 color = mix(vec3(1.0, 0.62, 0.24), vec3(1.0, 0.90, 0.64), vProgress);
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'sun-beam-soft-volume'
    mesh.scale.set(layer.width, 1, layer.width)
    mesh.renderOrder = 1
    volume.add(mesh)
    materials.push(material)
  }

  // Geometric hemispheres prevent any night-side shell, even at grazing viewing angles.
  // The inner layer washes the whole daylight face; the outer layer softens its rim.
  for (const layer of [{ scale: 1.014, opacity: 0.13, rim: 0.08 }, { scale: 1.038, opacity: 0.035, rim: 0.12 }]) {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...sharedUniforms, uOpacity: { value: layer.opacity }, uRim: { value: layer.rim } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
      toneMapped: false,
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize((vec4(normalMatrix * normal, 0.0) * viewMatrix).xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDirection;
        uniform float uStrength;
        uniform float uOpacity;
        uniform float uRim;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        float shellDayMask(vec3 surfaceNormal, vec3 sunlight) {
          return smoothstep(0.0, 0.07, dot(surfaceNormal, sunlight));
        }
        void main() {
          vec3 normalDirection = normalize(vWorldNormal);
          float dayMask = shellDayMask(normalDirection, uSunDirection);
          if (dayMask <= 0.0) discard;
          vec3 viewDirection = isOrthographic
            ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))
            : normalize(cameraPosition - vWorldPosition);
          float rim = pow(1.0 - abs(dot(normalDirection, viewDirection)), 1.7);
          float alpha = dayMask * (uOpacity + rim * uRim) * uStrength;
          vec3 color = mix(vec3(1.0, 0.70, 0.34), vec3(1.0, 0.91, 0.69), max(dot(normalDirection, uSunDirection), 0.0));
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
    })
    const hemisphere = new THREE.Mesh(hemisphereGeometry, material)
    hemisphere.name = 'sun-beam-day-hemisphere'
    hemisphere.scale.setScalar(radius * layer.scale)
    hemisphere.renderOrder = 3
    group.add(hemisphere)
    hemispheres.push(hemisphere)
    materials.push(material)
  }

  function update(earthCenter: THREE.Vector3, visible: boolean, strength: number) {
    if (disposed) return
    const distance = earthCenter.length()
    const length = distance - sunBoundary
    const intensity = Number.isFinite(strength) ? THREE.MathUtils.clamp(strength, 0, 2) : 0
    group.visible = visible && intensity > 0 && radius > 0 && Number.isFinite(length) && length > radius
    sharedUniforms.uStrength.value = intensity
    if (!group.visible) return

    direction.copy(earthCenter).divideScalar(distance)
    sharedUniforms.uEarthCenter.value.copy(earthCenter)
    sharedUniforms.uSunDirection.value.copy(direction).negate()
    // End at the terminator plane; the shader excludes Earth itself and all night-side air.
    volume.position.copy(direction).multiplyScalar(sunBoundary + length / 2)
    volume.quaternion.setFromUnitVectors(localAxis, direction)
    volume.scale.set(radius, length, radius)
    for (const hemisphere of hemispheres) {
      hemisphere.position.copy(earthCenter)
      hemisphere.quaternion.setFromUnitVectors(localAxis, sharedUniforms.uSunDirection.value)
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    group.visible = false
    group.removeFromParent()
    geometry.dispose()
    hemisphereGeometry.dispose()
    materials.forEach(material => material.dispose())
  }

  return { group, update, dispose }
}
