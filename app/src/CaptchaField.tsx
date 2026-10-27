import {useEffect,useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {api} from './api'
type Challenge={enabled:boolean;id?:string;image?:string}
export default function CaptchaField({revision,disabled,onChange,onReady}:{revision:number;disabled:boolean;onChange:(v:{captchaId:string;captchaAnswer:string})=>void;onReady:(v:boolean)=>void}){
 const [challenge,setChallenge]=useState<Challenge|null>(null),[answer,setAnswer]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{let alive=true;onReady(false);setAnswer('');setError('');setChallenge(null);onChange({captchaId:'',captchaAnswer:''});api<Challenge>('/auth/captcha').then(v=>{if(alive){setChallenge(v);onReady(true)}}).catch(()=>{if(alive)setError('دریافت کد امنیتی انجام نشد. دوباره تلاش کنید.')});return()=>{alive=false}},[revision,retry,onChange,onReady])
 if(challenge?.enabled===false)return null
 return <div className="captcha-field"><div className="captcha-heading"><span>کد امنیتی</span><button type="button" className="captcha-refresh" disabled={disabled||(!challenge&&!error)} onClick={()=>setRetry(v=>v+1)} aria-label="دریافت کد امنیتی جدید"><RefreshCw size={16}/>کد جدید</button></div>{error?<p className="form-error" role="alert">{error}</p>:!challenge?<p role="status">در حال دریافت کد امنیتی…</p>:<div className="captcha-row"><img src={challenge.image} alt="تصویر کد امنیتی پنج‌رقمی" width={190} height={64}/><input aria-label="کد امنیتی" disabled={disabled} required autoComplete="off" dir="ltr" inputMode="numeric" maxLength={5} minLength={5} placeholder="کد تصویر" value={answer} onChange={e=>{setAnswer(e.target.value);onChange({captchaId:challenge.id||'',captchaAnswer:e.target.value})}}/></div>}</div>
}
