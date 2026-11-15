const widgetUrl='https://flicker.finance/embed/en/xau/fear-greed?theme=light&border=off'
export const flickerSource='https://flicker.finance/assets/xau/fear-and-greed-index'
export function classifyFlickerWidget(html){
 // Read only visible provider text; translated strings inside scripts are not a status.
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&#(?:x27|39);|&apos;/gi,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ')
 if(/Fear & Greed Index isn't available for Gold Ounce\./i.test(text))return 'unavailable'
 return 'unknown'
}
export function createFlickerStatus({request=fetch,now=Date.now}={}){
 let cached=null,pending=null
 return async(force=false)=>{
  if(cached&&now()-cached.time<(force?15000:cached.ttl))return cached.value
  if(pending)return pending
  pending=(async()=>{let availability='unknown';try{const res=await request(widgetUrl,{signal:AbortSignal.timeout(6000),redirect:'error',headers:{accept:'text/html'}});if(!res.ok)throw Error('Provider response');const reader=res.body.getReader(),chunks=[];let length=0;try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>524288)throw Error('Provider response too large');chunks.push(value)}}finally{await reader.cancel()}availability=classifyFlickerWidget(Buffer.concat(chunks).toString('utf8'))}catch{/* Unknown retains the official iframe and its own status. */}
   const value={availability,checkedAt:new Date(now()).toISOString(),sourceUrl:flickerSource};cached={time:now(),ttl:availability==='unknown'?30000:300000,value};return value
  })().finally(()=>{pending=null});return pending
 }
}
export const getFlickerStatus=createFlickerStatus()
