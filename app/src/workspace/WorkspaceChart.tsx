import {forwardRef,useEffect,useImperativeHandle,useReducer,useRef,useState,useId} from 'react'
import {createChart,CandlestickSeries,BarSeries,LineSeries,AreaSeries,HistogramSeries,ColorType,PriceScaleMode} from 'lightweight-charts'
import type {IChartApi,ISeriesApi,SeriesType,UTCTimestamp,Logical} from 'lightweight-charts'
import tools from '../../shared/drawing-tools.json'
import type {Anchor,Bar,Drawing,Settings} from './types'
import {dateTime} from './types'
import {observations,sma,ema,bollinger,rsi,macd,wma,hull,atr,stochastic,cci,vwap,obv,donchian,heikin} from './indicators'
export interface ChartHandle{fit:()=>void;zoom:(factor:number)=>void;snapshot:()=>Promise<void>}
interface Props{bars:Bar[];settings:Settings;drawings:Drawing[];tool:string;selected:string|null;disabled:boolean;onSave:(d:Drawing[])=>Promise<void>;onSelect:(id:string|null)=>void;onFinish:()=>void;frame:string;color:string;stroke:number;dash:boolean;text:string;readOnly?:boolean;minTime?:number;onCut?:(time:number)=>void}
const t=(n:number)=>n as UTCTimestamp
export const WorkspaceChart=forwardRef<ChartHandle,Props>(function WorkspaceChart(props,ref){
  const {bars,settings,drawings,tool,selected,disabled,onSave,onSelect,onFinish,frame,color,stroke,dash,text,readOnly,onCut}=props
  const host=useRef<HTMLDivElement>(null),overlay=useRef<SVGSVGElement>(null),chart=useRef<IChartApi|null>(null),main=useRef<ISeriesApi<SeriesType>|null>(null)
  const updates=useRef<((bars:Bar[])=>void)[]>([]),current=useRef(props);current.current=props
  const [,redraw]=useReducer(n=>n+1,0),[draft,setDraft]=useState<Anchor[]>([]),[hover,setHover]=useState<Anchor|null>(null),[legend,setLegend]=useState<Bar|null>(null)
  const draftRef=useRef(draft);draftRef.current=draft
  const drag=useRef<{id:string;index:number;anchor:Anchor}|null>(null),[moving,setMoving]=useState<{id:string;index:number;anchor:Anchor}|null>(null)
  const previousRange=useRef<{from:Logical;to:Logical}|null>(null),lastFrame=useRef(frame),follow=useRef(true)
  const clip=useId().replaceAll(':',''),arrowId=`arrow-${clip}`
  useEffect(()=>{
    if(!host.current)return
    const c=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#0b1423'},textColor:'#8d9db6',fontFamily:'Arial',attributionLogo:true},grid:{vertLines:{visible:settings.grid,color:'#96a7c30b'},horzLines:{visible:settings.grid,color:'#96a7c314'}},rightPriceScale:{borderColor:'#253248',mode:settings.scale==='log'?PriceScaleMode.Logarithmic:settings.scale==='percent'?PriceScaleMode.Percentage:PriceScaleMode.Normal,scaleMargins:{top:.12,bottom:.12}},timeScale:{borderColor:'#253248',timeVisible:true,secondsVisible:false,rightOffset:7},crosshair:{vertLine:{color:'#9c8ed480'},horzLine:{color:'#9c8ed480'}},localization:{locale:'en-GB'},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false}})
    chart.current=c
    const priceFormat={type:'price' as const,precision:5,minMove:.00001}
    const candleOptions={upColor:settings.type==='hollow'?'#0b1423':settings.up,downColor:settings.down,borderUpColor:settings.up,borderDownColor:settings.down,wickUpColor:settings.up,wickDownColor:settings.down,priceFormat}
    const price=settings.type==='line'?c.addSeries(LineSeries,{color:'#a994ff',lineWidth:2,priceFormat}):settings.type==='area'?c.addSeries(AreaSeries,{lineColor:'#a994ff',topColor:'#8874e733',bottomColor:'#8874e700',priceFormat}):settings.type==='bars'?c.addSeries(BarSeries,{upColor:settings.up,downColor:settings.down,priceFormat}):c.addSeries(CandlestickSeries,candleOptions)
    main.current=price as ISeriesApi<SeriesType>
    updates.current=[data=>{const input=settings.type==='heikin'?heikin(data):data;price.setData(input.map(b=>settings.type==='line'||settings.type==='area'?{time:t(b.time),value:b.close}:{...b,time:t(b.time)}))}]
    const line=(name:string,shade:string,calc:(bars:Bar[])=>{time:number|string;value:number}[],pane=0)=>{
      const s=c.addSeries(LineSeries,{title:name,color:shade,lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,priceFormat},pane)
      updates.current.push(data=>s.setData(calc(data).map(p=>({time:t(Number(p.time)),value:p.value}))))
      return s
    }
    const enabled=(id:string)=>settings.indicators.some(i=>i===id),period=settings.period
    if(enabled('ema'))line(`EMA ${period}`,'#f4b36a',b=>ema(observations(b),period))
    if(enabled('sma'))line(`SMA ${period}`,'#65ddc2',b=>sma(observations(b),period))
    if(enabled('wma'))line(`WMA ${period}`,'#6bb9fc',b=>wma(b.map(x=>({time:x.time,value:x.close})),period))
    if(enabled('hma'))line(`HMA ${period}`,'#f287c1',b=>hull(b,period))
    if(enabled('bands')){line('BB upper','#8caeeb99',b=>bollinger(observations(b),period).upper);line('BB mean','#8caeeb',b=>bollinger(observations(b),period).middle);line('BB lower','#8caeeb99',b=>bollinger(observations(b),period).lower)}
    if(enabled('donchian')){line('DC high','#7dc7b4',b=>donchian(b,period).map(p=>({time:p.time,value:p.high})));line('DC low','#7dc7b4',b=>donchian(b,period).map(p=>({time:p.time,value:p.low})))}
    if(enabled('vwap'))line('VWAP UTC','#eadb7b',vwap)
    let pane=1
    const levels=(s:ISeriesApi<'Line'>,values:number[])=>values.forEach(price=>s.createPriceLine({price,color:'#a494bf55',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:''}))
    if(enabled('rsi')){const s=line('RSI 14','#b99af4',b=>rsi(observations(b)),pane++);s.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}}),priceFormat:{type:'price',precision:2,minMove:.01}});levels(s,[30,70])}
    if(enabled('macd')){line('MACD','#7aacf7',b=>macd(observations(b)).line,pane);line('Signal','#f5bb8b',b=>macd(observations(b)).signal,pane);const h=c.addSeries(HistogramSeries,{lastValueVisible:false,priceLineVisible:false,priceFormat},pane++);updates.current.push(b=>h.setData(macd(observations(b)).histogram.map(p=>({time:t(Number(p.time)),value:p.value,color:p.value>=0?'#36c5a377':'#f3778c77'}))))}
    if(enabled('atr'))line('ATR 14','#e2b57c',atr,pane++)
    if(enabled('stoch')){const s=line('Stoch K','#89b9ed',b=>stochastic(b).k,pane);line('Stoch D','#f2ae92',b=>stochastic(b).d,pane++);levels(s,[20,80]);s.applyOptions({priceFormat:{type:'price',precision:2,minMove:.01}})}
    if(enabled('cci')){const s=line('CCI 20','#a4d4b1',cci,pane++);levels(s,[-100,100])}
    if(enabled('roc'))line('ROC 12','#c3a5ed',b=>b.slice(12).map((x,i)=>({time:x.time,value:100*(x.close/b[i].close-1)})),pane++)
    if(enabled('obv'))line('OBV','#e0cd8d',obv,pane++)
    if(enabled('volume')){const h=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false},pane++);updates.current.push(b=>h.setData(b.map(x=>({time:t(x.time),value:x.volume,color:x.close>=x.open?`${settings.up}66`:`${settings.down}66`}))))}
    c.panes().forEach((p,i)=>p.setStretchFactor(i===0?5:1))
    const geometry=()=>{const range=c.timeScale().getVisibleLogicalRange();if(range)follow.current=range.to>=current.current.bars.length-3;redraw()}
    c.timeScale().subscribeVisibleLogicalRangeChange(geometry);c.timeScale().subscribeSizeChange(()=>redraw())
    c.subscribeCrosshairMove(param=>{const b=current.current.bars.find(b=>b.time===param.time);setLegend(b||null)})
    const resize=new ResizeObserver(()=>redraw());resize.observe(host.current)
    return()=>{previousRange.current=c.timeScale().getVisibleLogicalRange();resize.disconnect();c.remove();chart.current=null;main.current=null;updates.current=[]}
  },[settings.type,settings.indicators,settings.period,settings.grid,settings.scale,settings.up,settings.down])
  useEffect(()=>{
    updates.current.forEach(update=>update(bars))
    const scale=chart.current?.timeScale(),changed=lastFrame.current!==frame
    if(changed){previousRange.current=null;lastFrame.current=frame;follow.current=true}
    if(previousRange.current&&!changed){scale?.setVisibleLogicalRange(previousRange.current);previousRange.current=null}
    else if(changed||!scale?.getVisibleLogicalRange())scale?.setVisibleLogicalRange({from:Math.max(-1,bars.length-150),to:bars.length+7})
    else if(follow.current)scale?.scrollToRealTime()
    const f=requestAnimationFrame(()=>redraw());return()=>cancelAnimationFrame(f)
  },[bars,settings.type,settings.indicators,settings.period,settings.grid,settings.scale,settings.up,settings.down,frame])
  useEffect(()=>{setDraft([]);setHover(null);chart.current?.applyOptions({handleScroll:{pressedMouseMove:tool==='cursor',horzTouchDrag:tool==='cursor'}})},[tool,settings.type,settings.indicators])
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setDraft([]);setHover(null)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
  const size=chart.current?.paneSize(0),width=size?.width||0,height=size?.height||0
  const project=(a:Anchor)=>{
    if(!chart.current||!main.current||!bars.length)return null
    let i=bars.findIndex(b=>b.time>a.time);if(i<0)i=bars.length
    i=Math.max(0,i-1)
    const x=chart.current.timeScale().logicalToCoordinate(i as Logical),y=main.current.priceToCoordinate(a.price)
    return x===null||y===null?null:{x:Number(x),y:Number(y)}
  }
  const at=(x:number,y:number):Anchor|null=>{
    if(!chart.current||!main.current||!size||x<0||x>=size.width||y<0||y>=size.height)return null
    const logical=chart.current.timeScale().coordinateToLogical(x),bar=logical===null?null:bars[Math.round(Number(logical))]
    const price=main.current.coordinateToPrice(y)
    if(!bar||price===null||price<=0||price>100)return null
    const p=settings.magnet?[bar.open,bar.high,bar.low,bar.close].sort((a,b)=>Math.abs(a-price)-Math.abs(b-price))[0]:price
    return {time:Math.max(bar.time,current.current.minTime??bar.time),price:Number(p.toFixed(5))}
  }
  const place=(a:Anchor)=>{
    if(disabled||readOnly)return
    if(tool==='cut'){onCut?.(a.time);return}
    if(tool==='cursor'){onSelect(null);return}
    const definition=tools.find(x=>x.id===tool);if(!definition||drawings.length>=100)return
    const anchors=[...draftRef.current,a]
    if(anchors.length===definition.points){const d:Drawing={id:crypto.randomUUID(),type:tool,anchors,color,width:stroke,dash,hidden:false,locked:false,text};void onSave([...drawings,d]);onSelect(d.id);setDraft([]);setHover(null);onFinish()}
    else{setDraft(anchors);setHover(null)}
  }
  const draw=(d:Drawing,preview=false)=>{
    const locations=d.anchors.map(project);if(locations.some(p=>!p))return null
    if(d.anchors.length<(tools.find(t=>t.id===d.type)?.points||1))return <g key={d.id}><polyline points={locations.map(p=>`${p!.x},${p!.y}`).join(' ')} fill="none" stroke={d.color} strokeWidth={d.width} strokeDasharray="5 4"/>{locations.map((p,i)=><circle key={i} cx={p!.x} cy={p!.y} r={3} fill={d.color}/>)}</g>
    const a=locations[0]!,b=locations[1]||a,c=locations[2]||b,pa=d.anchors[0].price,pb=d.anchors[1]?.price??pa
    const common={stroke:d.color,strokeWidth:d.width,strokeDasharray:preview||d.dash?'6 4':undefined,fill:'none'}
    const line=(x1:number,y1:number,x2:number,y2:number,key?:number)=><line key={key} x1={x1} y1={y1} x2={x2} y2={y2} {...common}/>
    const label=(x:number,y:number,value:string,key?:number)=><text key={key} x={x} y={y} fill={d.color}>{value}</text>
    const extended=(p:{x:number;y:number},q:{x:number;y:number},both=false)=>{if(q.x===p.x)return line(p.x,0,p.x,height);const end=q.x>=p.x?width:0,start=both?width-end:p.x;return line(start,p.y+(q.y-p.y)*(start-p.x)/(q.x-p.x),end,p.y+(q.y-p.y)*(end-p.x)/(q.x-p.x))}
    let content
    if(d.type==='horizontal'||d.type==='horizontalRay')content=<>{line(d.type==='horizontalRay'?a.x:0,a.y,width,a.y)}{label(d.type==='horizontalRay'?a.x+5:6,a.y-7,pa.toFixed(5))}</>
    else if(d.type==='vertical')content=line(a.x,0,a.x,height)
    else if(d.type==='cross')content=<>{line(0,a.y,width,a.y)}{line(a.x,0,a.x,height)}</>
    else if(d.type==='ray'||d.type==='extended')content=extended(a,b,d.type==='extended')
    else if(d.type==='rectangle')content=<rect x={Math.min(a.x,b.x)} y={Math.min(a.y,b.y)} width={Math.abs(b.x-a.x)} height={Math.abs(b.y-a.y)} {...common} fill={`${d.color}12`}/>
    else if(d.type==='ellipse')content=<ellipse cx={(a.x+b.x)/2} cy={(a.y+b.y)/2} rx={Math.abs(b.x-a.x)/2} ry={Math.abs(b.y-a.y)/2} {...common} fill={`${d.color}12`}/>
    else if(d.type==='triangle')content=<polygon points={locations.map(p=>`${p!.x},${p!.y}`).join(' ')} {...common} fill={`${d.color}12`}/>
    else if(d.type==='channel'){const dy=c.y-(a.y+(b.y-a.y)*(c.x-a.x)/(b.x-a.x||1));content=<>{line(a.x,a.y,b.x,b.y)}{line(a.x,a.y+dy,b.x,b.y+dy)}<polygon points={`${a.x},${a.y} ${b.x},${b.y} ${b.x},${b.y+dy} ${a.x},${a.y+dy}`} fill={`${d.color}10`}/>{line(a.x,a.y+dy/2,b.x,b.y+dy/2)}</>}
    else if(d.type==='pitchfork'){const mid={x:(b.x+c.x)/2,y:(b.y+c.y)/2},delta={x:mid.x-a.x,y:mid.y-a.y};content=<>{extended(a,mid)}{extended(b,{x:b.x+delta.x,y:b.y+delta.y})}{extended(c,{x:c.x+delta.x,y:c.y+delta.y})}{line(b.x,b.y,c.x,c.y)}</>}
    else if(d.type==='fibonacci'||d.type==='fibExtension'){const levels=d.type==='fibonacci'?[0,.236,.382,.5,.618,.786,1]:[0,.618,1,1.272,1.618,2,2.618];content=<>{levels.map((level,i)=>{const price=d.type==='fibonacci'?pa+(pb-pa)*level:(d.anchors[2]?.price??pb)+(pb-pa)*level,y=main.current?.priceToCoordinate(price);return y===null||y===undefined?null:<g key={i}>{line(Math.min(a.x,b.x),Number(y),Math.max(a.x,b.x,c.x)+60,Number(y))}{label(Math.min(a.x,b.x)+4,Number(y)-4,`${level} · ${price.toFixed(5)}`)}</g>})}</>}
    else if(d.type==='fibTime')content=<>{[0,1,2,3,5,8,13].map((n,i)=><g key={i}>{line(a.x+(b.x-a.x)*n,0,a.x+(b.x-a.x)*n,height)}{label(a.x+(b.x-a.x)*n+3,18,String(n))}</g>)}</>
    else if(d.type==='fibFan'||d.type==='gannFan')content=<>{(d.type==='fibFan'?[.382,.5,.618,1]:[.125,.25,.5,1,2,4,8]).map((n,i)=><g key={i}>{extended(a,{x:b.x,y:a.y+(b.y-a.y)*n})}{label(b.x+5,a.y+(b.y-a.y)*n,String(n))}</g>)}</>
    else if(d.type==='text')content=label(a.x+7,a.y-8,d.text||'یادداشت')
    else if(d.type==='priceLabel')content=<>{line(a.x,a.y,a.x+35,a.y)}{label(a.x+38,a.y+4,pa.toFixed(5))}</>
    else if(['abcd','xabcd','elliott'].includes(d.type))content=<><polyline points={locations.map(p=>`${p!.x},${p!.y}`).join(' ')} {...common}/>{locations.map((p,i)=>label(p!.x+5,p!.y-8,(d.type==='elliott'?['0','1','2','3','4','5']:d.type==='xabcd'?['X','A','B','C','D']:['A','B','C','D'])[i],i))}</>
    else if(['measure','priceRange','dateRange'].includes(d.type)){const delta=pb-pa,minutes=Math.abs(d.anchors[1].time-d.anchors[0].time)/60;content=<><rect x={Math.min(a.x,b.x)} y={Math.min(a.y,b.y)} width={Math.abs(b.x-a.x)} height={Math.abs(b.y-a.y)} fill={`${d.color}18`}/>{line(a.x,a.y,b.x,b.y)}{label(Math.min(a.x,b.x)+5,Math.max(18,Math.min(a.y,b.y)-8),d.type==='dateRange'?`${minutes} min`:d.type==='priceRange'?`${delta.toFixed(5)} · ${(delta/pa*100).toFixed(2)}%`:`${delta.toFixed(5)} · ${(delta/pa*100).toFixed(2)}% · ${minutes} min`)}</>}
    else content=<>{d.type==='arrow'?<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} markerEnd={`url(#${arrowId})`}/>:line(a.x,a.y,b.x,b.y)}{d.type==='angle'&&label(b.x+6,b.y-8,`${(Math.atan2(a.y-b.y,b.x-a.x)*180/Math.PI).toFixed(1)}° screen`)}</>
    return <g key={d.id} className="ws-drawing" style={{pointerEvents:!preview&&!readOnly&&tool==='cursor'?'visiblePainted':'none'}} onPointerDown={e=>{if(!preview&&!readOnly&&tool==='cursor'){e.stopPropagation();onSelect(d.id)}}}>{content}{!preview&&!readOnly&&tool==='cursor'&&<polyline points={locations.map(p=>`${p!.x},${p!.y}`).join(' ')} fill="none" stroke="transparent" strokeWidth={14} style={{pointerEvents:'stroke',cursor:'pointer'}} onPointerDown={e=>{e.stopPropagation();onSelect(d.id)}}/>}{!preview&&tool==='cursor'&&d.id===selected&&locations.map((p,i)=><circle key={i} cx={p!.x} cy={p!.y} r={5} fill="#0b1423" stroke={d.color} strokeWidth={2} style={{pointerEvents:'all',cursor:d.locked?'not-allowed':'move',touchAction:'none'}} onPointerDown={e=>{e.stopPropagation();onSelect(d.id);if(!disabled&&!d.locked){drag.current={id:d.id,index:i,anchor:d.anchors[i]};e.currentTarget.setPointerCapture(e.pointerId)}}}/>)}</g>
  }
  useImperativeHandle(ref,()=>({fit:()=>{chart.current?.timeScale().fitContent();redraw()},zoom:factor=>{const ts=chart.current?.timeScale(),r=ts?.getVisibleLogicalRange();if(r){const mid=(r.to+r.from)/2,half=(r.to-r.from)/2*factor;ts?.setVisibleLogicalRange({from:mid-half,to:mid+half});redraw()}},snapshot:async()=>{
    const canvas=chart.current?.takeScreenshot();if(!canvas||!overlay.current)return
    const svg=overlay.current.cloneNode(true) as SVGSVGElement;svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',String(canvas.width));svg.setAttribute('height',String(canvas.height));svg.querySelectorAll('text').forEach(el=>el.setAttribute('font-size','11'))
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}))
    try{const picture=new Image();picture.src=url;await picture.decode();canvas.getContext('2d')?.drawImage(picture,0,0);const a=document.createElement('a');a.href=canvas.toDataURL();a.download='tradersho-chart.png';a.click()}finally{URL.revokeObjectURL(url)}
  }}))
  const start=useRef<{x:number;y:number}|null>(null)
  const last=legend||bars.at(-1)
  const display=drawings.map(d=>moving?.id===d.id?{...d,anchors:d.anchors.map((a,i)=>i===moving.index?moving.anchor:a)}:d)
  return <div className="ws-chart" data-testid="candle-chart">
    <div className="ws-ohlc" dir="ltr"><b>EUR/USD <span>· {frame} · {settings.type==='heikin'?'Heikin Ashi · synthetic OHLC':'OHLC'}</span></b>{last&&<><span>{dateTime(last.time)} UTC</span><span>O <em>{last.open.toFixed(5)}</em></span><span>H <em>{last.high.toFixed(5)}</em></span><span>L <em>{last.low.toFixed(5)}</em></span><span>C <em className={last.close>=last.open?'positive':'negative'}>{last.close.toFixed(5)}</em></span></>}</div>
    <div className={`ws-chart-plot ${tool!=='cursor'?'drawing-mode':''}`} style={{touchAction:tool==='cursor'?'pan-y':'none'}} onPointerDownCapture={e=>{start.current={x:e.clientX,y:e.clientY}}} onPointerMoveCapture={e=>{const rect=e.currentTarget.getBoundingClientRect(),a=at(e.clientX-rect.left,e.clientY-rect.top);if(drag.current&&a){drag.current={...drag.current,anchor:a};setMoving(drag.current)}else if(draftRef.current.length)setHover(a)}} onPointerUpCapture={e=>{
      if(drag.current){const move=drag.current;drag.current=null;setMoving(null);start.current=null;void onSave(drawings.map(d=>d.id===move.id?{...d,anchors:d.anchors.map((a,i)=>i===move.index?move.anchor:a)}:d));return}
      const p=start.current;start.current=null;if(!p||Math.hypot(e.clientX-p.x,e.clientY-p.y)>8)return
      const target=e.target as Element;if(target.closest('svg'))return
      const rect=e.currentTarget.getBoundingClientRect(),a=at(e.clientX-rect.left,e.clientY-rect.top);if(a)place(a)
    }} onPointerCancel={()=>{start.current=null;drag.current=null;setMoving(null)}}>
      <div ref={host} className="ws-lwc" role="img" aria-label={`نمودار کندلی EUR/USD تایم‌فریم ${frame}`}/>
      <svg ref={overlay} className="ws-overlay"><defs><clipPath id={clip}><rect width={width} height={height}/></clipPath><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs><g clipPath={`url(#${clip})`}>{!settings.hideDrawings&&display.filter(d=>!d.hidden).map(d=>draw(d))}{draft.length>0&&draw({id:'preview',type:tool,anchors:hover?[...draft,hover]:draft,color,width:stroke,dash:true,hidden:false,locked:false,text},true)}</g></svg>
    </div>
    <div className="ws-chart-status"><span>{tool==='cursor'?'کشیدن: جابه‌جایی · اسکرول: بزرگ‌نمایی':tool==='cut'?'برای شروع تمرین جدید، روی کندل انتخابی بزنید.':`${tools.find(t=>t.id===tool)?.label} · ${draft.length}/${tools.find(t=>t.id===tool)?.points} نقطه · Escape لغو`}</span><span dir="ltr">{bars.length.toLocaleString()} bars · UTC</span></div>
  </div>
})
