import {readFile} from 'node:fs/promises'
import {invalid} from './candle-market.mjs'
const tools=JSON.parse(await readFile(new URL('../shared/drawing-tools.json',import.meta.url)))
export function drawingsView(value,first,last){
  if(!Array.isArray(value)||value.length>100)invalid('حداکثر ۱۰۰ ترسیم قابل ذخیره است.')
  const ids=new Set()
  return value.map(d=>{
    const tool=tools.find(t=>t.id===d?.type)
    if(!tool||!/^[a-f\d-]{36}$/i.test(d.id)||ids.has(d.id)||d.anchors?.length!==tool.points)invalid('ترسیم معتبر نیست.')
    ids.add(d.id)
    const anchors=d.anchors.map(a=>{
      if(!a||!Number.isInteger(a.time)||a.time<first||a.time>last||a.time%60||!Number.isFinite(a.price)||a.price<=0||a.price>100)invalid('نقطهٔ ترسیم خارج از دادهٔ قابل مشاهده است.')
      return {time:a.time,price:a.price}
    })
    const color=/^#[a-f\d]{6}$/i.test(d.color)?d.color:'#a994ff'
    return {id:d.id,type:d.type,anchors,color,width:[1,2,3,4].includes(d.width)?d.width:2,dash:Boolean(d.dash),hidden:Boolean(d.hidden),locked:Boolean(d.locked),text:typeof d.text==='string'?d.text.slice(0,120):''}
  })
}
