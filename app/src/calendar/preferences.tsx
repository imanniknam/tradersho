import {createContext,useContext,useEffect,useState} from 'react'
import {calendarCurrencies,defaultCalendarCurrencies} from './CurrencyFilter'
export const CalendarUserContext=createContext('')
const validSelection=(value:unknown,choices:string[])=>typeof value==='string'&&(['all','none'].includes(value)||(value.split(',').length<=choices.length&&new Set(value.split(',')).size===value.split(',').length&&value.split(',').every(v=>choices.includes(v))))
/** Non-sensitive display preferences are isolated per signed-in account. */
export function useCalendarPreference(scope:'calendar'|'preview',kind:'currency'|'impact'){
 const user=useContext(CalendarUserContext),key=`tradersho.calendar.v1.${user}.${scope}.${kind}`
 const fallback=kind==='currency'?defaultCalendarCurrencies:'all',choices=kind==='currency'?calendarCurrencies:['high','medium','low']
 const [value,setValue]=useState<string>(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');return validSelection(saved,choices)?saved:fallback}catch{return fallback}})
 useEffect(()=>{if(!user)return;try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Filtering remains usable with storage disabled. */}},[key,user,value])
 return [value,setValue] as const
}
