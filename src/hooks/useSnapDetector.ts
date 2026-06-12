import { useCallback, useRef } from 'react';
import { useHandStore } from '../store/handStore';
import type { Landmark } from '../utils/landmarks';
import { getSnapDistance } from '../utils/landmarks';

/**
 * 检测右手打响指手势
 * 逻辑：中指尖快速靠近拇指 → 快速远离
 */
export function useSnapDetector() {
  const historyRef = useRef<number[]>([]);
  const lastSnapRef = useRef(0);
  const { setColorIndex, triggerSnap } = useHandStore();

  const detect = useCallback((landmarks: Landmark[]) => {
    const dist = getSnapDistance(landmarks);
    const history = historyRef.current;
    history.push(dist);
    if (history.length > 10) history.shift();
    if (history.length < 6) return;

    const now = performance.now();
    if (now - lastSnapRef.current < 800) return;

    const mid = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, mid);
    const secondHalf = history.slice(mid);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const range = Math.max(...history) - Math.min(...history);
    const minDist = Math.min(...history);

    if (range > 0.08 && secondAvg > firstAvg && minDist < 0.06) {
      lastSnapRef.current = now;
      triggerSnap();
      const next = (useHandStore.getState().colorIndex + 1) % 8;
      setColorIndex(next);
    }
  }, [setColorIndex, triggerSnap]);

  return { detect };
}
