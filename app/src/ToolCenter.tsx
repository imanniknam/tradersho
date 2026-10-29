import {useEffect,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {ArrowLeft,Bot,ChartNoAxesCombined,Clock3,RefreshCw,CalendarDays,Newspaper,ShieldCheck,BookOpen,Compass,Workflow,LayoutGrid} from 'lucide-react'
import {api} from './api'
import TradingViewChart from './TradingViewChart'
import './tool-workspace.css'

const sections=[
 {id:'chart',title:'نمای بازار',icon:ChartNoAxesCombined},
 {id:'risk',title:'پنل ریسک',icon:ShieldCheck,soon:true},
 {id:'expert',title:'اکسپرت',icon:Bot,soon:true},
 {id:'journal',title:'ژورنال',icon:BookOpen,soon:true},
 {id:'news',title:'اخبار',icon:Newspaper,href:'/panel/market'},
 {id:'compass',title:'قطب‌نما',icon:Compass,soon:true},
 {id:'scenario',title:'سناریو',icon:Workflow,soon:true},
 {id:'widgets',title:'ویجت‌ها',icon:LayoutGrid,soon:true},
 {id:'calendar',title:'تقویم',icon:CalendarDays,href:'/panel/market?tab=calendar'},
]
export function ComingSoon({title,description}:{title:string;description?:string}){return <section className="surface coming-soon"><div className="coming-symbol"><Clock3 size={32}/></div><span className="badge badge-muted">به‌زودی</span><h2>{title} در حال آماده‌سازی است</h2><p>{description||'این بخش پس از تکمیل و بررسی در دسترس قرار می‌گیرد.'}</p><div><Link className="button primary" to="/panel/tools">بازگشت به نمای بازار <ArrowLeft size={17}/></Link><Link className="button secondary" to="/panel">بازگشت به داشبورد</Link></div></section>}
export function ToolsPage(){return <ToolWorkspace selected="chart"/>}
export function ToolDetail(){const {toolId}=useParams();return <ToolWorkspace selected={toolId||'chart'}/>}
function ToolWorkspace({selected}:{selected:string}){
 const section=sections.find(s=>s.id===selected),[state,setState]=useState<'loading'|'ready'|'error'>('loading'),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{if(selected!=='chart')return;let live=true;setState('loading');api<{tools:{id:string;status:string}[]}>('/tools').then(async result=>{if(!result.tools.some(t=>t.id==='chart'&&['active','beta'].includes(t.status)))throw Error('نمودار در حال حاضر در دسترس نیست.');await api('/tools/chart/access');if(live)setState('ready')}).catch(e=>{if(live){setError(e.message);setState('error')}});return()=>{live=false}},[selected,revision])
 return <div className="analysis-center"><nav className="analysis-rail" aria-label="ابزارهای تحلیل">{sections.map(s=><Link key={s.id} to={s.href||(s.id==='chart'?'/panel/tools':'/panel/tools/'+s.id)} className={selected===s.id?'selected':''} aria-current={selected===s.id?'page':undefined}><s.icon size={23} strokeWidth={1.7}/><span>{s.title}</span>{s.soon&&<small>به‌زودی</small>}</Link>)}</nav><div className="analysis-body"><header className="analysis-heading"><h1>{section?.title||'ابزار پیدا نشد'}</h1><p>{selected==='chart'?'نمودار، رویدادها و خبرهای بازار در یک نگاه':'مرکز ابزار و تحلیل تریدر شو'}</p></header>{selected==='chart'?<div className="analysis-grid"><div className="analysis-chart">{state==='ready'?<TradingViewChart/>:state==='error'?<section className="surface analysis-error" role="alert"><h2>دریافت نمودار انجام نشد</h2><p>{error}</p><button className="button secondary" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={17}/>تلاش دوباره</button></section>:<div className="surface analysis-error" role="status">در حال آماده‌سازی نمودار…</div>}</div><aside className="analysis-context" aria-label="اطلاعات بازار"><CalendarPreview/><NewsPreview/></aside></div>:section?<ComingSoon title={section.title}/>:<section className="surface analysis-error"><h2>ابزار پیدا نشد</h2><Link className="button secondary" to="/panel/tools">بازگشت به نمای بازار</Link></section>}</div></div>
}
function CalendarPreview(){return <section className="surface context-card"><header><CalendarDays size={22}/><h2>تقویم اقتصادی</h2></header><p className="context-caption">رویدادهای اقتصادی و زمان انتشار گزارش‌ها</p><div className="calendar-preview"><CalendarDays size={32}/><h3>رویدادهای امروز بازار</h3><p>ساعت، اهمیت، پیش‌بینی و نتیجهٔ رویدادها را در تقویم فارسی ببینید.</p></div><Link className="context-link" to="/panel/market?tab=calendar">مشاهدهٔ تقویم <ArrowLeft size={15}/></Link></section>}
type Headline={id:string;title:string;url:string;publishedAt:string|null;detectedAt:string}
function NewsPreview(){const [items,setItems]=useState<Headline[]|null>(null),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0)
 useEffect(()=>{let live=true;setFailed(false);api<{items:Headline[]}>('/news?days=30').then(d=>{if(live)setItems(d.items.slice(0,3))}).catch(()=>{if(live)setFailed(true)});return()=>{live=false}},[revision])
 return <section className="surface context-card"><header><Newspaper size={22}/><h2>خبرهای بازار</h2></header><p className="context-caption">تازه‌ترین تیترهای دریافت‌شده از منابع</p>{failed?<div className="context-empty" role="status"><p>دریافت خبرها انجام نشد.</p><button className="button secondary small" onClick={()=>setRevision(n=>n+1)}>تلاش دوباره</button></div>:items===null?<p className="context-empty" role="status">در حال دریافت خبرها…</p>:items.length?<ul className="context-news">{items.map(item=><li key={item.id}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a><time dateTime={item.publishedAt||item.detectedAt}>{item.publishedAt?'انتشار: ':'شناسایی: '}{new Date(item.publishedAt||item.detectedAt).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran',month:'short',day:'numeric'})}</time></li>)}</ul>:<p className="context-empty">هنوز خبری برای این بازه دریافت نشده است.</p>}<Link className="context-link" to="/panel/market">مشاهدهٔ همهٔ خبرها <ArrowLeft size={15}/></Link></section>
}
