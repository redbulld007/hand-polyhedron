import { useRef, useEffect } from 'react';
import { useHandTracker } from '../hooks/useHandTracker';

export function CameraProvider() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { startTracking, stopTracking } = useHandTracker(videoRef);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          await startTracking();
        }
      } catch (err: any) {
        console.error('Camera error:', err?.message || 'Cannot access camera');
      }
    }

    init();

    return () => {
      stopTracking();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [startTracking, stopTracking]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, background: '#000' }}>
      <video ref={videoRef} playsInline muted style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: 'scaleX(-1)',
        background: '#000',
      }} />
    </div>
  );
}
