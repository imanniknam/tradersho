import {sma,ema,bollinger,rsi,macd} from '../analysis/indicators.ts'
import type {Bar} from './types'
export {sma,ema,bollinger,rsi,macd}
export const observations=(bars:Bar[])=>bars.map(b=>({date:String(b.time),value:b.close}))
export interface Value {time:number;value:number}
export const wma=(data:Value[],period:number):Value[]=>data.slice(period-1).map((p,i)=>({time:p.time,value:data.slice(i,i+period).reduce((s,b,j)=>s+b.value*(j+1),0)/(period*(period+1)/2)}))
export function hull(bars:Bar[],period:number){
  const data=bars.map(b=>({time:b.time,value:b.close})),half=new Map(wma(data,Math.max(1,Math.floor(period/2))).map(p=>[p.time,p.value]))
  return wma(wma(data,period).map(p=>({time:p.time,value:2*half.get(p.time)!-p.value})),Math.max(1,Math.floor(Math.sqrt(period))))
}
export function atr(bars:Bar[],period=14):Value[]{
  if(bars.length<period+1)return []
  const tr=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)))
  let value=tr.slice(0,period).reduce((s,v)=>s+v,0)/period
  const out=[{time:bars[period].time,value}]
  for(let i=period;i<tr.length;i++){value=(value*(period-1)+tr[i])/period;out.push({time:bars[i+1].time,value})}return out
}
export function stochastic(bars:Bar[]){
  const k=bars.slice(13).map((b,i)=>{const w=bars.slice(i,i+14),hi=Math.max(...w.map(x=>x.high)),lo=Math.min(...w.map(x=>x.low));return {time:b.time,value:hi===lo?50:100*(b.close-lo)/(hi-lo)}})
  return {k,d:sma(k.map(p=>({date:String(p.time),value:p.value})),3).map(p=>({time:Number(p.time),value:p.value}))}
}
export function cci(bars:Bar[],period=20){
  const typical=bars.map(b=>(b.high+b.low+b.close)/3)
  return bars.slice(period-1).map((b,i)=>{const w=typical.slice(i,i+period),mean=w.reduce((a,b)=>a+b)/period,deviation=w.reduce((a,b)=>a+Math.abs(b-mean),0)/period;return {time:b.time,value:deviation>Number.EPSILON*Math.max(1,Math.abs(mean))*10?(typical[i+period-1]-mean)/(.015*deviation):0}})
}
export function vwap(bars:Bar[]){let pv=0,volume=0,day=-1;const out:Value[]=[];for(const b of bars){const d=Math.floor(b.time/86400);if(d!==day){day=d;pv=0;volume=0}pv+=(b.high+b.low+b.close)/3*b.volume;volume+=b.volume;if(volume)out.push({time:b.time,value:pv/volume})}return out}
export function obv(bars:Bar[]){let value=0;return bars.map((b,i)=>{if(i)value+=b.close>bars[i-1].close?b.volume:b.close<bars[i-1].close?-b.volume:0;return {time:b.time,value}})}
export function donchian(bars:Bar[],period:number){return bars.slice(period-1).map((b,i)=>{const w=bars.slice(i,i+period);return {time:b.time,high:Math.max(...w.map(b=>b.high)),low:Math.min(...w.map(b=>b.low))}})}
export function heikin(bars:Bar[]){let po=0,pc=0;return bars.map((b,i)=>{const close=(b.open+b.high+b.low+b.close)/4,open=i?(po+pc)/2:(b.open+b.close)/2;po=open;pc=close;return {...b,open,high:Math.max(b.high,open,close),low:Math.min(b.low,open,close),close}})}
