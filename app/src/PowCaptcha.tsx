import {useEffect,useRef,useState} from 'react'
import type {Challenge} from 'altcha-lib'
import type {AltchaWidgetElement} from 'altcha'

type Props={id:string;challenge:Challenge;expiresIn:number;disabled:boolean;onChange:(v:{captchaId:string;captchaAnswer:string})=>void;onReady:(v:boolean)=>void}
export default function PowCaptcha({id,challenge,expiresIn,disabled,onChange,onReady}:Props){
 const host=useRef<HTMLDivElement>(null),[error,setError]=useState('')
 useEffect(()=>{
  let alive=true,widget:AltchaWidgetElement|undefined
  onReady(false);onChange({captchaId:id,captchaAnswer:''});setError('')
  const stateChanged=(event:Event)=>{
   if(!alive)return
   const detail=(event as CustomEvent<{state:string;payload?:string}>).detail
   const verified=detail.state==='verified'&&!!detail.payload
   onChange({captchaId:id,captchaAnswer:verified?detail.payload!:''});onReady(verified)
  }
  import('altcha').then(()=>import('altcha/i18n/fa')).then(async()=>{
   await customElements.whenDefined('altcha-widget')
   if(!alive||!host.current)return
   widget=document.createElement('altcha-widget');widget.addEventListener('statechange',stateChanged)
   host.current.replaceChildren(widget)
   await Promise.resolve() // The web component initializes in connectedCallback on the next microtask.
   if(!alive)return
   await widget.configure({challenge,language:'fa',workers:2,auto:'off',humanInteractionSignature:false,minDuration:500,
    formatError:()=> 'بررسی امنیتی انجام نشد؛ دوباره تلاش کنید.'})
  }).catch(()=>{if(alive){setError('بارگذاری بررسی امنیتی انجام نشد. دوباره تلاش کنید.');onReady(false)}})
  const expiry=setTimeout(()=>{if(alive){onReady(false);onChange({captchaId:id,captchaAnswer:''});widget?.remove();setError('بررسی امنیتی منقضی شد؛ بررسی جدید بگیرید.')}},Math.max(0,expiresIn)*1000)
  return()=>{alive=false;clearTimeout(expiry);widget?.removeEventListener('statechange',stateChanged);if(widget?.isConnected)widget.reset();widget?.remove()}
 },[id,challenge,expiresIn,onChange,onReady])
 return <div className="captcha-proof" inert={disabled}><div ref={host}/>{error&&<p className="form-error" role="alert">{error}</p>}</div>
}
