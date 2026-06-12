import { create } from 'zustand';
import type { Landmark } from '../utils/landmarks';

interface HandData {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right' | null;
  confidence: number;
}

export const COLOR_PALETTE = [
  '#00d4ff', // 青蓝
  '#ff00aa', // 亮粉
  '#00ff88', // 霓虹绿
  '#ffaa00', // 金色
  '#aa00ff', // 紫色
  '#ff3366', // 玫红
  '#00ffff', // 荧光青
  '#ff6600', // 橙色
] as const;

interface HandState {
  leftHand: HandData | null;
  rightHand: HandData | null;
  pinchDistance: number;
  isPinching: boolean;
  isTracking: boolean;
  colorIndex: number;
  snapTriggered: number; // timestamp of last snap
  setLeftHand: (data: HandData | null) => void;
  setRightHand: (data: HandData | null) => void;
  setPinchDistance: (d: number) => void;
  setIsPinching: (p: boolean) => void;
  setIsTracking: (t: boolean) => void;
  setColorIndex: (i: number) => void;
  triggerSnap: () => void;
}

export const useHandStore = create<HandState>((set) => ({
  leftHand: null,
  rightHand: null,
  pinchDistance: 0,
  isPinching: false,
  isTracking: false,
  colorIndex: 0,
  snapTriggered: 0,
  setLeftHand: (data) => set({ leftHand: data }),
  setRightHand: (data) => set({ rightHand: data }),
  setPinchDistance: (d) => set({ pinchDistance: d }),
  setIsPinching: (p) => set({ isPinching: p }),
  setIsTracking: (t) => set({ isTracking: t }),
  setColorIndex: (i) => set({ colorIndex: i }),
  triggerSnap: () => set({ snapTriggered: performance.now() }),
}));
