import { useEffect, useReducer, useRef, useState, useId } from 'react'
import { AreaSeries, ColorType, createChart, HistogramSeries, LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, Logical, Time } from 'lightweight-charts'
import { ArrowUpRight, Layers3, Minus, MousePointer2, MoveVertical, Ruler, Square, TrendingUp, Undo2 } from 'lucide-react'
import { bollinger, ema, macd, rsi, sma } from './indicators'
import type { IndicatorPoint, Observation } from './indicators'

export type DrawingTool = 'horizontal' | 'vertical' | 'trend' | 'ray' | 'rectangle' | 'fibonacci' | 'measure'
export interface Anchor { date: string; value: number }
export interface Drawing { id: string; type: DrawingTool; anchors: Anchor[] }
const drawingTools = [
  { id: 'cursor', label: 'نشانگر', icon: MousePointer2 }, { id: 'horizontal', label: 'خط افقی', icon: Minus },
  { id: 'vertical', label: 'خط عمودی', icon: MoveVertical }, { id: 'trend', label: 'خط روند', icon: TrendingUp },
  { id: 'ray', label: 'پرتو', icon: ArrowUpRight }, { id: 'rectangle', label: 'مستطیل', icon: Square },
  { id: 'fibonacci', label: 'فیبوناچی', icon: Layers3 }, { id: 'measure', label: 'اندازه‌گیری', icon: Ruler },
] as const
const indicators = [ ['ema','EMA 20'], ['sma','SMA 20'], ['bands','Bollinger 20,2'], ['rsi','RSI 14'], ['macd','MACD 12,26,9'] ] as const
type Indicator = typeof indicators[number][0]

export default function AnalysisChart({ points, drawings, onSave, disabled, pause }: {
  points: Observation[]; drawings: Drawing[]; onSave: (drawings: Drawing[]) => Promise<void>; disabled: boolean; pause: () => void;
}) {
  const [selected, setSelected] = useState<Record<Indicator,boolean>>({ema:false,sma:false,bands:false,rsi:false,macd:false})
  const [tool, setTool] = useState<DrawingTool | 'cursor'>('cursor')
  const [draft, setDraft] = useState<Anchor[]>([])
  const [hover, setHover] = useState<Anchor | null>(null)
  const [, redraw] = useReducer(n=>n+1,0)
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const main = useRef<ISeriesApi<'Area'> | null>(null)
  const updates = useRef<((data: Observation[]) => void)[]>([])
  const current = useRef({points,drawings,tool,draft,disabled,onSave})
  current.current = {points,drawings,tool,draft,disabled,onSave}
  const clip = useId().replaceAll(':','')

  useEffect(() => {
    if (!container.current) return
    const instance=createChart(container.current,{
      autoSize:true,
      layout:{background:{type:ColorType.Solid,color:'#0d1b2e'},textColor:'#aab8cf',fontFamily:'Vazirmatn, Arial',attributionLogo:true},
      grid:{vertLines:{color:'#aab8cf0c'},horzLines:{color:'#aab8cf12'}},
      rightPriceScale:{borderColor:'#aab8cf22',scaleMargins:{top:.12,bottom:.12}},
      timeScale:{borderColor:'#aab8cf22',rightOffset:4,timeVisible:false},
      localization:{locale:'en-GB'},
      crosshair:{vertLine:{color:'#a99aff'},horzLine:{color:'#a99aff'}},
      handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    })
    chart.current=instance
    const price=instance.addSeries(AreaSeries,{lineColor:'#a795ff',topColor:'#7961ff25',bottomColor:'#7961ff00',lineWidth:2,priceFormat:{type:'price',precision:4,minMove:.0001}})
    main.current=price
    updates.current=[data=>price.setData(data.map(p=>({time:p.date as Time,value:p.value}))) ]
    const line=(color:string,title:string,calculate:(p:Observation[])=>IndicatorPoint[],pane=0)=>{
      const series=instance.addSeries(LineSeries,{color,title,lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,priceFormat:{type:'price',precision:pane?5:4,minMove:pane ? .00001 : .0001}},pane)
      updates.current.push(data=>series.setData(calculate(data).map(p=>({...p,time:p.time as Time}))))
      return series
    }
    if(selected.ema)line('#ffad73','EMA 20',p=>ema(p,20))
    if(selected.sma)line('#7edec9','SMA 20',p=>sma(p,20))
    if(selected.bands){
      line('#82aaf099','BB upper',p=>bollinger(p).upper)
      line('#82aaf0','BB mean',p=>bollinger(p).middle)
      line('#82aaf099','BB lower',p=>bollinger(p).lower)
    }
    let pane=1
    if(selected.rsi){
      const oscillator=line('#c99dff','RSI 14',rsi,pane++)
      oscillator.applyOptions({priceFormat:{type:'price',precision:2,minMove:.01},autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})})
      for(const level of [30,70])oscillator.createPriceLine({price:level,color:'#c99dff55',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:''})
    }
    if(selected.macd){
      line('#83b4ff','MACD',p=>macd(p).line,pane)
      line('#ffad73','Signal',p=>macd(p).signal,pane)
      const histogram=instance.addSeries(HistogramSeries,{priceLineVisible:false,lastValueVisible:false,priceFormat:{type:'price',precision:5,minMove:.00001}},pane)
      updates.current.push(data=>histogram.setData(macd(data).histogram.map(p=>({...p,time:p.time as Time,color:p.value>=0?'#48bd9d88':'#ea889388'}))))
    }
    instance.panes().forEach((p,index)=>p.setStretchFactor(index===0?3:1))
    const geometry=()=>redraw()
    instance.timeScale().subscribeVisibleLogicalRangeChange(geometry)
    instance.timeScale().subscribeSizeChange(geometry)
    return()=>{instance.remove();chart.current=null;main.current=null;updates.current=[]}
  },[selected])
  useEffect(()=>{
    updates.current.forEach(update=>update(points))
    if(points.length<=50)chart.current?.timeScale().fitContent()
    else chart.current?.timeScale().scrollToRealTime()
    const frame=requestAnimationFrame(()=>redraw())
    return()=>cancelAnimationFrame(frame)
  },[points,selected])
  useEffect(()=>{
    chart.current?.applyOptions({handleScroll:{pressedMouseMove:tool==='cursor',horzTouchDrag:tool==='cursor'}})
    setDraft([]);setHover(null)
  },[tool,selected])

  const pointerStart = useRef<{x:number;y:number}|null>(null)
  const anchorAt = (x:number,y:number):Anchor|null => {
    const instance=chart.current,price=main.current
    if(!instance||!price)return null
    const size=instance.paneSize(0)
    if(x<0||x>=size.width||y<0||y>=size.height)return null
    const logical=instance.timeScale().coordinateToLogical(x)
    const observed=logical===null?undefined:current.current.points[Math.round(Number(logical))]
    const value=price.coordinateToPrice(y)
    return observed&&value!==null&&value>0?{date:observed.date,value:Number(value.toFixed(5))}:null
  }
  const place = (at:Anchor) => {
    const c=current.current
    if(c.disabled||c.tool==='cursor'||c.drawings.length>=50)return
    if(c.tool==='horizontal'||c.tool==='vertical') {
      void c.onSave([...c.drawings,{id:crypto.randomUUID(),type:c.tool,anchors:[at]}]);setDraft([]);setHover(null)
    } else if(!c.draft.length) { setDraft([at]);setHover(null) }
    else if(c.draft[0].date!==at.date||c.draft[0].value!==at.value) {
      void c.onSave([...c.drawings,{id:crypto.randomUUID(),type:c.tool,anchors:[c.draft[0],at]}]);setDraft([]);setHover(null)
    }
  }
  const size=chart.current?.paneSize(0)
  const width=size?.width||0,height=size?.height||0
  const project=(at:Anchor)=>{
    const index=points.findIndex(p=>p.date===at.date)
    if(index<0)return null
    const x=chart.current?.timeScale().logicalToCoordinate(index as Logical)
    const y=main.current?.priceToCoordinate(at.value)
    return x===undefined||x===null||y===undefined||y===null?null:{x:Number(x),y:Number(y)}
  }
  const draw=(drawing:Drawing, preview=false)=>{
    const a=project(drawing.anchors[0]),b=drawing.anchors[1]?project(drawing.anchors[1]):null
    if(!a)return null
    const color=drawing.type==='fibonacci'?'#f8bd7c':drawing.type==='measure'?'#85dfca':'#bfadff'
    const common={stroke:color,strokeWidth:1.5,strokeDasharray:preview?'5 4':undefined}
    const line=(x1:number,y1:number,x2:number,y2:number,key?:number)=> <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} {...common}/>
    if(drawing.type==='horizontal')return <g key={drawing.id}>{line(0,a.y,width,a.y)}<text x={8} y={a.y-7} fill={color}>{drawing.anchors[0].value.toFixed(4)}</text></g>
    if(drawing.type==='vertical')return <g key={drawing.id}>{line(a.x,0,a.x,height)}<text x={a.x+5} y={15} fill={color}>{drawing.anchors[0].date}</text></g>
    if(!b)return <circle key={drawing.id} cx={a.x} cy={a.y} r={4} fill={color}/>
    if(drawing.type==='rectangle')return <rect key={drawing.id} x={Math.min(a.x,b.x)} y={Math.min(a.y,b.y)} width={Math.abs(b.x-a.x)} height={Math.abs(b.y-a.y)} fill="#b6a2ff12" {...common}/>
    if(drawing.type==='fibonacci')return <g key={drawing.id}>{[0,.236,.382,.5,.618,.786,1].map((level,index)=>{
      const y=a.y+(b.y-a.y)*level,price=drawing.anchors[0].value+(drawing.anchors[1].value-drawing.anchors[0].value)*level
      return <g key={index}>{line(Math.min(a.x,b.x),y,Math.max(a.x,b.x),y)}<text x={Math.min(a.x,b.x)+4} y={y-4} fill={color}>{level} · {price.toFixed(4)}</text></g>
    })}</g>
    if(drawing.type==='ray'&&a.x!==b.x){const end=b.x>=a.x?width:0;return <g key={drawing.id}>{line(a.x,a.y,end,a.y+(b.y-a.y)*(end-a.x)/(b.x-a.x))}</g>}
    const delta=drawing.anchors[1].value-drawing.anchors[0].value
    const days=Math.abs(points.findIndex(p=>p.date===drawing.anchors[1].date)-points.findIndex(p=>p.date===drawing.anchors[0].date))
    return <g key={drawing.id}>{line(a.x,a.y,b.x,b.y)}<circle cx={a.x} cy={a.y} r={3} fill={color}/><circle cx={b.x} cy={b.y} r={3} fill={color}/>{drawing.type==='measure'&&<><rect x={Math.min(a.x,b.x)} y={Math.max(2,Math.min(a.y,b.y)-26)} width={210} height={22} rx={4} fill="#183b3a"/><text x={Math.min(a.x,b.x)+6} y={Math.max(16,Math.min(a.y,b.y)-11)} fill={color}>{delta>=0?'+':''}{delta.toFixed(4)} · {(delta/drawing.anchors[0].value*100).toFixed(2)}% · {days}D</text></>}</g>
  }
  return <div className="analysis-workbench">
    <div className="analysis-indicators" aria-label="اندیکاتورها">{indicators.map(([id,label])=><label key={id}><input type="checkbox" checked={selected[id]} onChange={e=>setSelected(s=>({...s,[id]:e.target.checked}))}/>{label}</label>)}</div>
    <div className="drawing-toolbar" role="toolbar" aria-label="ابزارهای ترسیم">{drawingTools.map(item=><button key={item.id} type="button" title={item.label} aria-label={item.label} aria-pressed={tool===item.id} disabled={disabled} className={tool===item.id?'active':''} onClick={()=>{pause();setTool(item.id)}}><item.icon size={17}/><span>{item.label}</span></button>)}<button type="button" aria-label="حذف آخرین ترسیم" disabled={disabled||!drawings.length} onClick={()=>{pause();void onSave(drawings.slice(0,-1))}}><Undo2 size={17}/><span>حذف آخرین</span></button></div>
    <div className={`analysis-chart-host ${tool!=='cursor'?'drawing-mode':''}`} style={{height:360+(selected.rsi?120:0)+(selected.macd?120:0),touchAction:tool==='cursor'?'pan-y':'none'}}
      onPointerDownCapture={event=>{pointerStart.current={x:event.clientX,y:event.clientY}}}
      onPointerUpCapture={event=>{
        const start=pointerStart.current;pointerStart.current=null
        if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)return
        const rect=event.currentTarget.getBoundingClientRect(),at=anchorAt(event.clientX-rect.left,event.clientY-rect.top)
        if(at)place(at)
      }}
      onPointerCancel={()=>{pointerStart.current=null}}
      onPointerMoveCapture={event=>{if(current.current.draft.length){const rect=event.currentTarget.getBoundingClientRect();setHover(anchorAt(event.clientX-rect.left,event.clientY-rect.top))}}}>
      <div ref={container} className="analysis-canvas" role="img" aria-label={`نمودار نرخ مرجع EUR/USD تا ${points.at(-1)?.date}`}/>
      <svg className="drawing-overlay" aria-label={`${drawings.length} ترسیم ذخیره‌شده`}><defs><clipPath id={clip}><rect width={width} height={height}/></clipPath></defs><g clipPath={`url(#${clip})`}>{drawings.map(d=>draw(d))}{draft.length>0&&tool!=='cursor'&&draw({id:'draft',type:tool,anchors:hover?[...draft,hover]:draft},true)}</g></svg>
    </div>
    <div className="drawing-hint" role="status"><span>{tool==='cursor'?'برای جابه‌جایی نمودار بکشید؛ برای بزرگ‌نمایی از محور استفاده کنید.':draft.length?'نقطهٔ دوم را روی نمودار انتخاب کنید.':`${drawingTools.find(t=>t.id===tool)?.label}: ${tool==='horizontal'||tool==='vertical'?'یک نقطه':'دو نقطه'} روی نمودار انتخاب کنید.`}</span><span>{drawings.length}/50 ترسیم</span></div>
    {(selected.macd||selected.rsi)&&<p className="indicator-note">اندیکاتورها فقط از دادهٔ قابل مشاهده محاسبه می‌شوند؛ MACD از دادهٔ ۲۶ام و خط سیگنال از دادهٔ ۳۴ام ظاهر می‌شود.</p>}
  </div>
}
