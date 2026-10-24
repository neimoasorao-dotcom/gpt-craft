import * as THREE from "three";

export function createWaterMaterial() {
  const uniforms = {
    waterTime: { value: 0 },
    waterDetail: { value: 2 },
    daylight: { value: 1 },
    sunDirection: { value: new THREE.Vector3(0.4, 0.7, -0.6).normalize() },
    sunColor: { value: new THREE.Color("#ffdfad") },
    skyTop: { value: new THREE.Color("#76adc6") },
    skyHorizon: { value: new THREE.Color("#d8e5dc") },
    sceneColor: { value: null },
    sceneDepth: { value: null },
    sceneResolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.07 },
    cameraFar: { value: 420 },
    hasScene: { value: false },
    fogColor: { value: new THREE.Color("#aac9c4") },
    fogDensity: { value: 0.007 },
    wetness: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
uniform float waterTime,waterDetail;
varying vec3 vWaterWorld,vWaterNormal;
varying float vWaterDepth;
varying vec4 vWaterClip;
void main(){
 vec3 p=position;
 vec3 world=(modelMatrix*vec4(p,1.)).xyz;
 // Greedy water quads contain T junctions. Keep their shared level exact;
 // continuous fragment normals supply waves without opening mesh cracks.
 vec4 wp=modelMatrix*vec4(p,1.);
 vWaterWorld=wp.xyz;
 vWaterNormal=normalize(mat3(modelMatrix)*normal);
 vec4 view=modelViewMatrix*vec4(p,1.);
 vWaterDepth=-view.z;
 vWaterClip=projectionMatrix*view;
 gl_Position=vWaterClip;
}`,
    fragmentShader: /* glsl */ `
#include <common>
#include <packing>
uniform float waterTime,waterDetail,daylight,cameraNear,cameraFar,fogDensity,wetness;
uniform vec3 sunDirection,sunColor,skyTop,skyHorizon,fogColor;
uniform sampler2D sceneColor,sceneDepth;
uniform vec2 sceneResolution;
uniform bool hasScene;
varying vec3 vWaterWorld,vWaterNormal;
varying float vWaterDepth;
varying vec4 vWaterClip;
float ripples(vec2 p){
 float w=sin(dot(p,vec2(.64,.29))+waterTime*.85)*.42;
 w+=sin(dot(p,vec2(-.37,.91))-waterTime*.72)*.29;
 w+=sin(dot(p,vec2(1.63,1.18))+waterTime*1.1)*.11;
 if(waterDetail>1.)w+=sin(dot(p,vec2(3.12,-2.7))-waterTime*1.75)*.035;
 return w;
}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float cloudNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y);}
vec3 reflectedSky(vec3 d){
 vec3 col=mix(skyHorizon,skyTop,pow(max(d.y,0.),.45));
 float towardSun=max(dot(d,sunDirection),0.);
 col+=sunColor*pow(towardSun,5.)*.15*daylight;
 // The reflection samples the same moving cloud plane as the procedural sky,
 // reduced to two octaves rather than rendering the world a third time.
 if(waterDetail>1. && d.y>.025){
  vec2 p=(vWaterWorld.xz+d.xz*(170.-vWaterWorld.y)/max(d.y,.025))*.005+vec2(waterTime*.009,waterTime*.0035);
  float density=cloudNoise(p)*.64+cloudNoise(mat2(1.6,-1.2,1.2,1.6)*p+3.7)*.36;
  float coverage=smoothstep(mix(.58,.36,wetness),mix(.80,.58,wetness),density)*smoothstep(.025,.10,d.y);
  vec3 cloud=mix(vec3(.045,.065,.10),mix(skyHorizon*.7,vec3(.67,.73,.73),.55),daylight);
  col=mix(col,cloud,coverage*.75);
 }
 return col;
}
void main(){
 vec2 p=vWaterWorld.xz;
 float t=waterTime;
 // Domain-warped wave phases break long parallel bands while retaining
 // continuous normals across chunk edges and coherent temporal motion.
 float phase1=dot(p,vec2(.64,.29))+t*.85+sin(p.y*.21+t*.17)*.68;
 float phase2=dot(p,vec2(-.37,.91))-t*.72+sin(p.x*.19-t*.13)*.57;
 float phase3=dot(p,vec2(1.63,1.18))+t*1.1+sin(dot(p,vec2(.3,-.24)))*.8;
 vec2 slope=vec2(.64,.29)*cos(phase1)*.36+vec2(-.37,.91)*cos(phase2)*.29;
 slope+=vec2(1.63,1.18)*cos(phase3)*.075;
 if(waterDetail>1.)slope+=vec2(3.12,-2.7)*cos(dot(p,vec2(3.12,-2.7))-t*1.75+sin(p.x*.4+p.y*.3))*.025;
 vec3 N=normalize(vec3(-slope.x*.12,1.,-slope.y*.12));
 if(abs(vWaterNormal.y)<.5)N=normalize(vWaterNormal+vec3(slope.x,0.,slope.y)*.08);
 vec3 V=normalize(cameraPosition-vWaterWorld);
 if(!gl_FrontFacing)N=-N;
 float facing=clamp(dot(N,V),0.,1.);
 float fresnel=.025+.975*pow(1.-facing,5.);
 vec2 uv=vWaterClip.xy/vWaterClip.w*.5+.5;
 float depth=5.5;
 float gap=5.5;
 vec3 refracted=vec3(.07,.31,.27);
 if(hasScene){
  float sceneZ=-perspectiveDepthToViewZ(texture2D(sceneDepth,uv).r,cameraNear,cameraFar);
  gap=max(0.,sceneZ-vWaterDepth);
  depth=gap*max(.15,abs(V.y));
  vec2 offset=N.xz*.008*min(gap,3.);
  vec2 refractedUv=clamp(uv+offset,vec2(.001),vec2(.999));
  float displacedZ=-perspectiveDepthToViewZ(texture2D(sceneDepth,refractedUv).r,cameraNear,cameraFar);
  if(displacedZ<vWaterDepth)refractedUv=uv;
  refracted=texture2D(sceneColor,refractedUv).rgb;
 }
 vec3 transmittance=exp(-vec3(.45,.23,.16)*depth);
 vec3 deepColor=mix(vec3(.006,.025,.049),vec3(.010,.13,.145),daylight);
 vec3 shallowColor=mix(vec3(.025,.09,.10),vec3(.12,.48,.37),daylight);
 vec3 volume=mix(shallowColor,deepColor,1.-exp(-depth*.18));
 vec3 col=hasScene?refracted*transmittance+volume*(1.-transmittance):volume;
 vec3 reflected=reflectedSky(reflect(-V,N));
 col=mix(col,reflected,fresnel*.86);
 vec3 H=normalize(V+sunDirection);
 float spec=pow(max(dot(N,H),0.),mix(220.,110.,wetness));
 col+=sunColor*spec*daylight*1.5*smoothstep(-.05,.1,sunDirection.y);
 // Reflected moonlight is restrained, avoiding a second sun at night.
 vec3 moonH=normalize(V-sunDirection);
 col+=vec3(.12,.23,.38)*pow(max(dot(N,moonH),0.),180.)*(1.-daylight)*.7;
 if(hasScene && gl_FrontFacing){
  float shore=(1.-smoothstep(.10,.75,gap));
  float lace=smoothstep(.05,.65,sin(gap*13.-t*1.1+ripples(p)*1.8));
  float foam=shore*(.35+lace*.65)*smoothstep(.02,.12,gap);
  col=mix(col,vec3(.65,.78,.71)*(.25+daylight*.7),foam*.58);
  float caustic=pow(max(0.,sin(p.x*2.3+ripples(p*.7))*sin(p.y*2.1-ripples(p*.8))),8.);
  col+=vec3(.06,.10,.06)*caustic*exp(-depth*.7)*daylight;
 }
 float haze=1.-exp(-fogDensity*fogDensity*vWaterDepth*vWaterDepth);
 col=mix(col,fogColor,clamp(haze,0.,1.));
 float alpha=hasScene?1.:clamp(.6+fresnel*.4+depth*.02,.6,1.);
 gl_FragColor=vec4(max(col,vec3(0.)),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`,
  });
  material.name = "Wildbound / jade water";
  material.userData.uniforms = uniforms;
  return material;
}
