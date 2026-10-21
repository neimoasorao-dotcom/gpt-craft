import * as THREE from "three";

const mix = (a, b, t) => a + (b - a) * t;
export class Atmosphere {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.rainAmount = 0;
    scene.fog = new THREE.FogExp2(0xa5c6bc, 0.008);
    this.hemi = new THREE.HemisphereLight(0xc5e3e8, 0x536146, 2.1);
    scene.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight(0xffe2a8, 2.7);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sunLight.shadow.camera, {
      left: -45,
      right: 45,
      top: 45,
      bottom: -45,
      near: 1,
      far: 180,
    });
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.shadow.normalBias = 0.045;
    scene.add(this.sunLight, this.sunLight.target);
    this.fill = new THREE.DirectionalLight(0x789cbe, 0.2);
    this.fill.position.set(-50, 40, 50);
    scene.add(this.fill);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color("#3d879e") },
        horizon: { value: new THREE.Color("#d9dfbb") },
        bottom: { value: new THREE.Color("#c1cab0") },
        sunDir: { value: new THREE.Vector3(1, 0.7, -1).normalize() },
        sunTint: { value: new THREE.Color("#ffe6b0") },
        time: { value: 0 },
      },
      vertexShader: `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec3 top,horizon,bottom,sunDir,sunTint; uniform float time; varying vec3 vDirection;float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.);vec3 col=mix(horizon,top,pow(h,.6));col=mix(col,bottom,smoothstep(.0,-.4,d.y));float sun=pow(max(dot(d,sunDir),0.),600.);float glow=pow(max(dot(d,sunDir),0.),12.);col+=sunTint*(sun*1.8+glow*.18);float star=step(.9986,hash(floor(d*460.)));col+=vec3(star)*smoothstep(.15,-.3,sunDir.y)*max(0.,d.y)*(.7+.3*sin(time+hash(d)*10.));gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
    });
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 16),
      skyMaterial,
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.moon = new THREE.Mesh(
      new THREE.CircleGeometry(3.5, 5),
      new THREE.MeshBasicMaterial({ color: 0xdfe9d0, fog: false }),
    );
    scene.add(this.moon);
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xf4f1d8,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 80);
    this.clouds.frustumCulled = false;
    this.cloudData = [];
    const obj = new THREE.Object3D();
    for (let i = 0; i < 80; i++) {
      const x = ((Math.sin(i * 37.17) * 563.54) % 1) * 190;
      const z = ((Math.sin(i * 75.29) * 193.53) % 1) * 190;
      const y = 100 + (i % 4) * 3;
      const sx = 9 + (i % 5) * 4;
      obj.position.set(x, y, z);
      obj.scale.set(sx, 2.2 + (i % 3), sx * 0.65);
      obj.updateMatrix();
      this.clouds.setMatrixAt(i, obj.matrix);
      this.cloudData.push({ x, y, z, sx });
    }
    scene.add(this.clouds);
    const positions = new Float32Array(900 * 3);
    for (let i = 0; i < positions.length; i++)
      positions[i] = (Math.random() - 0.5) * 60;
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.rain = new THREE.Points(
      this.rainGeo,
      new THREE.PointsMaterial({
        color: 0xa8d2d6,
        size: 0.08,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    this.rain.visible = false;
    scene.add(this.rain);
    this.elapsed = 0;
  }
  update(dt, time, position, settings = {}, underwater = false) {
    this.elapsed += dt;
    const phase = time * Math.PI * 2 - Math.PI / 2;
    const altitude = Math.sin(phase);
    const daylight = THREE.MathUtils.smoothstep(altitude, -0.15, 0.4);
    const sunset = Math.max(0, 1 - Math.abs(altitude) / 0.4);
    this.sunLight.position
      .copy(position)
      .add(new THREE.Vector3(Math.cos(phase) * 70, altitude * 85, -35));
    this.sunLight.target.position.copy(position);
    this.sunLight.intensity = 0.05 + daylight * 2.4;
    this.sunLight.color.setRGB(
      1,
      mix(0.55, 0.91, 1 - sunset),
      mix(0.32, 0.72, 1 - sunset),
    );
    this.hemi.intensity = 0.25 + daylight * 1.7;
    this.fill.intensity = 0.13 + (1 - daylight) * 0.2;
    this.hemi.color.set(0xb8dfec).lerp(new THREE.Color(0x486c91), 1 - daylight);
    const uniforms = this.sky.material.uniforms;
    uniforms.top.value
      .set(0x70a8c1)
      .lerp(new THREE.Color(0x081326), 1 - daylight);
    uniforms.horizon.value
      .set(0xdce6da)
      .lerp(new THREE.Color(0x273e52), 1 - daylight)
      .lerp(new THREE.Color(0xeab486), sunset * daylight * 0.48);
    uniforms.bottom.value.copy(uniforms.horizon.value);
    uniforms.sunDir.value
      .copy(this.sunLight.position)
      .sub(position)
      .normalize();
    uniforms.time.value = this.elapsed;
    this.sky.position.copy(position);
    this.moon.position
      .copy(position)
      .addScaledVector(uniforms.sunDir.value, -210);
    this.moon.lookAt(position);
    this.moon.visible = altitude < 0.2;
    this.clouds.material.color
      .set(0xffffff)
      .lerp(new THREE.Color(0x54708b), 1 - daylight);
    this.clouds.position.set(
      Math.floor(position.x / 190) * 190 + ((this.elapsed * 0.55) % 190),
      0,
      Math.floor(position.z / 190) * 190,
    );
    const rainy =
      Math.sin(time * 71 + Math.floor(this.elapsed / 120) * 8) > 0.93;
    this.rainAmount = mix(
      this.rainAmount,
      rainy ? 1 : 0,
      Math.min(dt * 0.2, 1),
    );
    this.rain.visible = this.rainAmount > 0.02;
    this.rain.position.copy(position);
    this.rain.material.opacity = this.rainAmount * 0.5;
    if (this.rain.visible) {
      const array = this.rainGeo.attributes.position.array;
      for (let i = 1; i < array.length; i += 3) {
        array[i] -= dt * 18;
        if (array[i] < -20) array[i] = 35;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }
    const distance = (settings.renderDistance || 5) * 16;
    this.scene.fog.color.copy(uniforms.horizon.value);
    this.scene.fog.density = 0.54 / distance + this.rainAmount * 0.004;
    if (underwater) {
      this.scene.fog.color.set(0x266b72);
      this.scene.fog.density = 0.09;
    }
    this.renderer.setClearColor(this.scene.fog.color);
    this.renderer.toneMappingExposure = 1.12;
    this.sunLight.castShadow = settings.quality !== "low";
    return {
      daylight,
      weather: this.rainAmount > 0.4 ? "雨" : "晴れ",
      isNight: daylight < 0.25,
    };
  }
  dispose() {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.clouds.geometry.dispose();
    this.clouds.material.dispose();
    this.rainGeo.dispose();
    this.rain.material.dispose();
  }
}

export class HandView {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);
    this.group.position.set(0.37, -0.32, -0.65);
    this.group.rotation.set(-0.15, -0.25, -0.15);
    this.mat = new THREE.MeshLambertMaterial({
      color: 0x91694e,
      depthTest: false,
      depthWrite: false,
    });
    this.gripMat = new THREE.MeshLambertMaterial({
      color: 0x73503a,
      depthTest: false,
      depthWrite: false,
    });
    this.headMat = new THREE.MeshLambertMaterial({
      color: 0x8b9d9b,
      depthTest: false,
      depthWrite: false,
    });
    this.handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.47, 0.065),
      this.gripMat,
    );
    this.handle.rotation.z = -0.35;
    this.head = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.095, 0.09),
      this.headMat,
    );
    this.head.position.set(0.07, 0.2, 0);
    this.head.rotation.z = -0.12;
    this.block = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), this.mat);
    this.hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.3, 0.15),
      new THREE.MeshLambertMaterial({
        color: 0xcda080,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.hand.position.set(0, -0.14, 0);
    this.group.add(this.handle, this.head, this.block, this.hand);
    this.group.traverse((o) => {
      o.renderOrder = 20;
      o.frustumCulled = false;
    });
    this.swing = 0;
  }
  update(dt, item, moving, mining = false) {
    this.swing = Math.max(0, this.swing - dt * 5);
    if (mining && this.swing < 0.1) this.swing = 1;
    const t = performance.now() / 1000;
    this.group.rotation.x = -0.15 - Math.sin(this.swing * Math.PI) * 0.8;
    this.group.rotation.z = -0.15 + Math.sin(this.swing * Math.PI) * 0.45;
    this.group.position.y =
      -0.32 + (moving ? Math.sin(t * 9) * 0.015 : Math.sin(t * 2) * 0.004);
    const tool = !!item?.tool;
    this.handle.visible = tool;
    this.head.visible = tool;
    this.block.visible = !!item && !tool;
    this.hand.visible = !tool;
    if (item?.color) this.mat.color.set(item.color);
    if (tool) {
      this.headMat.color.set(item.color || 0x93b7b1);
      this.head.scale.x = item.tool === "sword" ? 0.34 : 1;
      this.head.scale.y = item.tool === "sword" ? 4.8 : 1;
      this.head.position.y = item.tool === "sword" ? 0.33 : 0.2;
    }
  }
  hit() {
    this.swing = 1;
  }
}
