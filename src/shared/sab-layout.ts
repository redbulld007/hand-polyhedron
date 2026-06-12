// SharedArrayBuffer layout — 零拷贝主线程/Worker通信

export const SAB_MAGIC = 0x48414e44; // "HAND"
export const SAB_SIZE = 1024; // 1KB

export const OFF = {
  MAGIC: 0,
  FRAME_ID: 1,
  IS_TRACKING: 2,
  NUM_HANDS: 3,
  HAND0_X: 5,
  HAND1_X: 68,
  HAND0_HANDEDNESS: 131,
  HAND0_CONFIDENCE: 132,
  HAND1_HANDEDNESS: 133,
  HAND1_CONFIDENCE: 134,
  PINCH_DISTANCE: 135,
  IS_PINCHING: 136,
  SNAP_TRIGGERED: 137,
  COLOR_INDEX: 138,
  LIGHTING_SCORE: 139,
} as const;

export function createSAB(): SharedArrayBuffer {
  return new SharedArrayBuffer(SAB_SIZE);
}

export function getViews(sab: SharedArrayBuffer) {
  return {
    i32: new Int32Array(sab),
    f32: new Float32Array(sab),
  };
}
