export type EconomicValue={value:string;unit?:'number'|'percent'|'thousand'|'million'|'billion'|'trillion';currency?:'USD'|'EUR'|'GBP'|'JPY'|'AUD'|'CAD'|'CHF'|'NZD'}
const units={number:'',percent:'٪',thousand:'هزار',million:'میلیون',billion:'میلیارد',trillion:'تریلیون'}
// Source adapters must supply a canonical decimal and explicit unit. Never infer scale from translated text.
export function formatEconomicValue(input:EconomicValue|null|undefined){
 if(!input||typeof input.value!=='string'||!Object.hasOwn(units,input.unit||'number')||input.currency&&!/^(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)$/.test(input.currency))return null
 const raw=input.value.trim();if(!/^[+-]?\d{1,30}(?:\.\d{1,10})?$/.test(raw))return null
 const negative=raw.startsWith('-'),[integer,decimal]=raw.replace(/^[+-]/,'').split('.')
 const grouped=BigInt(integer).toLocaleString('en-US'),nonzero=BigInt(integer)!==0n||!!decimal&&/[1-9]/.test(decimal)
 return {number:(negative&&nonzero?'−':'')+grouped+(decimal?'.'+decimal:''),unit:units[input.unit||'number'],currency:input.currency||''}
}
