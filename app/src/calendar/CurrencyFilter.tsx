import {useState} from 'react'
import CountryLabel from './CountryLabel'
export const calendarCurrencies=['USD','EUR','GBP','JPY','CHF','CAD','AUD','NZD','CNY','SEK','NOK','ZAR','TRY','MXN','INR','BRL','KRW','SGD','HKD']
export const defaultCalendarCurrencies=calendarCurrencies.slice(0,8).join(',')
const countries=['US','EU','GB','JP','CH','CA','AU','NZ','CN','SE','NO','ZA','TR','MX','IN','BR','KR','SG','HK']
export default function CurrencyFilter({value,onChange,compact=false}:{value:string;onChange:(v:string)=>void;compact?:boolean}){
 const [open,setOpen]=useState(!compact)
 const selected=value==='all'?calendarCurrencies:value==='none'?[]:value.split(',')
 return <details className={'currency-picker'+(compact?' currency-picker-compact':'')} open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>ارزهای مرتبط <span>{selected.length.toLocaleString('fa-IR')} ارز</span><span aria-hidden="true">⌄</span></summary><div className="currency-picker-panel"><fieldset className="currency-filter"><legend className="sr-only">{compact?'ارزهای پیش‌نمایش':'ارزهای مرتبط'}</legend><div className="currency-filter-heading"><p>می‌توانید چند ارز را هم‌زمان انتخاب کنید.</p><div><button type="button" onClick={()=>onChange('all')}>انتخاب همه</button><button type="button" onClick={()=>onChange('none')}>پاک‌کردن انتخاب‌ها</button></div></div><div className="currency-choices">{calendarCurrencies.map((currency,n)=><label key={currency} className={selected.includes(currency)?'selected':''}><input type="checkbox" aria-label={currency} checked={selected.includes(currency)} onChange={()=>{const next=calendarCurrencies.filter(c=>c===currency?!selected.includes(c):selected.includes(c));onChange(next.length===calendarCurrencies.length?'all':next.length?next.join(','):'none')}}/><CountryLabel country={countries[n]} currency={currency} compact/></label>)}</div><button type="button" className="currency-done" onClick={()=>setOpen(false)}>تأیید و بستن</button></fieldset></div></details>
}
