import { useEffect, useRef } from 'react';
import { OFF, getViews } from '../shared/sab-layout';
import { HAND_MESH_TRIANGLES } from '../utils/landmarks';

const FILL_ALPHA = 0.08;
const PALM_ALPHA = 0.12;

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

export function HandSkeleton({ sab }: { sab: SharedArrayBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { f32, i32 } = getViews(sab);
    let raf = 0;
    let lastFrame = 0;
    let lastSnapFrame = 0;
    const sparks: Spark[] = [];
    let sparkTimer = 0;

    function spawnSparks(x: number, y: number, count: number, color: string): void {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 300;
        sparks.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 100,
          life: 0.3 + Math.random() * 0.7,
          maxLife: 0.3 + Math.random() * 0.7,
          color,
          size: 1.5 + Math.random() * 4,
        });
      }
    }

    function draw() {
      const now = performance.now();
      const fid = i32[OFF.FRAME_ID];
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      if (canvas!.width !== rect.width * dpr || canvas!.height !== rect.height * dpr) {
        canvas!.width = rect.width * dpr;
        canvas!.height = rect.height * dpr;
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, rect.width, rect.height);
      const w = rect.width, h = rect.height;

      const dt = Math.min(0.1, 1 / 60);
      const t = now * 0.001;

      // Detect snap event
      const snapFrame = i32[OFF.SNAP_TRIGGERED];
      const justSnapped = snapFrame !== 0 && snapFrame !== lastSnapFrame;
      if (justSnapped) lastSnapFrame = snapFrame;

      const pinching = i32[OFF.IS_PINCHING] === 1;
      const toScreen = (lx: number, ly: number): [number, number] => [(1 - lx) * w, ly * h];

      if (fid !== lastFrame) {
        lastFrame = fid;

        // Flowing neon color - shifts between cyan and magenta over time
        const hueShift = (t * 60) % 360;

        for (let hi = 0; hi < 2; hi++) {
          const base = hi === 0 ? OFF.HAND0_X : OFF.HAND1_X;
          if (isNaN(f32[base])) continue;

          const pts: [number, number][] = [];
          for (let i = 0; i < 21; i++) {
            pts.push(toScreen(f32[base + i * 3], f32[base + i * 3 + 1]));
          }

          // Each hand gets a different hue offset
          const baseHue = (hueShift + hi * 180) % 360;
          const wireColor = `hsl(${baseHue}, 100%, 65%)`;
          const fillColor = `hsla(${baseHue}, 100%, 65%, ${FILL_ALPHA})`;
          const palmFillColor = `hsla(${(baseHue + 30) % 360}, 100%, 60%, ${PALM_ALPHA})`;

          // Filled mesh triangles
          for (const [a, b, c] of HAND_MESH_TRIANGLES) {
            const [ax, ay] = pts[a];
            const [bx, by] = pts[b];
            const [cx, cy] = pts[c];
            const isPalm = a < 5 || b < 5 || c < 5;
            ctx!.fillStyle = isPalm ? palmFillColor : fillColor;
            ctx!.beginPath();
            ctx!.moveTo(ax, ay);
            ctx!.lineTo(bx, by);
            ctx!.lineTo(cx, cy);
            ctx!.closePath();
            ctx!.fill();
          }

          // Flowing neon wireframe with animated dash pattern
          const edgeSet = new Set<string>();
          const dashOffset = (t * 40 + hi * 20) % 30;
          ctx!.strokeStyle = wireColor;
          ctx!.lineWidth = 1.4;
          ctx!.lineCap = 'round';
          ctx!.lineJoin = 'round';
          ctx!.shadowColor = wireColor;
          ctx!.shadowBlur = 4;
          ctx!.setLineDash([8, 4, 2, 4]);
          ctx!.lineDashOffset = dashOffset;

          for (const [a, b, c] of HAND_MESH_TRIANGLES) {
            for (const [e1, e2] of [[a, b], [b, c], [c, a]]) {
              const key = Math.min(e1, e2) + '_' + Math.max(e1, e2);
              if (edgeSet.has(key)) continue;
              edgeSet.add(key);
              const [ax, ay] = pts[e1];
              const [bx, by] = pts[e2];
              ctx!.beginPath();
              ctx!.moveTo(ax, ay);
              ctx!.lineTo(bx, by);
              ctx!.stroke();
            }
          }
          ctx!.setLineDash([]);
          ctx!.shadowBlur = 0;

          // Face normals — short lines from triangle centroids
          const normalColor = `hsl(${baseHue}, 100%, 80%)`;
          ctx!.strokeStyle = normalColor;
          ctx!.lineWidth = 0.8;
          ctx!.lineCap = 'round';
          ctx!.globalAlpha = 0.6;
          for (const [a, b, c] of HAND_MESH_TRIANGLES) {
            const [ax, ay] = pts[a];
            const [bx, by] = pts[b];
            const [cx, cy] = pts[c];
            // Centroid
            const mx = (ax + bx + cx) / 3;
            const my = (ay + by + cy) / 3;
            // 2D normal: rotate edge AB by 90°
            const abx = bx - ax;
            const aby = by - ay;
            const cross = abx * (cy - ay) - aby * (cx - ax);
            const sign = cross >= 0 ? 1 : -1;
            const len = Math.hypot(-aby, abx);
            if (len < 0.001) continue;
            const nx = (-aby / len) * sign;
            const ny = (abx / len) * sign;
            const nl = 8;
            ctx!.beginPath();
            ctx!.moveTo(mx, my);
            ctx!.lineTo(mx + nx * nl, my + ny * nl);
            ctx!.stroke();
          }
          ctx!.globalAlpha = 1.0;

          // Key joint dots with glow
          ctx!.fillStyle = '#ffffff';
          ctx!.shadowColor = wireColor;
          ctx!.shadowBlur = 6;
          for (const idx of [0, 4, 8, 12, 16, 20]) {
            const [px, py] = pts[idx];
            ctx!.beginPath();
            ctx!.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx!.fill();
          }
          ctx!.shadowBlur = 0;

          // Right hand (hi=1) triggers spark effects
          if (hi === 1) {
            // Snap: large burst
            if (justSnapped) {
              const cx = (pts[4][0] + pts[12][0]) / 2;
              const cy = (pts[4][1] + pts[12][1]) / 2;
              const colors = ['#ff4444', '#ff8800', '#ffdd00', '#ffffff', '#ff6600'];
              for (let i = 0; i < 40; i++) {
                spawnSparks(cx, cy, 1, colors[Math.floor(Math.random() * colors.length)]);
              }
            }

            // Pinch: continuous spark stream
            if (pinching) {
              sparkTimer += dt;
              if (sparkTimer > 0.04) {
                sparkTimer = 0;
                const cx = (pts[4][0] + pts[8][0]) / 2;
                const cy = (pts[4][1] + pts[8][1]) / 2;
                spawnSparks(cx, cy, 2, '#00e5ff');
                spawnSparks(cx, cy, 1, '#ffffff');
              }
            }
          }
        }
      }

      // Update + draw sparks (every frame, not just on new landmark data)
      ctx!.save();
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 120 * dt; // gravity
        s.life -= dt;

        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        const alpha = s.life / s.maxLife;
        const r = s.size * alpha;
        ctx!.globalAlpha = alpha;
        ctx!.fillStyle = s.color;
        ctx!.shadowColor = s.color;
        ctx!.shadowBlur = r * 3;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();

      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [sab]);

  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }} />;
}
