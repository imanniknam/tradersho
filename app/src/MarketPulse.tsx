import {useEffect, useRef} from 'react'
import MarketPulseArtwork from './MarketPulseArtwork'
import './market-tools-motion-theme.css'

function ease(value:number) {
  const phase=Math.min(1,Math.max(0,value))
  return phase*phase*(3-2*phase)
}

export default function MarketPulse() {
  const artworkRef=useRef<SVGSVGElement>(null)

  useEffect(()=>{
    const artwork=artworkRef.current
    if(!artwork)return

    const elements=new Map([...artwork.querySelectorAll<SVGElement>('[id]')].map(node=>[node.id.slice(3),node]))
    const attr=(id:string,key:string,value:number|string)=>elements.get(id)?.setAttribute(key,String(value))
    const label=(id:string,value:string)=>{const node=elements.get(id);if(node)node.textContent=value}
    const preference=matchMedia('(prefers-reduced-motion: reduce)')
    let clock=0,last=performance.now(),frameId=0,visible=false

    function update(time:number) {
      const reveal=ease((time-.6)/2.3),breakeven=ease((time-4.1)/1.4)
      const pulse=.5+.5*Math.sin(time*2),needle=-18+36*ease((time-5.4)/1.8)
      const end=342+384*reveal,stop=341-56*breakeven,isBreakeven=breakeven===1
      attr('trade-lines','opacity',.18+.82*reveal)
      attr('profit-zone','width',384*reveal)
      attr('loss-zone','width',384*reveal)
      attr('loss-zone','height',(1-breakeven)*56)
      attr('tp-line','d',`M342 191H${end}`)
      attr('entry-line','d',`M342 285H${end}`)
      attr('sl-line','d',`M342 ${stop}H${end}`)
      attr('sl-line','stroke',isBreakeven?'#9cbbac':'#b8879b')
      attr('line-tags','opacity',reveal)
      attr('entry-tag','opacity',1-breakeven)
      attr('sl-tag','transform',`translate(0,${-56*breakeven})`)
      attr('sl-tag-bg','fill',isBreakeven?'#3b4b49':'#4b3541')
      attr('sl-label','fill',isBreakeven?'#c3dacf':'#dfb9c8')
      label('sl-label',isBreakeven?'BE':'SL')
      label('expert-risk-value',`${(isBreakeven?0:Math.max(.01,.5*(1-breakeven))).toFixed(2)} %`)
      attr('expert-risk-value','fill',isBreakeven?'#c3dacf':'#ede7f7')
      attr('be-light','opacity',.3+.7*breakeven)
      attr('step-glow','opacity',.25+.5*pulse)
      attr('needle','transform',`rotate(${needle} 703 434)`)
      attr('factor-dollar','width',43+5*pulse)
      attr('factor-yield','width',59-4*pulse)
      attr('factor-risk','width',25+3*pulse)
    }

    function frame(now:number) {
      clock+=Math.min((now-last)/1000,.1)
      last=now
      update(clock%10)
      frameId=requestAnimationFrame(frame)
    }

    function syncMotion() {
      cancelAnimationFrame(frameId)
      if(preference.matches)update(8)
      else if(visible&&!document.hidden){
        last=performance.now()
        frameId=requestAnimationFrame(frame)
      }
    }

    const observer=new IntersectionObserver(([entry])=>{
      visible=entry.isIntersecting
      syncMotion()
    })
    observer.observe(artwork)
    document.addEventListener('visibilitychange',syncMotion)
    preference.addEventListener('change',syncMotion)
    syncMotion()

    return ()=>{
      observer.disconnect()
      cancelAnimationFrame(frameId)
      document.removeEventListener('visibilitychange',syncMotion)
      preference.removeEventListener('change',syncMotion)
    }
  },[])

  return <div className="market-pulse" aria-hidden="true"><MarketPulseArtwork artworkRef={artworkRef}/></div>
}
