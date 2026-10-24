import * as THREE from "three";
import { getGraphicsPreset } from "./graphics-config.js";

const mix = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;
const fract = (n) => n - Math.floor(n);
const random = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
const DAY_TOP = new THREE.Color("#477fae");
const DAY_HORIZON = new THREE.Color("#bbd2d3");
const NIGHT_TOP = new THREE.Color("#071223");
const NIGHT_HORIZON = new THREE.Color("#24354e");
const DAWN = new THREE.Color("#eaa67c");
const RAIN_TOP = new THREE.Color("#536c7d");
const RAIN_HORIZON = new THREE.Color("#91a6ad");
const CAVE_FOG = new THREE.Color("#101a20");
const WATER_FOG = new THREE.Color("#146572");
const MOON_COLOR = new THREE.Color("#b0cbe3");

// One sky draw call. A ray intersects two cloud strata in world space; the
// optical-depth and directional density samples give thickness without a
// full-screen volumetric ray march. No textures, downloads or frame history.
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 top,horizon,bottom,sunDir,sunTint,origin;
uniform float time,daylight,twilight,wetness,cloudQuality;
varying vec3 vDirection;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y);}
float fbm(vec2 p){float n=0.;n+=noise(p)*.5333;p=mat2(1.6,-1.2,1.2,1.6)*p+3.7;n+=noise(p)*.2667;p=mat2(1.6,-1.2,1.2,1.6)*p+3.7;n+=noise(p)*.1333;if(cloudQuality>1.5)n+=noise(p*2.03)*.0667;return n;}
float starField(vec3 d){
 vec2 p=vec2(atan(d.z,d.x)*.15915494+.5,asin(clamp(d.y,-1.,1.))*.31830989+.5)*vec2(1000.,500.);
 vec2 cell=floor(p),local=fract(p)-.5;float h=hash21(cell);
 float radius=mix(.08,.19,hash21(cell+9.));float aa=max(fwidth(p.x),fwidth(p.y));
 return (1.-smoothstep(radius,radius+aa*.55,length(local)))*step(.995,h)*mix(.3,1.3,hash21(cell+4.));
}
void main(){
 vec3 d=normalize(vDirection);float altitude=max(d.y,0.);float mu=dot(d,sunDir);
 vec3 col=mix(horizon,top,pow(altitude,.45));
 // Rayleigh-like blue overhead and a sun-facing Mie/amber horizon.
 float facing=pow(clamp(dot(normalize(d.xz+vec2(.0001)),normalize(sunDir.xz+vec2(.0001)))*.5+.5,0.,1.),4.);
 float belt=exp(-abs(d.y-.015)*7.5)*twilight;
 col=mix(col,vec3(.94,.31,.12),belt*facing*.48);
 col+=sunTint*pow(max(mu,0.),24.)*(.065+.12*twilight)*daylight;
 col+=sunTint*pow(max(mu,0.),180.)*.12*daylight;
 float disk=smoothstep(.99986,.99993,mu)*smoothstep(-.055,.01,sunDir.y);
 col+=sunTint*disk*9.;
 // The moon has a cool aureole, a softly shaded cratered disk and no polygon rim.
 float lunar=dot(d,-sunDir);float moonDisk=smoothstep(.99977,.99982,lunar);
 float crater=.78+.22*noise(d.xz*1600.);
 col+=vec3(.53,.68,.88)*moonDisk*crater*(1.-daylight)*1.65;
 col+=vec3(.07,.10,.18)*pow(max(lunar,0.),90.)*(1.-daylight);
 float stars=starField(d)*smoothstep(.03,.18,d.y)*(1.-smoothstep(-.22,-.02,sunDir.y));
 col+=mix(vec3(.56,.72,1.),vec3(1.,.88,.65),noise(d.xz*900.))*stars*.65;
 if(d.y>.015){
  float planeDistance=(170.-origin.y)/max(d.y,.025);
  vec2 p=(origin.xz+d.xz*planeDistance)*.009+vec2(time*.009,time*.0035);
  float density=fbm(p);
  float threshold=mix(.50,.34,wetness);
  float cloud=smoothstep(threshold,threshold+.22,density);
  float sunSample=fbm(p+sunDir.xz*.32);
  float light=clamp(.57+(density-sunSample)*3.2,0.,1.);
  vec3 cloudShade=mix(vec3(.029,.044,.071),horizon*.58+top*.13,daylight);
  vec3 cloudLit=mix(vec3(.10,.15,.22),vec3(.80,.85,.82),daylight);
  cloudLit=mix(cloudLit,sunTint*.98,twilight*.74);
  vec3 cloudCol=mix(cloudShade,cloudLit,light);
  // Warm forward silver lining follows the thin edges of the cloud field.
  cloudCol+=sunTint*pow(max(mu,0.),8.)*pow(1.-cloud,3.)*.42*daylight*(1.-wetness*.7);
  cloudCol*=1.-wetness*.36;
  float fade=smoothstep(.015,.10,d.y);
  col=mix(col,cloudCol,cloud*fade*.94);
  if(cloudQuality>1.5){
   vec2 q=(origin.xz+d.xz*(235.-origin.y)/max(d.y,.025))*.0025+vec2(time*.004,0.);
   float veil=smoothstep(.57,.80,noise(q*vec2(1.,3.))+noise(q*vec2(2.,6.))*.23)*.20;
   col=mix(col,mix(horizon*.8,cloudLit,.65),veil*fade*(1.-cloud));
  }
 }
 col=mix(col,bottom,(1.-smoothstep(-.30,.0,d.y)));
 gl_FragColor=vec4(max(col,vec3(0.)),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export class Atmosphere {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.rainAmount = 0;
    this.wetness = 0;
    this.weatherOverride = null;
    this.elapsed = 0;
    this.cave = 0;
    this.shadowKey = "";
    this._sunDir = new THREE.Vector3();
    this._keyDir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._anchor = new THREE.Vector3();
    this._color = new THREE.Color();
    this.shared = {
      sunDirection: new THREE.Vector3(),
      sunColor: new THREE.Color(),
      moonDirection: new THREE.Vector3(),
      moonColor: MOON_COLOR.clone(),
      skyTop: DAY_TOP.clone(),
      skyHorizon: DAY_HORIZON.clone(),
      daylight: 1,
      wetness: 0,
      cave: 0,
      elapsed: 0,
      underwater: false,
    };
    scene.userData.atmosphere = this.shared;
    scene.fog = new THREE.FogExp2(DAY_HORIZON, 0.006);
    this.hemi = new THREE.HemisphereLight(0xbdd8f0, 0x746a46, 0.8);
    this.sunLight = new THREE.DirectionalLight(0xffe4be, 3.1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.00015;
    this.sunLight.shadow.normalBias = 0.035;
    this.sunLight.shadow.radius = 2;
    Object.assign(this.sunLight.shadow.camera, {
      left: -50,
      right: 50,
      top: 50,
      bottom: -50,
      near: 1,
      far: 260,
    });
    this.fill = new THREE.DirectionalLight(0x8aadc6, 0.16);
    this.fill.position.set(-45, 35, 50);
    scene.add(this.hemi, this.sunLight, this.sunLight.target, this.fill);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: this.shared.skyTop },
        horizon: { value: this.shared.skyHorizon },
        bottom: { value: DAY_HORIZON.clone() },
        sunDir: { value: this.shared.sunDirection },
        sunTint: { value: this.shared.sunColor },
        origin: { value: new THREE.Vector3() },
        time: { value: 0 },
        daylight: { value: 1 },
        twilight: { value: 0 },
        wetness: { value: 0 },
        cloudQuality: { value: 2 },
      },
      vertexShader: `varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: SKY_FRAGMENT,
    });
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 16),
      skyMaterial,
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    // Bounded, camera-local streaks: motion is coherent and the entire weather
    // layer is suppressed indoors or underwater rather than raining in caves.
    const rainPositions = new Float32Array(700 * 6);
    this.rainData = [];
    for (let i = 0; i < 700; i++)
      this.rainData.push({
        x: (random(i * 3) - 0.5) * 44,
        y: random(i * 3 + 1) * 44 - 12,
        z: (random(i * 3 + 2) - 0.5) * 44,
        length: 0.5 + random(i + 907) * 0.7,
      });
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(rainPositions, 3),
    );
    this.rain = new THREE.LineSegments(
      this.rainGeo,
      new THREE.LineBasicMaterial({
        color: 0xc3e2eb,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    const motePositions = new Float32Array(150 * 3);
    this.moteData = [];
    for (let i = 0; i < 150; i++)
      this.moteData.push(
        new THREE.Vector3(
          (random(i + 3001) - 0.5) * 24,
          (random(i + 4001) - 0.5) * 12,
          (random(i + 5001) - 0.5) * 24,
        ),
      );
    this.moteGeo = new THREE.BufferGeometry();
    this.moteGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(motePositions, 3),
    );
    this.motes = new THREE.Points(
      this.moteGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          color: { value: new THREE.Color(0xe1c596) },
          opacity: { value: 0.12 },
          viewportHeight: { value: 800 },
        },
        vertexShader: `uniform float viewportHeight;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(viewportHeight*.018/max(1.,-p.z),1.,5.);}`,
        fragmentShader: `uniform vec3 color;uniform float opacity;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(color,pow(1.-d,2.)*opacity);}`,
      }),
    );
    this.motes.frustumCulled = false;
    scene.add(this.motes);
  }
  configureShadows(settings) {
    const preset = getGraphicsPreset(settings.quality);
    const size = preset.shadowMapSize || 1024;
    const radius = preset.shadowDistance || 45;
    const key = `${size}/${radius}/${settings.quality}`;
    this.sunLight.castShadow =
      preset.shadows !== false && settings.quality !== "low";
    if (key === this.shadowKey) return preset;
    this.shadowKey = key;
    this.sunLight.shadow.mapSize.set(size, size);
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null;
    }
    Object.assign(this.sunLight.shadow.camera, {
      left: -radius,
      right: radius,
      bottom: -radius,
      top: radius,
    });
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
    return preset;
  }
  update(dt, time, position, settings = {}, underwater = false, context = {}) {
    this.elapsed += dt;
    const preset = this.configureShadows(settings);
    const phase = time * Math.PI * 2 - Math.PI / 2;
    const altitude = Math.sin(phase);
    const daylight = smooth(altitude, -0.18, 0.32);
    const twilight =
      (1 - smooth(Math.abs(altitude), 0.02, 0.43)) *
      smooth(altitude, -0.2, 0.08);
    const rainy =
      this.weatherOverride == null
        ? Math.sin(time * 71 + Math.floor(this.elapsed / 120) * 8) > 0.93
          ? 1
          : 0
        : THREE.MathUtils.clamp(this.weatherOverride, 0, 1);
    this.rainAmount = mix(this.rainAmount, rainy, 1 - Math.exp(-dt * 0.2));
    this.wetness = mix(
      this.wetness,
      this.rainAmount,
      1 - Math.exp(-dt * (this.rainAmount > this.wetness ? 0.14 : 0.025)),
    );
    let cave = context.cave;
    if (!Number.isFinite(cave) && context.world) {
      const h = context.world.getHeight(position.x, position.z);
      cave = smooth(h - position.y, 1, 8);
    }
    this.cave = mix(
      this.cave,
      THREE.MathUtils.clamp(cave || 0, 0, 1),
      1 - Math.exp(-dt * 2.5),
    );
    this._sunDir.set(Math.cos(phase) * 0.86, altitude, -0.38).normalize();
    const shared = this.shared;
    shared.sunDirection.copy(this._sunDir);
    shared.moonDirection.copy(this._sunDir).negate();
    shared.sunColor.setRGB(
      1,
      mix(0.35, 0.91, 1 - twilight),
      mix(0.13, 0.77, 1 - twilight),
    );
    shared.skyTop
      .copy(NIGHT_TOP)
      .lerp(DAY_TOP, daylight)
      .lerp(RAIN_TOP, this.rainAmount * 0.65 * daylight);
    shared.skyHorizon
      .copy(NIGHT_HORIZON)
      .lerp(DAY_HORIZON, daylight)
      .lerp(DAWN, twilight * 0.42)
      .lerp(RAIN_HORIZON, this.rainAmount * 0.55 * daylight);
    shared.daylight = daylight;
    shared.wetness = this.wetness;
    shared.cave = this.cave;
    shared.elapsed = this.elapsed;
    shared.underwater = underwater;
    this.sunLight.color.copy(daylight > 0.08 ? shared.sunColor : MOON_COLOR);
    this.sunLight.intensity =
      mix(0.22, 3.0, daylight) *
      (1 - this.rainAmount * 0.72) *
      (1 - this.cave * 0.94);
    this.hemi.intensity =
      mix(0.32, 0.82, daylight) *
      (1 - this.rainAmount * 0.24) *
      (1 - this.cave * 0.95);
    this.hemi.color.set(0x7795bc).lerp(this._color.set(0xbad4ea), daylight);
    this.hemi.groundColor
      .set(0x3b4557)
      .lerp(this._color.set(0x8a7655), daylight);
    this.fill.intensity = (0.12 + daylight * 0.06) * (1 - this.cave * 0.97);
    this.fill.color.set(0x8aabc8);
    // Snap the center in the light's orthonormal basis, not world XYZ. This
    // holds the shadow texel grid still while the player walks and turns.
    this._keyDir.copy(this._sunDir);
    if (daylight <= 0.08) this._keyDir.negate();
    this._right
      .crossVectors(this._keyDir, THREE.Object3D.DEFAULT_UP)
      .normalize();
    this._up.crossVectors(this._right, this._keyDir).normalize();
    const texel =
      ((preset.shadowDistance || 45) * 2) / (preset.shadowMapSize || 1024);
    this._anchor.copy(position);
    const alongRight = this._anchor.dot(this._right),
      alongUp = this._anchor.dot(this._up);
    this._anchor.addScaledVector(
      this._right,
      Math.round(alongRight / texel) * texel - alongRight,
    );
    this._anchor.addScaledVector(
      this._up,
      Math.round(alongUp / texel) * texel - alongUp,
    );
    this.sunLight.target.position.copy(this._anchor);
    this.sunLight.position
      .copy(this._anchor)
      .addScaledVector(this._keyDir, 125);
    this.sunLight.shadow.radius = mix(2.1, 1.2, Math.max(altitude, 0));
    const u = this.sky.material.uniforms;
    u.bottom.value.copy(shared.skyHorizon).multiplyScalar(0.85);
    u.origin.value.copy(position);
    u.time.value = this.elapsed;
    u.daylight.value = daylight;
    u.twilight.value = twilight;
    u.wetness.value = this.rainAmount;
    u.cloudQuality.value = (preset.cloudSteps || 4) >= 4 ? 2 : 1;
    this.sky.position.copy(position);
    const outside = 1 - this.cave;
    this.rain.visible = this.rainAmount > 0.02 && !underwater && outside > 0.5;
    this.rain.position.copy(position);
    this.rain.material.opacity = this.rainAmount * 0.28 * mix(0.5, 1, daylight);
    const count =
      settings.quality === "low"
        ? 240
        : settings.quality === "medium"
          ? 400
          : 700;
    this.rainGeo.setDrawRange(0, count * 2);
    if (this.rain.visible) {
      const a = this.rainGeo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const p = this.rainData[i];
        p.y -= dt * 21;
        p.x -= dt * 1.6;
        if (p.y < -12) {
          p.y = 32;
          p.x = (random(i + this.elapsed) - 0.5) * 44;
        }
        a.set([p.x, p.y, p.z, p.x - 0.13, p.y + p.length, p.z + 0.03], i * 6);
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }
    const particles = Number(preset.particles ?? 1);
    this.motes.visible = particles > 0 && settings.quality !== "low";
    if (this.motes.visible) {
      const a = this.moteGeo.attributes.position.array;
      for (let i = 0; i < 150; i++) {
        const p = this.moteData[i];
        a.set(
          [
            position.x + ((((p.x + this.elapsed * 0.13) % 24) + 24) % 24) - 12,
            position.y + p.y + Math.sin(this.elapsed * 0.27 + i) * 0.35,
            position.z + p.z + Math.sin(this.elapsed * 0.15 + i) * 0.25,
          ],
          i * 3,
        );
      }
      this.moteGeo.setDrawRange(
        0,
        Math.min(150, Math.round(particles > 1 ? particles : particles * 120)),
      );
      this.moteGeo.attributes.position.needsUpdate = true;
      this.motes.material.uniforms.color.value.set(
        this.cave > 0.5 ? 0x9bc6cd : daylight > 0.5 ? 0xd3bd8a : 0xade3a4,
      );
      this.motes.material.uniforms.opacity.value = underwater
        ? 0.25
        : this.cave > 0.5
          ? 0.12
          : mix(0.31, 0.11, daylight);
      this.motes.material.uniforms.viewportHeight.value =
        this.renderer.domElement?.height || 800;
    }
    const distance = (settings.renderDistance || 5) * 16;
    this.scene.fog.color.copy(shared.skyHorizon).lerp(CAVE_FOG, this.cave);
    this.scene.fog.density =
      (settings.quality === "low" || settings.quality === "medium"
        ? 0.43
        : 0.28) /
        distance +
      this.rainAmount * 0.003 +
      this.cave * 0.015;
    if (underwater) {
      this.scene.fog.color.copy(WATER_FOG);
      this.scene.fog.density = 0.075;
    }
    this.renderer.setClearColor(this.scene.fog.color);
    this.renderer.toneMappingExposure = mix(1.35, 1.03, daylight);
    return {
      daylight,
      weather: this.rainAmount > 0.4 ? "雨" : "晴れ",
      isNight: daylight < 0.25,
      cave: this.cave,
    };
  }
  dispose() {
    for (const object of [this.sky, this.rain, this.motes]) {
      this.scene.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
    this.scene.remove(
      this.hemi,
      this.sunLight,
      this.sunLight.target,
      this.fill,
    );
    this.sunLight.shadow.map?.dispose();
    if (this.scene.userData.atmosphere === this.shared)
      delete this.scene.userData.atmosphere;
  }
}

export class HandView {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);
    this.group.position.set(0.36, -0.34, -0.65);
    this.group.rotation.set(-0.14, -0.25, -0.14);
    // Draw the view model after transparent world surfaces (especially water).
    const overlay = { depthTest: false, depthWrite: false, transparent: true };
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x91694e,
      roughness: 0.85,
      ...overlay,
    });
    this.gripMat = new THREE.MeshStandardMaterial({
      color: 0x70503b,
      roughness: 0.94,
      ...overlay,
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: 0x8b9d9b,
      roughness: 0.55,
      metalness: 0.3,
      ...overlay,
    });
    this.wrapMat = new THREE.MeshStandardMaterial({
      color: 0x443d32,
      roughness: 0.95,
      ...overlay,
    });
    this.skinMat = new THREE.MeshLambertMaterial({
      color: 0xc49b7b,
      ...overlay,
    });
    this.cuffMat = new THREE.MeshStandardMaterial({
      color: 0x52665c,
      roughness: 0.98,
      ...overlay,
    });
    this.toolGroup = new THREE.Group();
    this.toolGroup.rotation.z = -0.26;
    this.handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.51, 0.06),
      this.gripMat,
    );
    this.toolGroup.add(this.handle);
    for (let i = 0; i < 4; i++) {
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.071, 0.026, 0.071),
        this.wrapMat,
      );
      wrap.position.y = -0.075 - i * 0.041;
      this.toolGroup.add(wrap);
    }
    const profiles = {
      pickaxe: [
        [-0.24, -0.04],
        [-0.17, 0.065],
        [-0.07, 0.105],
        [0.07, 0.105],
        [0.19, 0.055],
        [0.25, -0.04],
        [0.11, 0.012],
        [-0.08, 0.025],
      ],
      axe: [
        [-0.055, 0.065],
        [0.065, 0.115],
        [0.23, 0.13],
        [0.27, 0.045],
        [0.25, -0.13],
        [0.11, -0.115],
        [0.065, -0.035],
        [-0.055, -0.025],
      ],
      shovel: [
        [-0.055, -0.11],
        [-0.105, 0.045],
        [-0.075, 0.14],
        [0.075, 0.14],
        [0.105, 0.045],
        [0.055, -0.11],
      ],
      hoe: [
        [-0.045, 0.06],
        [0.18, 0.06],
        [0.23, 0.015],
        [0.22, -0.15],
        [0.15, -0.14],
        [0.14, -0.015],
        [-0.045, -0.015],
      ],
      sword: [
        [-0.033, 0],
        [-0.042, 0.34],
        [0, 0.465],
        [0.042, 0.34],
        [0.033, 0],
      ],
    };
    this.heads = {};
    for (const [name, points] of Object.entries(profiles)) {
      const shape = new THREE.Shape();
      shape.moveTo(...points[0]);
      for (const point of points.slice(1)) shape.lineTo(...point);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.052,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.005,
        bevelThickness: 0.005,
        curveSegments: 1,
      });
      geometry.translate(0, 0, -0.026);
      const head = new THREE.Mesh(geometry, this.headMat);
      head.position.y = name === "shovel" ? 0.35 : 0.235;
      this.toolGroup.add(head);
      this.heads[name] = head;
    }
    this.head = this.heads.pickaxe;
    this.guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.035, 0.075),
      this.headMat,
    );
    this.guard.position.y = 0.238;
    this.toolGroup.add(this.guard);
    const pommel = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.045, 0.075),
      this.wrapMat,
    );
    pommel.position.y = -0.26;
    this.toolGroup.add(pommel);
    this.block = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      this.mat,
    );
    this.block.rotation.set(0.15, 0.45, 0.05);
    this.block.position.set(-0.035, 0.025, -0.035);
    this.resource = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      this.mat,
    );
    this.resource.position.set(-0.035, 0.035, -0.035);
    this.resource.rotation.z = 0.3;
    this.arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.105, 0.29, 4, 1),
      this.cuffMat,
    );
    this.arm.rotation.y = Math.PI / 4;
    this.arm.position.set(0.015, -0.285, 0.075);
    this.cuff = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.065, 0.16),
      this.wrapMat,
    );
    this.cuff.position.set(0.015, -0.12, 0.075);
    this.hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.15, 0.145),
      this.skinMat,
    );
    this.hand.position.set(0.015, -0.035, 0.07);
    this.group.add(
      this.toolGroup,
      this.block,
      this.resource,
      this.arm,
      this.cuff,
      this.hand,
    );
    this.group.traverse((object) => {
      object.renderOrder = 20;
      object.frustumCulled = false;
    });
    this.swing = 0;
    this.elapsed = 0;
    this.moveBlend = 0;
    this.swayX = 0;
    this.swayY = 0;
    this._previousRotation = camera.quaternion.clone();
    this._turnDelta = new THREE.Quaternion();
    this._turnEuler = new THREE.Euler();
  }
  update(dt, item, moving, mining = false) {
    this.elapsed += dt;
    this.swing = Math.max(0, this.swing - dt * 4.4);
    if (mining && this.swing < 0.08) this.swing = 1;
    const blend = 1 - Math.exp(-dt * 12);
    this.moveBlend = mix(this.moveBlend, moving ? 1 : 0, blend);
    this._turnDelta
      .copy(this._previousRotation)
      .invert()
      .multiply(this.camera.quaternion);
    this._turnEuler.setFromQuaternion(this._turnDelta, "YXZ");
    this._previousRotation.copy(this.camera.quaternion);
    this.swayX = mix(
      this.swayX,
      THREE.MathUtils.clamp(-this._turnEuler.y * 1.8, -0.045, 0.045),
      blend,
    );
    this.swayY = mix(
      this.swayY,
      THREE.MathUtils.clamp(this._turnEuler.x * 1.5, -0.035, 0.035),
      blend,
    );
    const strike = Math.sin(this.swing * Math.PI),
      t = this.elapsed;
    this.group.rotation.set(
      -0.14 - strike * 0.72 + this.swayY,
      -0.25 - strike * 0.14,
      -0.14 + strike * 0.35 + this.swayX,
    );
    this.group.position.set(
      0.36 + this.swayX + Math.sin(t * 4.6) * 0.008 * this.moveBlend,
      -0.34 -
        strike * 0.045 +
        this.swayY +
        Math.sin(t * 9.2) * 0.012 * this.moveBlend +
        Math.sin(t * 1.8) * 0.003,
      -0.65 + strike * 0.1,
    );
    const tool = !!item?.tool;
    this.toolGroup.visible = tool;
    for (const [name, head] of Object.entries(this.heads))
      head.visible = tool && name === item.tool;
    this.guard.visible = item?.tool === "sword";
    const placeable = Number.isInteger(item?.block);
    this.block.visible = !!item && !tool && placeable;
    this.resource.visible = !!item && !tool && !placeable;
    this.hand.position.y = tool ? -0.055 : -0.035;
    if (item?.color) this.mat.color.set(item.color);
    if (tool) {
      this.headMat.color.set(item.color || 0x93b7b1);
      this.headMat.metalness = item.tier >= 4 ? 0.5 : item.tier >= 3 ? 0.28 : 0;
      this.headMat.roughness =
        item.tier >= 4 ? 0.48 : item.tier >= 3 ? 0.6 : 0.86;
      this.gripMat.color.set(item.tier >= 3 ? 0x635042 : 0x805d3e);
    }
  }
  hit() {
    this.swing = 1;
  }
  dispose() {
    this.camera.remove(this.group);
    this.group.traverse((object) => object.geometry?.dispose());
    for (const material of [
      this.mat,
      this.gripMat,
      this.headMat,
      this.wrapMat,
      this.skinMat,
      this.cuffMat,
    ])
      material.dispose();
  }
}
