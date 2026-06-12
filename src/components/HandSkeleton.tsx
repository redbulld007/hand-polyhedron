import { useEffect, useRef } from 'react';
import { OFF, getViews } from '../shared/sab-layout';
import { HAND_CONNECTIONS } from '../utils/landmarks';

const LANDMARK_COLOR = '#00ff88';
const CONNECTION_COLOR = '#00ff8866';
const POINT_RADIUS = 4;

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

    function draw() {
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

      if (fid !== lastFrame) {
        lastFrame = fid;
        const toScreen = (lx: number, ly: number): [number, number] => [(1 - lx) * w, ly * h];

        for (let hi = 0; hi < 2; hi++) {
          const base = hi === 0 ? OFF.HAND0_X : OFF.HAND1_X;
          if (isNaN(f32[base])) continue;

          ctx!.strokeStyle = CONNECTION_COLOR;
          ctx!.lineWidth = 2;
          ctx!.lineCap = 'round';
          for (const [a, b] of HAND_CONNECTIONS) {
            const [ax, ay] = toScreen(f32[base + a * 3], f32[base + a * 3 + 1]);
            const [bx, by] = toScreen(f32[base + b * 3], f32[base + b * 3 + 1]);
            ctx!.beginPath(); ctx!.moveTo(ax, ay); ctx!.lineTo(bx, by); ctx!.stroke();
          }
          for (let i = 0; i < 21; i++) {
            const [px, py] = toScreen(f32[base + i * 3], f32[base + i * 3 + 1]);
            ctx!.fillStyle = i === 0 ? '#ffcc00' : LANDMARK_COLOR;
            ctx!.shadowColor = LANDMARK_COLOR; ctx!.shadowBlur = 6;
            ctx!.beginPath(); ctx!.arc(px, py, POINT_RADIUS, 0, Math.PI * 2); ctx!.fill();
            ctx!.shadowBlur = 0;
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [sab]);

  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }} />;
}
