import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useHandStore, COLOR_PALETTE } from '../store/handStore';
import { usePinchGesture } from '../hooks/usePinchGesture';
import { getPalmCenter } from '../utils/landmarks';
import { SparkleEffect } from './SparkleEffect';

export function GlowingPolyhedron() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const wireframeRef = useRef<THREE.Mesh>(null);
  const outerGlowRef = useRef<THREE.Mesh>(null);
  const { leftHand, isPinching, colorIndex, snapTriggered } = useHandStore();
  const { targetScaleRef, springRef } = usePinchGesture();

  const currentScaleRef = useRef(1.0);
  const lastSnapRef = useRef(0);
  const snapFlashRef = useRef(0);
  const rotationBoostRef = useRef(0);

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.25, 1), []);
  const wireframeGeo = useMemo(() => new THREE.IcosahedronGeometry(0.27, 1), []);
  const outerGeo = useMemo(() => new THREE.IcosahedronGeometry(0.32, 1), []);

  useFrame((_, delta) => {
    if (!meshRef.current || !groupRef.current) return;
    const dt = Math.min(delta, 0.1);

    // 响指闪光衰减
    if (snapTriggered !== lastSnapRef.current) {
      lastSnapRef.current = snapTriggered;
      snapFlashRef.current = 1.0;
      rotationBoostRef.current = 5.0;
    }
    snapFlashRef.current = Math.max(0, snapFlashRef.current - dt * 2.5);
    rotationBoostRef.current = Math.max(0, rotationBoostRef.current - dt * 4);

    // 旋转 — 统一在 group 上，所有子 mesh 自动跟随
    const rotSpeed = 0.8 + rotationBoostRef.current;
    groupRef.current.rotation.y += dt * rotSpeed;
    groupRef.current.rotation.z += dt * 0.3;

    // 左手位置跟踪 — 统一移动 group，所有子元素自动同步
    if (leftHand?.landmarks) {
      const palm = getPalmCenter(leftHand.landmarks);
      const targetX = ((1 - palm.x) - 0.5) * 4.0;
      const targetY = (0.5 - palm.y) * 3.5;
      groupRef.current.position.lerp(new THREE.Vector3(targetX, targetY, 0), 0.15);
    }

    // 弹性弹簧缩放 — 统一缩放 group
    const targetScale = isPinching ? targetScaleRef.current : 1.0;
    const current = currentScaleRef.current;
    const diff = targetScale - current;
    const stiffness = 12;
    const damping = 0.78;
    springRef.current.velocity += diff * stiffness * dt;
    springRef.current.velocity *= damping;
    currentScaleRef.current += springRef.current.velocity * dt;

    if (!isPinching && Math.abs(currentScaleRef.current - 1.0) < 0.01 && Math.abs(springRef.current.velocity) < 0.01) {
      currentScaleRef.current = 1.0;
      springRef.current.velocity = 0;
    }

    groupRef.current.scale.setScalar(currentScaleRef.current);

    // 发光：捏合脉冲 + 响指暴闪
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const color = COLOR_PALETTE[colorIndex];
    mat.color.set(color);
    mat.emissive.set(color);

    let intensity = 0.8;
    if (isPinching) {
      intensity += Math.sin(performance.now() * 0.012) * 0.3;
    }
    intensity += snapFlashRef.current * 2.5;
    mat.emissiveIntensity = intensity;

    // 外层光晕
    if (outerGlowRef.current) {
      const outerMat = outerGlowRef.current.material as THREE.MeshBasicMaterial;
      outerMat.color.set(color);
      outerMat.opacity = 0.08 + snapFlashRef.current * 0.35 + (isPinching ? 0.05 : 0);
    }
  });

  return (
    <group ref={groupRef}>
      {/* 实体多面体 */}
      <mesh ref={meshRef}>
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial
          color={COLOR_PALETTE[0]}
          emissive={COLOR_PALETTE[0]}
          emissiveIntensity={0.8}
          roughness={0.12}
          metalness={0.15}
        />
      </mesh>

      {/* 线框叠加 */}
      <mesh ref={wireframeRef}>
        <primitive object={wireframeGeo} attach="geometry" />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.25} />
      </mesh>

      {/* 外层光晕 */}
      <mesh ref={outerGlowRef}>
        <primitive object={outerGeo} attach="geometry" />
        <meshBasicMaterial
          color={COLOR_PALETTE[0]}
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 粒子闪光 — group 的子元素，自动跟随位置 */}
      <SparkleEffect />
    </group>
  );
}
