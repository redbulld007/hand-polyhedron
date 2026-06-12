import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';
import { createSAB } from './shared/sab-layout';
import TrackingWorker from './workers/tracking.worker.ts?worker';
import RenderWorker from './workers/render.worker.ts?worker';

const sab = createSAB();

const trackingWorker = new TrackingWorker();
const renderWorker = new RenderWorker();
trackingWorker.postMessage({ type: 'init', sab });

const renderCanvas = document.createElement('canvas');
renderCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;';
document.body.appendChild(renderCanvas);

const offscreen = renderCanvas.transferControlToOffscreen();
renderWorker.postMessage(
  { type: 'init', sab, canvas: offscreen, width: renderCanvas.clientWidth, height: renderCanvas.clientHeight },
  [offscreen]
);

let trackingReady = false;
trackingWorker.onmessage = (e) => { if (e.data.type === 'ready') trackingReady = true; };

async function startCamera(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();

    function processVideoFrame(_now: number, metadata: VideoFrameCallbackMetadata) {
      if (trackingReady && video.readyState >= 2) {
        const frame = new VideoFrame(video, { timestamp: metadata.mediaTime });
        trackingWorker.postMessage({ type: 'frame', videoFrame: frame }, [frame]);
      }
      video.requestVideoFrameCallback(processVideoFrame);
    }
    video.requestVideoFrameCallback(processVideoFrame);

    new ResizeObserver(() => {
      renderWorker.postMessage({ type: 'resize', width: renderCanvas.clientWidth, height: renderCanvas.clientHeight });
    }).observe(renderCanvas);
  } catch (err) {
    console.error('Camera error:', err);
  }
}
startCamera();

createRoot(document.getElementById('root')!).render(<App sab={sab} />);
