import * as THREE from 'three'

/** 地表和外大气共用世界坐标下的太阳方向，兼容主视角与正交副机位。 */
export function createEarthAppearance(dayTexture: THREE.Texture, nightTexture: THREE.Texture, radius: number) {
  const sunDir = { value: new THREE.Vector3(-1, 0, 0) }
  const atmosphereDayColor = { value: new THREE.Color('#62c7f5') }
  const atmosphereTwilightColor = { value: new THREE.Color('#d87748') }

  const worldVertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      // normalMatrix handles scaled objects; transform its view-space result back to world space.
      vWorldNormal = normalize((vec4(normalMatrix * normal, 0.0) * viewMatrix).xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `

  const material = new THREE.ShaderMaterial({
    name: 'Earth surface with ocean glint and atmosphere',
    uniforms: {
      map: { value: dayTexture },
      nightMap: { value: nightTexture },
      lightIntensity: { value: 1.25 },
      nightBrightness: { value: 1 },
      cityLightStrength: { value: 2.45 },
      sunDir,
      nightTint: { value: new THREE.Color(0x08204a) },
      atmosphereDayColor,
      atmosphereTwilightColor,
    },
    toneMapped: true,
    vertexShader: worldVertexShader,
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D nightMap;
      uniform float lightIntensity;
      uniform float nightBrightness;
      uniform float cityLightStrength;
      uniform vec3 sunDir;
      uniform vec3 nightTint;
      uniform vec3 atmosphereDayColor;
      uniform vec3 atmosphereTwilightColor;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      float earthDayMask(float lightAmount) {
        // The Sun's centre is on the horizon at dot = 0; soften only the raster edge.
        float edgeWidth = max(fwidth(lightAmount) * 0.75, 0.00001);
        return smoothstep(-edgeWidth, edgeWidth, lightAmount);
      }

      void main() {
        vec3 normalDirection = normalize(vWorldNormal);
        vec3 sunDirection = normalize(sunDir);
        vec3 viewDirection = isOrthographic
          ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))
          : normalize(cameraPosition - vWorldPosition);
        vec3 dayColor = pow(max(texture2D(map, vUv).rgb, vec3(0.0)), vec3(1.08));
        vec3 nightLights = max(texture2D(nightMap, vUv).rgb, vec3(0.0));
        float lightAmount = dot(normalDirection, sunDirection);
        float dayMask = earthDayMask(lightAmount);
        float directLight = max(lightAmount, 0.0);

        // 蓝色占比估算海洋，避免陆地、冰雪和云层出现水面的镜面高光。
        float surfaceLuma = dot(dayColor, vec3(0.2126, 0.7152, 0.0722));
        float blueDominance = dayColor.b - max(dayColor.r, dayColor.g);
        float oceanMask = smoothstep(-0.025, 0.115, blueDominance)
          * (1.0 - smoothstep(0.48, 0.82, surfaceLuma));
        float cloudMask = smoothstep(0.64, 0.94, surfaceLuma)
          * (1.0 - oceanMask * 0.72);
        vec3 litDay = dayColor * (0.18 + lightIntensity * 0.58 * directLight);
        litDay *= mix(1.0, 1.02, cloudMask);
        litDay *= mix(vec3(1.0), vec3(0.78, 0.89, 1.0), oceanMask * 0.40);

        vec3 halfDirection = normalize(sunDirection + viewDirection + normalDirection * 0.00001);
        float specularPower = mix(28.0, 105.0, oceanMask);
        float specular = pow(max(dot(normalDirection, halfDirection), 0.0), specularPower)
          * oceanMask * directLight * dayMask;
        vec3 oceanGlint = mix(vec3(0.40, 0.64, 0.82), vec3(1.0), specular)
          * specular * (0.34 + lightIntensity * 0.16);

        float rimFill = 0.48 + 0.52 * pow(1.0 - abs(lightAmount), 0.72);
        vec3 darkSurface = dayColor * nightBrightness * 0.075 * rimFill
          + nightTint * nightBrightness * 0.12;
        // 柔和压缩灯光亮部，保留亮度控件，同时避免默认值将城市烧成白斑。
        vec3 cityEmission = vec3(1.0) - exp(-nightLights
          * vec3(1.12, 1.0, 0.82) * max(cityLightStrength, 0.0));
        vec3 color = mix(darkSurface + cityEmission, litDay + oceanGlint, dayMask);

        float atmosphereFresnel = 1.0 - abs(dot(normalDirection, viewDirection));
        float atmosphereDayStrength = smoothstep(-0.5, 1.0, lightAmount);
        vec3 innerAtmosphereColor = mix(atmosphereTwilightColor, atmosphereDayColor,
          smoothstep(-0.25, 0.75, lightAmount));
        float innerAtmosphereMix = clamp(atmosphereDayStrength
          * pow(atmosphereFresnel, 2.0) * 0.42, 0.0, 0.42);
        color = mix(color, innerAtmosphereColor, innerAtmosphereMix);

        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const atmosphereMaterial = new THREE.ShaderMaterial({
    name: 'Earth outer atmosphere',
    uniforms: { sunDir, atmosphereDayColor, atmosphereTwilightColor },
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    toneMapped: true,
    vertexShader: worldVertexShader,
    fragmentShader: `
      uniform vec3 sunDir;
      uniform vec3 atmosphereDayColor;
      uniform vec3 atmosphereTwilightColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 normalDirection = normalize(vWorldNormal);
        vec3 viewDirection = isOrthographic
          ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))
          : normalize(cameraPosition - vWorldPosition);
        float fresnel = 1.0 - abs(dot(normalDirection, viewDirection));
        float sunOrientation = dot(normalDirection, normalize(sunDir));
        float daylight = smoothstep(-0.5, 1.0, sunOrientation);
        float atmosphereMix = smoothstep(-0.25, 0.75, sunOrientation);
        // 背面球壳只露出地表外侧的一圈；外缘透明，内缘逐渐加深。
        float innerEdge = 1.0 - smoothstep(0.67, 1.0, fresnel);
        float alpha = pow(innerEdge, 2.65) * daylight * 0.94;
        if (alpha < 0.004) discard;
        vec3 glowColor = mix(atmosphereTwilightColor, atmosphereDayColor, atmosphereMix);
        gl_FragColor = vec4(glowColor, min(alpha, 0.94));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.055, 96, 64), atmosphereMaterial)
  atmosphere.name = 'earth-atmosphere'
  atmosphere.renderOrder = 2

  return { material, atmosphere }
}
