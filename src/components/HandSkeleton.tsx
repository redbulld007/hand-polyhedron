import { useRef, useEffect } from 'react';
import { useHandStore } from '../store/handStore';
import { HAND_CONNECTIONS } from '../utils/landmarks';

const LANDMARK_COLOR = '#00ff88';
const CONNECTION_COLOR = '#00ff8866';
const POINT_RADIUS = 4;
const LINE_WIDTH = 2;

export function HandSkeleton() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { leftHand, rightHand } = useHandStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx = context;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const w = rect.width;
    const h = rect.height;

    function drawHand(ctx: CanvasRenderingContext2D, landmarks: { x: number; y: number }[]) {
      const toScreen = (lx: number, ly: number): [number, number] => [
        (1 - lx) * w,
        ly * h,
      ];

      // 骨骼连线
      ctx.strokeStyle = CONNECTION_COLOR;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      for (const [a, b] of HAND_CONNECTIONS) {
        const [ax, ay] = toScreen(landmarks[a].x, landmarks[a].y);
        const [bx, by] = toScreen(landmarks[b].x, landmarks[b].y);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      // 关键点
      for (let i = 0; i < 21; i++) {
        const [px, py] = toScreen(landmarks[i].x, landmarks[i].y);
        ctx.fillStyle = i === 0 ? '#ffcc00' : LANDMARK_COLOR;
        ctx.shadowColor = LANDMARK_COLOR;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px, py, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    if (leftHand?.landmarks) drawHand(ctx, leftHand.landmarks);
    if (rightHand?.landmarks) drawHand(ctx, rightHand.landmarks);
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 3,
        pointerEvents: 'none',
      }}
    />
  );
}
