export type EconomicScalar={value:string;unit?:'number'|'percent'|'thousand'|'million'|'billion'|'trillion';currency?:'USD'|'EUR'|'GBP'|'JPY'|'AUD'|'CAD'|'CHF'|'NZD'|'CNY'|'SEK'|'NOK'|'ZAR'|'TRY'|'MXN'|'INR'|'BRL'|'KRW'|'SGD'|'HKD'}
export type EconomicValue=EconomicScalar|{components:EconomicScalar[];separator?:'|'|'-'}
const units={number:'',percent:'٪',thousand:'هزار',million:'میلیون',billion:'میلیارد',trillion:'تریلیون'}
// Source adapters must supply a canonical decimal and explicit unit. Never infer scale from translated text.
export function formatEconomicValue(input:EconomicValue|null|undefined){
 if(!input||!('value' in input)||typeof input.value!=='string'||!Object.hasOwn(units,input.unit||'number')||input.currency&&!/^(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|CNY|SEK|NOK|ZAR|TRY|MXN|INR|BRL|KRW|SGD|HKD)$/.test(input.currency))return null
 const raw=input.value.trim();if(!/^[+-]?\d{1,30}(?:\.\d{1,10})?$/.test(raw))return null
 const negative=raw.startsWith('-'),[integer,decimal]=raw.replace(/^[+-]/,'').split('.')
 const grouped=BigInt(integer).toLocaleString('en-US'),nonzero=BigInt(integer)!==0n||!!decimal&&/[1-9]/.test(decimal)
 return {number:(negative&&nonzero?'−':'')+grouped+(decimal?'.'+decimal:''),unit:units[input.unit||'number'],currency:input.currency||''}
}

// Exact comparison, including scaled units. Missing/incompatible/composite values stay neutral.
export function economicOutcome(actual:EconomicValue|null,forecast:EconomicValue|null,direction?:'higher'|'lower'|null):'positive'|'negative'|'neutral'{
 if(!direction||!actual||!forecast||!('value' in actual)||!('value' in forecast)||!formatEconomicValue(actual)||!formatEconomicValue(forecast)||(actual.currency||'')!==(forecast.currency||''))return 'neutral'
 if((actual.unit==='percent')!==(forecast.unit==='percent'))return 'neutral'
 const scales={number:0,percent:0,thousand:3,million:6,billion:9,trillion:12}
 const exact=(v:EconomicScalar)=>{const [whole,fraction='']=v.value.replace(/^[+-]/,'').split('.');return (v.value.startsWith('-')?-1n:1n)*BigInt(whole+fraction.padEnd(10,'0'))*10n**BigInt(scales[v.unit||'number'])}
 const a=exact(actual),f=exact(forecast);return a===f?'neutral':((a>f)===(direction==='higher')?'positive':'negative')
}
export function eventCountdown(at:string|null,now:number){
 if(!at)return null;const seconds=Math.ceil((Date.parse(at)-now)/1000)
 if(!Number.isFinite(seconds)||seconds<0||seconds>86400)return null
 const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60
 return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':')
}
