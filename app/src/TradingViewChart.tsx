import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import { useTheme } from './theme'

// Official hosted widget: TradingView supplies and controls its own market data.
// No scraping, custom datafeed, Replay or paper-account connection is implied.
export default function TradingViewChart() {
  const {theme}=useTheme()
  const host=useRef<HTMLDivElement>(null)
  const expandButton=useRef<HTMLButtonElement>(null)
  const region=useRef<HTMLElement>(null)
  const [expanded,setExpanded]=useState(false)
  const [attempt,setAttempt]=useState(0)
  const [status,setStatus]=useState<'loading'|'embedded'|'error'|'slow'>('loading')
  useEffect(()=>{
    const node=host.current
    if(!node) return
    let alive=true
    setStatus('loading')
    const widget=document.createElement('div')
    widget.className='tradingview-widget-container__widget'
    widget.style.cssText='height:calc(100% - 32px);width:100%'
    const credit=document.createElement('div')
    credit.className='tradingview-widget-copyright'
    const link=document.createElement('a')
    link.href='https://www.tradingview.com/symbols/XAUUSD/?utm_source=tradersho&utm_medium=widget_new&utm_campaign=advanced-chart'
    link.target='_blank';link.rel='noopener nofollow';link.textContent='XAUUSD chart by TradingView'
    credit.append(link)
    const script=document.createElement('script')
    script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async=true
    script.textContent=JSON.stringify({autosize:true,symbol:'OANDA:XAUUSD',interval:'60',timezone:'Etc/UTC',theme,style:'1',locale:'en',allow_symbol_change:true,hide_top_toolbar:false,hide_side_toolbar:false,withdateranges:true,calendar:false,save_image:true,support_host:'https://www.tradingview.com',backgroundColor:theme==='light'?'#ffffff':'#0d1b2e'})
    script.onerror=()=>{if(alive)setStatus('error')}
    // Mounting confirms embedding only; cross-origin feed availability stays with TradingView.
    const observer=new MutationObserver(()=>{
      const frame=node.querySelector('iframe')
      if(frame && !frame.dataset.observed){frame.dataset.observed='true';if(alive)setStatus('embedded');frame.title='نمودار تحلیل بازار TradingView';frame.addEventListener('load',()=>{if(alive)setStatus('embedded')},{once:true})}
    })
    observer.observe(node,{childList:true,subtree:true})
    node.replaceChildren(widget,credit,script)
    const timer=window.setTimeout(()=>{if(alive)setStatus(s=>s==='loading'?'slow':s)},20000)
    return ()=>{alive=false;clearTimeout(timer);observer.disconnect();node.replaceChildren()}
  },[theme,attempt])
  useEffect(()=>{
    if(!expanded)return
    const previous=document.activeElement as HTMLElement|null
    const overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    region.current?.focus()
    const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);if(e.key==='Tab'){const nodes=Array.from(region.current?.querySelectorAll<HTMLElement>('button,a[href],iframe')||[]).filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===region.current)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}
    window.addEventListener('keydown',close)
    return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',close);(previous?.isConnected?previous:expandButton.current)?.focus()}
  },[expanded])
  return <section ref={region} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} tabIndex={-1} className={`tv-chart surface ${expanded?'tv-expanded':''}`} aria-label="محیط تحلیل بازار">
    <div className="tv-toolbar"><span><i className="tv-dot"/> نمودار TradingView</span><div><button className="icon-button" onClick={()=>setAttempt(n=>n+1)} aria-label="بارگذاری دوباره نمودار"><RefreshCw size={18}/></button><button ref={expandButton} className="button secondary small" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>} {expanded?'بازگشت به پنل':'نمای تمام‌صفحه'}</button></div></div>
    {status==='loading' && <p className="tv-status" role="status">در حال اتصال به TradingView…</p>}
    {(status==='error'||status==='slow') && <div className="tv-status" role="alert">{status==='error'?'اتصال به TradingView برقرار نشد.':'بارگذاری نمودار بیشتر از معمول طول کشیده است.'} <button onClick={()=>setAttempt(n=>n+1)}>تلاش دوباره</button><a href="https://www.tradingview.com/chart/?symbol=OANDA%3AXAUUSD" target="_blank" rel="noopener noreferrer">باز کردن TradingView</a></div>}
    <div ref={host} className="tradingview-widget-container tv-host"/>
    <p className="tv-disclosure">داده و امکانات نمودار توسط TradingView ارائه می‌شود. دسترسی به نمادها و میزان تأخیر به بازار و منبع داده بستگی دارد. <a href="https://www.tradingview.com/chart/?symbol=OANDA%3AXAUUSD" target="_blank" rel="noopener noreferrer">باز کردن در TradingView</a></p>
  </section>
}
