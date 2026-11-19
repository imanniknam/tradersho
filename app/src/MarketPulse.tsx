import {useState} from 'react'
import {Pause,Play} from 'lucide-react'

const candles = [235, 226, 237, 211, 198, 207, 172, 185, 156, 136, 149, 123, 113, 122, 91, 78, 85, 63]

export default function MarketPulse() {
  const [paused,setPaused]=useState(false)
  return (<>
    <div className="market-pulse" aria-hidden="true" data-paused={paused}>
      <svg className="mp-scene" viewBox="0 0 760 340" focusable="false" direction="ltr">
        <defs>
          <pattern id="tools-grid" width="28" height="25" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V25" className="mp-grid"/>
          </pattern>
        </defs>
        <ellipse cx="360" cy="172" rx="337" ry="142" className="mp-orbit"/>
        <g className="mp-chart-card">
          <rect x="88" y="28" width="515" height="247" rx="16" className="mp-card"/>
          <rect x="102" y="65" width="481" height="190" fill="url(#tools-grid)"/>
          <path d="M88 59H603" className="mp-grid"/>
          <path d="M107 44h18m7 0h4" className="mp-grid" strokeWidth="3" strokeLinecap="round"/>
          <text x="153" y="48">MetaTrader</text><text x="501" y="48">XAUUSD</text>
          <g className="mp-price-levels">
            <path d="M167 99H567M167 155H567M167 210H567"/>
          </g>
          {candles.map((y,i)=>{
            const previous=candles[i-1]??245, x=172+i*19,top=Math.min(previous,y),height=Math.max(4,Math.abs(previous-y))
            return <g key={i} className={'mp-candle'+(previous<y?' down':'')}>
              <path d={`M${x} ${top-7}v${height+14}`}/><rect x={x-4} y={top} width="8" height={height} rx="1.4"/>
            </g>
          })}
          <path d="M172 242C235 237 266 208 306 194S394 165 427 142S485 111 495 91" pathLength="1" className="mp-price-trace"/>
        </g>
        <g className="mp-expert-card">
          <rect x="35" y="126" width="163" height="178" rx="13" className="mp-card"/>
          <text x="52" y="151" className="mp-title">Tradersho</text>
          <text x="52" y="168">MONEY MANAGER</text>
          <path d="M52 181H182M52 218H182M52 252H182" className="mp-grid"/>
          <text x="52" y="203">Risk</text><text x="129" y="203">0.50%</text>
          <text x="52" y="237">Risk / Reward</text><text x="148" y="237">1 : 3</text>
          <rect x="52" y="268" width="58" height="17" rx="4" className="mp-buy"/>
          <rect x="118" y="268" width="64" height="17" rx="4" className="mp-sell"/>
        </g>
        <g className="mp-risk-card">
          <rect x="533" y="53" width="174" height="116" rx="13" className="mp-card"/>
          <text x="550" y="79" className="mp-title">Smart Risk Panel</text>
          <text x="550" y="110" className="mp-value">0.85%</text>
          {[0,1,2,3,4].map(i=><rect key={i} x={550+i*28} y="128" width="21" height="20" rx="5" className={i===2?'mp-risk-step':'mp-risk-cell'}/>)}
        </g>
        <g className="mp-compass-card">
          <rect x="450" y="212" width="228" height="94" rx="13" className="mp-card"/>
          <circle cx="500" cy="259" r="31" className="mp-dial"/>
          <path d="M500 233v5m0 42v5m-26-26h5m42 0h5" className="mp-grid"/>
          <g className="mp-needle">
            <path d="m500 237 7 22-7 22-7-22Z"/>
            <path d="m500 237 7 22h-14Z"/>
          </g>
          <text x="548" y="250" className="mp-title">Gold Compass</text>
          <path d="M548 274h26m10 0h26m10 0h29" className="mp-factors"/>
        </g>
      </svg>
    </div>
    <button className="market-pulse-toggle" type="button" onClick={()=>setPaused(value=>!value)}
      aria-label={paused?'ادامهٔ حرکت پس‌زمینه':'توقف حرکت پس‌زمینه'}>
      {paused?<Play size={15} aria-hidden="true"/>:<Pause size={15} aria-hidden="true"/>}
    </button>
  </>)
}
