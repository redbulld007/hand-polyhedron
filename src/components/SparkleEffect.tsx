import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useHandStore } from '../store/handStore';

export function SparkleEffect() {
  const pointsRef = useRef<THREE.Points>(null);
  const { snapTriggered } = useHandStore();
  const lastSnapRef = useRef(0);

  const particleCount = 60;
  const positions = useMemo(() => new Float32Array(particleCount * 3), []);
  const velocities = useMemo(() => new Float32Array(particleCount * 3), []);
  const lifeRef = useRef<Float32Array>(new Float32Array(particleCount));

  const initParticles = (origin: THREE.Vector3) => {
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 1.5 + Math.random() * 2.5;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;
      lifeRef.current![i] = 0.6 + Math.random() * 0.8;
    }
  };

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    if (snapTriggered !== lastSnapRef.current) {
      lastSnapRef.current = snapTriggered;
      const parent = pointsRef.current.parent;
      if (parent) {
        const worldPos = new THREE.Vector3();
        parent.getWorldPosition(worldPos);
        initParticles(worldPos);
      }
    }

    const geo = pointsRef.current.geometry;
    const posAttr = geo.attributes.position;
    let anyAlive = false;

    for (let i = 0; i < particleCount; i++) {
      const life = lifeRef.current![i];
      if (life <= 0) {
        positions[i * 3] = positions[i * 3 + 1] = positions[i * 3 + 2] = 9999;
        continue;
      }
      anyAlive = true;
      lifeRef.current![i] -= delta;
      velocities[i * 3] *= 0.96;
      velocities[i * 3 + 1] *= 0.96;
      velocities[i * 3 + 2] *= 0.96;
      positions[i * 3] += velocities[i * 3] * delta;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
    }

    if (anyAlive) posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3] as const}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#ffffff"
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        transparent
        opacity={0.9}
      />
    </points>
  );
}
