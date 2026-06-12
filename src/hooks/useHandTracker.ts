import { useCallback, useRef } from 'react';
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useHandStore } from '../store/handStore';
import { getPinchDistance, isPinching } from '../utils/landmarks';
import { useSnapDetector } from './useSnapDetector';

export function useHandTracker(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const animFrameRef = useRef<number>(0);
  const { setLeftHand, setRightHand, setPinchDistance, setIsPinching, setIsTracking } = useHandStore();
  const { detect: detectSnap } = useSnapDetector();

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const recognizer = recognizerRef.current;
    if (!video || !recognizer || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const results = recognizer.recognizeForVideo(video, performance.now());

    if (results.landmarks && results.landmarks.length > 0) {
      setIsTracking(true);
      let leftFound = false;
      let rightFound = false;

      for (let i = 0; i < results.landmarks.length; i++) {
        const landmarks = results.landmarks[i] as unknown as NormalizedLandmark[];
        const handedness = results.handedness?.[i]?.[0];
        const mapped = landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z }));

        if (handedness?.categoryName === 'Left') {
          setLeftHand({ landmarks: mapped, handedness: 'Left', confidence: handedness.score });
          leftFound = true;
        } else if (handedness?.categoryName === 'Right') {
          setRightHand({ landmarks: mapped, handedness: 'Right', confidence: handedness.score });
          const dist = getPinchDistance(mapped);
          setPinchDistance(dist);
          setIsPinching(isPinching(mapped));
          detectSnap(mapped);
          rightFound = true;
        }
      }

      if (!leftFound) setLeftHand(null);
      if (!rightFound) setRightHand(null);
    } else {
      setLeftHand(null);
      setRightHand(null);
      setIsTracking(false);
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, setLeftHand, setRightHand, setPinchDistance, setIsPinching, setIsTracking]);

  const startTracking = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );
      recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
          delegate: 'GPU',
        },
        numHands: 2,
        runningMode: 'VIDEO',
      });
      animFrameRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      console.error('MediaPipe init error:', err);
    }
  }, [processFrame]);

  const stopTracking = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    recognizerRef.current?.close();
    recognizerRef.current = null;
  }, []);

  return { startTracking, stopTracking };
}
