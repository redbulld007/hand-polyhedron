// 手部关键点计算工具

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

// MediaPipe 手部关键点索引
export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

/** 计算掌心位置（手腕 + 中指根部 + 小指根部 的平均） */
export function getPalmCenter(landmarks: Landmark[]): Landmark {
  const wrist = landmarks[LANDMARK.WRIST];
  const middleMcp = landmarks[LANDMARK.MIDDLE_MCP];
  const pinkyMcp = landmarks[LANDMARK.PINKY_MCP];
  return {
    x: (wrist.x + middleMcp.x + pinkyMcp.x) / 3,
    y: (wrist.y + middleMcp.y + pinkyMcp.y) / 3,
    z: (wrist.z + middleMcp.z + pinkyMcp.z) / 3,
  };
}

/** 计算捏合距离：拇指尖到食指尖的 3D 欧氏距离 */
export function getPinchDistance(landmarks: Landmark[]): number {
  const thumb = landmarks[LANDMARK.THUMB_TIP];
  const index = landmarks[LANDMARK.INDEX_TIP];
  return Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z);
}

/** 判定是否处于捏合状态 */
export function isPinching(landmarks: Landmark[], threshold = 0.06): boolean {
  return getPinchDistance(landmarks) < threshold;
}

/** 根据手腕 x 坐标判断左右手 */
export function isLeftHand(wristX: number): boolean {
  return wristX > 0.5;
}

/** 手部骨骼连线（21个关键点之间的连接） */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

/** 计算打响指距离：中指尖(12)到拇指尖(4)的距离 */
export function getSnapDistance(landmarks: Landmark[]): number {
  const middle = landmarks[LANDMARK.MIDDLE_TIP];
  const thumb = landmarks[LANDMARK.THUMB_TIP];
  return Math.hypot(middle.x - thumb.x, middle.y - thumb.y, middle.z - thumb.z);
}

/** 手部三角网格面定义 - 用于建模线风格渲染 */
export const HAND_MESH_TRIANGLES: [number, number, number][] = [
  // Palm
  [0, 1, 5],   [0, 5, 9],   [0, 9, 13],   [0, 13, 17],
  [1, 2, 5],   [2, 5, 9],
  [5, 9, 6],   [9, 13, 10],  [13, 17, 14],
  [5, 6, 9],   [9, 10, 13],  [13, 14, 17],
  // Thumb
  [1, 2, 3],   [2, 3, 4],
  // Index
  [5, 6, 7],   [6, 7, 8],
  // Middle
  [9, 10, 11], [10, 11, 12],
  // Ring
  [13, 14, 15], [14, 15, 16],
  // Pinky
  [17, 18, 19], [18, 19, 20],
];
