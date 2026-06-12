// Render Worker: Three.js + OffscreenCanvas — GPU hand mesh + polyhedron
import * as THREE from 'three';
import { OFF, SAB_MAGIC, getViews } from '../shared/sab-layout';
import { COLOR_PALETTE, SPRING_STIFFNESS, SPRING_DAMPING } from '../shared/constants';
import { HAND_MESH_TRIANGLES } from '../utils/landmarks';

// ── Constants ──
const HAND_LM = 21;
const TRI_COUNT = HAND_MESH_TRIANGLES.length;
const MAX_SPARKS = 400;
const PCOUNT = 60;
const RING_SEG = 20;

// Hand outer contour: wrist → pinky → ring → middle → index → thumb → back to wrist
const HAND_CONTOUR = [0, 17, 18, 19, 20, 16, 12, 8, 4, 3, 2, 1, 0];
const CONTOUR_SEG = HAND_CONTOUR.length - 1;

// ── State ──
let sab: SharedArrayBuffer;
let i32: Int32Array;
let f32: Float32Array;
let renderer: THREE.WebGLRenderer;
let scene3D: THREE.Scene;
let sceneOverlay: THREE.Scene;
let cam3D: THREE.PerspectiveCamera;
let camOverlay: THREE.OrthographicCamera;
let group: THREE.Group;
let solidMesh: THREE.Mesh;
let glowMesh: THREE.Mesh;
let polyParticles: THREE.Points;
let polyPositions: Float32Array;
let polyVelocities: Float32Array;
let polyLife: Float32Array;

// Hand mesh GPU objects
interface HandGpu {
  fillGeo: THREE.BufferGeometry;
  fillMesh: THREE.Mesh;
  wireGeo: THREE.BufferGeometry;
  wireLines: THREE.LineSegments;
  normalGeo: THREE.BufferGeometry;
  normalLines: THREE.LineSegments;
  contourGeo: THREE.BufferGeometry;
  contourLines: THREE.LineSegments;
  contourGlow: THREE.LineSegments;
  trackRing: THREE.Points;
}

let hand0: HandGpu;
let hand1: HandGpu;
let sparkGeo: THREE.BufferGeometry;
let sparkPoints: THREE.Points;

// Precomputed unique edges
let UNIQUE_EDGES: [number, number][] = [];
const EDGE_COUNT = 38;

function buildUniqueEdges(): void {
  const set = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of HAND_MESH_TRIANGLES) {
    for (const [e1, e2] of [[a,b],[b,c],[c,a]]) {
      const key = Math.min(e1,e2)+'_'+Math.max(e1,e2);
      if (set.has(key)) continue;
      set.add(key);
      edges.push([e1, e2]);
    }
  }
}

// Spark CPU state
interface SparkCpu {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
}
const sparks: SparkCpu[] = [];
const sparkPosBuf = new Float32Array(MAX_SPARKS * 3);
let sparkTimer = 0;
let lastSnapS = 0;

function spawnSparks(x: number, y: number, count: number): void {
  for (let i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 0.3 + Math.random() * 1.5;
    sparks.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - Math.random() * 0.5,
      life: 0.3 + Math.random() * 0.7,
      maxLife: 0.3 + Math.random() * 0.7,
    });
  }
}

// ── Coordinate helpers ──
function lmToOverlay(lx: number, ly: number): [number, number] {
  return [(1 - lx) - 0.5, ly - 0.5];
}

function readHandPts(hi: 0 | 1): [number, number][] | null {
  const base = hi === 0 ? OFF.HAND0_X : OFF.HAND1_X;
  if (isNaN(f32[base])) return null;
  const pts: [number, number][] = [];
  for (let i = 0; i < HAND_LM; i++) {
    pts.push(lmToOverlay(f32[base + i * 3], f32[base + i * 3 + 1]));
  }
  return pts;
}

// Also read 3D landmarks (with z) for wrist ring orientation
function readHandPts3D(hi: 0 | 1): [number, number, number][] | null {
  const base = hi === 0 ? OFF.HAND0_X : OFF.HAND1_X;
  if (isNaN(f32[base])) return null;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < HAND_LM; i++) {
    const lx = f32[base + i * 3];
    const ly = f32[base + i * 3 + 1];
    const lz = f32[base + i * 3 + 2];
    pts.push([(1 - lx) - 0.5, ly - 0.5, lz]);
  }
  return pts;
}

// ── GPU geometry builders ──
function createHandGpu(): HandGpu {
  // Triangle fills — more visible for hand cutout effect
  const fillGeo = new THREE.BufferGeometry();
  const fillVerts = new Float32Array(TRI_COUNT * 9);
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fillVerts, 3));
  fillGeo.setIndex(Array.from({length: TRI_COUNT * 3}, (_, i) => i));
  const fillMesh = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({
    color: '#00e5ff', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  }));

  // Wireframe edges
  const wireGeo = new THREE.BufferGeometry();
  const wireVerts = new Float32Array(EDGE_COUNT * 6);
  const wireColors = new Float32Array(EDGE_COUNT * 6);
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wireVerts, 3));
  wireGeo.setAttribute('color', new THREE.BufferAttribute(wireColors, 3));
  const wireLines = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({
    vertexColors: true, linewidth: 1, transparent: true, opacity: 1.0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));

  // Face normals
  const normalGeo = new THREE.BufferGeometry();
  const normalVerts = new Float32Array(TRI_COUNT * 6);
  normalGeo.setAttribute('position', new THREE.BufferAttribute(normalVerts, 3));
  const normalLines = new THREE.LineSegments(normalGeo, new THREE.LineBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.5, depthTest: false, depthWrite: false,
  }));

  // Hand contour outline — thick glowing silhouette
  const contourGeo = new THREE.BufferGeometry();
  const contourVerts = new Float32Array(CONTOUR_SEG * 6);
  contourGeo.setAttribute('position', new THREE.BufferAttribute(contourVerts, 3));
  const contourLines = new THREE.LineSegments(contourGeo, new THREE.LineBasicMaterial({
    color: '#ffffff', linewidth: 1, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  // Glow pass (wider-looking via brighter color + additive)
  const contourGlowGeo = new THREE.BufferGeometry();
  const contourGlowVerts = new Float32Array(CONTOUR_SEG * 6);
  contourGlowGeo.setAttribute('position', new THREE.BufferAttribute(contourGlowVerts, 3));
  const contourGlow = new THREE.LineSegments(contourGlowGeo, new THREE.LineBasicMaterial({
    color: '#88ccff', linewidth: 1, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));

  // Wrist tracking ring — larger, brighter
  const ringGeo = new THREE.BufferGeometry();
  const ringVerts = new Float32Array(RING_SEG * 3);
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringVerts, 3));
  const trackRing = new THREE.Points(ringGeo, new THREE.PointsMaterial({
    color: '#00ff88', size: 0.06, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  }));

  return { fillGeo, fillMesh, wireGeo, wireLines, normalGeo, normalLines, contourGeo, contourLines, contourGlow, trackRing };
}

// ── Update hand mesh from SAB ──
function updateHandGpu(h: HandGpu, pts: [number, number][], pts3D: [number, number, number][]): void {
  // Triangle fills
  const fv = h.fillGeo.attributes.position.array as Float32Array;
  for (let t = 0; t < TRI_COUNT; t++) {
    const [a, b, c] = HAND_MESH_TRIANGLES[t];
    fv[t * 9] = pts[a][0]; fv[t * 9 + 1] = pts[a][1]; fv[t * 9 + 2] = 0;
    fv[t * 9 + 3] = pts[b][0]; fv[t * 9 + 4] = pts[b][1]; fv[t * 9 + 5] = 0;
    fv[t * 9 + 6] = pts[c][0]; fv[t * 9 + 7] = pts[c][1]; fv[t * 9 + 8] = 0;
  }
  h.fillGeo.attributes.position.needsUpdate = true;

  // Wireframe edges
  const wv = h.wireGeo.attributes.position.array as Float32Array;
  const wc = h.wireGeo.attributes.color.array as Float32Array;
  for (let e = 0; e < UNIQUE_EDGES.length; e++) {
    const [a, b] = UNIQUE_EDGES[e];
    wv[e * 6] = pts[a][0]; wv[e * 6 + 1] = pts[a][1]; wv[e * 6 + 2] = 0;
    wv[e * 6 + 3] = pts[b][0]; wv[e * 6 + 4] = pts[b][1]; wv[e * 6 + 5] = 0;
  }
  h.wireGeo.attributes.position.needsUpdate = true;
  h.wireGeo.attributes.color.needsUpdate = true;

  // Face normals
  const nv = h.normalGeo.attributes.position.array as Float32Array;
  for (let t = 0; t < TRI_COUNT; t++) {
    const [a, b, c] = HAND_MESH_TRIANGLES[t];
    const [ax, ay] = pts[a]; const [bx, by] = pts[b]; const [cx, cy] = pts[c];
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3;
    const abx = bx - ax, aby = by - ay;
    const cross = abx * (cy - ay) - aby * (cx - ax);
    const sign = cross >= 0 ? 1 : -1;
    const len = Math.hypot(-aby, abx);
    const nl = 0.025;
    const nx = len > 0.0001 ? (-aby / len) * sign * nl : 0;
    const ny = len > 0.0001 ? (abx / len) * sign * nl : 0;
    nv[t * 6] = mx; nv[t * 6 + 1] = my; nv[t * 6 + 2] = 0;
    nv[t * 6 + 3] = mx + nx; nv[t * 6 + 4] = my + ny; nv[t * 6 + 5] = 0;
  }
  h.normalGeo.attributes.position.needsUpdate = true;

  // Hand contour
  const cv = h.contourGeo.attributes.position.array as Float32Array;
  const cgv = h.contourGlow.geometry.attributes.position.array as Float32Array;
  for (let s = 0; s < CONTOUR_SEG; s++) {
    const a = HAND_CONTOUR[s], b = HAND_CONTOUR[s + 1];
    cv[s * 6] = pts[a][0]; cv[s * 6 + 1] = pts[a][1]; cv[s * 6 + 2] = 0;
    cv[s * 6 + 3] = pts[b][0]; cv[s * 6 + 4] = pts[b][1]; cv[s * 6 + 5] = 0;
    cgv[s * 6] = pts[a][0]; cgv[s * 6 + 1] = pts[a][1]; cgv[s * 6 + 2] = 0;
    cgv[s * 6 + 3] = pts[b][0]; cgv[s * 6 + 4] = pts[b][1]; cgv[s * 6 + 5] = 0;
  }
  h.contourGeo.attributes.position.needsUpdate = true;
  h.contourGlow.geometry.attributes.position.needsUpdate = true;

  // Wrist ring — compute 3D-oriented circle from wrist + palm plane
  const rv = h.trackRing.geometry.attributes.position.array as Float32Array;
  const [wx, wy, wz] = pts3D[0];
  // Palm normal from wrist→index and wrist→pinky
  const ix = pts3D[5][0] - wx, iy = pts3D[5][1] - wy, iz = pts3D[5][2] - wz;
  const px = pts3D[17][0] - wx, py = pts3D[17][1] - wy, pz = pts3D[17][2] - wz;
  const nx = iy * pz - iz * py;
  const ny = iz * px - ix * pz;
  const nz = ix * py - iy * px;
  const nl = Math.hypot(nx, ny, nz) || 1;
  // Two perpendicular vectors in the palm plane
  const ux = ix, uy = iy, uz = iz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const vx = (ny * uz - nz * uy) / (nl * ul);
  const vy = (nz * ux - nx * uz) / (nl * ul);
  const vz = (nx * uy - ny * ux) / (nl * ul);
  const radius = 0.06;
  for (let s = 0; s < RING_SEG; s++) {
    const a = (s / RING_SEG) * Math.PI * 2;
    rv[s * 3] = wx + (ux / ul * Math.cos(a) + vx * Math.sin(a)) * radius;
    rv[s * 3 + 1] = wy + (uy / ul * Math.cos(a) + vy * Math.sin(a)) * radius;
    rv[s * 3 + 2] = wz + (uz / ul * Math.cos(a) + vz * Math.sin(a)) * radius;
  }
  h.trackRing.geometry.attributes.position.needsUpdate = true;
}

function hideHandGpu(h: HandGpu): void {
  const big = 999;
  for (const geo of [h.fillGeo, h.normalGeo, h.contourGeo, h.contourGlow.geometry]) {
    const arr = geo.attributes.position.array as Float32Array;
    arr.fill(big);
    geo.attributes.position.needsUpdate = true;
  }
  const wv = h.wireGeo.attributes.position.array as Float32Array;
  wv.fill(big);
  h.wireGeo.attributes.position.needsUpdate = true;
  const rv = h.trackRing.geometry.attributes.position.array as Float32Array;
  rv.fill(big);
  h.trackRing.geometry.attributes.position.needsUpdate = true;
}

// ── Init ──
function init(canvas: OffscreenCanvas, w: number, h: number): void {
  buildUniqueEdges();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(1);
  renderer.autoClear = false;

  // 3D scene (polyhedron)
  scene3D = new THREE.Scene();
  cam3D = new THREE.PerspectiveCamera(60, w / h, 0.1, 10);
  cam3D.position.z = 2.5;

  scene3D.add(new THREE.AmbientLight(0x333333, 0.3));
  const l1 = new THREE.PointLight(0x0088ff, 0.6); l1.position.set(2, 2, 2); scene3D.add(l1);
  const l2 = new THREE.PointLight(0xff00aa, 0.4); l2.position.set(-2, -1, 1); scene3D.add(l2);

  group = new THREE.Group(); scene3D.add(group);

  // Semi-transparent polyhedron
  const geo = new THREE.IcosahedronGeometry(0.25, 1);
  solidMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: COLOR_PALETTE[0], emissive: COLOR_PALETTE[0],
    emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.1,
    transparent: true, opacity: 0.65,
  }));
  group.add(solidMesh);

  const wGeo = new THREE.IcosahedronGeometry(0.27, 1);
  group.add(new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({
    color: '#ffffff', wireframe: true, transparent: true, opacity: 0.2,
  })));

  const gGeo = new THREE.IcosahedronGeometry(0.32, 1);
  glowMesh = new THREE.Mesh(gGeo, new THREE.MeshBasicMaterial({
    color: COLOR_PALETTE[0], transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(glowMesh);

  polyPositions = new Float32Array(PCOUNT * 3);
  polyVelocities = new Float32Array(PCOUNT * 3);
  polyLife = new Float32Array(PCOUNT);
  for (let i = 0; i < PCOUNT; i++) polyPositions[i * 3] = polyPositions[i * 3 + 1] = polyPositions[i * 3 + 2] = 9999;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(polyPositions, 3));
  polyParticles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.04, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
  }));
  group.add(polyParticles);

  // Overlay scene (hand mesh 2D)
  sceneOverlay = new THREE.Scene();
  camOverlay = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);

  hand0 = createHandGpu();
  hand1 = createHandGpu();
  for (const h of [hand0, hand1]) {
    sceneOverlay.add(h.fillMesh, h.wireLines, h.normalLines, h.contourLines, h.contourGlow, h.trackRing);
  }

  // Spark particles
  sparkGeo = new THREE.BufferGeometry();
  sparkPosBuf.fill(999);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPosBuf, 3));
  sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 0.03, color: '#ffffff', blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  }));
  sceneOverlay.add(sparkPoints);

  requestAnimationFrame(loop);
}

// ── Neon color update ──
function updateNeonColors(h: HandGpu, baseHue: number, t: number): void {
  const wc = h.wireGeo.attributes.color.array as Float32Array;
  const c = new THREE.Color();
  for (let e = 0; e < UNIQUE_EDGES.length; e++) {
    const hue = (baseHue + e * 8 + Math.sin(t * 3 + e) * 15) % 360;
    c.setHSL(hue / 360, 1, 0.65);
    wc[e * 6] = c.r; wc[e * 6 + 1] = c.g; wc[e * 6 + 2] = c.b;
    wc[e * 6 + 3] = c.r; wc[e * 6 + 4] = c.g; wc[e * 6 + 5] = c.b;
  }
  h.wireGeo.attributes.color.needsUpdate = true;

  const mat = h.fillMesh.material as THREE.MeshBasicMaterial;
  c.setHSL(baseHue / 360, 1, 0.6);
  mat.color.set(c);
}

let currentScale = 1.0;
let velocity = 0;
let lastSnapFlash = 0;
let snapFlash = 0;
let rotationBoost = 0;

function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, 1 / 60);
  if (!i32 || !f32 || i32[OFF.MAGIC] !== SAB_MAGIC) { renderer.render(scene3D, cam3D); return; }

  const now = performance.now();
  const t = now * 0.001;
  const snapT = i32[OFF.SNAP_TRIGGERED];
  const pinching = i32[OFF.IS_PINCHING] === 1;
  const cIdx = i32[OFF.COLOR_INDEX];

  if (snapT !== lastSnapS) { lastSnapS = snapT; snapFlash = 1.0; rotationBoost = 5.0; spawnPolyParticles(); }
  snapFlash = Math.max(0, snapFlash - dt * 2.5);
  rotationBoost = Math.max(0, rotationBoost - dt * 4);

  // ── 3D polyhedron ──
  if (i32[OFF.IS_TRACKING]) {
    let palm = readPalm(0);
    if (!palm) palm = readPalm(1);
    if (palm) group.position.set(((1 - palm[0]) - 0.5) * 4.0, (0.5 - palm[1]) * 3.5, 0);
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
  if (pinching) intensity += Math.sin(t * 7) * 0.3;
  intensity += snapFlash * 2.5;
  mat.emissiveIntensity = intensity;
  mat.opacity = 0.5 + snapFlash * 0.35 + (pinching ? 0.1 : 0.15);
  (glowMesh.material as THREE.MeshBasicMaterial).color.set(color);
  (glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.12 + snapFlash * 0.4 + (pinching ? 0.08 : 0);

  // Polyhedron particles
  const pAttr = polyParticles.geometry.attributes.position;
  for (let i = 0; i < PCOUNT; i++) {
    if (polyLife[i] <= 0) { polyPositions[i * 3] = 9999; polyPositions[i * 3 + 1] = 9999; polyPositions[i * 3 + 2] = 9999; continue; }
    polyLife[i] -= dt;
    polyVelocities[i * 3] *= 0.96; polyVelocities[i * 3 + 1] *= 0.96; polyVelocities[i * 3 + 2] *= 0.96;
    polyPositions[i * 3] += polyVelocities[i * 3] * dt;
    polyPositions[i * 3 + 1] += polyVelocities[i * 3 + 1] * dt;
    polyPositions[i * 3 + 2] += polyVelocities[i * 3 + 2] * dt;
  }
  pAttr.needsUpdate = true;

  // ── Hand mesh overlay (GPU) ──
  const hueBase = (t * 50) % 360;

  for (let hi = 0; hi < 2; hi++) {
    const h = hi === 0 ? hand0 : hand1;
    const pts = readHandPts(hi as 0 | 1);
    const pts3D = readHandPts3D(hi as 0 | 1);
    if (pts && pts3D) {
      updateHandGpu(h, pts, pts3D);
      updateNeonColors(h, (hueBase + hi * 180) % 360, t);
      h.fillMesh.visible = true;
      h.wireLines.visible = true;
      h.normalLines.visible = true;
      h.contourLines.visible = true;
      h.contourGlow.visible = true;
      h.trackRing.visible = true;

      // Pulse tracking ring
      const ringMat = h.trackRing.material as THREE.PointsMaterial;
      ringMat.size = 0.05 + Math.sin(t * 6) * 0.015;
      const pulse = 0.5 + Math.sin(t * 6) * 0.5;
      ringMat.color.setRGB(0, 0.6 + pulse * 0.4, pulse * 0.8);

      // Sparks from right hand
      if (hi === 1) {
        if (snapT !== lastSnapFlash) {
          lastSnapFlash = snapT;
          const cx = (pts[4][0] + pts[12][0]) / 2;
          const cy = (pts[4][1] + pts[12][1]) / 2;
          for (let i = 0; i < 60; i++) spawnSparks(cx, cy, 1);
        }
        if (pinching) {
          sparkTimer += dt;
          if (sparkTimer > 0.03) {
            sparkTimer = 0;
            const cx = (pts[4][0] + pts[8][0]) / 2;
            const cy = (pts[4][1] + pts[8][1]) / 2;
            spawnSparks(cx, cy, 3);
          }
        }
      }
    } else {
      hideHandGpu(h);
    }
  }

  // Update spark GPU buffer
  for (let i = 0; i < MAX_SPARKS; i++) {
    if (i < sparks.length) {
      const s = sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 0.3 * dt;
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); i--; continue; }
      sparkPosBuf[i * 3] = s.x;
      sparkPosBuf[i * 3 + 1] = s.y;
      sparkPosBuf[i * 3 + 2] = 0;
    } else {
      sparkPosBuf[i * 3] = 999;
      sparkPosBuf[i * 3 + 1] = 999;
      sparkPosBuf[i * 3 + 2] = 999;
    }
  }
  sparkGeo.attributes.position.needsUpdate = true;

  // ── Render ──
  renderer.clear();
  renderer.render(scene3D, cam3D);
  renderer.clearDepth();
  renderer.render(sceneOverlay, camOverlay);
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

function spawnPolyParticles(): void {
  const wp = new THREE.Vector3(); group.getWorldPosition(wp);
  for (let i = 0; i < PCOUNT; i++) {
    polyPositions[i * 3] = wp.x; polyPositions[i * 3 + 1] = wp.y; polyPositions[i * 3 + 2] = wp.z;
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI, sp = 1.5 + Math.random() * 2.5;
    polyVelocities[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
    polyVelocities[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp;
    polyVelocities[i * 3 + 2] = Math.cos(ph) * sp;
    polyLife[i] = 0.6 + Math.random() * 0.8;
  }
}

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'init') {
    sab = e.data.sab; const v = getViews(sab); i32 = v.i32; f32 = v.f32;
    init(e.data.canvas, e.data.width, e.data.height);
  } else if (e.data.type === 'resize' && renderer) {
    renderer.setSize(e.data.width, e.data.height, false);
    cam3D.aspect = e.data.width / e.data.height; cam3D.updateProjectionMatrix();
    camOverlay.right = 0.5 * e.data.width / e.data.height;
    camOverlay.left = -camOverlay.right;
    camOverlay.updateProjectionMatrix();
  }
};
