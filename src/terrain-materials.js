import * as THREE from "three";

const wind = /* glsl */ `
float materialId = atlasTile.x + (7.0-atlasTile.y)*8.0;
float leaves = max(1.0-step(.1,abs(materialId-7.0)),max(1.0-step(.1,abs(materialId-25.0)),1.0-step(.1,abs(materialId-26.0))));
float grass = max(1.0-step(.1,abs(materialId-22.0)),1.0-step(.1,abs(materialId-34.0)));
vec3 anchor = (modelMatrix*vec4(position,1.0)).xyz;
float breeze = sin(anchor.x*.43+terrainTime*.91+sin(anchor.z*.27+terrainTime*.37));
breeze += .35*sin(anchor.z*1.37-terrainTime*1.33+anchor.y*.35);
float sway = leaves*.024 + grass*fract(position.y+.005)*.055;
transformed.x += breeze*sway;
transformed.z += sin(anchor.z*.39+terrainTime*.73+anchor.x*.21)*sway*.6;
`;

function configure(shader, uniforms, lit) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader =
    /* glsl */ `
attribute vec2 repeatUv; attribute vec2 atlasTile;
uniform float terrainTime;
varying vec2 vRepeatUv,vAtlasTile;
varying vec3 vSurfaceWorld,vTerrainNormal;
${lit ? "attribute float glow;varying float vGlow;" : ""}
` + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>\n${wind}\nvRepeatUv=repeatUv;vAtlasTile=atlasTile;
    vSurfaceWorld=(modelMatrix*vec4(transformed,1.)).xyz;
    vTerrainNormal=normalize(mat3(modelMatrix)*normal);
    ${lit ? "vGlow=glow;" : ""}`,
  );
  shader.fragmentShader =
    /* glsl */ `
varying vec2 vRepeatUv,vAtlasTile;
varying vec3 vSurfaceWorld,vTerrainNormal;
${lit ? "varying float vGlow;uniform float terrainWetness,terrainDaylight;uniform vec3 terrainSunDirection,terrainSunColor;" : ""}
` + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <map_fragment>",
    /* glsl */ `
#ifdef USE_MAP
 vec2 atlasUv=(vAtlasTile+vec2(.0025)+fract(vRepeatUv)*.995)/8.0;
 // Cap the footprint before the atlas mip levels begin mixing whole tiles.
 vec2 gx=dFdx(vRepeatUv)*.124375,gy=dFdy(vRepeatUv)*.124375;
 gx/=max(1.,length(gx)*16.);gy/=max(1.,length(gy)*16.);
 vec4 sampledDiffuseColor=textureGrad(map,atlasUv,gx,gy);
 diffuseColor *= sampledDiffuseColor;
#endif
${
  lit
    ? /* glsl */ `
 float id=vAtlasTile.x+(7.0-vAtlasTile.y)*8.0;
 float vegetation=max(1.-step(.1,abs(id-7.)),max(1.-step(.1,abs(id-25.)),1.-step(.1,abs(id-26.))));
 float foliage=max(vegetation,1.-step(.1,abs(id-22.)));
 float ore=step(10.5,id)*(1.-step(13.5,id));
 float crystal=max(1.-step(.1,abs(id-13.)),1.-step(.1,abs(id-32.)));
 float wetSurface=terrainWetness*smoothstep(.15,.9,vTerrainNormal.y)*(1.-foliage*.7);
 float macro=sin(vSurfaceWorld.x*.117+sin(vSurfaceWorld.z*.13)*1.7)*sin(vSurfaceWorld.z*.075+vSurfaceWorld.y*.07);
 diffuseColor.rgb *= 1.0 + macro*.055;
 diffuseColor.rgb *= mix(vec3(1.),vec3(.80,.86,.90),wetSurface);
 // The foliage palette drifts across the landscape without per-face random noise.
 diffuseColor.rgb *= mix(vec3(1.),mix(vec3(.96,1.,.92),vec3(1.04,.98,.90),macro*.5+.5),foliage);
`
    : ""
}
`,
  );
  if (!lit) return;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <roughnessmap_fragment>",
    /* glsl */ `#include <roughnessmap_fragment>
 roughnessFactor=mix(.91,.46,ore);
 roughnessFactor=mix(roughnessFactor,.36,crystal);
 roughnessFactor=mix(roughnessFactor,.65,1.-step(.1,abs(id-14.)));
 roughnessFactor=mix(roughnessFactor,.29,1.-step(.1,abs(id-31.)));
 roughnessFactor=mix(roughnessFactor,.32,wetSurface*.8);
`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <metalnessmap_fragment>",
    "#include <metalnessmap_fragment>\nmetalnessFactor=ore*.17+crystal*.06;",
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <normal_fragment_maps>",
    /* glsl */ `#include <normal_fragment_maps>
 // Derivative bump reads the already-filtered albedo: no extra texture fetches
 // and no geometry inflation. Grain is deliberately small at voxel edges.
 float heightDetail=dot(sampledDiffuseColor.rgb,vec3(.299,.587,.114));
 vec3 surfaceX=dFdx(-vViewPosition),surfaceY=dFdy(-vViewPosition);
 vec3 gradientX=cross(surfaceY,normal),gradientY=cross(normal,surfaceX);
 float determinant=dot(surfaceX,gradientX);
 normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(heightDetail)*gradientX+dFdy(heightDetail)*gradientY)*.006*(1.-foliage*.7));
`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    /* glsl */ `#include <emissivemap_fragment>
 float luminousMask=smoothstep(.14,.54,dot(sampledDiffuseColor.rgb,vec3(.299,.587,.114)));
 totalEmissiveRadiance+=diffuseColor.rgb*vGlow*(.24+luminousMask*2.7);
 // A restrained transmission approximation lights thin leaves from behind.
 float transmission=pow(max(0.,dot(normalize(vSurfaceWorld-cameraPosition),terrainSunDirection)),3.);
 totalEmissiveRadiance+=diffuseColor.rgb*terrainSunColor*foliage*transmission*.32*terrainDaylight;
`,
  );
}

export function createTerrainMaterials(texture) {
  const uniforms = {
    terrainTime: { value: 0 },
    terrainWetness: { value: 0 },
    terrainDaylight: { value: 1 },
    terrainSunDirection: {
      value: new THREE.Vector3(0.4, 0.7, -0.6).normalize(),
    },
    terrainSunColor: { value: new THREE.Color("#ffe0af") },
  };
  const solid = new THREE.MeshStandardMaterial({
    map: texture,
    vertexColors: true,
    alphaTest: 0.35,
    roughness: 0.9,
    metalness: 0,
    dithering: true,
  });
  solid.onBeforeCompile = (shader) => configure(shader, uniforms, true);
  solid.customProgramCacheKey = () => "wildbound-natural-terrain-v2";
  const depth = new THREE.MeshDepthMaterial({
    map: texture,
    alphaTest: 0.35,
    depthPacking: THREE.RGBADepthPacking,
  });
  depth.onBeforeCompile = (shader) => configure(shader, uniforms, false);
  depth.customProgramCacheKey = () => "wildbound-natural-depth-v2";
  return { solid, depth, uniforms };
}
