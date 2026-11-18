import {useContext,useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import {Link} from 'react-router-dom'
import {ArrowLeft,ShieldCheck,RefreshCw} from 'lucide-react'
import {api} from '../api'
import {CalendarUserContext} from '../calendar/preferences'
import {calculateRisk,defaults,profiles,stageAt,validateInput} from './engine'
import type {RiskInput} from './engine'
import './risk-widget.css'
type Setup={id:string;name:string;input:RiskInput}
const num=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
export default function RiskWidget({resizeHandles,onMinimumHeight}:{resizeHandles?:ReactNode;onMinimumHeight?:(height:number)=>void}){
 const user=useContext(CalendarUserContext),key='tradersho.risk-widget.v1.'+user,content=useRef<HTMLDivElement>(null)
 const [choice,setChoice]=useState<{id:string;stage:number}>(()=>{try{const s=JSON.parse(localStorage.getItem(key)||'null');return {id:typeof s?.id==='string'?s.id:'',stage:Number.isInteger(s?.stage)&&s.stage>0?s.stage:1}}catch{return {id:'',stage:1}}})
 const [setups,setSetups]=useState<Setup[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{let live=true;setLoading(true);setError('');api<{setups:Setup[]}>('/risk/setups').then(d=>{if(live)setSetups(d.setups.filter(s=>s.input&&!Object.keys(validateInput(s.input)).length))}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[revision])
 const setup=setups.find(s=>s.id===choice.id),input=setup?.input||defaults,plan=calculateRisk(input),current=Math.min(choice.stage,plan.crossingTrade),stage=stageAt(plan,current)
 const amount='$'+num(input.balance*stage.risk/100)
 const stages=Array.from({length:Math.min(plan.capacity,10)},(_,i)=>i+1)

 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(choice))}catch{}},[key,choice])
 useEffect(()=>{const node=content.current;if(!node)return;const sync=()=>onMinimumHeight?.(Math.ceil(node.getBoundingClientRect().height+2));const observer=new ResizeObserver(sync);observer.observe(node);sync();return()=>observer.disconnect()},[onMinimumHeight])
 const full='/panel/tools/risk?'+(setup?'setup='+encodeURIComponent(setup.id)+'&':'')+'stage='+current
 return <section className="surface context-card flicker-card risk-widget" aria-labelledby="risk-widget-title">{resizeHandles}<div ref={content} className="risk-widget-content"><header><span className="risk-widget-title"><ShieldCheck size={22}/><h2 id="risk-widget-title">پنل مدیریت ریسک</h2></span><Link to={full}>مشاهدهٔ کامل <ArrowLeft size={15}/></Link></header>{loading?<p role="status" className="risk-widget-notice">در حال دریافت ستاپ‌ها…</p>:error?<div className="risk-widget-notice" role="alert"><p>{error}</p><button onClick={()=>setRevision(n=>n+1)}><RefreshCw size={14}/>تلاش دوباره</button></div>:<><label className="risk-widget-select"><span>ستاپ</span><select aria-label="ستاپ پنل مدیریت ریسک" value={setup?.id||''} onChange={e=>setChoice({id:e.target.value,stage:1})}><option value="">پیش‌فرض پنل مدیریت ریسک</option>{setups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{!setups.length&&<p className="risk-widget-empty">ستاپی ذخیره نکرده‌اید. <Link to="/panel/tools/risk">ساخت ستاپ</Link></p>}<div className="risk-widget-metrics"><div><small>مرحله فعلی</small><strong><bdi>T{current}</bdi></strong></div><div><small>ریسک مرحله</small><strong><bdi>{num(stage.risk)}%</bdi></strong></div><div><small>مبلغ ریسک</small><strong className={amount.length>9?'risk-widget-long-amount':undefined}><bdi>{amount}</bdi></strong></div></div><div className="risk-widget-path-heading"><h3>معاملات مجاز تا سقف افت</h3><span>{plan.capacity.toLocaleString('fa-IR')} معامله</span></div><div className="risk-widget-stages" role="group" aria-label="انتخاب مرحلهٔ ریسک">{stages.map(n=><span key={n}><button type="button" className={n>plan.capacity?'blocked':n===plan.stages.length?'recovery':n>plan.stages.length?'fixed':'cycle'} aria-pressed={current===n} onClick={()=>setChoice(s=>({...s,stage:n}))} title={'مرحلهٔ '+n}>T{n}</button></span>)}</div>{current>plan.capacity&&<p className="risk-widget-warning" role="status">این معامله از سقف افت مجاز عبور می‌کند.</p>}<h3 className="risk-widget-spec-title">مشخصات ستاپ</h3><dl className="risk-widget-specs">{[['سقف افت مجاز',input.maxLoss+'%'],['ریسک پایه',input.baseRisk+'%'],['نسبت ریسک به سود','1 : '+input.rr],['مراحل چرخه',String(input.cycleLength)],['توزیع سود خالص',profiles[input.distribution].label.replace(/^توزیع\s*/, '')],['معاملات مجاز',String(plan.capacity)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl></>}</div></section>
}
