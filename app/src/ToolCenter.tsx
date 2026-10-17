import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bot, Calculator, CalendarDays, ChartNoAxesCombined, Clock3, LayoutGrid, NotebookPen, RefreshCw, Search } from 'lucide-react'
import { api } from './api'
import { tools } from './data'
import type { ToolId } from './data'
const ReferenceLab = lazy(() => import('./ReferenceLab'))
const CandleWorkspace = lazy(() => import('./workspace/CandleWorkspace'))

type Readiness = 'active' | 'beta' | 'coming_soon' | 'maintenance'
interface CatalogItem { id: ToolId; status: Readiness; label: string }

function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    setError('')
    api<{ tools: CatalogItem[] }>('/tools').then(result => { if (current) setCatalog(result.tools) }).catch(cause => { if (current) setError((cause as Error).message) })
    return () => { current = false }
  }, [attempt])
  return { catalog, error, retry: () => setAttempt(a => a + 1) }
}

function ToolIcon({ id, size = 22 }: { id: ToolId; size?: number }) {
  const Icon = { chart: ChartNoAxesCombined, calculator: Calculator, calendar: CalendarDays, journal: NotebookPen, expert: Bot }[id]
  return <Icon size={size} strokeWidth={1.7}/>
}

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return <section className="surface coming-soon"><div className="coming-symbol"><Clock3 size={32}/></div><span className="badge badge-muted">به‌زودی</span><h2>{title} در حال آماده‌سازی است</h2><p>{description || 'این بخش پس از تکمیل و بررسی در دسترس قرار می‌گیرد. فعلاً می‌توانید سایر بخش‌های آمادهٔ پنل را بررسی کنید.'}</p><div><Link className="button primary" to="/panel/tools">دیدن ابزارهای آماده <ArrowLeft size={17}/></Link><Link className="button secondary" to="/panel">بازگشت به داشبورد</Link></div></section>
}

function CatalogError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="surface empty-state"><h2>دریافت وضعیت ابزارها ممکن نشد</h2><p role="alert">{message}</p><button className="button secondary" onClick={retry}><RefreshCw size={16}/> تلاش دوباره</button></div>
}

export function ToolsPage() {
  const { catalog, error, retry } = useCatalog()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const filtered = tools.filter(tool => `${tool.title} ${tool.description} ${tool.category}`.includes(query)).filter(tool => {
    const item = catalog?.find(c => c.id === tool.id)
    return filter === 'all' || (filter === 'ready' ? item?.status === 'active' || item?.status === 'beta' : item?.status === 'coming_soon')
  })
  return <><div className="page-head"><div><span className="eyebrow">TRADERSHO / TOOL CENTER</span><h1>مرکز ابزارها</h1><p>یک فضای مشخص برای هر کار؛ وضعیت آمادگی هر ابزار را اینجا ببینید.</p></div></div>{error ? <CatalogError message={error} retry={retry}/> : !catalog ? <div className="lab-loading"><div className="loader"/> دریافت ابزارها…</div> : <>
    <div className="tools-toolbar"><div className="search-field"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="جستجو در ابزارها..." aria-label="جستجو در ابزارها"/></div><div className="segmented" aria-label="فیلتر وضعیت ابزارها">{[['all','همه'],['ready','آمادهٔ استفاده'],['soon','به‌زودی']].map(([key,label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
    <div className="tools-result"><span>{filtered.length} ابزار</span><span>هر ابزار پس از تکمیل در همین صفحه فعال می‌شود</span></div>
    {filtered.length ? <div className="tool-cards tool-catalog-grid">{filtered.map(tool => {
      const item = catalog.find(c => c.id === tool.id)
      const ready = item?.status === 'beta' || item?.status === 'active'
      return <Link to={`/panel/tools/${tool.id}`} className={`tool-card catalog-card ${ready ? 'ready' : 'upcoming'}`} key={tool.id}>
        <div className={`catalog-art catalog-art-${tool.id}`}><ToolIcon id={tool.id} size={42}/><span>{tool.id === 'chart' ? 'REFERENCE / REPLAY' : tool.id === 'calculator' ? 'RISK / CALCULATOR' : 'TRADERSHO / NEXT'}</span><div className="catalog-art-lines"/></div>
        <div className="tool-card-body"><div className="tool-card-meta"><span className={`badge ${ready ? 'badge-violet' : 'badge-muted'}`}>{item?.label || 'در حال بررسی'}</span><span>{tool.category}</span></div><h3>{tool.title}</h3><p>{tool.description}</p><span className="tool-card-link">{ready ? 'ورود به ابزار' : 'دربارهٔ این ابزار'} <ArrowLeft size={16}/></span></div>
      </Link>
    })}</div> : <div className="surface empty-state"><Search size={28}/><h2>ابزاری پیدا نشد</h2><button className="button secondary" onClick={() => { setFilter('all'); setQuery('') }}>نمایش همه</button></div>}
  </>}</>
}

export function ToolDetail({ calculator }: { calculator: ReactNode }) {
  const { toolId } = useParams()
  const [searchParams] = useSearchParams()
  const tool = tools.find(t => t.id === toolId)
  const { catalog, error, retry } = useCatalog()
  const [accessError, setAccessError] = useState('')
  const [allowed, setAllowed] = useState(false)
  const item = catalog?.find(c => c.id === toolId)
  useEffect(() => {
    let current = true
    setAllowed(false); setAccessError('')
    if (item?.status === 'active' || item?.status === 'beta') {
      api(`/tools/${item.id}/access`).then(() => { if (current) setAllowed(true) }).catch(cause => { if (current) setAccessError((cause as Error).message) })
    }
    return () => { current = false }
  }, [item])
  if (!tool) return <div className="empty-state"><h1>ابزار پیدا نشد</h1><Link to="/panel/tools">بازگشت به مرکز ابزارها</Link></div>
  const upcoming = item?.status === 'coming_soon' || item?.status === 'maintenance'
  return <><div className="page-head"><div><Link className="back-link" to="/panel/tools"><ArrowRight size={16}/> بازگشت به مرکز ابزارها</Link><span className="eyebrow">TRADERSHO / WORKSPACE</span><h1>{tool.title}</h1><p>{tool.description}</p></div><Link to="/panel/tools" className="button secondary"><LayoutGrid size={17}/> همهٔ ابزارها</Link></div>
    <nav className="tool-switch-bar" aria-label="جابه‌جایی ابزارها">{tools.map(t => <Link key={t.id} className={t.id === toolId ? 'active' : ''} to={`/panel/tools/${t.id}`}><ToolIcon id={t.id} size={16}/>{t.title}</Link>)}</nav>
    {error ? <CatalogError message={error} retry={retry}/> : !catalog ? <div className="lab-loading"><div className="loader"/> بررسی وضعیت ابزار…</div> : upcoming ? <ComingSoon title={tool.title} description={tool.description + ' این ابزار هنوز منتشر نشده و پس از آماده‌سازی از همین مسیر در دسترس خواهد بود.'}/> : accessError ? <CatalogError message={accessError} retry={() => { setAllowed(false); retry() }}/> : !allowed ? <div className="lab-loading"><div className="loader"/> در حال آماده‌سازی…</div> : toolId === 'chart' ? <Suspense fallback={<div className="lab-loading">دریافت فضای تمرین…</div>}>{searchParams.get('view') === 'reference' ? <ReferenceLab/> : <CandleWorkspace/>}</Suspense> : toolId === 'calculator' ? <section className="surface detail-surface"><div className="surface-head"><div><span className="eyebrow">RISK MANAGEMENT</span><h2>محاسبهٔ اندازهٔ موقعیت</h2></div><span className="badge badge-violet">بر پایهٔ ورودی شما</span></div>{calculator}</section> : <ComingSoon title={tool.title}/>}
  </>
}
