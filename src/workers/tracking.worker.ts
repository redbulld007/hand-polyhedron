// Tracking Worker: MediaPipe Hands + Kalman + Occlusion + Gesture
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { OFF, SAB_MAGIC, getViews } from '../shared/sab-layout';
import { PINCH_THRESHOLD, SNAP_COOLDOWN_MS } from '../shared/constants';

let sab: SharedArrayBuffer;
let i32: Int32Array;
let f32: Float32Array;
let recognizer: GestureRecognizer | null = null;
let frameId = 0;

let snapDistHistory: number[] = [];
let lastSnapTime = 0;
let colorIndex = 0;
let lightingCounter = 0;

function pDist(lm: NormalizedLandmark[]): number {
  return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y, lm[4].z - lm[8].z);
}
function sDist(lm: NormalizedLandmark[]): number {
  return Math.hypot(lm[12].x - lm[4].x, lm[12].y - lm[4].y, lm[12].z - lm[4].z);
}

async function initRecognizer(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(
    '/wasm'
  );
  recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/wasm/gesture_recognizer.task',
      delegate: 'GPU',
    },
    numHands: 2,
    runningMode: 'VIDEO',
  });
  console.log('[TrackingWorker] MediaPipe initialized successfully');
}

function processFrame(videoFrame: VideoFrame): void {
  if (!recognizer) return;
  const now = performance.now();
  const results = recognizer.recognizeForVideo(videoFrame, now);
  frameId++;

  if (results.landmarks && results.landmarks.length > 0) {
    let hasL = false, hasR = false;
    let rLm: NormalizedLandmark[] | null = null;

    for (let i = 0; i < results.landmarks.length; i++) {
      const lm = results.landmarks[i];
      const h = results.handedness?.[i]?.[0];
      if (h?.categoryName === 'Left') { hasL = true; writeHand(0, lm, 'Left', now); }
      else if (h?.categoryName === 'Right') { hasR = true; rLm = lm; writeHand(1, lm, 'Right', now); }
    }

    if (!hasL) writeHand(0, null, 'Left', now);
    if (!hasR) writeHand(1, null, 'Right', now);

    i32[OFF.IS_TRACKING] = 1;
    i32[OFF.NUM_HANDS] = (hasL ? 1 : 0) + (hasR ? 1 : 0);

    // Gestures (right hand)
    if (rLm) {
      const pd = pDist(rLm);
      f32[OFF.PINCH_DISTANCE] = pd;
      i32[OFF.IS_PINCHING] = pd < PINCH_THRESHOLD ? 1 : 0;
      detectSnap(rLm, now);
    } else i32[OFF.IS_PINCHING] = 0;

    // Lighting
    if (lightingCounter++ % 30 === 0 && hasL && results.landmarks[0]) {
      const lm = results.landmarks[0];
      let sum = 0;
      for (let i = 0; i < 5; i++) sum += lm[i].y;
      f32[OFF.LIGHTING_SCORE] = Math.min(1, Math.max(0, (sum / 5) * 1.5));
    }
  } else {
    i32[OFF.IS_TRACKING] = 0;
    i32[OFF.NUM_HANDS] = 0;
  }
  i32[OFF.FRAME_ID] = frameId;
}

function writeHand(idx: 0 | 1, lm: NormalizedLandmark[] | null, _handedness: 'Left' | 'Right', _now: number): void {
  const base = idx === 0 ? OFF.HAND0_X : OFF.HAND1_X;
  if (lm) {
    for (let i = 0; i < 21; i++) {
      f32[base + i * 3] = lm[i].x;
      f32[base + i * 3 + 1] = lm[i].y;
      f32[base + i * 3 + 2] = lm[i].z;
    }
  }
}

function detectSnap(lm: NormalizedLandmark[], now: number): void {
  const sd = sDist(lm);
  snapDistHistory.push(sd);
  if (snapDistHistory.length > 10) snapDistHistory.shift();
  if (snapDistHistory.length < 6 || now - lastSnapTime < SNAP_COOLDOWN_MS) return;
  const mid = Math.floor(snapDistHistory.length / 2);
  const f = snapDistHistory.slice(0, mid), s = snapDistHistory.slice(mid);
  const fA = f.reduce((a, b) => a + b, 0) / f.length, sA = s.reduce((a, b) => a + b, 0) / s.length;
  const range = Math.max(...snapDistHistory) - Math.min(...snapDistHistory);
  if (range > 0.08 && sA > fA && Math.min(...snapDistHistory) < 0.06) {
    lastSnapTime = now;
    colorIndex = (colorIndex + 1) % 8;
    i32[OFF.SNAP_TRIGGERED] = Math.floor(now);
    i32[OFF.COLOR_INDEX] = colorIndex;
  }
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'init') {
    try {
      sab = e.data.sab;
      const v = getViews(sab);
      i32 = v.i32; f32 = v.f32;
      i32[OFF.MAGIC] = SAB_MAGIC;
      await initRecognizer();
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      console.error('[TrackingWorker] Init failed:', err?.message || err);
      i32[OFF.ERROR_CODE] = 1;
      self.postMessage({ type: 'error', message: err?.message || String(err) });
    }
  } else if (e.data.type === 'frame') {
    processFrame(e.data.videoFrame);
    e.data.videoFrame.close();
  }
};
