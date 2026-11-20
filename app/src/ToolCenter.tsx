import {lazy,Suspense,useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import MarketDesk from './MarketDesk'
import {Link,useParams} from 'react-router-dom'
import {ArrowLeft,SlidersHorizontal,ChartNoAxesCombined,Clock3,RefreshCw,CalendarDays,ShieldCheck,BookOpen,Compass,Workflow,LayoutGrid} from 'lucide-react'
import {api} from './api'
import TradingViewChart from './TradingViewChart'
import RiskWidget from './risk/RiskWidget'
import RiskPanel from './risk/RiskPanel'
import './tool-workspace.css'
import CalendarPage from './calendar/CalendarPage'
import EventDetail from './calendar/EventDetail'
import type {EconomicEvent} from './calendar/EventDetail'
import ImpactFilter from './calendar/ImpactFilter'
import CurrencyFilter from './calendar/CurrencyFilter'
import {useCalendarPreference} from './calendar/preferences'

const ExpertAcademy=lazy(()=>import('./expert/ExpertAcademy'))
const sections=[
 {id:'chart',title:'نمای بازار',icon:ChartNoAxesCombined},
 {id:'risk',title:'پنل مدیریت ریسک',icon:ShieldCheck},
 {id:'expert',title:'اکسپرت',icon:SlidersHorizontal},
 {id:'calendar',title:'تقویم',icon:CalendarDays},
 {id:'journal',title:'ژورنال',icon:BookOpen,soon:true},
 {id:'compass',title:'قطب‌نما',icon:Compass,soon:true},
 {id:'scenario',title:'سناریو',icon:Workflow,soon:true},
 {id:'widgets',title:'ویجت‌ها',icon:LayoutGrid,soon:true},
]
export function ComingSoon({title,description}:{title:string;description?:string}){return <section className="surface coming-soon"><div className="coming-symbol"><Clock3 size={32}/></div><span className="badge badge-muted">به‌زودی</span><h2>{title} در حال آماده‌سازی است</h2><p>{description||'این بخش پس از تکمیل و بررسی در دسترس قرار می‌گیرد.'}</p><div><Link className="button primary" to="/panel/tools">بازگشت به نمای بازار <ArrowLeft size={17}/></Link><Link className="button secondary" to="/panel">بازگشت به داشبورد</Link></div></section>}
export function ToolDetail(){const {toolId}=useParams();return <ToolWorkspace selected={toolId||'chart'}/>}
function ToolWorkspace({selected}:{selected:string}){
 const rail=useRef<HTMLElement>(null)
 useEffect(()=>{const sync=()=>{const node=rail.current,link=node?.querySelector<HTMLElement>('[aria-current="page"]');if(node&&link&&matchMedia('(max-width:900px)').matches){const a=node.getBoundingClientRect(),b=link.getBoundingClientRect();node.scrollLeft+=b.left-a.left-(a.width-b.width)/2}};sync();window.addEventListener('resize',sync);return()=>window.removeEventListener('resize',sync)},[selected])
 const isMarket=selected==='chart'
 const [marketOpened,setMarketOpened]=useState(isMarket)
 useEffect(()=>{if(isMarket)setMarketOpened(true)},[isMarket])
 const section=sections.find(s=>s.id===selected),[state,setState]=useState<'loading'|'ready'|'error'>('loading'),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{if(!marketOpened)return;let live=true;setState('loading');api<{tools:{id:string;status:string}[]}>('/tools').then(async result=>{if(!result.tools.some(t=>t.id==='chart'&&['active','beta'].includes(t.status)))throw Error('نمودار در حال حاضر در دسترس نیست.');await api('/tools/chart/access');if(live)setState('ready')}).catch(e=>{if(live){setError(e.message);setState('error')}});return()=>{live=false}},[marketOpened,revision])
 return <div className={`analysis-center ${selected==='chart'?'analysis-market':selected==='expert'?'analysis-expert':selected==='risk'?'analysis-risk':''}`}><nav ref={rail} className="analysis-rail" aria-label="ابزارهای تحلیل">{sections.map(s=><Link key={s.id} to={s.id==='chart'?'/panel/tools':'/panel/tools/'+s.id} className={selected===s.id?'selected':''} aria-current={selected===s.id?'page':undefined}><span className="analysis-tool-icon"><s.icon size={23} strokeWidth={1.8}/></span><span>{s.title}</span>{s.soon&&<small>به‌زودی</small>}</Link>)}</nav><div className="analysis-body"><header className="analysis-heading"><h1>{section?.title||'ابزار پیدا نشد'}</h1><p>{selected==='chart'?'نمودار و رویدادهای اقتصادی در یک نگاه':'مرکز ابزار و تحلیل تریدر شو'}</p></header>{marketOpened&&<div className="market-view" hidden={!isMarket}><MarketDesk chart={handles=>state==='ready'?<TradingViewChart resizeHandles={handles} visible={isMarket}/>:state==='error'?<section className="surface analysis-error" role="alert"><h2>دریافت نمودار انجام نشد</h2><p>{error}</p><button className="button secondary" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={17}/>تلاش دوباره</button></section>:<div className="surface analysis-error" role="status">در حال آماده‌سازی نمودار…</div>} calendar={(handles,onBounds)=>isMarket?<CalendarPreview resizeHandles={handles} onBounds={onBounds}/>:null} flicker={(handles,onMinimumHeight)=>isMarket?<RiskWidget resizeHandles={handles} onMinimumHeight={onMinimumHeight}/>:null}/></div>}{isMarket?null:selected==='expert'?<Suspense fallback={<div className="surface analysis-error" role="status">در حال آماده‌سازی محیط آموزش…</div>}><ExpertAcademy/></Suspense>:selected==='risk'?<RiskPanel/>:selected==='calendar'?<CalendarPage/>:section?<ComingSoon title={section.title}/>:<section className="surface analysis-error"><h2>ابزار پیدا نشد</h2><Link className="button secondary" to="/panel/tools">بازگشت به نمای بازار</Link></section>}</div></div>
}
function CalendarPreview({resizeHandles,onBounds}:{resizeHandles?:ReactNode;onBounds?:(bounds:{min:number;max:number})=>void}){
 const region=useRef<HTMLDivElement>(null),[visibleCount,setVisibleCount]=useState(6)
 const [currency,setCurrency]=useCalendarPreference('preview','currency'),[impact,setImpact]=useCalendarPreference('preview','impact')
 const clockAnchor=useRef({server:Date.now(),local:performance.now()}),[clock,setClock]=useState(Date.now())
 useEffect(()=>{const tick=()=>setClock(clockAnchor.current.server+performance.now()-clockAnchor.current.local);const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[])
 const [selectedEvent,setSelectedEvent]=useState<{event:EconomicEvent;anchor:HTMLElement}|null>(null)
 const [hoveredEvent,setHoveredEvent]=useState<string|null>(null),[focusedEvent,setFocusedEvent]=useState<string|null>(null)
 const [events,setEvents]=useState<EconomicEvent[]|null>(null),[error,setError]=useState(false),[total,setTotal]=useState(0)
 useEffect(()=>{let live=true,request=0;const load=()=>{const current=++request;api<{events:NonNullable<typeof events>;total?:number;serverNow?:string}>('/calendar?'+new URLSearchParams({upcoming:'1',limit:'50',currency,impact})).then(d=>{if(live&&current===request){const server=d.serverNow?Date.parse(d.serverNow):Date.now();clockAnchor.current={server,local:performance.now()};setClock(server);setEvents(d.events);setTotal(d.total??d.events.length);setError(false)}}).catch(()=>{if(live&&current===request)setError(true)})};const visible=()=>{if(document.visibilityState==='visible')load()};load();const timer=window.setInterval(visible,30000);document.addEventListener('visibilitychange',visible);return()=>{live=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible)}},[currency,impact])
 const day=new Date(clock).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'}),upcoming=(events||[]).filter(e=>e.at&&Date.parse(e.at)>=clock&&e.status!=='cancelled'&&e.status!=='released'),list=[...upcoming].sort((a,b)=>Date.parse(a.at!)-Date.parse(b.at!)).slice(0,visibleCount),upcomingTotal=Math.max(0,total-((events?.length||0)-upcoming.length))
 useEffect(()=>{
  const node=region.current
  if(!node) return
  const card=node.closest<HTMLElement>('.calendar-preview-card')!
  const controls=card.querySelectorAll<HTMLElement>('header,.context-caption,.preview-filters,.context-link')
  const sync=()=>{
   if(!card.offsetParent) return
   const fitted=matchMedia('(min-width:1201px) and (min-height:700px)').matches
   const firstRow=node.querySelector<HTMLElement>('.calendar-preview-event')
   const rowHeight=firstRow?.getBoundingClientRect().height||Math.max(58,Math.min(90,parseFloat(getComputedStyle(node).fontSize)*5))
   setVisibleCount(fitted?Math.max(1,Math.min(50,Math.floor((node.clientHeight-2)/rowHeight))):6)
   if(fitted){
    const cardChrome=card.getBoundingClientRect().height-node.clientHeight+4
    onBounds?.({
     min:Math.ceil(cardChrome+rowHeight),
     max:Math.ceil(cardChrome+rowHeight*Math.max(1,Math.min(upcoming.length,50))),
    })
   }
  }
  const observer=new ResizeObserver(sync)
  observer.observe(node)
  controls.forEach(control=>observer.observe(control))
  window.addEventListener('resize',sync)
  sync()
  return()=>{observer.disconnect();window.removeEventListener('resize',sync)}
 },[onBounds,upcoming.length])
 const emphasizedEvent=[hoveredEvent,focusedEvent,selectedEvent?.event.id].find(id=>list.some(e=>e.id===id))||list[0]?.id
 return <section className="surface context-card calendar-preview-card">{resizeHandles}<header><CalendarDays size={22} aria-hidden="true"/><h2>تقویم اقتصادی</h2></header><p className="context-caption">نزدیک‌ترین رویدادهای آینده · ساعت تهران{error&&events!==null&&' · آخرین دادهٔ دریافت‌شده'}</p><div className="preview-filters"><CurrencyFilter compact value={currency} onChange={v=>{setSelectedEvent(null);setEvents(null);setError(false);setCurrency(v)}}/><ImpactFilter label="اهمیت پیش‌نمایش" value={impact} onChange={v=>{setSelectedEvent(null);setEvents(null);setError(false);setImpact(v)}}/></div><div ref={region} className="calendar-preview">{error&&events===null?<p role="status">دریافت رویدادها انجام نشد؛ دوباره تقویم را بررسی کنید.</p>:events===null?<p role="status">در حال دریافت رویدادها…</p>:list.length?list.map(e=><button type="button" className={'calendar-preview-event'+(e.id===emphasizedEvent?' is-emphasized':'')} key={e.id} onPointerEnter={ev=>{if(ev.pointerType!=='touch')setHoveredEvent(e.id)}} onPointerLeave={()=>setHoveredEvent(null)} onFocus={()=>setFocusedEvent(e.id)} onBlur={()=>setFocusedEvent(null)} aria-haspopup="dialog" aria-expanded={selectedEvent?.event.id===e.id} onClick={ev=>setSelectedEvent({event:e,anchor:ev.currentTarget})} title={e.title+(e.originalTitle?' · '+e.originalTitle:'')}><time dateTime={e.at||e.date}>{e.at?new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'}).format(new Date(e.at)):'—'}{e.date!==day&&<small>{new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',month:'short',day:'numeric'}).format(new Date(e.at||e.date+'T12:00:00Z'))}</small>}</time><bdi className="event-country event-currency" dir="ltr">{e.currency}</bdi><span className="preview-event-title"><strong>{e.title}</strong>{e.originalTitle&&<small lang="en" dir="ltr">{e.originalTitle}</small>}</span><span className={'preview-impact '+(e.impact||'unknown')}><i aria-hidden="true"/>{({high:'زیاد',medium:'متوسط',low:'کم'}[e.impact||'']||'نامشخص')}</span></button>):<p>در داده‌های دریافت‌شده رویداد آینده‌ای با این فیلترها پیدا نشد.</p>}</div><Link className="context-link" to="/panel/tools/calendar">مشاهدهٔ تقویم <ArrowLeft size={15}/>{list.length>0&&<span className="preview-count">{list.length.toLocaleString('fa-IR')} از {upcomingTotal.toLocaleString('fa-IR')}</span>}</Link>{selectedEvent&&<EventDetail event={selectedEvent.event} anchor={selectedEvent.anchor} now={clock} onClose={()=>setSelectedEvent(null)}/>}</section>
}
