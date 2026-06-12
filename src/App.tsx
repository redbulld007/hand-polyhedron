import { useState, useEffect, useRef } from 'react';
import { getViews } from './shared/sab-layout';
import { OFF } from './shared/sab-layout';

export default function App({ sab }: { sab: SharedArrayBuffer }) {
  const [status, setStatus] = useState('正在初始化...');
  const [pinchBar, setPinchBar] = useState(0);
  const [lighting, setLighting] = useState(0.5);
  const [error, setError] = useState('');
  const frameRef = useRef(0);

  useEffect(() => {
    const { i32, f32 } = getViews(sab);
    let raf = 0;

    function poll() {
      const fid = i32[OFF.FRAME_ID];
      if (fid !== frameRef.current) {
        frameRef.current = fid;

        const tracking = i32[OFF.IS_TRACKING];
        const numHands = i32[OFF.NUM_HANDS];
        const pinching = i32[OFF.IS_PINCHING];

        if (!tracking || numHands === 0) setStatus('请将双手置于摄像头前');
        else if (numHands === 1) setStatus('请伸出双手');
        else if (pinching) setStatus('捏合调节大小');
        else setStatus('右手捏合来调节大小');

        setPinchBar(pinching ? Math.max(5, (1 - f32[OFF.PINCH_DISTANCE] / 0.15) * 100) : 0);
        setLighting(f32[OFF.LIGHTING_SCORE] || 0.5);

        if (i32[OFF.ERROR_CODE] === 1) setError('初始化失败：无法加载手势识别模型，请检查网络连接');
      }
      raf = requestAnimationFrame(poll);
    }
    poll();
    return () => cancelAnimationFrame(raf);
  }, [sab]);

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 10, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: '16px', color: '#ffffffcc', fontSize: '14px', letterSpacing: '1px', background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)' }}>
        {status}
      </div>
      {error && (
        <div style={{ textAlign: 'center', padding: '12px 16px', color: '#ff4444', fontSize: '14px', background: 'rgba(255,0,0,0.15)', margin: '0 16px', borderRadius: '8px' }}>
          {error}
        </div>
      )}
      {lighting < 0.3 && (
        <div style={{ textAlign: 'center', padding: '8px', color: '#ffaa00', fontSize: '13px', background: 'rgba(0,0,0,0.5)' }}>
          光线较暗，请补充面部光照以获得更好的追踪效果
        </div>
      )}
      {pinchBar > 0 && (
        <div style={{ position: 'fixed', right: '20px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '120px', background: '#ffffff22', borderRadius: '2px' }}>
          <div style={{ width: '100%', height: `${pinchBar}%`, background: 'linear-gradient(180deg, #00d4ff, #0066ff)', borderRadius: '2px', position: 'absolute', bottom: 0, transition: 'height 0.05s linear' }} />
        </div>
      )}
    </div>
      {/* Bottom hint */}
      <div style={{ position: 'fixed', bottom: '24px', width: '100%', textAlign: 'center', color: '#ffffff66', fontSize: '12px', zIndex: 10, pointerEvents: 'none' }}>
        左手移动多面体 &nbsp;|&nbsp; 右手捏合控制大小 &nbsp;|&nbsp; 响指切换颜色
      </div>
    </>
  );
}
