import { useHandStore } from '../store/handStore';

export function UIOverlay() {
  const { leftHand, rightHand, isPinching, isTracking, pinchDistance } = useHandStore();

  const statusText = !isTracking
    ? '请将双手置于摄像头前'
    : !leftHand
      ? '未检测到左手'
      : !rightHand
        ? '未检测到右手'
        : isPinching
          ? '🤏 捏合调节大小'
          : '🖐️ 右手捏合来调节大小';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%',
      zIndex: 10, pointerEvents: 'none',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        textAlign: 'center', padding: '16px',
        color: '#ffffffcc', fontSize: '14px',
        letterSpacing: '1px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
      }}>
        {statusText}
      </div>

      <div style={{
        position: 'fixed', bottom: '24px', width: '100%',
        textAlign: 'center', color: '#ffffff66', fontSize: '12px',
      }}>
        左手放置多面体 &nbsp;|&nbsp; 右手捏合控制大小
      </div>

      {rightHand && isPinching && (
        <div style={{
          position: 'fixed', right: '20px', top: '50%',
          transform: 'translateY(-50%)',
          width: '4px', height: '120px',
          background: '#ffffff22',
          borderRadius: '2px',
        }}>
          <div style={{
            width: '100%',
            height: `${Math.max(5, (1 - pinchDistance / 0.15) * 100)}%`,
            background: 'linear-gradient(180deg, #00d4ff, #0066ff)',
            borderRadius: '2px',
            transition: 'height 0.05s linear',
            position: 'absolute',
            bottom: 0,
          }} />
        </div>
      )}
    </div>
  );
}
