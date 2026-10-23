import { useEffect, useRef } from 'react'

const candles = [
  [18, 70, 40, 'up'], [16, 64, 52, 'down'], [22, 80, 44, 'up'], [14, 58, 40, 'up'], [20, 66, 50, 'down'], [26, 92, 56, 'up'],
  [18, 78, 60, 'up'], [24, 70, 62, 'down'], [16, 98, 70, 'up'], [22, 88, 72, 'up'], [14, 80, 66, 'down'], [28, 110, 78, 'up']
] as const

/* Decorative, non-data artwork: an abstract living market scene. No prices, no history. */
export default function MarketPulse() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = host.getBoundingClientRect()
        host.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
        host.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
      })
    }
    const leave = () => { host.style.setProperty('--px', '0'); host.style.setProperty('--py', '0') }
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(frame); host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave) }
  }, [])
  const path = 'M10 232 C60 226 78 190 120 196 S190 236 236 178 S300 120 346 146 S420 70 470 88 S560 30 630 42'
  return (
    <div className="market-pulse" ref={ref} aria-hidden="true">
      <span className="mp-aurora mp-aurora-a" /><span className="mp-aurora mp-aurora-b" /><span className="mp-aurora mp-aurora-c" />
      <svg className="mp-scene" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="mp-line" x1="0" x2="1"><stop offset="0" stopColor="var(--mp-c2)" /><stop offset=".55" stopColor="var(--mp-c1)" /><stop offset="1" stopColor="var(--mp-c3)" /></linearGradient>
          <linearGradient id="mp-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--mp-c1)" stopOpacity=".30" /><stop offset="1" stopColor="var(--mp-c1)" stopOpacity="0" /></linearGradient>
          <linearGradient id="mp-fade" x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <mask id="mp-mask"><rect width="640" height="300" fill="url(#mp-fade)" /></mask>
          <filter id="mp-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        <g mask="url(#mp-mask)">
          <g className="mp-grid">
            {Array.from({ length: 7 }, (_, i) => <line key={'h' + i} x1="0" x2="640" y1={30 + i * 40} y2={30 + i * 40} />)}
            {Array.from({ length: 12 }, (_, i) => <line key={'v' + i} y1="0" y2="300" x1={20 + i * 56} x2={20 + i * 56} />)}
          </g>
          <g className="mp-candles" transform="translate(30 0)">
            {candles.map(([w, h, y, dir], i) => (
              <g key={i} className={'mp-candle ' + dir} style={{ animationDelay: `${-i * 0.55}s` }} transform={`translate(${i * 50} ${300 - y - h})`}>
                <line x1={w / 2} x2={w / 2} y1={-14} y2={h + 14} />
                <rect width={w} height={h} rx="4" />
              </g>
            ))}
          </g>
          <path d={path + ' L630 300 L10 300 Z'} className="mp-area" />
          <path d={path} className="mp-glow" filter="url(#mp-glow)" pathLength={1} />
          <path d={path} className="mp-trace" pathLength={1} />
          <circle r="5" className="mp-dot"><animateMotion dur="7s" repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes="0;.62;1" calcMode="linear" /></circle>
          <circle r="14" className="mp-halo"><animateMotion dur="7s" repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes="0;.62;1" calcMode="linear" /></circle>
        </g>
      </svg>
    </div>
  )
}
