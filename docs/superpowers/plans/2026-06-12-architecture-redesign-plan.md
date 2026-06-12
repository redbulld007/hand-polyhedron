# hand-polyhedron 架构重构实施计划

> **Goal:** 将 hand-polyhedron 重构为全 Worker 管线架构，达到 <150ms 延迟

**Architecture:** 主线程摄像头采集 + UI → Tracking Worker (MediaPipe + Kalman) → Render Worker (Three.js + OffscreenCanvas)，SharedArrayBuffer 零拷贝通信

**Tech Stack:** Vite 8, TypeScript 6, React 19, Three.js, MediaPipe Hands, Web Workers

### 实施顺序

1. shared/ — 共享常量、SAB 布局、landmarks 工具
2. Vite 配置 — Worker bundling + SAB headers
3. tracking.worker.ts — MediaPipe + Kalman + 遮挡 + 手势
4. render.worker.ts — Three.js 场景 + 动画循环
5. main.tsx + UIOverlay — 入口 + 状态 UI
6. 清理旧文件 + 验证
