import * as THREE from "three";
import { getGraphicsPreset } from "./graphics-config.js";

const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const blurShader = `
uniform sampler2D source; uniform vec2 stepUV; uniform float threshold;
varying vec2 vUv;
vec3 sampleLight(vec2 uv){vec3 c=texture2D(source,uv).rgb;float l=max(c.r,max(c.g,c.b));return c*max(0.,l-threshold)/max(l,.001);}
void main(){vec3 col=sampleLight(vUv)*.227027;
col+=(sampleLight(vUv+stepUV*1.384615)+sampleLight(vUv-stepUV*1.384615))*.316216;
col+=(sampleLight(vUv+stepUV*3.230769)+sampleLight(vUv-stepUV*3.230769))*.07027;
gl_FragColor=vec4(col,1.);}`;
const compositeShader = `
uniform sampler2D source, bloomTexture, sceneDepth;
uniform vec2 inverseSize; uniform float bloomStrength,aoStrength,nearPlane,farPlane,time,underwater,cave,wetness;
uniform mat4 inverseProjection,cameraWorld; uniform vec3 fogColor;
varying vec2 vUv;
float linearDepth(float z){return (nearPlane*farPlane)/(farPlane-z*(farPlane-nearPlane));}
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 antialias(vec2 uv){
 vec3 center=texture2D(source,uv).rgb;
 float nw=luma(texture2D(source,uv+vec2(-1.,-1.)*inverseSize).rgb);
 float ne=luma(texture2D(source,uv+vec2(1.,-1.)*inverseSize).rgb);
 float sw=luma(texture2D(source,uv+vec2(-1.,1.)*inverseSize).rgb);
 float se=luma(texture2D(source,uv+vec2(1.,1.)*inverseSize).rgb);
 float mid=luma(center),lo=min(mid,min(min(nw,ne),min(sw,se))),hi=max(mid,max(max(nw,ne),max(sw,se)));
 if(hi-lo<max(.045,hi*.14))return center;
 vec2 dir=vec2(-((nw+ne)-(sw+se)),((nw+sw)-(ne+se)));
 float reduce=max((nw+ne+sw+se)*.03125,.0078125);
 dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-6.),vec2(6.))*inverseSize;
 vec3 a=.5*(texture2D(source,uv+dir*(-.166667)).rgb+texture2D(source,uv+dir*.166667).rgb);
 vec3 b=a*.5+.25*(texture2D(source,uv-dir*.5).rgb+texture2D(source,uv+dir*.5).rgb);
 float lb=luma(b);return (lb<lo||lb>hi)?a:b;
}
void main(){
 vec2 uv=vUv;
 uv+=vec2(sin(uv.y*38.+time*1.2),cos(uv.x*31.+time*.9))*underwater*.0012;
 vec3 col=antialias(uv);
 float raw=texture2D(sceneDepth,vUv).r;
 float depth=linearDepth(raw);
 // Small deterministic contact kernel. No animated noise, history or ghosting.
 float occ=0.; float slope=length(vec2(dFdx(depth),dFdy(depth)));
 if(raw<.9999&&depth<65.&&aoStrength>0.){
  vec2 radius=inverseSize*clamp(45./max(depth,1.),1.5,9.);
  for(int i=0;i<8;i++){
   float a=float(i)*.785398;
   float z=linearDepth(texture2D(sceneDepth,vUv+vec2(cos(a),sin(a))*radius).r);
   float delta=depth-z;
   occ+=smoothstep(.06+slope*1.8,.8+slope*2.,delta)*(1.-smoothstep(1.,3.5,delta));
  }
 }
 col*=1.-occ*.125*aoStrength;
 // A little valley mist above the world, rather than a uniformly opaque fog wall.
 if(raw<.9999){
  vec4 view=inverseProjection*vec4(vUv*2.-1.,raw*2.-1.,1.);
  view/=view.w; vec3 world=(cameraWorld*view).xyz;
  float heightDensity=exp(-max(world.y-31.,0.)*.12);
  float mist=(1.-exp(-depth*.0028))*heightDensity*(1.-cave)*(1.-underwater);
  col=mix(col,fogColor,clamp(mist,0.,.24));
 }
 col+=texture2D(bloomTexture,uv).rgb*bloomStrength;
 // Keep night blues and highlight warmth without global oversaturation.
 col=mix(col,col*vec3(.75,1.04,1.07),underwater*.3);
 vec2 edge=vUv*(1.-vUv);float vignette=pow(clamp(edge.x*edge.y*16.,0.,1.),.085);
 col*=mix(.9,1.,vignette);
 gl_FragColor=vec4(max(col,vec3(0.)),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Linear HDR scene, bounded bloom/contact shading, and opaque water refraction.
 * Low/medium use the direct renderer; unsupported float targets use RGBA8.
 */
export class SceneRenderer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.type = renderer.extensions.has("EXT_color_buffer_float")
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
    this.size = new THREE.Vector2();
    this.opaqueSize = new THREE.Vector2();
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.blur = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader,
      fragmentShader: blurShader,
      uniforms: {
        source: { value: null },
        stepUV: { value: new THREE.Vector2() },
        threshold: { value: 1 },
      },
    });
    this.composite = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      vertexShader,
      fragmentShader: compositeShader,
      uniforms: {
        source: { value: null },
        bloomTexture: { value: null },
        sceneDepth: { value: null },
        inverseSize: { value: new THREE.Vector2() },
        bloomStrength: { value: 0.12 },
        aoStrength: { value: 0.35 },
        nearPlane: { value: camera.near },
        farPlane: { value: camera.far },
        time: { value: 0 },
        underwater: { value: 0 },
        cave: { value: 0 },
        wetness: { value: 0 },
        inverseProjection: { value: camera.projectionMatrixInverse },
        cameraWorld: { value: camera.matrixWorld },
        fogColor: { value: new THREE.Color() },
      },
    });
    this.disabled = false;
  }
  target(w, h, depth = false) {
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: this.type,
      depthBuffer: depth,
    });
    if (depth)
      target.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    return target;
  }
  resize(preset) {
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x),
      h = Math.max(1, this.size.y);
    const signature = `${w},${h},${preset.refractionScale},${preset.samples}`;
    if (signature === this.signature) return true;
    this.disposeTargets();
    this.signature = signature;
    this.opaqueSize.set(
      Math.max(1, Math.round(w * preset.refractionScale)),
      Math.max(1, Math.round(h * preset.refractionScale)),
    );
    const gl = this.renderer.getContext();
    const formats =
      this.type === THREE.HalfFloatType
        ? [gl.RGBA16F, gl.DEPTH_COMPONENT24]
        : [gl.RGBA8, gl.DEPTH_COMPONENT24];
    const supported = formats.map((format) =>
      Array.from(
        gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES) ||
          [],
      ),
    );
    const samples = Math.max(
      0,
      ...supported[0].filter(
        (n) => n <= preset.samples && supported[1].includes(n),
      ),
    );
    let valid = false;
    // Format-specific MSAA limits vary by driver. Validate once on allocation,
    // then retry plain RGBA8 before falling back to the direct renderer.
    for (const attempt of [
      { type: this.type, samples },
      { type: THREE.UnsignedByteType, samples: 0 },
    ]) {
      this.type = attempt.type;
      this.color = this.target(w, h, true);
      this.color.samples = attempt.samples;
      this.opaque = this.target(this.opaqueSize.x, this.opaqueSize.y, true);
      this.bloomA = this.target(
        Math.max(1, Math.round(w / 4)),
        Math.max(1, Math.round(h / 4)),
      );
      this.bloomB = this.target(this.bloomA.width, this.bloomA.height);
      try {
        valid = [this.color, this.opaque, this.bloomA, this.bloomB].every(
          (target) => {
            this.renderer.setRenderTarget(target);
            return (
              gl.checkFramebufferStatus(gl.FRAMEBUFFER) ===
              gl.FRAMEBUFFER_COMPLETE
            );
          },
        );
      } catch {
        valid = false;
      }
      this.renderer.setRenderTarget(null);
      if (valid) break;
      this.disposeTargets();
    }
    if (!valid) {
      this.disabled = true;
      this.failureReason =
        "Post-processing targets are unsupported on this graphics driver.";
      return false;
    }
    this.composite.uniforms.inverseSize.value.set(1 / w, 1 / h);
    return true;
  }
  drawQuad(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }
  render(world, hand, settings) {
    const preset = getGraphicsPreset(settings.quality);
    world?.updateEnvironment?.(this.camera);
    if (!preset.postProcessing || this.disabled) {
      world?.setRenderContext?.({ enabled: false });
      if (this.color) {
        this.disposeTargets();
        this.signature = null;
      }
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (!this.resize(preset)) {
      world?.setRenderContext?.({ enabled: false });
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const renderer = this.renderer;
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(
      this.viewProjection.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    );
    const visibleWater =
      world &&
      [...world.chunks.values()].some(
        (chunk) =>
          chunk.water &&
          chunk.water.visible &&
          this.frustum.intersectsObject(chunk.water),
      );
    const handVisible = hand?.visible;
    world?.setRenderContext?.({ enabled: false });
    if (visibleWater) {
      const waterMeshes = [...world.chunks.values()]
        .map((chunk) => chunk.water)
        .filter((mesh) => mesh?.visible);
      for (const mesh of waterMeshes) mesh.visible = false;
      if (hand) hand.visible = false;
      try {
        renderer.setRenderTarget(this.opaque);
        renderer.render(this.scene, this.camera);
      } finally {
        for (const mesh of waterMeshes) mesh.visible = true;
        if (hand) hand.visible = handVisible;
      }
      world?.setRenderContext?.({
        enabled: true,
        colorTexture: this.opaque.texture,
        depthTexture: this.opaque.depthTexture,
        resolution: this.opaqueSize,
        cameraNear: this.camera.near,
        cameraFar: this.camera.far,
      });
    }
    renderer.setRenderTarget(this.color);
    renderer.render(this.scene, this.camera);
    const b = this.blur.uniforms;
    b.source.value = this.color.texture;
    b.threshold.value = 1.05;
    b.stepUV.value.set(preset.bloomRadius / this.bloomA.width, 0);
    this.drawQuad(this.blur, this.bloomA);
    b.source.value = this.bloomA.texture;
    b.threshold.value = 0;
    b.stepUV.value.set(0, preset.bloomRadius / this.bloomA.height);
    this.drawQuad(this.blur, this.bloomB);
    const u = this.composite.uniforms,
      a = this.scene.userData.atmosphere;
    u.source.value = this.color.texture;
    u.sceneDepth.value = this.color.depthTexture;
    u.bloomTexture.value = this.bloomB.texture;
    u.bloomStrength.value = preset.bloomStrength;
    u.aoStrength.value = preset.aoStrength;
    u.time.value = a?.elapsed || 0;
    u.underwater.value = a?.underwater ? 1 : 0;
    u.cave.value = a?.cave || 0;
    u.wetness.value = a?.wetness || 0;
    u.fogColor.value.copy(this.scene.fog.color);
    this.drawQuad(this.composite, null);
  }
  disposeTargets() {
    for (const key of ["color", "opaque", "bloomA", "bloomB"]) {
      this[key]?.dispose();
      this[key] = null;
    }
  }
  dispose() {
    this.disposeTargets();
    this.quad.geometry.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}
