import MarketPage from './MarketPage'
import RecoveryPage from './RecoveryPage'
import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/500.css'
import '@fontsource/vazirmatn/600.css'
import '@fontsource/vazirmatn/700.css'
import '@fontsource/vazirmatn/800.css'
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, ChevronLeft, Headphones, Home, LayoutGrid, LogOut, Menu, UserRound, Wallet, X, RotateCcw, Newspaper } from 'lucide-react'
import { api } from './api'
import type { User } from './api'
import { ComingSoon, ToolsPage, ToolDetail } from './ToolCenter'
import AuthScreen from './AuthScreen'
import SecurityCard from './SecurityCard'
import DashboardHome from './DashboardHome'
import { SupportList, SupportNew, SupportConversation } from './Support'
import { ThemeProvider, ThemeToggle, useTheme } from './theme'
import './styles.css'
import './release.css'
import './brand-fonts.css'
import './polish.css'
import './mobile.css'
import './refinements.css'
import './gradient-polish.css'
import './motion-polish.css'
import PrivacyPage from './PrivacyPage'

interface AuthValue { user:User|null; loading:boolean; setUser:(u:User|null)=>void }
const AuthContext=createContext<AuthValue|null>(null)
function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('Auth missing');return value}
function AuthProvider({children}:{children:ReactNode}){
  const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true)
  useEffect(()=>{api<{user:User}>('/session').then(d=>setUser(d.user)).catch(()=>setUser(null)).finally(()=>setLoading(false))},[])
  return <AuthContext.Provider value={{user,loading,setUser}}>{children}</AuthContext.Provider>
}
function Brand(){const {theme}=useTheme();return <span className="brand"><img className="brand-logo" src={theme==='light'?'/assets/logo-purple.png':'/assets/logo-white.png'} alt="Tradersho"/></span>}
function Spinner(){return <div className="splash"><Brand/><div className="loader"/></div>}
function Protected(){const {user,loading}=useAuth();const loc=useLocation();if(loading)return <Spinner/>;if(!user)return <Navigate to={`/auth?next=${encodeURIComponent(loc.pathname)}`} replace/>;return <Outlet/>}
function RecoveryRoute({reset=false}:{reset?:boolean}){const {setUser}=useAuth();return <RecoveryPage reset={reset} onReset={()=>setUser(null)}/>}
function AuthPage(){const {user,setUser,loading}=useAuth();return <AuthScreen user={user} setUser={setUser} loading={loading} brand={<span className="auth-brand-plate"><Brand/></span>} mobileBrand={<Brand/>} spinner={<Spinner/>}/>}
const menu=[
  {label:'داشبورد',href:'/panel',icon:Home,soon:false},
  {label:'مرکز ابزار و تحلیل',href:'/panel/tools',icon:LayoutGrid,soon:false},
  {label:'اخبار و تقویم',href:'/panel/market',icon:Newspaper,soon:false},
  {label:'مدرسه فارکس',href:'/panel/courses',icon:BookOpen,soon:true},
  {label:'خدمات ریبیت',href:'/panel/rebate',icon:RotateCcw,soon:true},
  {label:'کیف پول',href:'/panel/wallet',icon:Wallet,soon:true},
  {label:'پشتیبانی',href:'/panel/support',icon:Headphones,soon:false},
  {label:'حساب کاربری',href:'/panel/account',icon:UserRound,soon:false},
]
function Shell({admin=false}:{admin?:boolean}){
  const shellMenu=admin?[{label:'میز پشتیبانی',href:'/admin/support',icon:Headphones,soon:false}]:menu
  const base=admin?'/admin':'/panel'
  useEffect(()=>{document.title=admin?'پنل مدیریت | تریدر شو':'پنل کاربری | تریدر شو';return()=>{document.title='پنل کاربری | تریدر شو'}},[admin])
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:900px)').matches)
  useEffect(()=>{const media=window.matchMedia('(max-width:900px)');const sync=()=>setCompact(media.matches);media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync)},[])
  const {user,setUser}=useAuth();const nav=useNavigate();const loc=useLocation();const [open,setOpen]=useState(false);const view=useRef<HTMLElement>(null);const mobileTrigger=useRef<HTMLButtonElement>(null);const menuRef=useRef<HTMLElement>(null)
  useEffect(()=>{setOpen(false);view.current?.scrollTo(0,0)},[loc.pathname])
  useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;menuRef.current?.querySelector<HTMLElement>('button,a')?.focus();const fn=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);mobileTrigger.current?.focus()}if(e.key==='Tab'){const nodes=Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')||[]).filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};window.addEventListener('keydown',fn);return()=>{window.removeEventListener('keydown',fn);if(previous?.isConnected)previous.focus()}},[open])
  const current=shellMenu.findLast(i=>loc.pathname===i.href||(i.href!='/panel'&&loc.pathname.startsWith(i.href+'/')))||shellMenu[0]
  const logout=async()=>{try{await api('/auth/logout','POST');setUser(null);nav('/auth',{replace:true})}catch{setLogoutError('خروج انجام نشد؛ دوباره تلاش کنید.')}}
  const [logoutError,setLogoutError]=useState('')
  const toolMode=!admin&&loc.pathname.startsWith('/panel/tools')
  return <div className={`app-shell ${admin?'admin-shell':''} ${toolMode?'tools-shell':''}`}><aside inert={compact&&!open} aria-hidden={compact&&!open?true:undefined} role={compact&&open?'dialog':undefined} aria-modal={compact&&open?true:undefined} aria-label={compact&&open?'فهرست پنل':undefined} ref={menuRef} id="panel-navigation" className={`sidebar ${open?'open':''}`}><div className="sidebar-head"><Link to={base} aria-label={admin?'تریدر شو، پنل مدیریت':'تریدر شو، داشبورد'}><Brand/></Link><button className="icon-button mobile-close" onClick={()=>setOpen(false)} aria-label="بستن منو"><X size={21}/></button></div><div className="sidebar-kicker">{admin?'پنل مدیریت':'پنل کاربری'}</div><nav aria-label={admin?'ناوبری مدیریت':'ناوبری اصلی'} className="side-nav">{shellMenu.map(item=><Link key={item.href} to={item.href} className={`nav-link ${current.href===item.href?'active':''}`} aria-current={current.href===item.href?'page':undefined}><item.icon size={20}/><span>{item.label}</span>{item.soon&&<small className="nav-soon">به‌زودی</small>}</Link>)}</nav><div className="sidebar-bottom">{admin&&<Link className="nav-link" to="/panel"><UserRound size={20}/>بازگشت به پنل کاربری</Link>}<button className="logout" onClick={logout}><LogOut size={18}/> خروج از حساب</button>{logoutError&&<p role="alert">{logoutError}</p>}</div></aside>{open&&<button className="mobile-overlay" onClick={()=>setOpen(false)} aria-label="بستن منو"/>}<div className="workspace" inert={compact&&open}><header className="topbar"><a className="skip-link" href="#main-content">رفتن به محتوای اصلی</a><div className="topbar-right">{toolMode&&<Link className="analysis-top-brand" to="/panel/tools"><Brand/><strong>مرکز ابزار و تحلیل</strong></Link>}<button ref={mobileTrigger} aria-controls="panel-navigation" className="icon-button hamburger" onClick={()=>setOpen(true)} aria-label="باز کردن منو" aria-expanded={open}><Menu size={22}/></button>{loc.pathname!=='/panel'&&<button className="icon-button top-back" onClick={()=>{if((window.history.state?.idx??0)>0)nav(-1);else nav(base)}} aria-label="بازگشت به صفحهٔ قبل"><ArrowRight size={19}/></button>}<div className="breadcrumb"><Link to={base}>{admin?'پنل مدیریت':'پنل من'}</Link><ChevronLeft size={15}/>{loc.pathname.startsWith('/panel/tools/')?<><Link to="/panel/tools">ابزارها</Link><ChevronLeft size={15}/><strong>{({'chart':'نمای بازار','expert':'اکسپرت','risk':'پنل ریسک','journal':'ژورنال','compass':'قطب‌نما','scenario':'سناریو','widgets':'ویجت‌ها'}[loc.pathname.split('/').at(-1)||'']||'ابزار')}</strong></>:<strong>{current.label}</strong>}</div></div><div className="topbar-left">{toolMode&&<Link className="analysis-panel-back" to="/panel"><ArrowRight size={16}/>بازگشت به پنل</Link>}<ThemeToggle/><Link className="user-pill" to="/panel/account"><span className="avatar">{user?.name?.slice(0,1)||'ک'}</span><span className="user-pill-copy"><strong>{user?.name}</strong><small>حساب کاربری</small></span></Link></div></header><main ref={view} tabIndex={-1} className="main-scroll" id="main-content"><div className="main-inner page-enter" key={loc.pathname}><Outlet/></div></main></div><nav inert={compact&&open} className="mobile-bottom" aria-label={admin?'ناوبری موبایل مدیریت':'ناوبری موبایل'}>{admin?<><Link to="/admin/support" className="active"><Headphones size={20}/>تیکت‌ها</Link><Link to="/panel"><UserRound size={20}/>پنل کاربری</Link></>:<><Link to="/panel" className={loc.pathname==='/panel'?'active':''}><Home size={20}/>داشبورد</Link><Link to="/panel/tools" className={loc.pathname.startsWith('/panel/tools')?'active':''}><LayoutGrid size={20}/>ابزارها</Link><Link to="/panel/account" className={loc.pathname==='/panel/account'?'active':''}><UserRound size={20}/>حساب من</Link><button onClick={()=>setOpen(true)}><Menu size={20}/>بیشتر</button></>}</nav></div>
}
function Dashboard(){const {user}=useAuth();return <DashboardHome user={user}/>}
function AdminProtected(){
 const {user}=useAuth();const [allowed,setAllowed]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;setError('');api('/admin/session').then(()=>{if(alive)setAllowed(true)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[attempt])
 if(!user?.isSupportAgent)return <div className="splash"><h1>دسترسی به پنل مدیریت مجاز نیست</h1><p role="alert">{error||'این بخش فقط برای مسئولان مجاز پشتیبانی است.'}</p><Link className="button primary" to="/panel">بازگشت به پنل کاربری</Link></div>
 if(error)return <div className="splash"><h1>دریافت پنل مدیریت ممکن نشد</h1><p role="alert">{error}</p><button className="button primary" onClick={()=>setAttempt(v=>v+1)}>تلاش دوباره</button><Link className="back-link" to="/panel">بازگشت به پنل کاربری</Link></div>
 return allowed?<Outlet/>:<Spinner/>
}
function School(){return <><PageHeader title="مدرسه فارکس"/><ComingSoon title="مدرسه فارکس" description="محتوای مدرسه فارکس در حال آماده‌سازی است و پس از نهایی‌شدن در این بخش قرار می‌گیرد."/></>}
function PageHeader({title}:{title:string}){return <div className="page-head"><h1>{title}</h1></div>}
function AccountPage(){
 const {user,setUser}=useAuth();const [name,setName]=useState(user?.name||'');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [saveError,setSaveError]=useState(false);
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');setSaveError(false);try{const d=await api<{user:User}>('/account','PATCH',{name});setUser(d.user);setMessage('نام شما با موفقیت به‌روزرسانی شد.')}catch(cause){setSaveError(true);setMessage((cause as Error).message)}finally{setBusy(false)}}
 return <><PageHeader title="حساب کاربری"/><div className="account-grid"><div className="surface profile-surface"><div className="profile-top"><span className="profile-avatar">{user?.name?.slice(0,1)}</span><div><h2>{user?.name}</h2><p>{user?.email}</p></div></div><form onSubmit={submit} className="stack-form"><label>نام و نام خانوادگی<input value={name} maxLength={80} onChange={e=>setName(e.target.value)} minLength={2} required/></label><label>ایمیل<input value={user?.email||''} disabled dir="ltr"/></label>{message&&<div className={saveError?'form-error':'form-success'} role={saveError?'alert':'status'}>{message}</div>}<button className="button primary" disabled={busy}>{busy?'در حال ذخیره…':'ذخیرهٔ تغییرات'}<Check size={17}/></button></form></div><SecurityCard onLogoutAll={()=>setUser(null)}/></div></>
}
function App(){return <BrowserRouter><ThemeProvider><AuthProvider><Routes><Route path="/forgot-password" element={<RecoveryRoute/>}/><Route path="/reset-password" element={<RecoveryRoute reset/>}/><Route path="/privacy" element={<PrivacyPage/>}/><Route path="/auth" element={<AuthPage/>}/><Route element={<Protected/>}><Route path="/panel" element={<Shell/>}><Route index element={<Dashboard/>}/><Route path="tools" element={<ToolsPage/>}/><Route path="tools/:toolId" element={<ToolDetail/>}/><Route path="market" element={<MarketPage/>}/><Route path="calendar" element={<Navigate to="/panel/market?tab=calendar" replace/>}/><Route path="courses/*" element={<School/>}/><Route path="school" element={<Navigate to="/panel/courses" replace/>}/><Route path="wallet" element={<ComingSoon title="کیف پول"/>}/><Route path="rebate" element={<ComingSoon title="خدمات ریبیت"/>}/><Route path="support" element={<SupportList/>}/><Route path="support/new" element={<SupportNew/>}/><Route path="support/:ticketId" element={<SupportConversation/>}/><Route path="support-desk/*" element={<Navigate to="/admin/support" replace/>}/><Route path="account" element={<AccountPage/>}/><Route path="*" element={<Navigate to="/panel" replace/>}/></Route><Route element={<AdminProtected/>}><Route path="/admin" element={<Shell admin/>}><Route index element={<Navigate to="/admin/support" replace/>}/><Route path="support" element={<SupportList agent/>}/><Route path="support/:ticketId" element={<SupportConversation agent/>}/><Route path="*" element={<Navigate to="/admin/support" replace/>}/></Route></Route></Route><Route path="*" element={<Navigate to="/panel" replace/>}/></Routes></AuthProvider></ThemeProvider></BrowserRouter>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
