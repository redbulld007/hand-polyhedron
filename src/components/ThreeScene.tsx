import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { GlowingPolyhedron } from './GlowingPolyhedron';

export function ThreeScene() {
  return (
    <Canvas
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}
      camera={{ position: [0, 0, 2.5], fov: 60 }}
      gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
    >
      <ambientLight intensity={0.2} />
      <pointLight position={[2, 2, 2]} intensity={0.5} color="#0088ff" />
      <pointLight position={[-2, -1, 1]} intensity={0.3} color="#ff00aa" />

      <Suspense fallback={null}>
        <GlowingPolyhedron />
      </Suspense>

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={1.5}
          radius={0.5}
        />
      </EffectComposer>
    </Canvas>
  );
}
