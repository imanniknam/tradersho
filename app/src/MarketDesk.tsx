import {useContext,useEffect,useRef,useState} from 'react'
import type {CSSProperties,KeyboardEvent,PointerEvent,ReactNode} from 'react'
import {RotateCcw} from 'lucide-react'
import {CalendarUserContext} from './calendar/preferences'
import './market-desk.css'

type Size={side:number|null;calendar:number|null;height:number|null}
type Panel='chart'|'calendar'|'flicker'
type Edge='n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'
const empty:Size={side:null,calendar:null,height:null}
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n))
const names={chart:'چارت',calendar:'تقویم',flicker:'فلیکر'}
const directions={n:'بالا',s:'پایین',e:'راست',w:'چپ',ne:'بالا راست',nw:'بالا چپ',se:'پایین راست',sw:'پایین چپ'}
export default function MarketDesk({chart,calendar,flicker}:{chart:(handles:ReactNode)=>ReactNode;calendar:(handles:ReactNode)=>ReactNode;flicker:(handles:ReactNode)=>ReactNode}){
 const user=useContext(CalendarUserContext),key=`tradersho.market-layout.v1.${user}`
 const [size,setSize]=useState<Size>(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');return saved&&['side','calendar','height'].every(k=>saved[k]===null||typeof saved[k]==='number'&&Number.isFinite(saved[k])&&saved[k]>0)?saved:empty}catch{return empty}})
 const grid=useRef<HTMLDivElement>(null),drag=useRef<{id:number;node:HTMLElement;x:number;y:number;width:number;height:number;side:number;calendar:number;panel:Panel;edge:Edge;size:Size}|null>(null)
 const [active,setActive]=useState(false)
 useEffect(()=>{if(!user||active)return;try{localStorage.setItem(key,JSON.stringify(size))}catch{/* Resizing works without browser storage. */}},[key,user,size,active])
 const resize=(start:NonNullable<typeof drag.current>,dx:number,dy:number)=>{
  const {panel,edge,width,height,side,calendar}=start
  // Adjacent cards share boundaries so resizing cannot overlap the chart or filters.
  const next={...start.size}
  if(edge.includes('e')||edge.includes('w'))next.side=clamp(side+(panel==='chart'?(edge.includes('w')?dx:-dx):edge.includes('w')?-dx:dx),300,Math.min(640,width-440))/width
  if(edge.includes('n')||edge.includes('s')){
   if(panel==='chart')next.height=clamp(height+(edge.includes('n')?-dy:dy),560,Math.max(1600,innerHeight*2))
   else next.calendar=clamp(calendar+(panel==='flicker'?(edge.includes('n')?dy:-dy):edge.includes('n')?-dy:dy),240,height-270)/(height-10)
  }
  setSize(next)
 }
 const finish=(cancel=false)=>{const start=drag.current;if(!start)return;if(cancel)setSize(start.size);drag.current=null;setActive(false);if(start.node.hasPointerCapture(start.id))start.node.releasePointerCapture(start.id)}
 useEffect(()=>{if(!active)return;const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();finish(true)}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[active])
 const measure=(panel:Panel,edge:Edge,node:HTMLElement,id=0,x=0,y=0)=>{const host=grid.current!,r=host.getBoundingClientRect(),side=host.querySelector('.analysis-context')!.getBoundingClientRect(),calendar=host.querySelector('.calendar-preview-card')!.getBoundingClientRect();return {id,node,x,y,width:r.width,height:r.height,side:side.width,calendar:calendar.height,panel,edge,size}}
 const begin=(e:PointerEvent<HTMLButtonElement>,panel:Panel,edge:Edge)=>{if(e.button!==0)return;e.preventDefault();drag.current=measure(panel,edge,e.currentTarget,e.pointerId,e.clientX,e.clientY);e.currentTarget.setPointerCapture(e.pointerId);setActive(true)}
 const keyboard=(e:KeyboardEvent<HTMLButtonElement>,panel:Panel,edge:Edge)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?40:12;resize(measure(panel,edge,e.currentTarget),e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}
 const handles=(panel:Panel)=><div className="market-resize-controls" aria-label={`تغییر اندازهٔ ${names[panel]}`}>{(Object.keys(directions) as Edge[]).map(edge=><button key={edge} type="button" className={`market-resize-handle resize-${edge}`} aria-label={`تغییر اندازهٔ ${names[panel]} از ${directions[edge]}`} title="برای تغییر اندازه بکشید؛ کلیدهای جهت‌دار هم فعال‌اند" onPointerDown={e=>begin(e,panel,edge)} onPointerMove={e=>{const start=drag.current;if(start?.id===e.pointerId)resize(start,e.clientX-start.x,e.clientY-start.y)}} onPointerUp={()=>finish()} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish()} onKeyDown={e=>keyboard(e,panel,edge)}><span/></button>)}</div>
 const style={'--market-side':size.side===null?'clamp(340px,24vw,420px)':`clamp(300px,${size.side*100}%,min(640px,calc(100% - 454px)))`,'--market-calendar':size.calendar===null?'minmax(240px,1fr) minmax(270px,var(--market-gold-default,320px))':`minmax(240px,${clamp(size.calendar,.2,.85)}fr) minmax(270px,${1-clamp(size.calendar,.2,.85)}fr)`,'--market-height':size.height===null?'auto':`${size.height}px`} as CSSProperties
 return <><div className="market-layout-tools"><span>برای تغییر اندازه، لبه یا گوشهٔ باکس‌ها را بکشید.</span><button type="button" onClick={()=>setSize(empty)}><RotateCcw size={14}/>چیدمان پیش‌فرض</button></div><div ref={grid} className={`analysis-grid market-desk${active?' market-resizing':''}${size.height!==null?' market-custom-height':''}`} style={style}><div className="analysis-chart">{chart(handles('chart'))}</div><aside className="analysis-context" aria-label="اطلاعات بازار">{calendar(handles('calendar'))}{flicker(handles('flicker'))}</aside>{active&&<div className="market-drag-shield"/>}</div></>
}
