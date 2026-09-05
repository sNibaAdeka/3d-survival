import * as THREE from 'three';

interface TimedObject {
  object: THREE.Object3D;
  ttl: number;
}

export class EffectsManager {
  private readonly tracers: TimedObject[] = [];
  private readonly sparks: TimedObject[] = [];
  private tracerIndex = 0;
  private sparkIndex = 0;

  constructor(private readonly scene: THREE.Scene) {
    const tracerMaterial = new THREE.LineBasicMaterial({
      color: '#ffe66d',
      transparent: true,
      opacity: 0.95
    });

    for (let i = 0; i < 80; i += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new THREE.Line(geometry, tracerMaterial);
      line.visible = false;
      scene.add(line);
      this.tracers.push({ object: line, ttl: 0 });
    }

    const sparkGeometry = new THREE.IcosahedronGeometry(0.16, 1);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#f8fcff' });
    for (let i = 0; i < 48; i += 1) {
      const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
      spark.visible = false;
      scene.add(spark);
      this.sparks.push({ object: spark, ttl: 0 });
    }
  }

  spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color: THREE.ColorRepresentation = '#ffe66d'): void {
    const entry = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
    const line = entry.object as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.setXYZ(0, start.x, start.y, start.z);
    attribute.setXYZ(1, end.x, end.y, end.z);
    attribute.needsUpdate = true;
    line.material.color.set(color);
    line.visible = true;
    entry.ttl = 0.055;
  }

  spawnSpark(point: THREE.Vector3, color: THREE.ColorRepresentation = '#f8fcff'): void {
    const entry = this.sparks[this.sparkIndex];
    this.sparkIndex = (this.sparkIndex + 1) % this.sparks.length;
    const mesh = entry.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    mesh.position.copy(point);
    mesh.material.color.set(color);
    mesh.scale.setScalar(1);
    mesh.visible = true;
    entry.ttl = 0.18;
  }

  update(dt: number): void {
    for (const tracer of this.tracers) {
      if (tracer.ttl <= 0) continue;
      tracer.ttl -= dt;
      tracer.object.visible = tracer.ttl > 0;
    }

    for (const spark of this.sparks) {
      if (spark.ttl <= 0) continue;
      spark.ttl -= dt;
      spark.object.visible = spark.ttl > 0;
      spark.object.scale.setScalar(Math.max(0.2, spark.ttl * 7));
    }
  }
}
