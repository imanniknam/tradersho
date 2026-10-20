import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/500.css'
import '@fontsource/vazirmatn/600.css'
import '@fontsource/vazirmatn/700.css'
import '@fontsource/vazirmatn/800.css'
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, Headphones, Home, LayoutGrid, LogOut, Menu, UserRound, Wallet, X, ChartNoAxesCombined, RotateCcw } from 'lucide-react'
import { api } from './api'
import type { User } from './api'
import { ComingSoon, ToolsPage, ToolDetail } from './ToolCenter'
import AuthScreen from './AuthScreen'
import SecurityCard from './SecurityCard'
import { ThemeProvider, ThemeToggle, useTheme } from './theme'
import './styles.css'
import './release.css'

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
function AuthPage(){const {user,setUser,loading}=useAuth();return <AuthScreen user={user} setUser={setUser} loading={loading} brand={<Brand/>} mobileBrand={<Brand/>} spinner={<Spinner/>}/>}
const menu=[
  {label:'داشبورد',href:'/panel',icon:Home,soon:false},
  {label:'مرکز ابزار و تحلیل',href:'/panel/tools',icon:LayoutGrid,soon:false},
  {label:'مدرسه فارکس',href:'/panel/courses',icon:BookOpen,soon:true},
  {label:'خدمات ریبیت',href:'/panel/rebate',icon:RotateCcw,soon:true},
  {label:'کیف پول',href:'/panel/wallet',icon:Wallet,soon:true},
  {label:'پشتیبانی',href:'/panel/support',icon:Headphones,soon:true},
  {label:'حساب کاربری',href:'/panel/account',icon:UserRound,soon:false},
]
function Shell(){
  const {user,setUser}=useAuth();const nav=useNavigate();const loc=useLocation();const [open,setOpen]=useState(false);const view=useRef<HTMLElement>(null)
  useEffect(()=>{setOpen(false);view.current?.scrollTo(0,0)},[loc.pathname])
  useEffect(()=>{if(!open)return;const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[open])
  const current=menu.findLast(i=>loc.pathname===i.href||(i.href!='/panel'&&loc.pathname.startsWith(i.href+'/')))||menu[0]
  const logout=async()=>{try{await api('/auth/logout','POST');setUser(null);nav('/auth',{replace:true})}catch{setLogoutError('خروج انجام نشد؛ دوباره تلاش کنید.')}}
  const [logoutError,setLogoutError]=useState('')
  return <div className="app-shell"><aside className={`sidebar ${open?'open':''}`}><div className="sidebar-head"><Link to="/panel" aria-label="تریدر شو، داشبورد"><Brand/></Link><button className="icon-button mobile-close" onClick={()=>setOpen(false)} aria-label="بستن منو"><X size={21}/></button></div><div className="sidebar-kicker">پنل کاربری</div><nav aria-label="ناوبری اصلی" className="side-nav">{menu.map(item=><Link key={item.href} to={item.href} className={`nav-link ${current.href===item.href?'active':''}`} aria-current={current.href===item.href?'page':undefined}><item.icon size={20}/><span>{item.label}</span>{item.soon&&<small className="nav-soon">به‌زودی</small>}</Link>)}</nav><div className="sidebar-bottom"><button className="logout" onClick={logout}><LogOut size={18}/> خروج از حساب</button>{logoutError&&<p role="alert">{logoutError}</p>}</div></aside>{open&&<button className="mobile-overlay" onClick={()=>setOpen(false)} aria-label="بستن منو"/>}<div className="workspace"><header className="topbar"><div className="topbar-right"><button className="icon-button hamburger" onClick={()=>setOpen(true)} aria-label="باز کردن منو" aria-expanded={open}><Menu size={22}/></button>{loc.pathname!=='/panel'&&<button className="icon-button top-back" onClick={()=>{if((window.history.state?.idx??0)>0)nav(-1);else nav('/panel')}} aria-label="بازگشت به صفحهٔ قبل"><ArrowRight size={19}/></button>}<div className="breadcrumb"><Link to="/panel">پنل من</Link><ChevronLeft size={15}/>{loc.pathname.startsWith('/panel/tools/')?<><Link to="/panel/tools">ابزارها</Link><ChevronLeft size={15}/><strong>{loc.pathname.endsWith('/chart')?'نمودار TradingView':'به‌زودی'}</strong></>:<strong>{current.label}</strong>}</div></div><div className="topbar-left"><ThemeToggle/><Link className="user-pill" to="/panel/account"><span className="avatar">{user?.name?.slice(0,1)||'ک'}</span><span className="user-pill-copy"><strong>{user?.name}</strong><small>حساب کاربری</small></span></Link></div></header><main ref={view} className="main-scroll" id="main-content"><div className="main-inner page-enter" key={loc.pathname}><Outlet/></div></main></div><nav className="mobile-bottom" aria-label="ناوبری موبایل"><Link to="/panel" className={loc.pathname==='/panel'?'active':''}><Home size={20}/>داشبورد</Link><Link to="/panel/tools" className={loc.pathname.startsWith('/panel/tools')?'active':''}><LayoutGrid size={20}/>ابزارها</Link><Link to="/panel/account" className={loc.pathname==='/panel/account'?'active':''}><UserRound size={20}/>حساب من</Link><button onClick={()=>setOpen(true)}><Menu size={20}/>بیشتر</button></nav></div>
}
function Dashboard(){const {user}=useAuth();return <div className="dashboard-minimal"><div className="dashboard-greeting"><span className="eyebrow">TRADERSHO / MY SPACE</span><h1>سلام {user?.name?.split(' ')[0]}، خوش آمدید</h1><p>به پنل کاربری تریدر شو خوش آمدید.</p></div><section className="dashboard-chart-entry surface"><div className="entry-icon"><ChartNoAxesCombined size={32}/></div><div className="entry-copy"><span className="eyebrow">تحلیل بازار</span><h2>نمودار TradingView</h2><p>بازار را با نمودار و ابزارهای تحلیلی TradingView بررسی کنید.</p><Link className="button primary" to="/panel/tools/chart">باز کردن نمودار <ArrowLeft size={18}/></Link></div><div className="entry-motif" aria-hidden="true">{[35,52,43,70,59,83,67,95,78].map((h,i)=><i key={i} style={{height:h+'px'}}/>)}</div></section><p className="dashboard-footnote">بخش‌های دیگر پنل پس از نهایی‌شدن، از منوی اصلی در دسترس قرار می‌گیرند.</p></div>}
function School(){return <><PageHeader title="مدرسه فارکس"/><ComingSoon title="مدرسه فارکس" description="محتوای مدرسه فارکس در حال آماده‌سازی است و پس از نهایی‌شدن در این بخش قرار می‌گیرد."/></>}
function PageHeader({title}:{title:string}){return <div className="page-head"><h1>{title}</h1></div>}
function AccountPage(){
 const {user,setUser}=useAuth();const [name,setName]=useState(user?.name||'');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');try{const d=await api<{user:User}>('/account','PATCH',{name});setUser(d.user);setMessage('نام شما با موفقیت به‌روزرسانی شد.')}catch(cause){setMessage((cause as Error).message)}finally{setBusy(false)}}
 return <><PageHeader title="حساب کاربری"/><div className="account-grid"><div className="surface profile-surface"><div className="profile-top"><span className="profile-avatar">{user?.name?.slice(0,1)}</span><div><h2>{user?.name}</h2><p>{user?.email}</p></div></div><form onSubmit={submit} className="stack-form"><label>نام و نام خانوادگی<input value={name} onChange={e=>setName(e.target.value)} minLength={2} required/></label><label>ایمیل<input value={user?.email||''} disabled dir="ltr"/></label>{message&&<div className="form-success" role="status">{message}</div>}<button className="button primary" disabled={busy}>{busy?'در حال ذخیره…':'ذخیرهٔ تغییرات'}<Check size={17}/></button></form></div><SecurityCard onLogoutAll={()=>setUser(null)}/></div></>
}
function App(){return <BrowserRouter><ThemeProvider><AuthProvider><Routes><Route path="/auth" element={<AuthPage/>}/><Route element={<Protected/>}><Route path="/panel" element={<Shell/>}><Route index element={<Dashboard/>}/><Route path="tools" element={<ToolsPage/>}/><Route path="tools/:toolId" element={<ToolDetail/>}/><Route path="courses/*" element={<School/>}/><Route path="school" element={<Navigate to="/panel/courses" replace/>}/><Route path="wallet" element={<ComingSoon title="کیف پول"/>}/><Route path="rebate" element={<ComingSoon title="خدمات ریبیت"/>}/><Route path="support" element={<ComingSoon title="پشتیبانی"/>}/><Route path="account" element={<AccountPage/>}/><Route path="*" element={<Navigate to="/panel" replace/>}/></Route></Route><Route path="*" element={<Navigate to="/panel" replace/>}/></Routes></AuthProvider></ThemeProvider></BrowserRouter>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
