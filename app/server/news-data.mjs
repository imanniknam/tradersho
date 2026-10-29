import {createHash} from 'node:crypto'
import {isIP} from 'node:net'
export const newsProviders=['gdelt','fed','bls']
export const newsCategories=['forex','gold','macro']
export const sourceNames={gdelt:'GDELT',fed:'فدرال رزرو آمریکا',bls:'اداره آمار کار آمریکا'}
export const cleanText=value=>String(value||'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim()
export function articleUrl(value){
 try{const u=new URL(value);const host=u.hostname.toLowerCase();if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||!host.includes('.')||isIP(host.replace(/^\[|\]$/g,''))||/\.(local|localhost|test|internal)$/.test(host))return null;u.hash='';return u.href}catch{return null}
}
export const articleId=(url,publishedAt=null)=>createHash('sha256').update(url+(publishedAt?'\n'+new Date(publishedAt).toISOString():'')).digest('hex')
const invalid=()=>{throw Object.assign(new Error('دادهٔ خبر معتبر نیست.'),{status:400})}
export function validateNewsBatch(input,now=Date.now()){
 const at=new Date(input?.generatedAt);if(!Number.isFinite(+at)||Math.abs(+at-now)>24*3600000||!Array.isArray(input.items)||input.items.length>100||!Array.isArray(input.sources)||input.sources.length!==3)invalid()
 if(!input.sources.every(v=>v&&typeof v==='object')||!input.items.every(v=>v&&typeof v==='object'))invalid()
 if(new Set(input.sources.map(v=>v.provider)).size!==3)invalid()
 const sources=input.sources.map(v=>{if(!newsProviders.includes(v.provider)||!['ok','empty','error'].includes(v.status))invalid();return {provider:v.provider,status:v.status,error:v.status==='error'?['timeout','blocked','quota','unavailable'].includes(v.error)?v.error:'unavailable':null}})
 const items=input.items.map(v=>{
  const url=articleUrl(v.url),title=cleanText(v.originalTitle),fa=cleanText(v.titleFa),published=v.publishedAt?new Date(v.publishedAt):null,detected=new Date(v.detectedAt||at)
  if(!url||url.length>1800||!newsProviders.includes(v.provider)||!newsCategories.includes(v.category)||!title||title.length>500||fa.length>500||fa&&!/[\u0600-\u06ff]/.test(fa)||!['native','machine','editorial','pending'].includes(v.translation)||!!fa===(v.translation==='pending')||!Number.isFinite(+detected)||+detected>now+600000||published&&(!Number.isFinite(+published)||+published>now+600000))invalid()
  const host=new URL(url).hostname
  if(v.provider==='fed'&&host!=='www.federalreserve.gov'&&host!=='federalreserve.gov'||v.provider==='bls'&&host!=='www.bls.gov'&&host!=='bls.gov')invalid()
  return {id:articleId(url,published),provider:v.provider,url,domain:host,title,fa:fa||null,category:v.category,translation:v.translation,published:published?.toISOString()||null,detected:detected.toISOString()}
 })
 return {at:at.toISOString(),sources,items}
}
