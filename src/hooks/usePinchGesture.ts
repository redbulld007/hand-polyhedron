import { useEffect, useRef } from 'react';
import { useHandStore } from '../store/handStore';

/**
 * 捏合手势 → 弹性缩放
 * 捏合距离越小 → 缩放越大，带弹簧物理
 */
export function usePinchGesture() {
  const { pinchDistance, isPinching } = useHandStore();
  const targetScaleRef = useRef(1.0);
  // 弹簧状态：velocity 和 scale 在 GlowingPolyhedron 的 useFrame 中更新
  const springRef = useRef({ velocity: 0 });

  useEffect(() => {
    if (!isPinching) {
      return;
    }
    // 扩大范围：pinch 0.015(紧捏) → scale 3.5, pinch 0.18(松开) → scale 0.2
    const minDist = 0.015;
    const maxDist = 0.18;
    const clamped = Math.max(minDist, Math.min(maxDist, pinchDistance));
    const t = (clamped - minDist) / (maxDist - minDist);
    targetScaleRef.current = 0.2 + (1 - t) * 3.3;
  }, [pinchDistance, isPinching]);

  return { targetScaleRef, springRef };
}
