import * as THREE from "three";

/** Built beacons become distant, animated landmarks that survive world reloads. */
export class BeaconEffects {
  constructor(scene) {
    this.scene = scene;
    this.active = new Map();
    this.geometry = new THREE.CylinderGeometry(0.22, 0.65, 64, 8, 1, true);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xa5f4db,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.ringGeometry = new THREE.TorusGeometry(0.9, 0.025, 4, 8);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xd4ead0,
      toneMapped: false,
      transparent: true,
      opacity: 0.8,
    });
    this.scan = 0;
  }
  update(dt, world, position) {
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 1.5;
      const nearby = new Set();
      for (const [key, id] of Object.entries(world.edits)) {
        if (id !== 36) continue;
        const [x, y, z] = key.split(",").map(Number);
        if (Math.hypot(x - position.x, z - position.z) > 145) continue;
        nearby.add(key);
        if (!this.active.has(key)) {
          const group = new THREE.Group();
          group.position.set(x + 0.5, y + 0.5, z + 0.5);
          const beam = new THREE.Mesh(this.geometry, this.material);
          beam.position.y = 32;
          group.add(beam);
          const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.6;
          group.add(ring);
          const second = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
          second.position.y = 0.6;
          second.scale.setScalar(0.65);
          group.add(second);
          this.scene.add(group);
          this.active.set(key, { group, beam, ring, second, clock: 0 });
        }
      }
      for (const [key, effect] of this.active)
        if (!nearby.has(key)) {
          this.scene.remove(effect.group);
          this.active.delete(key);
        }
    }
    for (const effect of this.active.values()) {
      effect.clock += dt;
      const pulse = 1 + Math.sin(effect.clock * 1.7) * 0.16;
      effect.beam.scale.set(pulse, 1, pulse);
      effect.ring.rotation.z += dt * 0.28;
      effect.second.rotation.y += dt * 0.5;
      effect.second.rotation.x = Math.sin(effect.clock * 0.7) * 0.7;
      effect.ring.position.y = 0.8 + Math.sin(effect.clock) * 0.13;
      effect.second.position.y = effect.ring.position.y;
    }
  }
  dispose() {
    for (const effect of this.active.values()) this.scene.remove(effect.group);
    this.active.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
