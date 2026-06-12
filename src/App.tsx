import { CameraProvider } from './components/CameraProvider';
import { ThreeScene } from './components/ThreeScene';
import { UIOverlay } from './components/UIOverlay';
import { HandSkeleton } from './components/HandSkeleton';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <CameraProvider />
      <ThreeScene />
      <HandSkeleton />
      <UIOverlay />
    </div>
  );
}
