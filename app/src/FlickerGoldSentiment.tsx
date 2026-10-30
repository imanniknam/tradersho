import {useEffect,useRef,useState} from 'react'
import {ExternalLink,Gauge} from 'lucide-react'
import {useTheme} from './theme'
const origin='https://flicker.finance'
const source=origin+'/assets/xau/fear-and-greed-index?utm_source=tradersho&utm_medium=widget&utm_campaign=fear-greed'
export default function FlickerGoldSentiment(){
 const {theme}=useTheme(),frame=useRef<HTMLIFrameElement>(null),[height,setHeight]=useState(260),[loaded,setLoaded]=useState(false),[slow,setSlow]=useState(false)
 const src=origin+'/embed/en/xau/fear-greed?'+new URLSearchParams({theme,bg:'transparent',border:'off',accent:'543aff',font:'system'})
 useEffect(()=>{setLoaded(false);setSlow(false);setHeight(260);const timer=setTimeout(()=>setSlow(true),15000);return()=>clearTimeout(timer)},[src])
 useEffect(()=>{const resize=(e:MessageEvent)=>{if(e.origin!==origin||e.source!==frame.current?.contentWindow||e.data?.type!=='flicker-widget:resize'||typeof e.data.height!=='number'||!Number.isFinite(e.data.height))return;setHeight(Math.max(180,Math.min(650,Math.round(e.data.height))))};window.addEventListener('message',resize);return()=>window.removeEventListener('message',resize)},[])
 return <section className="surface context-card flicker-card" aria-labelledby="gold-sentiment-title"><header><Gauge size={22}/><h2 id="gold-sentiment-title">ترس و طمع طلا</h2></header><p className="context-caption">احساسات بازار طلا · <bdi>XAU</bdi></p><div className="flicker-frame-wrap"><iframe ref={frame} key={src} src={src} title="شاخص ترس و طمع طلا — Flicker" width="100%" height={height} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>setLoaded(true)}/></div>{!loaded&&slow&&<p className="context-caption" role="status">دریافت ویجت طول کشیده است؛ می‌توانید آن را در سایت منبع ببینید.</p>}<div className="flicker-guide" role="group" aria-label="راهنمای فارسی شاخص"><dl>{[['Extreme fear','ترس شدید'],['Fear','ترس'],['Neutral','خنثی'],['Greed','طمع'],['Extreme greed','طمع شدید']].map(([en,fa])=><div key={en}><dt lang="en" dir="ltr">{en}</dt><dd>{fa}</dd></div>)}</dl></div><a className="context-link flicker-attribution" href={source} target="_blank" rel="noopener noreferrer">شاخص اختصاصی طلا از Flicker<ExternalLink size={14}/></a></section>
}
