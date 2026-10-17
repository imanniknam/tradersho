import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, ExternalLink, Info, Pause, Play, RefreshCw, SkipForward } from 'lucide-react'
import { api } from './api'
import AnalysisChart from './analysis/AnalysisChart'
import type { Drawing } from './analysis/AnalysisChart'
import BacktestPanel from './analysis/BacktestPanel'
import type { SimulationView } from './analysis/BacktestPanel'

interface Point { date: string; value: number }
interface Dataset {
  id: string; symbol: string; firstDate: string; lastDate: string; totalPoints: number;
  startDates: string[]; source: string; sourceUrl: string; termsUrl: string; downloadedOn: string;
}
interface Session {
  id: string; startCursor: number; cursor: number; version: number; startDate: string;
  currentDate: string; hasNext: boolean; points: Point[]; updatedAt: string;
  drawings: Drawing[]; drawingVersion: number; simulation: SimulationView | null;
}

export default function ReferenceLab() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(800)
  const [startDate, setStartDate] = useState('')
  const [initialBalance, setInitialBalance] = useState('10000')
  const inflight = useRef(false)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [market, saved] = await Promise.all([
        api<{ dataset: Dataset }>('/market/catalog'), api<{ session: Session | null }>('/replay/session'),
      ])
      if (!mounted.current) return
      setDataset(market.dataset); setSession(saved.session)
      setStartDate(saved.session?.startDate || market.dataset.startDates[0])
    } catch (cause) { if (mounted.current) setError((cause as Error).message) }
    finally { if (mounted.current) setLoading(false) }
  }, [])
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [load])
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', pause)
    return () => document.removeEventListener('visibilitychange', pause)
  }, [])

  const begin = async () => {
    if (!dataset || inflight.current) return
    inflight.current = true; setBusy(true); setPlaying(false); setError('')
    // Weekends/holidays snap forward to the next published observation.
    const date = dataset.startDates.find(d => d >= startDate)
    if (!date) { setError('تاریخ شروع خارج از بازهٔ داده است.'); setBusy(false); inflight.current = false; return }
    try {
      const result = await api<{ session: Session }>('/replay/session', 'POST', { startDate: date, initialBalance })
      if (mounted.current) { setSession(result.session); setStartDate(result.session.startDate) }
    } catch (cause) { if (mounted.current) setError((cause as Error).message) }
    finally { inflight.current = false; if (mounted.current) setBusy(false) }
  }

  const advance = useCallback(async () => {
    if (!session?.hasNext || inflight.current) return
    inflight.current = true; setBusy(true); setError('')
    try {
      const result = await api<{ session: Session }>(`/replay/session/${session.id}/advance`, 'POST', { version: session.version, requestId: crypto.randomUUID() })
      if (mounted.current) { setSession(result.session); if (!result.session.hasNext) setPlaying(false) }
    } catch (cause) {
      if (mounted.current) { setError((cause as Error).message); setPlaying(false) }
      // Also resolves a lost response or a version conflict with another tab.
      try {
        const current = await api<{ session: Session }>(`/replay/session/${session.id}`)
        if (mounted.current) setSession(current.session)
      } catch { /* original error remains visible */ }
    } finally { inflight.current = false; if (mounted.current) setBusy(false) }
  }, [session])

  useEffect(() => {
    if (!playing || busy || !session?.hasNext) return
    const timer = window.setTimeout(() => { void advance() }, speed)
    return () => window.clearTimeout(timer)
  }, [playing, busy, session, speed, advance])

  const mutate = async (suffix: string, method: string, input: Record<string, unknown>) => {
    if (!session || inflight.current) return
    inflight.current = true; setBusy(true); setPlaying(false); setError('')
    try {
      const result = await api<{ session: Session }>(`/replay/session/${session.id}/${suffix}`, method, input)
      if (mounted.current) setSession(result.session)
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message)
      try {
        const current = await api<{ session: Session }>(`/replay/session/${session.id}`)
        if (mounted.current) setSession(current.session)
      } catch { /* preserve the original failure */ }
    } finally { inflight.current = false; if (mounted.current) setBusy(false) }
  }

  if (loading) return <div className="surface lab-loading"><div className="loader"/> در حال آماده‌سازی فضای تمرین…</div>
  if (!dataset) return <div className="surface empty-state"><Info size={30}/><h2>داده دریافت نشد</h2><p role="alert">{error}</p><button className="button secondary" onClick={() => void load()}><RefreshCw size={16}/> تلاش دوباره</button></div>
  const last = session?.points.at(-1)
  const first = session?.points[session.startCursor]
  const change = last && first ? ((last.value / first.value - 1) * 100) : 0
  const percent = session ? Math.round((session.cursor - session.startCursor) / (dataset.totalPoints - 1 - session.startCursor) * 100) : 0

  return <div className="reference-lab">
    <div className="lab-heading"><div><span className="eyebrow">TRADERSHO / PRACTICE LAB</span><h2>هر گام، یک روز از بازار</h2><p>روند EUR/USD را از یک نقطه در گذشته، قدم‌به‌قدم مرور کنید.</p></div><span className="badge badge-violet">نسخهٔ آزمایشی · نرخ روزانه</span></div>
    <div className="lab-disclosure"><Info size={19}/><p>این نسخه از <strong>نرخ مرجع روزانهٔ ECB</strong> استفاده می‌کند؛ نمودار خطی است و دادهٔ Live یا کندل درون‌روزی ندارد. حساب فرضی زیر نمودار، سفارش‌ها را با نرخ روز بعد شبیه‌سازی می‌کند.</p></div>
    <div className="lab-layout"><section className="surface lab-workspace" aria-label="فضای نمودار و Replay">
      <div className="lab-quote"><div><span className="lab-symbol" dir="ltr">EUR / USD</span><small>دلار آمریکا به ازای یک یورو</small></div><div className="lab-price" dir="ltr"><strong data-testid="reference-price">{last ? last.value.toFixed(4) : '—'}</strong>{session && <span className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}% <small>از شروع تمرین</small></span>}</div></div>
      <div className="lab-chart-toolbar"><span><Clock3 size={14}/> روزانه · 1D</span><span>تحلیل روی نرخ‌های مرجع</span></div>
      {session ? <AnalysisChart points={session.points} drawings={session.drawings} disabled={busy} pause={() => setPlaying(false)} onSave={drawings => mutate('drawings', 'PUT', { drawings, drawingVersion: session.drawingVersion })}/> : <div className="lab-start-placeholder"><ChartMotif/><h3>نقطهٔ شروع، دست شماست</h3><p>تاریخ را انتخاب کنید و یک تمرین تازه بسازید.</p><button className="button primary" onClick={() => void begin()} disabled={busy}>شروع تمرین <ArrowLeft size={17}/></button></div>}
      <div className="replay-controls"><button className="button primary" onClick={() => setPlaying(p => !p)} disabled={!session?.hasNext || (busy && !playing)} aria-label={playing ? 'توقف پخش' : 'پخش خودکار'}>{playing ? <Pause size={18}/> : <Play size={18}/>} {playing ? 'توقف' : 'پخش'}</button><button className="button secondary" onClick={() => { setPlaying(false); void advance() }} disabled={!session?.hasNext || busy} aria-label="روز بعد"><SkipForward size={18}/> روز بعد</button><label className="replay-speed">سرعت<select value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="سرعت پخش"><option value={1600}>آرام · 0.5×</option><option value={800}>عادی · 1×</option><option value={300}>سریع · 2×</option></select></label><div className="replay-day"><small>{session ? 'روز قابل مشاهده' : 'بدون تمرین فعال'}</small><strong data-testid="replay-date" dir="ltr">{session?.currentDate || '—'}</strong></div></div>
      {session && <div className="replay-progress"><div><span>{session.hasNext ? `${session.cursor - session.startCursor} روز مرور شده` : 'به پایان بازهٔ داده رسیدید'}</span><span>{percent}٪</span></div><progress max={100} value={percent} aria-label="پیشرفت مرور تاریخچه"/></div>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </section><aside className="lab-sidebar"><section className="surface lab-session"><span className="eyebrow">تمرین شما</span><h3>{session ? 'ادامه از همان نقطه' : 'آمادهٔ اولین قدم؟'}</h3><p>پیشرفت هر گام در حساب شما ذخیره می‌شود. با بازگشت به این صفحه، همان تمرین را ادامه دهید.</p><label>سرمایهٔ اولیهٔ تمرین جدید (دلار)<input type="number" min={100} max={10000000} step="0.01" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} dir="ltr"/></label><label>شروع از تاریخ<input type="date" value={startDate} min={dataset.startDates[0]} max={dataset.startDates.at(-1)} onChange={e => { setPlaying(false); setStartDate(e.target.value) }}/></label><small>در روز تعطیل، نزدیک‌ترین روز انتشار بعدی انتخاب می‌شود.</small><button className="button secondary" onClick={() => void begin()} disabled={busy || !startDate}><RefreshCw size={16}/>{session ? 'تمرین جدید از این تاریخ' : 'ساخت تمرین'}</button>{session && <span className="lab-save-status" role="status"><Check size={15}/>{busy ? 'در حال ثبت گام…' : 'آخرین گام ذخیره شد'}</span>}</section>
    <section className="surface lab-source"><span className="eyebrow">دربارهٔ داده</span><h3>یک شروع رایگان و شفاف</h3><dl><div><dt>نماد</dt><dd dir="ltr">{dataset.symbol}</dd></div><div><dt>بازه</dt><dd dir="ltr">{dataset.firstDate}<br/>{dataset.lastDate}</dd></div><div><dt>تعداد نرخ روزانه</dt><dd>{dataset.totalPoints}</dd></div><div><dt>نوع تمرین</dt><dd>حساب فرضی، بدون امتیاز</dd></div></dl><p>نرخ‌ها تاریخی و مرجع‌اند؛ قیمت قابل اجرای معامله، bid/ask یا OHLC نیستند. این داده‌ها به‌رایگان در سایت ECB در دسترس‌اند.</p><a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noreferrer">منبع: بانک مرکزی اروپا <ExternalLink size={13}/></a><a href={dataset.termsUrl} target="_blank" rel="noreferrer">شرایط استفاده از داده <ExternalLink size={13}/></a></section></aside></div>
    {session && <BacktestPanel simulation={session.simulation} hasNext={session.hasNext} busy={busy} initialBalance={initialBalance} command={input => mutate('simulation', 'POST', { ...input, version: session.version, requestId: crypto.randomUUID() })}/>}
    <p className="chart-attribution" dir="ltr">TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a> · <a href="/licenses/lightweight-charts.txt" target="_blank" rel="noreferrer">Apache 2.0</a></p>
  </div>
}

function ChartMotif() { return <div className="lab-motif" aria-hidden="true">{[28, 45, 39, 60, 51, 78, 66, 90].map((height, i) => <i key={i} style={{ height }}/>)}</div> }
