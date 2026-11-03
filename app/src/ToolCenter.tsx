import {useEffect,useRef,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {ArrowLeft,Bot,ChartNoAxesCombined,Clock3,RefreshCw,CalendarDays,ShieldCheck,BookOpen,Compass,Workflow,LayoutGrid} from 'lucide-react'
import {api} from './api'
import TradingViewChart from './TradingViewChart'
import FlickerGoldSentiment from './FlickerGoldSentiment'
import './tool-workspace.css'
import CountryLabel from './calendar/CountryLabel'
import CalendarPage from './calendar/CalendarPage'

const sections=[
 {id:'chart',title:'نمای بازار',icon:ChartNoAxesCombined},
 {id:'risk',title:'پنل ریسک',icon:ShieldCheck,soon:true},
 {id:'expert',title:'اکسپرت',icon:Bot,soon:true},
 {id:'journal',title:'ژورنال',icon:BookOpen,soon:true},
 {id:'compass',title:'قطب‌نما',icon:Compass,soon:true},
 {id:'scenario',title:'سناریو',icon:Workflow,soon:true},
 {id:'widgets',title:'ویجت‌ها',icon:LayoutGrid,soon:true},
 {id:'calendar',title:'تقویم',icon:CalendarDays},
]
export function ComingSoon({title,description}:{title:string;description?:string}){return <section className="surface coming-soon"><div className="coming-symbol"><Clock3 size={32}/></div><span className="badge badge-muted">به‌زودی</span><h2>{title} در حال آماده‌سازی است</h2><p>{description||'این بخش پس از تکمیل و بررسی در دسترس قرار می‌گیرد.'}</p><div><Link className="button primary" to="/panel/tools">بازگشت به نمای بازار <ArrowLeft size={17}/></Link><Link className="button secondary" to="/panel">بازگشت به داشبورد</Link></div></section>}
export function ToolsPage(){return <ToolWorkspace selected="chart"/>}
export function ToolDetail(){const {toolId}=useParams();return <ToolWorkspace selected={toolId||'chart'}/>}
function ToolWorkspace({selected}:{selected:string}){
 const section=sections.find(s=>s.id===selected),[state,setState]=useState<'loading'|'ready'|'error'>('loading'),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{if(selected!=='chart')return;let live=true;setState('loading');api<{tools:{id:string;status:string}[]}>('/tools').then(async result=>{if(!result.tools.some(t=>t.id==='chart'&&['active','beta'].includes(t.status)))throw Error('نمودار در حال حاضر در دسترس نیست.');await api('/tools/chart/access');if(live)setState('ready')}).catch(e=>{if(live){setError(e.message);setState('error')}});return()=>{live=false}},[selected,revision])
 return <div className={`analysis-center ${selected==='chart'?'analysis-market':''}`}><nav className="analysis-rail" aria-label="ابزارهای تحلیل">{sections.map(s=><Link key={s.id} to={s.id==='chart'?'/panel/tools':'/panel/tools/'+s.id} className={selected===s.id?'selected':''} aria-current={selected===s.id?'page':undefined}><s.icon size={23} strokeWidth={1.7}/><span>{s.title}</span>{s.soon&&<small>به‌زودی</small>}</Link>)}</nav><div className="analysis-body"><header className="analysis-heading"><h1>{section?.title||'ابزار پیدا نشد'}</h1><p>{selected==='chart'?'نمودار و رویدادهای اقتصادی در یک نگاه':'مرکز ابزار و تحلیل تریدر شو'}</p></header>{selected==='chart'?<div className="analysis-grid"><div className="analysis-chart">{state==='ready'?<TradingViewChart/>:state==='error'?<section className="surface analysis-error" role="alert"><h2>دریافت نمودار انجام نشد</h2><p>{error}</p><button className="button secondary" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={17}/>تلاش دوباره</button></section>:<div className="surface analysis-error" role="status">در حال آماده‌سازی نمودار…</div>}</div><aside className="analysis-context" aria-label="اطلاعات بازار"><CalendarPreview/><FlickerGoldSentiment/></aside></div>:selected==='calendar'?<CalendarPage/>:section?<ComingSoon title={section.title}/>:<section className="surface analysis-error"><h2>ابزار پیدا نشد</h2><Link className="button secondary" to="/panel/tools">بازگشت به نمای بازار</Link></section>}</div></div>
}
function CalendarPreview(){
 const region=useRef<HTMLDivElement>(null),[visibleCount,setVisibleCount]=useState(6)
 const clockAnchor=useRef({server:Date.now(),local:performance.now()}),[clock,setClock]=useState(Date.now())
 useEffect(()=>{const tick=()=>setClock(clockAnchor.current.server+performance.now()-clockAnchor.current.local);const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[])
 const [events,setEvents]=useState<{id:string;title:string;originalTitle?:string;currency:string;country?:string;impact?:string|null;at:string|null;date:string;status:string}[]|null>(null),[error,setError]=useState(false),[total,setTotal]=useState(0)
 useEffect(()=>{let live=true;const load=()=>{api<{events:NonNullable<typeof events>;total?:number;serverNow?:string}>('/calendar?upcoming=1&limit=50').then(d=>{if(live){const server=d.serverNow?Date.parse(d.serverNow):Date.now();clockAnchor.current={server,local:performance.now()};setClock(server);setEvents(d.events);setTotal(d.total??d.events.length);setError(false)}}).catch(()=>{if(live)setError(true)})};const visible=()=>{if(document.visibilityState==='visible')load()};load();const timer=window.setInterval(visible,60000);document.addEventListener('visibilitychange',visible);return()=>{live=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible)}},[])
 useEffect(()=>{const node=region.current;if(!node)return;const sync=()=>{const fitted=matchMedia('(min-width:1201px) and (min-height:700px)').matches;setVisibleCount(fitted?Math.max(1,Math.min(50,Math.floor((node.clientHeight-2)/42))):6)};const observer=new ResizeObserver(sync);observer.observe(node);window.addEventListener('resize',sync);sync();return()=>{observer.disconnect();window.removeEventListener('resize',sync)}},[])
 const upcoming=(events||[]).filter(e=>e.at&&Date.parse(e.at)>=clock&&e.status!=='cancelled'&&e.status!=='released'),list=upcoming.slice(0,visibleCount),upcomingTotal=Math.max(0,total-((events?.length||0)-upcoming.length)),day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'})
 return <section className="surface context-card calendar-preview-card"><header><CalendarDays size={22}/><h2>تقویم اقتصادی</h2></header><p className="context-caption">رویدادهای پیش رو · ساعت تهران</p><div ref={region} className="calendar-preview">{error?<p>برای مشاهدهٔ رویدادها وارد تقویم شوید.</p>:events===null?<p role="status">در حال دریافت رویدادها…</p>:list.length?list.map(e=><Link className="calendar-preview-event" key={e.id} to="/panel/tools/calendar" title={e.title+(e.originalTitle?' · '+e.originalTitle:'')}><time dateTime={e.at||e.date}>{e.at?new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'}).format(new Date(e.at)):'—'}{e.date!==day&&<small>{new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',month:'short',day:'numeric'}).format(new Date(e.at||e.date+'T12:00:00Z'))}</small>}</time><CountryLabel country={e.country} currency={e.currency} compact/><span className="preview-event-title">{e.title}</span><span className={'preview-impact '+(e.impact||'unknown')} role="img" aria-label={'اهمیت: '+({high:'زیاد',medium:'متوسط',low:'کم'}[e.impact||'']||'اعلام نشده')}/></Link>):<p>رویدادی برای روزهای پیش رو ثبت نشده است.</p>}</div><Link className="context-link" to="/panel/tools/calendar">مشاهدهٔ تقویم <ArrowLeft size={15}/>{list.length>0&&<span className="preview-count">{list.length.toLocaleString('fa-IR')} از {upcomingTotal.toLocaleString('fa-IR')}</span>}</Link></section>
}
