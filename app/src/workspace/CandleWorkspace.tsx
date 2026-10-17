import {useCallback,useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Link} from 'react-router-dom'
import {ArrowRight,Camera,Check,ChevronDown,ChevronLeft,Eye,EyeOff,Focus,HelpCircle,LayoutPanelLeft,ListTree,LockKeyhole,Magnet,Maximize2,Minimize2,MousePointer2,Pause,Play,Plus,Redo2,RotateCcw,Scissors,Search,Settings2,SkipForward,SlidersHorizontal,Trash2,Undo2,UnlockKeyhole,Upload,Wallet,X,ZoomIn,ZoomOut} from 'lucide-react'
import {api} from '../api'
import {WorkspaceChart} from './WorkspaceChart'
import type {ChartHandle} from './WorkspaceChart'
import PaperPanel from './PaperPanel'
import {parseCsv} from './importCsv'
import drawingTools from '../../shared/drawing-tools.json'
import {dateTime,defaults,indicatorList} from './types'
import type {Bar,Dataset,Drawing,Session,Settings} from './types'
import './workspace.css'
const intervals=['1m','3m','5m','15m','30m','1h','2h','4h','1D']
function safeSettings(value:Partial<Settings>):Settings{
  return {...defaults,type:['candles','hollow','bars','line','area','heikin'].includes(value.type||'')?value.type!:defaults.type,indicators:Array.isArray(value.indicators)?value.indicators.filter(x=>indicatorList.some(i=>i.id===x)):defaults.indicators,period:Number.isInteger(value.period)&&value.period!>=2&&value.period!<=200?value.period!:20,grid:typeof value.grid==='boolean'?value.grid:true,scale:['normal','log','percent'].includes(value.scale||'')?value.scale!:'normal',magnet:!!value.magnet,keepDrawing:!!value.keepDrawing,hideDrawings:!!value.hideDrawings,up:/^#[a-f\d]{6}$/i.test(value.up||'')?value.up!:defaults.up,down:/^#[a-f\d]{6}$/i.test(value.down||'')?value.down!:defaults.down,frame:intervals.includes(value.frame||'')?value.frame!:'15m',compare:!!value.compare}
}
export default function CandleWorkspace(){
  const [session,setSession]=useState<Session|null>(null),[datasets,setDatasets]=useState<Dataset[]>([]),[settings,setSettings]=useState<Settings>(defaults),[frame,setFrame]=useState('15m'),[compareBars,setCompareBars]=useState<Bar[]>([])
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(700)
  const [focused,setFocused]=useState(false),[modal,setModal]=useState(''),[rail,setRail]=useState(''),[query,setQuery]=useState(''),[tool,setTool]=useState('cursor'),[selected,setSelected]=useState<string|null>(null),[inspector,setInspector]=useState(false),[paperOpen,setPaperOpen]=useState(true)
  const [color,setColor]=useState('#a994ff'),[stroke,setStroke]=useState(2),[dash,setDash]=useState(false),[note,setNote]=useState('یادداشت'),[balance,setBalance]=useState('10000'),[start,setStart]=useState('2025-01-08T00:00'),[datasetId,setDatasetId]=useState(''),[ack,setAck]=useState(false),[importError,setImportError]=useState(''),[settingsSaved,setSettingsSaved]=useState(true)
  const chart=useRef<ChartHandle>(null),root=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null),alive=useRef(true),locked=useRef(false),current=useRef({session,frame,settings});current.current={session,frame,settings}
  const history=useRef<{undo:Drawing[][];redo:Drawing[][]}>({undo:[],redo:[]}),[,revision]=useState(0),settingsReady=useRef(false)
  const apply=useCallback((result:Session)=>{if(alive.current)setSession(result)},[])
  const refresh=useCallback(async()=>{const s=current.current.session;if(s){const r=await api<{session:Session}>(`/candles/session/${s.id}?frame=${current.current.frame}`);apply(r.session)}},[apply])
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const [catalog,result]=await Promise.all([api<{datasets:Dataset[]}>('/candles/datasets'),api<{session:Session|null}>('/candles/session?frame=15m')])
      if(!alive.current)return
      setDatasets(catalog.datasets);setDatasetId(result.session?.dataset.id||catalog.datasets[0].id)
      let s=result.session
      if(!s)s=(await api<{session:Session}>('/candles/session?frame=15m','POST',{datasetId:catalog.datasets[0].id,balance:'10000'})).session
      const saved=safeSettings(s.settings);setSettings(saved);setFrame(saved.frame)
      if(saved.frame!=='15m')s=(await api<{session:Session}>(`/candles/session/${s.id}?frame=${saved.frame}`)).session
      apply(s);settingsReady.current=true
    }catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setLoading(false)}
  },[apply])
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false}},[load])
  const mutate=useCallback(async(action:string,method:string,input:Record<string,unknown>)=>{
    const {session:s,frame}=current.current;if(!s||locked.current)return false
    locked.current=true;setBusy(true);setError('')
    try{const result=await api<{session:Session}>(`/candles/session/${s.id}/${action}?frame=${frame}`,method,input);apply(result.session);return true}
    catch(e){setPlaying(false);if(alive.current)setError((e as Error).message);try{await refresh()}catch{}return false}
    finally{locked.current=false;if(alive.current)setBusy(false)}
  },[apply,refresh])
  const advance=useCallback(async()=>{const s=current.current.session;if(s)await mutate('advance','POST',{version:s.version,requestId:crypto.randomUUID()})},[mutate])
  useEffect(()=>{
    if(!playing||!session?.hasNext||busy)return
    const timer=window.setTimeout(()=>void advance(),speed);return()=>window.clearTimeout(timer)
  },[playing,session?.version,session?.hasNext,busy,speed,advance])
  useEffect(()=>{const pause=()=>{if(document.hidden)setPlaying(false)};document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause)},[])
  useEffect(()=>{if(!session?.hasNext)setPlaying(false)},[session?.hasNext])
  const changeFrame=async(next:string)=>{
    if(locked.current||next===frame)return
    setPlaying(false);locked.current=true;setBusy(true);setTool('cursor');setError('')
    try{if(session){const r=await api<{session:Session}>(`/candles/session/${session.id}?frame=${next}`);apply(r.session)}setFrame(next);setSettings(s=>({...s,frame:next}))}catch(e){setError((e as Error).message)}finally{locked.current=false;setBusy(false)}
  }
  useEffect(()=>{
    if(!settingsReady.current||!session?.id)return
    setSettingsSaved(false)
    const id=session.id,timer=window.setTimeout(()=>{api(`/candles/session/${id}/settings?frame=${frame}`,'PUT',{settings}).then(()=>{if(alive.current)setSettingsSaved(true)}).catch(e=>{if(alive.current)setError((e as Error).message)})},600)
    return()=>window.clearTimeout(timer)
  },[settings,session?.id,frame])
  useEffect(()=>{
    let active=true
    if(!settings.compare||!session)return
    const second=frame==='1h'?'4h':'1h'
    api<{session:Session}>(`/candles/session/${session.id}?frame=${second}`).then(r=>{if(active)setCompareBars(r.session.bars)}).catch(e=>{if(active)setError((e as Error).message)})
    return()=>{active=false}
  },[settings.compare,session?.id,session?.version,frame])
  const saveDrawings=useCallback(async(drawings:Drawing[],record=true)=>{
    setPlaying(false);const previous=current.current.session?.drawings;if(!previous)return
    const ok=await mutate('drawings','PUT',{drawings,drawingVersion:current.current.session!.drawingVersion})
    if(ok&&record){history.current.undo.push(previous);if(history.current.undo.length>40)history.current.undo.shift();history.current.redo=[];revision(n=>n+1)}
    return ok
  },[mutate])
  const undo=useCallback(async()=>{const before=history.current.undo.at(-1),now=current.current.session?.drawings;if(before&&now&&await saveDrawings(before,false)){history.current.undo.pop();history.current.redo.push(now);revision(n=>n+1);setSelected(null)}},[saveDrawings])
  const redo=useCallback(async()=>{const next=history.current.redo.at(-1),now=current.current.session?.drawings;if(next&&now&&await saveDrawings(next,false)){history.current.redo.pop();history.current.undo.push(now);revision(n=>n+1)}},[saveDrawings])
  const begin=async(time?:number)=>{
    if(locked.current)return
    setPlaying(false);locked.current=true;setBusy(true);setError('')
    try{
      const data=await api<{session:Session}>(`/candles/session?frame=${frame}`,'POST',{datasetId:datasetId||session?.dataset.id,balance,time:time??Date.parse(start+':00Z')/1000})
      apply(data.session);history.current={undo:[],redo:[]};setSelected(null);setTool('cursor');setModal('');setSettingsSaved(false)
      // Preserve the current layout for the new account as well.
      await api(`/candles/session/${data.session.id}/settings?frame=${frame}`,'PUT',{settings:current.current.settings});setSettingsSaved(true)
    }catch(e){setError((e as Error).message)}finally{locked.current=false;setBusy(false)}
  }
  const trade=async(input:Record<string,unknown>)=>{setPlaying(false);if(session)await mutate('trade','POST',{...input,version:session.version,requestId:crypto.randomUUID()})}
  const patchDrawing=async(id:string,patch:Partial<Drawing>)=>{if(session)await saveDrawings(session.drawings.map(d=>d.id===id?{...d,...patch}:d))}
  const remove=useCallback(()=>{if(selected&&current.current.session)void saveDrawings(current.current.session.drawings.filter(d=>d.id!==selected)).then(ok=>{if(ok)setSelected(null)})},[saveDrawings,selected])
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){
        if(modal){setModal('');return}if(rail){setRail('');return}if(tool!=='cursor'){setTool('cursor');return}
        setSelected(null);if(focused)setFocused(false);return
      }
      if((e.target as Element)?.closest('input,textarea,select,[contenteditable=true]'))return
      const inside=focused||root.current?.contains(document.activeElement);if(!inside)return
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();void(e.shiftKey?redo():undo())}
      else if(e.code==='Space'){e.preventDefault();setPlaying(p=>!p)}
      else if(e.key==='ArrowRight'){e.preventDefault();setPlaying(false);void advance()}
      else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove()}
      else if(e.key.toLowerCase()==='f')setFocused(p=>!p)
      else if(e.key.toLowerCase()==='h')setTool('horizontal')
      else if(e.key.toLowerCase()==='t')setTool('trend')
      else if(e.key.toLowerCase()==='v')setTool('cursor')
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[focused,modal,rail,tool,undo,redo,advance,remove])
  useEffect(()=>{const handle=()=>{if(!document.fullscreenElement)setFocused(false)};document.addEventListener('fullscreenchange',handle);return()=>document.removeEventListener('fullscreenchange',handle)},[])
  const nativeFullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.current?.requestFullscreen()}catch{setError('تمام‌صفحهٔ مرورگر در دسترس نیست؛ حالت تمرکز همچنان قابل استفاده است.')}}
  const upload=async(f:File)=>{
    setPlaying(false);setImportError('');if(!ack){setImportError('اجازهٔ استفادهٔ شخصی از فایل را تأیید کنید.');return}
    if(f.size>5_000_000){setImportError('حداکثر اندازهٔ فایل پنج مگابایت است.');return}
    if(locked.current)return
    locked.current=true;setBusy(true)
    try{const bars=parseCsv(await f.text());const r=await api<{dataset:Dataset}>('/candles/datasets','POST',{name:`EUR/USD · ${f.name.slice(0,50)}`,bars,acknowledged:true});const catalog=await api<{datasets:Dataset[]}>('/candles/datasets');setDatasets(catalog.datasets);setDatasetId(r.dataset.id);setStart(new Date(bars[Math.min(1000,bars.length-2)].time*1000).toISOString().slice(0,16));setModal('session')}catch(e){setImportError((e as Error).message)}finally{locked.current=false;setBusy(false);if(file.current)file.current.value=''}
  }
  const template=()=>{
    const rows=['time,open,high,low,close,volume'];let p=1.08
    for(let i=0;i<100;i++){const o=p;p=Number((p+Math.sin(i)*.0001).toFixed(5));rows.push([1735689600+i*60,o,Number((Math.max(o,p)+.0001).toFixed(5)),Number((Math.min(o,p)-.0001).toFixed(5)),p,100].join(','))}
    const url=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='EURUSD-M1-synthetic-template.csv';a.click();URL.revokeObjectURL(url)
  }
  if(loading)return <div className="lab-loading"><div className="loader"/>آماده‌سازی محیط تحلیل…</div>
  if(!session)return <section className="surface empty-state"><h2>محیط چارت آماده نشد</h2><p role="alert">{error}</p><button className="button secondary" onClick={()=>void load()}>تلاش دوباره</button></section>
  const selectedDrawing=session.drawings.find(d=>d.id===selected),last=session.bars.at(-1)!,groups=[...new Set(drawingTools.map(t=>t.group))],visibleTools=drawingTools.filter(t=>(rail==='all'||t.group===rail)&&(`${t.label} ${t.id}`.toLowerCase().includes(query.toLowerCase())))
  const iconButton=(name:string,Icon:typeof Search,onClick:()=>void,active=false,disabled=false)=><button className={`ws-icon ${active?'active':''}`} title={name} aria-label={name} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon size={18}/></button>
  const content=<div ref={root} className={`candle-workspace ${focused?'is-focused':''}`} tabIndex={-1} aria-label="محیط تحلیل کندلی" onPointerDown={()=>{if(document.activeElement===document.body)root.current?.focus({preventScroll:true})}}>
    <header className="ws-topbar"><Link to="/panel/tools" className="ws-back" onClick={()=>{setPlaying(false);setFocused(false)}} title="بازگشت به مرکز ابزارها"><ArrowRight size={17}/><span>ابزارها</span></Link><button className="ws-symbol" onClick={()=>{setPlaying(false);setModal('session')}}><strong dir="ltr">EUR / USD</strong><small>{session.dataset.kind==='synthetic'?'DEMO · مصنوعی':'CSV · فایل شخصی'}</small><ChevronDown size={13}/></button><div className="ws-frame-list" aria-label="تایم‌فریم">{intervals.map(f=><button key={f} disabled={busy} aria-pressed={frame===f} className={frame===f?'active':''} onClick={()=>void changeFrame(f)}>{f}</button>)}</div><div className="ws-top-actions">{iconButton('اندیکاتورها',SlidersHorizontal,()=>{setQuery('');setModal('indicators')})}{iconButton('تنظیمات نمودار',Settings2,()=>setModal('settings'))}{iconButton('ذخیره تصویر نمودار',Camera,()=>void chart.current?.snapshot().catch(()=>setError('ذخیرهٔ تصویر ممکن نشد.')))}{iconButton('حالت دو نموداری',LayoutPanelLeft,()=>setSettings(s=>({...s,compare:!s.compare})),settings.compare)}{iconButton(focused?'خروج از حالت تمرکز':'تمام صفحهٔ چارت',focused?Minimize2:Maximize2,()=>{setPlaying(false);setFocused(v=>!v)},focused)}</div></header>
    <div className="ws-subbar"><div><span className={`ws-data-dot ${session.dataset.kind==='synthetic'?'demo':''}`}/><span>{session.dataset.kind==='synthetic'?'دادهٔ مصنوعی؛ برای آزمایش رابط و تمرین، نه تاریخچهٔ بازار':'فایل شخصی EUR/USD · اعتبار منبع مستقل تأیید نشده'}</span><button onClick={()=>setModal('data')}>جزئیات داده</button></div><span className="ws-save"><Check size={12}/>{busy?'در حال ثبت…':settingsSaved?'ذخیره شد':'ثبت تنظیمات…'}</span></div>
    <div className="ws-stage"><aside className="ws-rail" aria-label="نوار ابزار تحلیل">
      {iconButton('نشانگر · V',MousePointer2,()=>{setTool('cursor');setRail('')},tool==='cursor')}
      {iconButton('جستجوی ابزارها',Search,()=>{setPlaying(false);setQuery('');setRail(rail==='all'?'':'all')},rail==='all')}
      {groups.map((group,index)=><button key={group} className={`ws-icon ws-group ${rail===group?'active':''}`} title={group} aria-label={`ابزارهای ${group}`} aria-expanded={rail===group} onClick={()=>{setPlaying(false);setQuery('');setRail(rail===group?'':group)}}><span>{['╱','≋','▱','ƒ','↔','T','W'][index]}</span><ChevronLeft size={8}/></button>)}
      <hr/>{iconButton('آهنربای OHLC',Magnet,()=>setSettings(s=>({...s,magnet:!s.magnet})),settings.magnet)}{iconButton('ادامه ترسیم',Plus,()=>setSettings(s=>({...s,keepDrawing:!s.keepDrawing})),settings.keepDrawing)}{iconButton('پنهان کردن ترسیم‌ها',settings.hideDrawings?EyeOff:Eye,()=>setSettings(s=>({...s,hideDrawings:!s.hideDrawings})),settings.hideDrawings)}{iconButton('مدیریت ترسیم‌ها',ListTree,()=>setInspector(p=>!p),inspector)}<hr/>{iconButton('بازگردانی · Ctrl Z',Undo2,()=>void undo(),false,busy||!history.current.undo.length)}{iconButton('انجام دوباره · Ctrl Shift Z',Redo2,()=>void redo(),false,busy||!history.current.redo.length)}{iconButton('راهنمای میانبرها',HelpCircle,()=>setModal('help'))}
    </aside><div className="ws-plot-region"><div className="ws-chart-switch"><label>نمایش<select aria-label="نوع نمودار" value={settings.type} onChange={e=>setSettings(s=>({...s,type:e.target.value as Settings['type']}))}><option value="candles">کندل</option><option value="hollow">کندل توخالی</option><option value="bars">میله OHLC</option><option value="line">خطی</option><option value="area">ناحیه‌ای</option><option value="heikin">هیکن آشی</option></select></label><div className="ws-active-indicators">{settings.indicators.map(id=><button key={id} title={indicatorList.find(i=>i.id===id)?.name} onClick={()=>setSettings(s=>({...s,indicators:s.indicators.filter(x=>x!==id)}))}>{id.toUpperCase()} <X size={10}/></button>)}</div><div className="ws-zoom">{iconButton('بزرگ‌نمایی',ZoomIn,()=>chart.current?.zoom(.75))}{iconButton('کوچک‌نمایی',ZoomOut,()=>chart.current?.zoom(1.3))}{iconButton('نمایش کل دادهٔ قابل مشاهده',Focus,()=>chart.current?.fit())}</div></div>
      {tool!=='cursor'&&<div className="ws-drawing-style"><b>{tool==='cut'?'انتخاب نقطهٔ شروع':drawingTools.find(d=>d.id===tool)?.label}</b><label>رنگ<input aria-label="رنگ ترسیم جدید" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><select aria-label="ضخامت ترسیم جدید" value={stroke} onChange={e=>setStroke(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}px</option>)}</select><label><input type="checkbox" checked={dash} onChange={e=>setDash(e.target.checked)}/>خط‌چین</label>{tool==='text'&&<input aria-label="متن ترسیم جدید" value={note} maxLength={120} onChange={e=>setNote(e.target.value)}/>}<button onClick={()=>setTool('cursor')}><X size={14}/></button></div>}
      <div className={`ws-charts ${settings.compare?'split':''}`}><WorkspaceChart ref={chart} bars={session.bars} settings={settings} drawings={session.drawings} tool={tool} selected={selected} disabled={busy} onSave={async d=>{await saveDrawings(d)}} onSelect={setSelected} onFinish={()=>{if(!settings.keepDrawing)setTool('cursor')}} frame={frame} minTime={session.dataset.first} color={color} stroke={stroke} dash={dash} text={note} onCut={time=>void begin(time)}/>{settings.compare&&<WorkspaceChart bars={compareBars} settings={{...settings,indicators:['volume']}} drawings={[]} tool="cursor" selected={null} disabled readOnly onSave={async()=>{}} onSelect={()=>{}} onFinish={()=>{}} frame={frame==='1h'?'4h':'1h'} color={color} stroke={stroke} dash={dash} text={note}/>}</div>
    </div>
    {inspector&&<aside className="ws-inspector"><div className="ws-section-head"><b>ترسیم‌ها <small>{session.drawings.length}/100</small></b><button aria-label="بستن مدیریت ترسیم" onClick={()=>setInspector(false)}><X size={16}/></button></div>{session.drawings.length===0?<p className="ws-empty">ابزاری را از نوار کناری انتخاب کنید و نقاط آن را روی چارت بگذارید.</p>:<div className="ws-object-list">{session.drawings.map(d=><div key={d.id} className={selected===d.id?'selected':''}><button className="ws-object-name" onClick={()=>setSelected(d.id)}><i style={{background:d.color}}/>{drawingTools.find(t=>t.id===d.type)?.label}</button><button disabled={busy} aria-label={`نمایش ترسیم ${d.id}`} onClick={()=>void patchDrawing(d.id,{hidden:!d.hidden})}>{d.hidden?<EyeOff size={13}/>:<Eye size={13}/>}</button><button disabled={busy} aria-label={`قفل ترسیم ${d.id}`} onClick={()=>void patchDrawing(d.id,{locked:!d.locked})}>{d.locked?<LockKeyhole size={13}/>:<UnlockKeyhole size={13}/>}</button></div>)}</div>}{selectedDrawing&&<div className="ws-object-editor" key={selectedDrawing.id}><h4>ویرایش ترسیم انتخابی</h4><label>رنگ<input type="color" aria-label="رنگ ترسیم انتخابی" disabled={busy} value={selectedDrawing.color} onChange={e=>void patchDrawing(selectedDrawing.id,{color:e.target.value})}/></label><label>ضخامت<select disabled={busy} aria-label="ضخامت ترسیم انتخابی" value={selectedDrawing.width} onChange={e=>void patchDrawing(selectedDrawing.id,{width:Number(e.target.value)})}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><label><input type="checkbox" checked={selectedDrawing.dash} disabled={busy} onChange={e=>void patchDrawing(selectedDrawing.id,{dash:e.target.checked})}/>خط‌چین</label>{selectedDrawing.type==='text'&&<label>متن<input defaultValue={selectedDrawing.text} disabled={busy} maxLength={120} onBlur={e=>{if(e.target.value!==selectedDrawing.text)void patchDrawing(selectedDrawing.id,{text:e.target.value})}}/></label>}<p>برای جابه‌جایی نقطه، دستگیرهٔ دایره‌ای روی چارت را بکشید. قفل از جابه‌جایی جلوگیری می‌کند.</p><button className="ws-delete" disabled={busy} onClick={remove}><Trash2 size={13}/>حذف انتخاب‌شده</button></div>}<button className="ws-delete ws-clear" disabled={busy||!session.drawings.length} onClick={()=>setModal('clear')}>حذف همهٔ ترسیم‌ها</button></aside>}
    {rail&&<div className="ws-tool-menu"><div className="ws-section-head"><b>{rail==='all'?'۲۷ ابزار ترسیم':rail}</b><button onClick={()=>setRail('')} aria-label="بستن فهرست ابزار"><X size={15}/></button></div><div className="ws-search"><Search size={15}/><input aria-label="جستجوی ابزار ترسیم" placeholder="جستجوی نام ابزار…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="ws-tool-results">{visibleTools.map(d=><button key={d.id} aria-label={d.label} aria-pressed={tool===d.id} className={tool===d.id?'active':''} onClick={()=>{setTool(d.id);setRail('');setPlaying(false)}}><span>{d.label}<small>{d.id}</small></span><em>{d.points} نقطه</em></button>)}{!visibleTools.length&&<p className="ws-empty">ابزاری پیدا نشد.</p>}</div></div>}
    </div>
    <div className="ws-replay"><span className="ws-replay-label"><i/> REPLAY</span>{iconButton('انتخاب کندل شروع',Scissors,()=>{setPlaying(false);setTool(tool==='cut'?'cursor':'cut')},tool==='cut')}{iconButton(playing?'توقف Replay':'پخش Replay',playing?Pause:Play,()=>setPlaying(v=>!v),playing,!session.hasNext)}{iconButton('کندل بعد',SkipForward,()=>{setPlaying(false);void advance()},false,busy||!session.hasNext)}<select aria-label="سرعت Replay" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1400}>0.5×</option><option value={700}>1×</option><option value={300}>2×</option><option value={100}>5×</option></select><span className="ws-replay-time" data-testid="candle-time" dir="ltr">{dateTime(session.time)} UTC</span><progress value={session.cursor-session.startCursor} max={session.dataset.total-1-session.startCursor} aria-label="پیشرفت Replay"/><button onClick={()=>{setPlaying(false);setModal('session')}}><RotateCcw size={14}/>تمرین جدید</button><button className={paperOpen?'active':''} onClick={()=>setPaperOpen(v=>!v)}><Wallet size={15}/>معاملات</button>{focused&&iconButton('تمام‌صفحهٔ مرورگر',Maximize2,()=>void nativeFullscreen())}</div>
    {error&&<div className="ws-error" role="alert">{error}<button onClick={()=>setError('')} aria-label="بستن خطا"><X size={14}/></button></div>}
    {!session.hasNext&&<div className="ws-end">پایان داده؛ موقعیت‌های باز با آخرین Close ارزش‌گذاری می‌شوند. تمرین جدید بسازید.</div>}
    {paperOpen&&<PaperPanel paper={session.paper} price={last.close} busy={busy} hasNext={session.hasNext} onCommand={trade}/>}
    <footer className="ws-footer"><span>Tradersho Practice · {session.dataset.kind==='synthetic'?'SYNTHETIC DATA':'PRIVATE CSV'} · No live trading</span><span dir="ltr"><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> · <a href="/licenses/lightweight-charts.txt" target="_blank" rel="noreferrer">Apache 2.0</a></span></footer>
    {modal&&<div className="ws-dialog-shade" onClick={e=>{if(e.target===e.currentTarget)setModal('')}}><section className="ws-dialog" role="dialog" aria-modal="true" aria-label={{indicators:'اندیکاتورها',settings:'تنظیمات نمودار',session:'تمرین جدید',import:'ورود فایل OHLC',data:'اطلاعات داده',help:'راهنما',clear:'حذف ترسیم‌ها'}[modal]}><div className="ws-dialog-heading"><h2>{{indicators:'کتابخانهٔ اندیکاتورها',settings:'تنظیمات محیط تحلیل',session:'تمرین تازه',import:'ورود فایل OHLC',data:'دادهٔ این چارت',help:'راهنما و میانبرها',clear:'حذف ترسیم‌ها'}[modal]}</h2><button aria-label="بستن پنجره" onClick={()=>setModal('')}><X size={20}/></button></div>
      {modal==='indicators'&&<><div className="ws-search"><Search size={17}/><input autoFocus placeholder="جستجوی اندیکاتور…" aria-label="جستجوی اندیکاتور" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="ws-presets"><button onClick={()=>setSettings(s=>({...s,indicators:['ema','bands','volume']}))}>قالب روند</button><button onClick={()=>setSettings(s=>({...s,indicators:['rsi','macd','volume']}))}>قالب مومنتوم</button><button onClick={()=>setSettings(s=>({...s,indicators:[]}))}>پاک‌کردن</button></div><p className="ws-help">حداکثر پنج اندیکاتور هم‌زمان برای خوانایی. warm-up رعایت می‌شود؛ روی تایم‌فریم روزانه ممکن است دادهٔ کافی نداشته باشید.</p><div className="ws-indicator-list">{indicatorList.filter(i=>`${i.name} ${i.category}`.toLowerCase().includes(query.toLowerCase())).map(i=><label key={i.id}><input aria-label={i.name} type="checkbox" checked={settings.indicators.includes(i.id)} disabled={!settings.indicators.includes(i.id)&&settings.indicators.length>=5} onChange={e=>setSettings(s=>({...s,indicators:e.target.checked?[...s.indicators,i.id]:s.indicators.filter(x=>x!==i.id)}))}/><span dir="ltr">{i.name}<small>{i.note||i.category}</small></span><Plus size={15}/></label>)}</div></>}
      {modal==='settings'&&<div className="ws-settings-form"><label>دورهٔ میانگین‌ها / باند / کانال<select value={settings.period} onChange={e=>setSettings(s=>({...s,period:Number(e.target.value)}))}>{[5,9,10,14,20,21,50,100,200].map(n=><option key={n}>{n}</option>)}</select></label><label>محور قیمت<select value={settings.scale} onChange={e=>setSettings(s=>({...s,scale:e.target.value as Settings['scale']}))}><option value="normal">معمولی</option><option value="log">لگاریتمی</option><option value="percent">درصدی</option></select></label><label><span>شبکهٔ زمینه</span><input type="checkbox" checked={settings.grid} onChange={e=>setSettings(s=>({...s,grid:e.target.checked}))}/></label><label>رنگ صعود<input type="color" value={settings.up} onChange={e=>setSettings(s=>({...s,up:e.target.value}))}/></label><label>رنگ نزول<input type="color" value={settings.down} onChange={e=>setSettings(s=>({...s,down:e.target.value}))}/></label><p>هیکن آشی یک تبدیل نمایشی است؛ قیمت اجرای معامله از OHLC اصلی می‌آید. زاویهٔ روند برحسب پیکسل صفحه و بادبزن گن نسبت به دو نقطهٔ انتخابی است؛ با Gann دارای مقیاس ثابت معادل نیست.</p><button className="ws-primary" onClick={()=>setModal('')}>اعمال شد</button></div>}
      {modal==='session'&&<div className="ws-settings-form"><p>تمرین تازه، حساب و ترسیم‌های مستقلی می‌سازد. تمرین قبلی در دیتابیس باقی می‌ماند؛ صفحه آخرین تمرین را ادامه می‌دهد.</p><label>منبع داده<select aria-label="منبع داده تمرین" value={datasetId} onChange={e=>{setDatasetId(e.target.value);const d=datasets.find(d=>d.id===e.target.value);if(d)setStart(new Date((d.first+Math.min(1000,d.total-2)*60)*1000).toISOString().slice(0,16))}}>{datasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>سرمایهٔ اولیه (USD)<input aria-label="سرمایه اولیه کندلی" type="number" min={100} max={1e7} value={balance} onChange={e=>setBalance(e.target.value)} dir="ltr"/></label><label>شروع · UTC<input aria-label="شروع Replay UTC" type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><button className="ws-primary" disabled={busy} onClick={()=>void begin()}>ساخت تمرین با این سرمایه</button><button className="ws-secondary" onClick={()=>{setImportError('');setModal('import')}}><Upload size={15}/>ورود فایل شخصی OHLC</button></div>}
      {modal==='import'&&<div className="ws-import"><p>فقط EUR/USD یک‌دقیقه‌ای، ۵۱ تا ۳۰٬۰۰۰ کندل، حداکثر ۵ مگابایت. زمان باید UTC، مرتب و یکتا باشد؛ کندل‌های گمشده ساخته نمی‌شوند. اگر حجم ندارید ستون volume را حذف کنید.</p><code dir="ltr">time,open,high,low,close,volume<br/>2025-01-01T00:00:00Z,1.08,1.0802,1.0799,1.0801,100</code><button className="ws-secondary" onClick={template}>دانلود قالب CSV با ۱۰۰ کندل مصنوعی</button><label className="ws-import-ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>نوع نماد و زمان UTC را بررسی کرده‌ام و اجازهٔ استفاده از این فایل را دارم. فایل فقط در حساب خودم قابل دسترسی است.</label><input ref={file} type="file" accept=".csv,text/csv" aria-label="انتخاب فایل OHLC" disabled={busy||!ack} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f)}}/>{importError&&<p role="alert" className="negative">{importError}</p>}</div>}
      {modal==='data'&&<div className="ws-data-info"><span className="badge badge-violet">{session.dataset.kind==='synthetic'?'دادهٔ مصنوعی':'فایل شخصی'}</span><p>{session.dataset.source}</p><dl><div><dt>نماد</dt><dd>EUR/USD</dd></div><div><dt>تعداد کندل پایه</dt><dd>{session.dataset.total.toLocaleString()}</dd></div><div><dt>بازه UTC</dt><dd dir="ltr">{dateTime(session.dataset.first)}<br/>{dateTime(session.dataset.last)}</dd></div><div><dt>گام پایه</dt><dd>M1 · یک دقیقه</dd></div></dl><p>در تایم‌فریم بالاتر، آخرین کندل فقط از دقیقه‌های آشکارشده ساخته شده و ممکن است ناقص باشد. تغییر تایم‌فریم زمان Replay را جابه‌جا نمی‌کند. نسخهٔ دمو و حجم آن مصنوعی‌اند؛ نرخ واقعی Live یا تاریخچهٔ بروکر نیستند.</p><Link to="/panel/tools/chart?view=reference" onClick={()=>setFocused(false)}>رفتن به نسخهٔ قبلی با نرخ مرجع واقعی ECB</Link><button className="ws-primary" onClick={()=>{setImportError('');setModal('import')}}>ورود فایل OHLC</button></div>}
      {modal==='help'&&<div className="ws-data-info"><p>ابزار را از نوار سمت چپ انتخاب و تعداد نقاط نوشته‌شده را روی نمودار کلیک کنید. ترسیم انتخابی با دستگیره‌ها قابل ویرایش است؛ رنگ، ضخامت و قفل در پنل ترسیم‌ها قرار دارند.</p><dl>{[['Space','پخش / توقف'],['→','کندل بعد'],['F','تمام صفحهٔ چارت'],['Escape','بستن پنجره / خروج از تمرکز'],['H / T / V','خط افقی / روند / نشانگر'],['Ctrl / Cmd + Z','بازگردانی'],['Ctrl / Cmd + Shift + Z','انجام دوباره'],['Delete','حذف انتخاب‌شده']].map(([k,v])=><div key={k}><dt dir="ltr">{k}</dt><dd>{v}</dd></div>)}</dl><p>میانبرها زمانی فعال‌اند که تمرکز داخل محیط چارت باشد. این نسخه ۲۷ ترسیم و ۱۵ اندیکاتور دارد؛ Pine Script، اسکنر و کل قابلیت‌های Supercharts جزو امکانات فعال نیستند.</p></div>}
      {modal==='clear'&&<div className="ws-data-info"><p>تمام ترسیم‌های این تمرین حذف شوند؟ بازگردانی در همین صفحه با Ctrl/Cmd+Z در دسترس است.</p><button className="ws-primary" disabled={busy} onClick={()=>void saveDrawings([]).then(ok=>{if(ok){setModal('');setSelected(null)}})}>حذف ترسیم‌های این تمرین</button></div>}
    </section></div>}
  </div>
  return focused?createPortal(content,document.body):content
}
