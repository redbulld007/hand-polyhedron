// Render Worker: Three.js + OffscreenCanvas, driven by SAB landmarks
import * as THREE from 'three';
import { OFF, SAB_MAGIC, getViews } from '../shared/sab-layout';
import { COLOR_PALETTE, SPRING_STIFFNESS, SPRING_DAMPING } from '../shared/constants';

let sab: SharedArrayBuffer;
let i32: Int32Array;
let f32: Float32Array;
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let group: THREE.Group;
let solidMesh: THREE.Mesh;
let glowMesh: THREE.Mesh;
let particlePoints: THREE.Points;
let particlePositions: Float32Array;
let particleVelocities: Float32Array;
let particleLife: Float32Array;
const PCOUNT = 60;

let currentScale = 1.0;
let velocity = 0;
let lastSnapFrame = 0;
let snapFlash = 0;
let rotationBoost = 0;

function init(canvas: OffscreenCanvas, w: number, h: number): void {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(1);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 10);
  camera.position.z = 2.5;

  scene.add(new THREE.AmbientLight(0x333333, 0.3));
  const l1 = new THREE.PointLight(0x0088ff, 0.6); l1.position.set(2, 2, 2); scene.add(l1);
  const l2 = new THREE.PointLight(0xff00aa, 0.4); l2.position.set(-2, -1, 1); scene.add(l2);

  group = new THREE.Group(); scene.add(group);

  const geo = new THREE.IcosahedronGeometry(0.25, 1);
  solidMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: COLOR_PALETTE[0], emissive: COLOR_PALETTE[0],
    emissiveIntensity: 0.8, roughness: 0.12, metalness: 0.15,
  }));
  group.add(solidMesh);

  const wGeo = new THREE.IcosahedronGeometry(0.27, 1);
  group.add(new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({
    color: '#ffffff', wireframe: true, transparent: true, opacity: 0.25,
  })));

  const gGeo = new THREE.IcosahedronGeometry(0.32, 1);
  glowMesh = new THREE.Mesh(gGeo, new THREE.MeshBasicMaterial({
    color: COLOR_PALETTE[0], transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(glowMesh);

  // Particles
  particlePositions = new Float32Array(PCOUNT * 3);
  particleVelocities = new Float32Array(PCOUNT * 3);
  particleLife = new Float32Array(PCOUNT);
  for (let i = 0; i < PCOUNT; i++) particlePositions[i * 3] = particlePositions[i * 3 + 1] = particlePositions[i * 3 + 2] = 9999;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particlePoints = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.04, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
  }));
  group.add(particlePoints);

  requestAnimationFrame(loop);
}

function readPalm(hi: 0 | 1): [number, number, number] | null {
  const base = hi === 0 ? OFF.HAND0_X : OFF.HAND1_X;
  const x0 = f32[base], y0 = f32[base + 1];
  if (isNaN(x0)) return null;
  return [
    (x0 + f32[base + 9*3] + f32[base + 17*3]) / 3,
    (y0 + f32[base + 9*3+1] + f32[base + 17*3+1]) / 3,
    (f32[base + 2] + f32[base + 9*3+2] + f32[base + 17*3+2]) / 3,
  ];
}

function spawnParticles(): void {
  const wp = new THREE.Vector3(); group.getWorldPosition(wp);
  for (let i = 0; i < PCOUNT; i++) {
    particlePositions[i * 3] = wp.x; particlePositions[i * 3 + 1] = wp.y; particlePositions[i * 3 + 2] = wp.z;
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI, sp = 1.5 + Math.random() * 2.5;
    particleVelocities[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
    particleVelocities[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp;
    particleVelocities[i * 3 + 2] = Math.cos(ph) * sp;
    particleLife[i] = 0.6 + Math.random() * 0.8;
  }
}

function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, 1 / 60);
  if (!i32 || !f32 || i32[OFF.MAGIC] !== SAB_MAGIC) return;

  const snapT = i32[OFF.SNAP_TRIGGERED];
  const pinching = i32[OFF.IS_PINCHING] === 1;
  const cIdx = i32[OFF.COLOR_INDEX];

  if (snapT !== lastSnapFrame) { lastSnapFrame = snapT; snapFlash = 1.0; rotationBoost = 5.0; spawnParticles(); }
  snapFlash = Math.max(0, snapFlash - dt * 2.5);
  rotationBoost = Math.max(0, rotationBoost - dt * 4);

  if (i32[OFF.IS_TRACKING]) {
    const palm = readPalm(0);
    if (palm) group.position.lerp(new THREE.Vector3(((1 - palm[0]) - 0.5) * 4.0, (0.5 - palm[1]) * 3.5, 0), 0.15);
  }

  const targetScale = pinching ? 1.0 + (1 - Math.min(1, f32[OFF.PINCH_DISTANCE] / 0.15)) * 2.5 : 1.0;
  velocity += (targetScale - currentScale) * SPRING_STIFFNESS * dt;
  velocity *= SPRING_DAMPING;
  currentScale += velocity * dt;
  if (!pinching && Math.abs(currentScale - 1.0) < 0.01 && Math.abs(velocity) < 0.01) { currentScale = 1.0; velocity = 0; }
  group.scale.setScalar(currentScale);

  group.rotation.y += dt * (0.8 + rotationBoost);
  group.rotation.z += dt * 0.3;

  const color = COLOR_PALETTE[cIdx % COLOR_PALETTE.length];
  const mat = solidMesh.material as THREE.MeshStandardMaterial;
  mat.color.set(color); mat.emissive.set(color);
  let intensity = 0.8;
  if (pinching) intensity += Math.sin(performance.now() * 0.012) * 0.3;
  intensity += snapFlash * 2.5;
  mat.emissiveIntensity = intensity;

  (glowMesh.material as THREE.MeshBasicMaterial).color.set(color);
  (glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.08 + snapFlash * 0.35 + (pinching ? 0.05 : 0);

  const pAttr = particlePoints.geometry.attributes.position;
  for (let i = 0; i < PCOUNT; i++) {
    if (particleLife[i] <= 0) { particlePositions[i * 3] = particlePositions[i * 3 + 1] = particlePositions[i * 3 + 2] = 9999; continue; }
    particleLife[i] -= dt;
    particleVelocities[i * 3] *= 0.96; particleVelocities[i * 3 + 1] *= 0.96; particleVelocities[i * 3 + 2] *= 0.96;
    particlePositions[i * 3] += particleVelocities[i * 3] * dt;
    particlePositions[i * 3 + 1] += particleVelocities[i * 3 + 1] * dt;
    particlePositions[i * 3 + 2] += particleVelocities[i * 3 + 2] * dt;
  }
  pAttr.needsUpdate = true;

  renderer.render(scene, camera);
}

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'init') {
    sab = e.data.sab; const v = getViews(sab); i32 = v.i32; f32 = v.f32;
    init(e.data.canvas, e.data.width, e.data.height);
  } else if (e.data.type === 'resize' && renderer) {
    renderer.setSize(e.data.width, e.data.height, false);
    camera.aspect = e.data.width / e.data.height; camera.updateProjectionMatrix();
  }
};
