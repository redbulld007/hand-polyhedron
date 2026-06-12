# hand-polyhedron 架构重构设计

**日期**: 2026-06-12
**方案**: B — 全离主线程 Worker 管线

## 目标

- 手势识别 → 画面反馈延迟 < 150ms
- 双手遮挡时基于 ID 优先追踪先检测的手
- 卡尔曼滤波预测插值
- 头部区域稳定补光引导

## 架构

```
MAIN THREAD                    TRACKING WORKER              RENDER WORKER
───────────                    ────────────────              ──────────────
Camera (getUserMedia)          MediaPipe Hands               Three.js WebGPU
  ↓ VideoFrame transfer →      GestureRecognizer(GPU)        OffscreenCanvas
UI Overlay (React)             Kalman Filter ×2              独立 rAF 循环
<canvas> ──transferControl──→  OcclusionManager              读取 SAB landmarks
                               GestureEngine                 Bloom 后处理
```

## 数据通道

SharedArrayBuffer (560B)，零拷贝共享：

| Offset | Size | Field |
|--------|------|-------|
| 0 | 4B | magic (0x48414E44) |
| 4 | 4B | frame_id |
| 8 | 4B | is_tracking |
| 12 | 4B | num_hands |
| 20 | 252B | hand_0_landmarks (21×xyz) |
| 272 | 252B | hand_1_landmarks |
| 524 | 4B | hand_0_handedness |
| 540 | 4B | pinch_distance |
| 544 | 4B | is_pinching |
| 548 | 4B | snap_triggered |
| 556 | 4B | lighting_score |

## 卡尔曼滤波器

- 状态向量 6D: [x, y, z, vx, vy, vz]
- 匀速模型，Q=1e-3, R=5e-3
- 丢失时 predict 外推 ≤5 帧

## 遮挡管理

- 每手维护 stableId + 30 帧历史
- 两手腕距离 < 阈值 → 优先先检测的手
- 恢复时基于历史预测位置重新匹配

## 光照评估

- 面部 ROI 像素均值 → lighting_score (0-1)
- < 0.3 时 UI 提示补光

## 文件结构

```
src/
├── main.tsx                  # 入口
├── App.tsx                   # React UI Overlay
├── workers/
│   ├── tracking.worker.ts    # 追踪管线
│   ├── render.worker.ts      # 3D 渲染
│   └── ...
├── shared/
│   ├── sab-layout.ts         # SAB 结构
│   ├── landmarks.ts          # 关键点计算
│   └── constants.ts
└── components/
    └── UIOverlay.tsx
```

## 技术栈

- 追踪: MediaPipe Hands (WASM + GPU delegate)
- 渲染: Three.js WebGPU (OffscreenCanvas)
- 通信: SharedArrayBuffer + postMessage
- UI: React 19 (仅 Overlay)
- 构建: Vite 8 + TypeScript 6
