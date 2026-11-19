import {useCallback,useContext,useEffect,useRef,useState} from 'react'
import {ArrowLeft,BookOpen,Bot,Check,ChevronDown,Download,Grip,Layers,Maximize2,Minimize2,Pin,RotateCcw,Search,ShieldCheck,X} from 'lucide-react'
import simulatorTemplate from './simulator.html?raw'
import demoMarketSource from './demo-market.mjs?raw'
import {createDemoMarket} from './demo-market.mjs'
const demoMarket=createDemoMarket()
const simulator=simulatorTemplate.replace('/* SHARED_DEMO_MARKET */',demoMarketSource.replace(/^export /gm,''))
import download from './download.json'
import mt4 from './download-mt4.json'
import {advancedTopics,expertTabs,topicTab} from './content'
import type {ExpertTab,Topic} from './content'
import './expert.css'
import {CalendarUserContext} from '../calendar/preferences'
import {chartBackground,useTheme} from '../theme'
type Guide=Topic&{tab:ExpertTab;example?:string;rect?:{x:number;y:number;width:number;height:number}|null}
type GuideWindow={id:string;guide:Guide;pinned:boolean;minimized:boolean;x:number;y:number}
type Scenario={entry:number;sl:number;tp:number;lines:boolean;direction:string;lot:number;risk:number;tpNet:number;slPoints:number;tpPoints:number;ratio:number;orderType:string}
const isScenario=(v:unknown):v is Scenario=>{const s=v as Scenario;return !!s&&['entry','sl','tp','lot','risk','tpNet','slPoints','tpPoints','ratio'].every(k=>Number.isFinite(s[k as keyof Scenario])&&Math.abs(Number(s[k as keyof Scenario]))<1e9)&&typeof s.lines==='boolean'&&['Long','Short'].includes(s.direction)&&['Instant','Pending','Stop Limit'].includes(s.orderType)}
const demoSpread=0.25
const initialScenario:Scenario={entry:4012.57,sl:4002.21,tp:4038.51,lines:true,direction:'Long',lot:.06,risk:62.16,tpNet:155.64,slPoints:10360,tpPoints:25940,ratio:2.5,orderType:'Instant'}
const chartWidth=1400, priceGutter=64, tradeEnd=1040
type ChartPaint=Partial<Record<'background'|'up'|'down'|'volume'|'sl'|'tp',string>>
type ChartTheme=keyof typeof chartBackground
function normalizeChartPaint(paint:ChartPaint|undefined){
 const background=paint?.background
 // The previous Manage → Dark and Restore buttons saved this built-in blue.
 return background==='#071b2e'?{...paint,background:chartBackground.dark}:paint
}
function chartInk(background:string){
 const luminance=[1,3,5].map(i=>{
  const channel=parseInt(background.slice(i,i+2),16)/255
  return channel<=0.04045?channel/12.92:((channel+.055)/1.055)**2.4
 })
 return luminance[0]*.2126+luminance[1]*.7152+luminance[2]*.0722>.179?'#000000':'#ffffff'
}
const fa=(v:number)=>v.toLocaleString('fa-IR')
const isTopic=(v:unknown):boolean=>{const t=v as Topic;return !!t&&typeof t.key==='string'&&t.key.length<160&&typeof t.title==='string'&&t.title.length<500&&typeof t.description==='string'&&t.description.length<6000&&Array.isArray(t.steps)&&t.steps.length<=15&&t.steps.every(s=>typeof s==='string'&&s.length<1500)&&typeof t.note==='string'&&t.note.length<5000}
export default function ExpertAcademy(){
 const account=useContext(CalendarUserContext),storageKey='tradersho.expert.v1.'+account
 const readSaved=()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'null')||{}}catch{return {}}}
 const saved=useRef(readSaved()).current
 const {theme}=useTheme()
 const themeRef=useRef(theme);themeRef.current=theme

 const frame=useRef<HTMLIFrameElement>(null),canvas=useRef<HTMLDivElement>(null),library=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:1100,height:760}),[native,setNative]=useState({height:580,scale:100,width:420,mode:'pro',panelWidth:420,panelHeight:580,popupTop:0,popupWidth:0,popupHeight:0}),[catalog,setCatalog]=useState<Topic[]>(advancedTopics),[windows,setWindows]=useState<GuideWindow[]>([]),[active,setActive]=useState(''),[latest,setLatest]=useState<Guide|null>(null),[scenario,setScenario]=useState(initialScenario),[visited,setVisited]=useState<Set<string>>(new Set()),[query,setQuery]=useState(''),[category,setCategory]=useState<ExpertTab|'all'>('all'),[indexOpen,setIndexOpen]=useState(false),[ready,setReady]=useState(false),[limit,setLimit]=useState(false),[chartPaint,setChartPaint]=useState<Partial<Record<ChartTheme,ChartPaint>>>(()=>{
  const previous=saved.ui?.chartPaint??{[theme]:saved.ui?.paint}
  return {light:normalizeChartPaint(previous.light),dark:normalizeChartPaint(previous.dark)}
 }),[monitor,setMonitor]=useState(saved.ui?.monitor!==false)
 const paint=chartPaint[theme]??{},background=paint.background??chartBackground[theme]
 const mobile=size.width<760||(native.width>500&&size.width<1200),scale=Math.min(native.scale/100,(size.width-(mobile?16:native.width>500&&size.width>=1200?390:32))/native.width,1.2),drag=useRef<{id:string;startX:number;startY:number;x:number;y:number}|null>(null)
 const mobileGuide=useRef<HTMLElement>(null)
 const [panelColors,setPanelColors]=useState<Record<string,string>>({})
 const [monitorMinimized,setMonitorMinimized]=useState(saved.ui?.minimized===true)
 const monitorNode=useRef<HTMLElement>(null),monitorDrag=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null),[monitorPosition,setMonitorPosition]=useState<{left:number;top:number}|null>(saved.ui?.position||null)
 const clampMonitor=useCallback((left:number,top:number)=>{const host=canvas.current,node=monitorNode.current;if(!host||!node)return {left,top};return {left:Math.max(host.clientWidth*tradeEnd/chartWidth+8,Math.min(left,host.clientWidth-priceGutter-node.offsetWidth-8)),top:Math.max(36,Math.min(top,host.clientHeight-node.offsetHeight-8))}},[])
 useEffect(()=>{setMonitorPosition(p=>p?clampMonitor(p.left,p.top):p)},[size.width,size.height,mobile,monitor,monitorMinimized,clampMonitor])
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify({...readSaved(),ui:{chartPaint,monitor,minimized:monitorMinimized,position:monitorPosition}}))}catch{}},[storageKey,chartPaint,monitor,monitorMinimized,monitorPosition])
 const windowsRef=useRef<GuideWindow[]>([]);windowsRef.current=windows
 const openRef=useRef<(g:Guide)=>void>(()=>{})
 const send=useCallback((action:string,extra:Record<string,unknown>={})=>frame.current?.contentWindow?.postMessage({type:'tradersho-expert-command',action,...extra},'*'),[])
 const open=useCallback((g:Guide)=>{const current=windowsRef.current;if(!mobile&&current.length>=4&&current.every(w=>w.pinned)&&!current.some(w=>w.id===g.key)){setLimit(true);return}const preferredX=frame.current&&canvas.current?Math.max(20,frame.current.getBoundingClientRect().right-canvas.current.getBoundingClientRect().left+40):20;setLimit(false);setLatest(g);setVisited(previous=>new Set(previous).add(g.key));setActive(g.key);setWindows(previous=>{const existing=previous.find(w=>w.id===g.key);if(existing)return [...previous.filter(w=>w.id!==g.key),{...existing,guide:g,minimized:false}];const replace=previous.find(w=>!w.pinned),base=previous.filter(w=>w.id!==replace?.id);return [...base.slice(-3),{id:g.key,guide:g,pinned:false,minimized:false,x:replace?.x??Math.max(20,preferredX-base.length*14),y:replace?.y??70+base.length*50}]})},[mobile])
 openRef.current=open
 useEffect(()=>{const node=canvas.current;if(!node)return;const sync=()=>setSize(p=>p.width===node.clientWidth&&p.height===node.clientHeight?p:{width:node.clientWidth,height:node.clientHeight});const observer=new ResizeObserver(sync);observer.observe(node);sync();return()=>observer.disconnect()},[])
 useEffect(()=>{const receive=(e:MessageEvent)=>{if(e.source!==frame.current?.contentWindow||e.origin!=='null'||!e.data)return;const d=e.data;
  if(d.type==='tradersho-expert-save'&&d.snapshot&&JSON.stringify(d.snapshot).length<500000){try{localStorage.setItem(storageKey,JSON.stringify({...readSaved(),snapshot:d.snapshot}))}catch{}}
  if(d.type==='tradersho-expert-panel-palette'&&d.palette&&['background','field','button','line','text','muted','header'].every(k=>typeof d.palette[k]==='string'&&/^(#[0-9a-f]{3,8}|rgba?\([0-9.,% ]+\))$/i.test(d.palette[k])))setPanelColors(d.palette)
  if(d.type==='tradersho-expert-palette'&&d.paint&&['background','up','down','volume','sl','tp'].every(k=>d.paint[k]===undefined||/^#[0-9a-f]{6}$/i.test(d.paint[k]))){
   const currentTheme=themeRef.current
   const background=d.mode==='dark'?chartBackground.dark:undefined
   const update=background?{...d.paint,background}:d.paint
   setChartPaint(previous=>({...previous,[currentTheme]:{...previous[currentTheme],...update}}))
  }
  if(d.type==='tradersho-expert-catalog'&&Array.isArray(d.items)&&d.items.length<600){setCatalog([...d.items.filter(isTopic),...advancedTopics].filter((t,i,a)=>a.findIndex(v=>v.key===t.key)===i));setReady(true)}
  if(d.type==='tradersho-expert-size'&&Number.isFinite(d.height)&&d.height>=20&&d.height<=4000)setNative(p=>{const next={...p,height:Math.ceil(d.height)+2,scale:Number.isFinite(d.scale)?Math.min(120,Math.max(80,d.scale)):p.scale,width:Number.isFinite(d.width)&&d.width>=300&&d.width<=1400?d.width:p.width,mode:['simple','pro'].includes(d.mode)?d.mode:p.mode,...Object.fromEntries(['panelWidth','panelHeight','popupTop','popupWidth','popupHeight'].map(k=>[k,Number.isFinite(d[k])&&d[k]>=0&&d[k]<=4000?d[k]:p[k as keyof typeof p]]))};return Object.keys(next).every(k=>next[k as keyof typeof next]===p[k as keyof typeof p])?p:next})
  if(d.type==='tradersho-expert-scenario'&&isScenario(d.scenario))setScenario(d.scenario)
  if(d.type==='tradersho-expert-guide'&&isTopic(d)&&expertTabs.some(t=>t.id===d.tab)){const rect=d.rect&&['x','y','width','height'].every(k=>Number.isFinite(d.rect[k]))?d.rect:null;openRef.current({...d,rect})}
 };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)},[])
 useEffect(()=>{send('viewport',{width:size.width})},[send,size.width])
 useEffect(()=>{if(indexOpen)library.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})},[indexOpen])
 const selectTopic=(topic:Topic)=>{const tab=topicTab(topic.key);open({...topic,tab,rect:null});send('topic',{key:topic.key,tab});setIndexOpen(false);canvas.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}
 const arrange=()=>{const columns=Math.max(1,Math.min(2,Math.floor((size.width-native.width*scale-60)/360)));setWindows(previous=>previous.map((w,i)=>({...w,x:Math.min(size.width-360,native.width*scale+60+(columns===2?i%2*350:i*14)),y:66+(columns===2?Math.floor(i/2)*210:i*42),minimized:false})))}
 // Preserve user-placed guides; a panel height change must not rearrange every window.
 useEffect(()=>{if(mobile)return;const maxX=Math.max(20,size.width-360),minX=Math.min(maxX,native.width*scale+60);setWindows(previous=>{let changed=false;const next=previous.map(w=>{const x=Math.min(maxX,Math.max(minX,w.x)),y=Math.max(16,Math.min(w.y,Math.max(16,size.height-200)));if(x===w.x&&y===w.y)return w;changed=true;return {...w,x,y}});return changed?next:previous})},[size.width,size.height,native.width,scale,mobile])
 const move=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return;const x=Math.max(8,Math.min(size.width-340,d.x+e.clientX-d.startX)),y=Math.max(44,Math.min(size.height-130,d.y+e.clientY-d.startY));setWindows(previous=>previous.map(w=>w.id===d.id?{...w,x,y}:w))}
 const point=latest?.rect&&frame.current&&canvas.current?(()=>{const a=frame.current!.getBoundingClientRect(),b=canvas.current!.getBoundingClientRect(),r=latest!.rect!;return {x:a.left-b.left+(r.x+r.width/2)*scale,y:a.top-b.top+(r.y+r.height/2)*scale,frameRight:a.right-b.left}})():null
 const activeWindow=windows.find(w=>w.id===active),lineEnd=activeWindow?{x:activeWindow.x,y:Math.max(activeWindow.y+50,Math.min(point?.y??activeWindow.y+50,activeWindow.y+Math.min(570,size.height-activeWindow.y-25)))}:null
 useEffect(()=>{
  const guide=mobileGuide.current, scroll=canvas.current?.closest('.main-scroll')
  if(!mobile||!guide||!scroll)return
  const previewBottom=guide.getBoundingClientRect().top+Math.min(82,guide.offsetHeight)
  const navTop=document.querySelector('.mobile-bottom')?.getBoundingClientRect().top||innerHeight
  const hidden=previewBottom-Math.min(navTop,scroll.getBoundingClientRect().bottom)+8
  if(hidden>0)scroll.scrollBy({top:hidden,behavior:'instant'})
 },[mobile,active,latest,native.height,scale])
 const target=latest?.rect&&point?{x:point.x-latest.rect.width*scale/2,y:point.y-latest.rect.height*scale/2,width:latest.rect.width*scale,height:latest.rect.height*scale}:null
 const connector=target&&lineEnd&&point?{endX:point.frameRight+8,endY:target.y+target.height/2,bendX:point.frameRight+20}:null
 const filtered=catalog.filter(t=>(category==='all'||topicTab(t.key)===category)&&(!query.trim()||(t.title+' '+t.description+' '+t.key).toLowerCase().includes(query.trim().toLowerCase())))
 const focusWindow=(id:string)=>{setActive(id);setWindows(previous=>{const w=previous.find(v=>v.id===id);return w?[...previous.filter(v=>v.id!==id),w]:previous})}
 const pin=(id:string)=>setWindows(previous=>previous.map(w=>w.id===id?{...w,pinned:!w.pinned}:w))
 return <div className="expert-academy" data-ready={ready} data-compact={mobile}><header className="expert-academy-intro"><div><span className="expert-eyebrow"><Bot size={16}/>آزمایشگاه تعاملی اکسپرت <bdi>v2.13</bdi></span><h2>پنل را لمس کن؛ کاربردش را یاد بگیر.</h2><p>یک چارت ثابت، کنترل‌های قابل‌تجربه و راهنمای فارسی برای هر تصمیم.</p></div><div><a className="button secondary" href="#expert-downloads"><Download size={16}/>دانلود و نصب</a></div></header>
 <section className="expert-lab" aria-label="محیط آموزشی اکسپرت">{!mobile&&<header className="expert-lab-toolbar"><div><span className="expert-live-dot"/><strong><bdi>XAUUSD</bdi> · میز آموزش</strong><span className="expert-demo-badge">سناریوی ثابت و فرضی</span></div><div><button onClick={()=>setIndexOpen(v=>!v)} aria-expanded={indexOpen} aria-controls="expert-topic-library"><BookOpen size={16}/>فهرست راهنماها</button><button onClick={()=>setMonitor(v=>!v)} aria-pressed={monitor}>مانیتور</button><button onClick={arrange}><Layers size={16}/>چینش پنجره‌ها</button><button onClick={()=>{setWindows([]);setScenario(initialScenario);setChartPaint({});send('reset')}} aria-label="بازنشانی محیط آموزشی"><RotateCcw size={17}/><span>بازنشانی</span></button></div></header>}

 <div className={'expert-chart-workbench'+(mobile?' compact':'')} ref={canvas} style={{...Object.fromEntries(Object.entries(panelColors).map(([key,value])=>['--expert-panel-'+key,value])),'--expert-chart-bg':background,'--expert-chart-ink':chartInk(background),'--expert-price-gutter':`${priceGutter}px`,'--expert-panel-height':`${native.height*scale}px`} as React.CSSProperties}>{!mobile&&monitor&&<aside ref={monitorNode} className={'expert-market-monitor'+(monitorMinimized?' monitor-minimized':'')} aria-label="مانیتور آموزشی" style={!mobile&&monitorPosition?{left:monitorPosition.left,top:monitorPosition.top,right:'auto',bottom:'auto'}:undefined}><header onPointerDown={e=>{if(mobile||(e.target as HTMLElement).closest('button'))return;const node=monitorNode.current,host=canvas.current;if(!node||!host)return;const r=node.getBoundingClientRect(),h=host.getBoundingClientRect();monitorDrag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left-h.left,top:r.top-h.top};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault()}} onPointerMove={e=>{const d=monitorDrag.current;if(!d||d.id!==e.pointerId)return;setMonitorPosition(clampMonitor(d.left+e.clientX-d.x,d.top+e.clientY-d.y))}} onPointerUp={e=>{monitorDrag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{monitorDrag.current=null}}><bdi>XAUUSD • M15</bdi><div className="expert-monitor-actions"><button onClick={()=>setMonitorMinimized(v=>!v)} aria-label={monitorMinimized?'بازکردن مانیتور آموزشی':'جمع‌کردن مانیتور آموزشی'} aria-expanded={!monitorMinimized}>{monitorMinimized?<Maximize2 size={13}/>:<Minimize2 size={13}/>}</button><button onClick={()=>setMonitor(false)} aria-label="بستن مانیتور آموزشی"><X size={14}/></button></div></header><button onClick={()=>{const t=catalog.find(t=>t.key==='monitor');if(t)open({...t,tab:'setup',rect:null})}}><span>SPREAD</span><bdi>{demoSpread.toFixed(2)}</bdi></button><button onClick={()=>{const t=catalog.find(t=>t.key==='monitor');if(t)open({...t,tab:'setup',rect:null})}}><span>NET P/L</span><bdi>+45.00 USD</bdi></button><div><span>CANDLE CLOSE</span><bdi>08:30</bdi></div><small>مقادیر ثابتِ مثال آموزشی</small></aside>}{!mobile&&<><StaticChart scenario={scenario} paint={paint} width={size.width} onLevel={(key,value)=>{setScenario(s=>({...s,[key]:value}));send('level',{key,value})}}/><div className="expert-chart-caption"><span>چارت آموزشی · قیمت‌ها زنده نیستند</span><bdi>M15 / XAUUSD</bdi></div></>}<div className="expert-native-desk" style={{width:native.width*scale,height:native.height*scale}}><div className="expert-native-handle"><Bot size={14}/><span>پنل آموزشی <bdi>MT5</bdi></span><div className="expert-native-modes">{[['simple','Simple'],['pro','Pro']].map(([mode,label])=><button key={mode} aria-pressed={native.mode===mode} onClick={()=>send('mode',{mode})}>{label}</button>)}</div></div><iframe ref={frame} title="نسخهٔ آموزشی پنل اکسپرت متاتریدر ۵" srcDoc={simulator} allowTransparency={true} sandbox="allow-scripts" width={native.width} height={native.height} style={{transform:`scale(${scale})`,clipPath:native.popupWidth?`polygon(evenodd, 0% 0%, ${native.panelWidth/native.width*100}% 0%, ${native.panelWidth/native.width*100}% ${native.panelHeight/native.height*100}%, 0% ${native.panelHeight/native.height*100}%, 0% 0%, ${(native.panelWidth+12)/native.width*100}% ${native.popupTop/native.height*100}%, 100% ${native.popupTop/native.height*100}%, 100% ${(native.popupTop+native.popupHeight)/native.height*100}%, ${(native.panelWidth+12)/native.width*100}% ${(native.popupTop+native.popupHeight)/native.height*100}%, ${(native.panelWidth+12)/native.width*100}% ${native.popupTop/native.height*100}%, 0% 0%)`:'inset(0)'}} onLoad={()=>{send('restore-session',{snapshot:readSaved().snapshot||null});send('viewport',{width:size.width});send('catalog')}}/></div>
 {!mobile&&latest?.key===active&&point&&lineEnd&&target&&connector&&!activeWindow?.minimized&&point.y>=35&&point.y<size.height-10&&<svg className="expert-guide-arrow" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true"><defs><marker id="expert-arrow-tip" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none"/></marker></defs>{lineEnd.x-6>connector.endX+5&&<path data-expert-connector="true" d={`M ${lineEnd.x-6} ${lineEnd.y} H ${connector.bendX} V ${connector.endY} H ${connector.endX}`} markerEnd="url(#expert-arrow-tip)"/>}</svg>}

 {mobile&&activeWindow&&<article ref={mobileGuide} className="expert-inline-guide" aria-label={activeWindow.guide.title}>
  <header><h3>{activeWindow.guide.title}</h3><button type="button" onClick={()=>setActive('')} aria-label="بستن راهنما"><X size={16}/></button></header>
  <p>{activeWindow.guide.description}</p>
  <ol>{activeWindow.guide.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>
  {activeWindow.guide.example&&<p>{activeWindow.guide.example}</p>}
  <p className="expert-inline-note">{activeWindow.guide.note}</p>
 </article>}
 {!mobile&&<div className="expert-window-layer" role="region" aria-label="پنجره‌های راهنمای باز">{windows.map((w,i)=><article key={w.id} className={'expert-help-window '+(w.id===active?'active':'')+(w.minimized?' minimized':'')} style={mobile?undefined:{left:w.x,top:w.y,zIndex:20+i,maxHeight:Math.max(100,size.height-w.y-16)}} onFocus={()=>focusWindow(w.id)} aria-label={w.guide.title}><header onPointerDown={e=>{if(mobile||(e.target as HTMLElement).closest('button'))return;focusWindow(w.id);drag.current={id:w.id,startX:e.clientX,startY:e.clientY,x:w.x,y:w.y};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={move} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}><span className="expert-window-grip"><Grip size={16}/><span>{expertTabs.find(t=>t.id===w.guide.tab)?.en} <bdi> / {fa(i+1)}</bdi></span></span><div><button onClick={()=>pin(w.id)} aria-label={w.pinned?'آزادکردن راهنما':'سنجاق‌کردن راهنما'} aria-pressed={w.pinned}><Pin size={15}/></button><button onClick={()=>setWindows(previous=>previous.map(v=>v.id===w.id?{...v,minimized:!v.minimized}:v))} aria-label={w.minimized?'بازکردن پنجره راهنما':'جمع‌کردن پنجره راهنما'}>{w.minimized?<Maximize2 size={15}/>:<Minimize2 size={15}/>}</button><button onClick={()=>setWindows(previous=>previous.filter(v=>v.id!==w.id))} aria-label={'بستن راهنمای '+w.guide.title}><X size={16}/></button></div></header><div className="expert-window-content"><span className="expert-guide-tag">راهنمای همین کنترل</span><h3>{w.guide.title}</h3><p>{w.guide.description}</p><ol>{w.guide.steps.map((step,index)=><li key={index}><b>{fa(index+1)}</b><span>{step}</span></li>)}</ol>{w.guide.example&&<div className="expert-example"><small>در سناریوی فعلی شما</small><p>{w.guide.example}</p></div>}<div className="expert-guide-note"><ShieldCheck size={16}/><p>{w.guide.note}</p></div><button className="expert-locate-control" onClick={()=>{setActive(w.id);send('topic',{key:w.guide.key,tab:w.guide.tab})}}>نمایش این بخش در پنل<ArrowLeft size={15}/></button></div>{w.minimized&&<button className="expert-minimized-title" onClick={()=>setWindows(previous=>previous.map(v=>v.id===w.id?{...v,minimized:false}:v))}>{w.guide.title}<ChevronDown size={15}/></button>}</article>)}</div>}</div>
 {!mobile&&<footer className="expert-lab-footer"><span><Pin size={14}/>{limit&&windows.length>=4?'چهار راهنما سنجاق شده‌اند؛ برای راهنمای تازه یکی را آزاد یا بسته کنید.':'راهنما را سنجاق کن، بعد روی گزینهٔ بعدی بزن تا چند پنجره باز بماند.'}</span><span>{fa(visited.size)} راهنما دیده‌شده</span></footer>}</section>
 <section ref={library} className="expert-topic-library" id="expert-topic-library" hidden={!indexOpen}><header><div><span className="expert-eyebrow">CONTROL LIBRARY</span><h3>از هرجای پنل، راه درست را پیدا کن.</h3></div><button onClick={()=>setIndexOpen(false)} aria-label="بستن فهرست راهنماها"><X size={20}/></button></header><div className="expert-topic-filters"><label><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="نام فارسی یا انگلیسی کنترل…" aria-label="جستجوی راهنمای اکسپرت"/></label><div role="group" aria-label="بخش راهنما"><button aria-pressed={category==='all'} onClick={()=>setCategory('all')}>همه</button>{expertTabs.map(t=><button key={t.id} aria-pressed={category===t.id} onClick={()=>setCategory(t.id)}>{t.en}</button>)}</div></div><div className="expert-topic-grid">{filtered.map(t=><button key={t.key} onClick={()=>selectTopic(t)}><span>{expertTabs.find(tab=>tab.id===topicTab(t.key))?.en}</span><strong>{t.title}</strong>{visited.has(t.key)?<Check size={16}/>:<ArrowLeft size={16}/>}</button>)}{!filtered.length&&<p>راهنمایی با این جستجو پیدا نشد.</p>}</div></section>
 <section className="expert-downloads" id="expert-downloads"><header><div><h3>یاد بگیر؛ بعد در متاتریدر امتحان کن.</h3><p>فایل نسخهٔ ارسالی، راهنمای نصب و کاتالوگ کامل آموزش در یک‌جا.</p></div><Download size={32}/></header><div className="expert-download-grid"><article className="expert-download-primary"><img className="expert-platform-logo" src="/assets/platforms/metatrader5.png" alt="MetaTrader 5"/><span className="expert-download-platform">MT5 <bdi>v{download.version}</bdi></span><h4>اکسپرت متاتریدر ۵</h4><p>EX5 آمادهٔ نصب، راهنمای نصب و فایل‌های مجوز.</p><a href={'/downloads/'+download.file} download className="button secondary"><Download size={17}/>دریافت نسخهٔ MT5<span>{(download.bytes/1048576).toFixed(2)} MB</span></a></article><article><img className="expert-platform-logo" src="/assets/platforms/metatrader4.png" alt="MetaTrader 4"/><span className="expert-download-platform">MT4 <bdi>v{mt4.version}</bdi></span><h4>اکسپرت متاتریدر ۴</h4><p>فایل اصلی EX4 ارسالی، همراه راهنمای نصب MT4. ابتدا در حساب دمو بررسی کنید.</p><a href={'/downloads/'+mt4.file} download className="button secondary"><Download size={17}/>دریافت نسخهٔ MT4<span>{(mt4.bytes/1048576).toFixed(2)} MB</span></a></article><article><span className="expert-download-platform expert-download-guide"><span>راهنمای فارسی</span><BookOpen size={22}/></span><h4>کاتالوگ آموزشی</h4><p>نصب، کاربرد کنترل‌ها، مسیرهای یادگیری و نکات نسخهٔ ۲.۱۳.</p><a href="/downloads/Tradersho-Expert-v2.13-Guide.pdf" download className="button secondary"><Download size={17}/>دانلود کاتالوگ PDF</a></article></div></section></div>
}
function StaticChart({scenario,paint,width,onLevel}:{scenario:Scenario;paint:ChartPaint;width:number;onLevel:(key:'entry'|'sl'|'tp',value:number)=>void}){
 const priceAxis=chartWidth*(1-priceGutter/width)
 const levelDrag=useRef<'entry'|'sl'|'tp'|null>(null)
 const bars=demoMarket.bars('M15').slice(-48),offset=initialScenario.entry-bars[bars.length-1].close
 // Fit every wick inside the plot. The fixed series still shares its OHLC/ATR
 // with the educational panel; dragging a level never rescales the candles.
 const candles=bars.map(c=>({...c,open:c.open+offset,high:c.high+offset,low:c.low+offset,close:c.close+offset,volume:12+c.volume%54}))
 const priceMin=Math.floor((Math.min(...candles.map(c=>c.low),initialScenario.sl)-8)/10)*10,priceMax=Math.ceil((Math.max(...candles.map(c=>c.high),initialScenario.tp)+8)/10)*10
 const plotTop=90,plotBottom=640,plotStart=40,lastCandleX=820
 const candleX=(index:number)=>plotStart+(lastCandleX-plotStart)*(index/(candles.length-1))
 const y=(p:number)=>plotTop+(priceMax-p)/(priceMax-priceMin)*(plotBottom-plotTop)
 const priceLabels = ([
  {label:'ENTRY', price:scenario.entry},
  {label:'SL', price:scenario.sl},
  {label:'TP', price:scenario.tp},
 ] as const).map(level=>({...level, y:y(level.price)})).sort((a,b)=>a.y-b.y)
 for(let i=0;i<priceLabels.length;i++){
  priceLabels[i].y=Math.max(76,priceLabels[i].y,i===0?0:priceLabels[i-1].y+26)
 }
 for(let i=priceLabels.length-1;i>=0;i--){
  priceLabels[i].y=Math.min(660,priceLabels[i].y,i===priceLabels.length-1?660:priceLabels[i+1].y-26)
 }
 const labelWidth=tradeEnd-lastCandleX-28,labelCenter=(tradeEnd+lastCandleX)/2
 const side=scenario.direction==='Long'?'Buy':'Sell'
 const order=scenario.orderType==='Instant'?side:scenario.orderType==='Pending'?`Pending ${side}`:`${side} Stop Limit`
 const net=(value:number)=>`${value<0?'−':value>0?'+':''}$${Math.abs(value).toFixed(2)} Net`
 const levelDetails={
  ENTRY:`(${order} ${scenario.lot.toFixed(2)}) R:R ${scenario.ratio.toFixed(2)}`,
  SL:`(${net(-scenario.risk)}) | ${Math.round(scenario.slPoints)} points`,
  TP:`(${net(scenario.tpNet)}) | ${Math.round(scenario.tpPoints)} points`
 }

 const moveLevel=(e:React.PointerEvent<SVGSVGElement>)=>{const key=levelDrag.current;if(!key)return;const box=e.currentTarget.getBoundingClientRect(),value=Math.round((priceMax-((e.clientY-box.top)/box.height*780-plotTop)/(plotBottom-plotTop)*(priceMax-priceMin))*100)/100,long=scenario.direction==='Long';if(key==='entry'){onLevel(key,Math.max(priceMin,Math.min(priceMax,long?Math.max(scenario.sl+.01,Math.min(scenario.tp-.01,value)):Math.max(scenario.tp+.01,Math.min(scenario.sl-.01,value)))));return}const below=key==='sl'?long:!long;onLevel(key,below?Math.max(priceMin,Math.min(scenario.entry-.01,value)):Math.min(priceMax,Math.max(scenario.entry+.01,value)))}
 return <svg onPointerMove={moveLevel} onPointerUp={()=>{levelDrag.current=null}} onPointerCancel={()=>{levelDrag.current=null}} className="expert-static-chart" style={{'--expert-up':paint.up,'--expert-down':paint.down,'--expert-volume':paint.volume,'--expert-sl':paint.sl,'--expert-tp':paint.tp} as React.CSSProperties} viewBox="0 0 1400 780" preserveAspectRatio="none" role="img" aria-label="چارت ثابت آموزشی طلا؛ دادهٔ فرضی، بدون قیمت زنده"><defs><clipPath id="expert-plot-clip"><rect x="30" y="72" width={priceAxis-30} height="600"/></clipPath></defs><rect width="1400" height="780" fill="var(--expert-chart-bg)"/><line className="expert-price-axis" x1={priceAxis} x2={priceAxis} y1="70" y2="740"/>{Array.from({length:9},(_,i)=><g key={i}><line x1="20" x2={priceAxis} y1={y(priceMax-i*(priceMax-priceMin)/8)} y2={y(priceMax-i*(priceMax-priceMin)/8)}/><text className="expert-axis-tick" textLength={44*chartWidth/width} lengthAdjust="spacingAndGlyphs" x={chartWidth-8*chartWidth/width} textAnchor="end" y={y(priceMax-i*(priceMax-priceMin)/8)+4}>{(priceMax-i*(priceMax-priceMin)/8).toFixed(2)}</text></g>)}{Array.from({length:9},(_,i)=><line key={i} x1={plotStart+i*(tradeEnd-plotStart)/8} x2={plotStart+i*(tradeEnd-plotStart)/8} y1="70" y2="740"/>)}<g clipPath="url(#expert-plot-clip)">{candles.map((c,i)=><g key={i} data-candle-index={i} className={c.close>=c.open?'candle-up':'candle-down'}><line x1={candleX(i)} x2={candleX(i)} y1={y(c.high)} y2={y(c.low)}/><rect x={candleX(i)-4} y={Math.min(y(c.open),y(c.close))} width="8" height={Math.max(2,Math.abs(y(c.open)-y(c.close)))}/></g>)}</g>{candles.map((c,i)=><rect className={c.close>=c.open?'volume-up':'volume-down'} key={i} x={candleX(i)-4} y={740-c.volume} width="8" height={c.volume}/>)}{scenario.lines&&<g className="expert-trade-zones"><rect x={lastCandleX} width={tradeEnd-lastCandleX} y={Math.min(y(scenario.entry),y(scenario.sl))} height={Math.abs(y(scenario.entry)-y(scenario.sl))} fill={paint.sl||'#a66b32'} opacity=".38"/><rect x={lastCandleX} width={tradeEnd-lastCandleX} y={Math.min(y(scenario.entry),y(scenario.tp))} height={Math.abs(y(scenario.entry)-y(scenario.tp))} fill={paint.tp||'#5142bd'} opacity=".42"/></g>}{
  scenario.lines && priceLabels.map(({label,price,y:labelY})=>{
   const priceY=y(price),title=`${label==='ENTRY'?'Entry':label} ${price.toFixed(2)}`
   const fitText=title.length+levelDetails[label].length>37
   return <g key={label} className={'scenario-level '+label} style={{cursor:'ns-resize',touchAction:'none'}} onPointerDown={e=>{
    levelDrag.current=label==='ENTRY'?'entry':label==='SL'?'sl':'tp'
    e.currentTarget.setPointerCapture(e.pointerId)
   }}>
    <line className="scenario-level-hit" style={{stroke:'transparent',strokeWidth:14,strokeDasharray:'none'}} x1="30" x2={tradeEnd} y1={priceY} y2={priceY}/>
    <line x1="30" x2={tradeEnd} y1={priceY} y2={priceY}/>
    <line className="scenario-boundary" x1={lastCandleX} x2={tradeEnd} y1={priceY} y2={priceY}/>
    {priceY!==labelY&&<line className="scenario-boundary" x1={labelCenter} x2={labelCenter} y1={priceY} y2={labelY}/>}
    <rect x={labelCenter-labelWidth/2} y={labelY-10} width={labelWidth} height="20" rx="2"/>
    <text x={labelCenter} y={labelY+3.5} textAnchor="middle" textLength={fitText?labelWidth-12:undefined} lengthAdjust="spacingAndGlyphs"><tspan data-level-price="">{title}</tspan>{' '+levelDetails[label]}</text>
   </g>
  })
 }{[0,1,2,3].map(i=><text key={i} x={plotStart+i*(lastCandleX-plotStart)/3} y="765">{['06:00','09:00','12:00','15:00'][i]}</text>)}</svg>
}
