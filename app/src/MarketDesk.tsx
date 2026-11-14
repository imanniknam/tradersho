import {useContext,useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {CSSProperties,KeyboardEvent,PointerEvent,ReactNode} from 'react'
import {RotateCcw} from 'lucide-react'
import {CalendarUserContext} from './calendar/preferences'
import './market-desk.css'

type Size={side:number|null;calendar:number|null;height:number|null}
type Panel='chart'|'calendar'|'flicker'
type Edge='n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'
const empty:Size={side:null,calendar:null,height:null},gap=10,minCalendar=220
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n))
const names={chart:'چارت',calendar:'تقویم',flicker:'فلیکر'}
const directions={n:'بالا',s:'پایین',e:'راست',w:'چپ',ne:'بالا راست',nw:'بالا چپ',se:'پایین راست',sw:'پایین چپ'}
export default function MarketDesk({chart,calendar,flicker}:{chart:(handles:ReactNode)=>ReactNode;calendar:(handles:ReactNode)=>ReactNode;flicker:(handles:ReactNode,onMinimumHeight:(height:number)=>void)=>ReactNode}){
 const user=useContext(CalendarUserContext),key=`tradersho.market-layout.v1.${user}`
 const [size,setSize]=useState<Size>(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');return saved&&['side','calendar','height'].every(k=>saved[k]===null||typeof saved[k]==='number'&&Number.isFinite(saved[k])&&saved[k]>0)?saved:empty}catch{return empty}})
 const [availableHeight,setAvailableHeight]=useState(520),[goldContentHeight,setGoldContentHeight]=useState(270),minGold=Math.max(270,goldContentHeight),minimumHeight=minCalendar+gap+minGold
 const grid=useRef<HTMLDivElement>(null),drag=useRef<{id:number;node:HTMLElement;x:number;y:number;width:number;height:number;side:number;calendar:number;gold:number;scroll:number;panel:Panel;edge:Edge;size:Size}|null>(null)
 const [active,setActive]=useState(false)
 // A definite height avoids intrinsic fr-track recalculation in Safari. The available
 // viewport is measured independently from either card's changing content.
 useLayoutEffect(()=>{const host=grid.current!,body=host.parentElement!,scroller=host.closest<HTMLElement>('.main-scroll')!,inner=host.closest<HTMLElement>('.main-inner')!,siblings=[...body.children].filter(n=>n!==host) as HTMLElement[];const sync=()=>{if(!matchMedia('(min-width:1201px) and (min-height:700px)').matches)return;const style=getComputedStyle(body),spacing=parseFloat(style.rowGap)||0,other=siblings.reduce((sum,n)=>{const css=getComputedStyle(n);return sum+n.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0)},0),origin=body.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop;const height=Math.max(520,Math.floor(scroller.clientHeight-origin-(parseFloat(getComputedStyle(inner).paddingBottom)||0)-other-spacing*siblings.length));setAvailableHeight(previous=>Math.abs(previous-height)<1?previous:height)};const observer=new ResizeObserver(sync);observer.observe(scroller);siblings.forEach(n=>observer.observe(n));window.addEventListener('resize',sync);sync();return()=>{observer.disconnect();window.removeEventListener('resize',sync)}},[])
 useEffect(()=>{if(!user||active)return;try{localStorage.setItem(key,JSON.stringify(size))}catch{/* Resizing works without browser storage. */}},[key,user,size,active])
 const resize=(start:NonNullable<typeof drag.current>,dx:number,dy:number)=>{
  const {panel,edge,width,height,side,calendar,gold}=start,next={...start.size},maxHeight=Math.max(6000,innerHeight*2)
  if(edge.includes('e')||edge.includes('w'))next.side=clamp(side+(panel==='chart'?(edge.includes('w')?dx:-dx):edge.includes('w')?-dx:dx),300,Math.min(640,width-454))/width
  if(edge.includes('n')||edge.includes('s')){
   if(panel==='chart')next.height=clamp(height+(edge.includes('n')?-dy:dy),minimumHeight,maxHeight)
   else if(panel==='flicker'&&edge.includes('s')){const g=clamp(gold+dy,minGold,maxHeight-calendar-gap),h=calendar+gap+g;next.height=h;next.calendar=calendar/(h-gap)}
   else if(panel==='calendar'&&edge.includes('n')){const c=clamp(calendar-dy,minCalendar,maxHeight-gold-gap),h=c+gap+Math.max(minGold,gold);next.height=h;next.calendar=c/(h-gap)}
   else{const c=clamp(calendar+dy,minCalendar,maxHeight-minGold-gap),h=Math.max(height,c+gap+minGold);next.height=h;next.calendar=c/(h-gap)}
  }
  setSize(next)
 }
 const finish=(cancel=false)=>{const start=drag.current;if(!start)return;if(cancel)setSize(start.size);drag.current=null;setActive(false);if(start.node.hasPointerCapture(start.id))start.node.releasePointerCapture(start.id)}
 useEffect(()=>{if(!active)return;const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();finish(true)}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[active])
 const measure=(panel:Panel,edge:Edge,node:HTMLElement,id=0,x=0,y=0)=>{const host=grid.current!,r=host.getBoundingClientRect(),side=host.querySelector('.analysis-context')!.getBoundingClientRect(),calendar=host.querySelector('.calendar-preview-card')!.getBoundingClientRect(),gold=host.querySelector('.flicker-card')!.getBoundingClientRect();return {id,node,x,y,width:r.width,height:r.height,side:side.width,calendar:calendar.height,gold:gold.height,scroll:host.closest<HTMLElement>('.main-scroll')!.scrollTop,panel,edge,size}}
 const begin=(e:PointerEvent<HTMLButtonElement>,panel:Panel,edge:Edge)=>{if(e.button!==0)return;e.preventDefault();drag.current=measure(panel,edge,e.currentTarget,e.pointerId,e.clientX,e.clientY);e.currentTarget.setPointerCapture(e.pointerId);setActive(true)}
 const keyboard=(e:KeyboardEvent<HTMLButtonElement>,panel:Panel,edge:Edge)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?40:12;resize(measure(panel,edge,e.currentTarget),e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}
 const handles=(panel:Panel)=><div className="market-resize-controls" aria-label={`تغییر اندازهٔ ${names[panel]}`}>{(Object.keys(directions) as Edge[]).map(edge=><button key={edge} type="button" className={`market-resize-handle resize-${edge}`} aria-label={`تغییر اندازهٔ ${names[panel]} از ${directions[edge]}`} title="برای تغییر اندازه بکشید؛ کلیدهای جهت‌دار هم فعال‌اند" onPointerDown={e=>begin(e,panel,edge)} onPointerMove={e=>{const start=drag.current;if(start?.id===e.pointerId){e.preventDefault();const scroll=grid.current!.closest<HTMLElement>('.main-scroll')!.scrollTop;resize(start,e.clientX-start.x,e.clientY-start.y+scroll-start.scroll)}}} onPointerUp={()=>finish()} onPointerCancel={()=>finish()} onLostPointerCapture={()=>finish()} onKeyDown={e=>keyboard(e,panel,edge)}><span/></button>)}</div>
 const height=Math.max(minimumHeight,size.height??availableHeight),free=height-gap,calendarHeight=size.calendar===null?Math.max(minCalendar,free-Math.max(minGold,innerHeight<=850?270:320)):clamp(size.calendar*free,minCalendar,free-minGold)
 const style={'--market-side':size.side===null?'clamp(340px,24vw,420px)':`clamp(300px,${size.side*100}%,min(640px,calc(100% - 454px)))`,'--market-calendar':`${calendarHeight}px ${free-calendarHeight}px`,'--market-height':`${height}px`} as CSSProperties
 return <><div className="market-layout-tools"><span>برای تغییر اندازه، لبه یا گوشهٔ باکس‌ها را بکشید.</span><button type="button" onClick={()=>setSize(empty)}><RotateCcw size={14}/>چیدمان پیش‌فرض</button></div><div ref={grid} className={`analysis-grid market-desk${active?' market-resizing':''}${size.height!==null?' market-custom-height':''}`} style={style}><div className="analysis-chart">{chart(handles('chart'))}</div><aside className="analysis-context" aria-label="اطلاعات بازار">{calendar(handles('calendar'))}{flicker(handles('flicker'),setGoldContentHeight)}</aside>{active&&<div className="market-drag-shield"/>}</div></>
}
