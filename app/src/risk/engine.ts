export const profiles={uniform:{label:'توزیع یکنواخت‌تر',description:'کاهش ملایم سود خالص در طول چرخه',ratio:.75},balanced:{label:'توزیع متعادل',description:'کاهش متوسط سود خالص مراحل',ratio:.5},early:{label:'تمرکز روی معاملات اول',description:'سهم بیشتر سود خالص در مراحل اول',ratio:.25}} as const
export type Profile=keyof typeof profiles
export type RiskInput={balance:number;maxLoss:number;baseRisk:number;rr:number;cycleLength:number;distribution:Profile}
export type Stage={number:number;risk:number;priorLoss:number;tpProfit:number;netAtTp:number;cumulativeLoss:number}
export const defaults:RiskInput={balance:10000,maxLoss:12,baseRisk:1,rr:3,cycleLength:6,distribution:'balanced'}
export const fields={balance:{label:'موجودی مبنا',min:1,max:100000000,unit:'USD',hint:'همهٔ مبلغ‌ها بر اساس این موجودی ثابت محاسبه می‌شوند.'},maxLoss:{label:'سقف افت مجاز',min:.1,max:100,unit:'٪',hint:'حداکثر زیان تجمعی نسبت به موجودی مبنا.'},baseRisk:{label:'ریسک پایه',min:.01,max:100,unit:'٪',hint:'بودجهٔ چرخه = ریسک پایه × تعداد مراحل؛ ریسک مرحلهٔ اول متفاوت است.'},rr:{label:'نسبت سود به ریسک',min:.1,max:100,unit:'R',hint:'مثلاً ۳ یعنی سود هدف، سه برابر ریسک همان معامله است.'},cycleLength:{label:'تعداد مراحل چرخه',min:2,max:20,unit:'مرحله',hint:'از ۲ تا ۲۰ مرحله؛ مرحلهٔ آخر در صورت برد سربه‌سر است.'}} as const
export type Field=keyof typeof fields
export function parseNumber(raw:string){
 const normalized=raw.trim().replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/٫/g,'.').replace(/٬/g,',')
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalized))return NaN
 return Number(normalized.replace(/,/g,''))
}
export function validateInput(input:RiskInput){
 const errors:Partial<Record<Field|'distribution',string>>={}
 for(const key of Object.keys(fields) as Field[]){const {label,min,max}=fields[key],value=input[key];if(!Number.isFinite(value)||value<min||value>max)errors[key]=`${label} باید بین ${min.toLocaleString('fa-IR')} و ${max.toLocaleString('fa-IR')} باشد.`;else if(key==='cycleLength'&&!Number.isInteger(value))errors[key]='تعداد مراحل باید عدد صحیح باشد.'}
 if(!Object.hasOwn(profiles,input.distribution))errors.distribution='روش توزیع معتبر نیست.'
 return errors
}
// Technical specification v1.2: percentages use a fixed starting balance; no intermediate rounding.
export function calculateRisk(input:RiskInput){
 if(Object.keys(validateInput(input)).length)throw new RangeError('Invalid risk inputs')
 const {baseRisk:b,cycleLength:n,rr:R,maxLoss:D}=input,e=profiles[input.distribution].ratio,B=b*n,F=B/(R+1),m=n-1
 const weights=Array.from({length:m},(_,i)=>m===1?1:1-i/(m-1)*(1-e))
 let c=0;for(const w of weights)c+=(c+w)/R
 const S=(B-F)/c;let loss=0
 const stages:Stage[]=weights.map((w,i)=>{const priorLoss=loss,netAtTp=w*S,risk=(priorLoss+netAtTp)/R,tpProfit=R*risk;loss+=risk;return {number:i+1,risk,priorLoss,tpProfit,netAtTp,cumulativeLoss:loss}})
 stages.push({number:n,risk:F,priorLoss:loss,tpProfit:R*F,netAtTp:0,cumulativeLoss:B})
 const epsilon=1e-7,fullCycleFits=B<=D+epsilon
 const capacity=fullCycleFits?n+Math.max(0,Math.floor((D-B+epsilon)/F)):stages.filter(s=>s.cumulativeLoss<=D+epsilon).length
 const usedLoss=capacity<=n?(capacity?stages[capacity-1].cumulativeLoss:0):B+(capacity-n)*F
 return {input,stages,budget:B,finalRisk:F,scale:S,capacity,crossingTrade:capacity+1,fullCycleFits,usedLoss,remainingLoss:Math.max(0,D-usedLoss)}
}
export type RiskPlan=ReturnType<typeof calculateRisk>
export function stageAt(plan:RiskPlan,number:number):Stage{
 if(!Number.isInteger(number)||number<1||number>Math.max(plan.stages.length,plan.crossingTrade))throw new RangeError('Invalid stage')
 if(number<=plan.stages.length)return plan.stages[number-1]
 const priorLoss=plan.budget+(number-plan.stages.length-1)*plan.finalRisk
 return {number,risk:plan.finalRisk,priorLoss,tpProfit:plan.finalRisk*plan.input.rr,netAtTp:plan.finalRisk*plan.input.rr-priorLoss,cumulativeLoss:priorLoss+plan.finalRisk}
}
