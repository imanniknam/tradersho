import type {Bar} from './types'
export function parseCsv(source:string):Bar[]{
  const lines=source.replace(/^\uFEFF/,'').trim().split(/\r?\n/)
  if(lines.length<52||lines.length>30001)throw new Error('فایل باید سرستون و بین ۵۱ تا ۳۰٬۰۰۰ کندل داشته باشد.')
  const header=lines.shift()!.toLowerCase().split(',').map(x=>x.trim())
  for(const key of ['time','open','high','low','close'])if(!header.includes(key))throw new Error(`ستون ${key} موجود نیست. قالب استاندارد را دانلود کنید.`)
  if(new Set(header).size!==header.length)throw new Error('نام ستون‌ها تکراری است.')
  const index=(key:string)=>header.indexOf(key)
  return lines.map((line,i)=>{
    const cells=line.split(',').map(x=>x.trim())
    if(cells.length!==header.length)throw new Error(`تعداد ستون‌ها در سطر ${i+2} صحیح نیست.`)
    const raw=cells[index('time')]
    const time=/^\d{10}$/.test(raw)?Number(raw):/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.000)?)?Z$/.test(raw)?Date.parse(raw)/1000:NaN
    if(!Number.isInteger(time))throw new Error(`زمان سطر ${i+2} باید Unix seconds یا ISO UTC با پسوند Z باشد.`)
    const numeric=(key:string)=>{const str=cells[index(key)];if(!str||!/^\d+(\.\d+)?$/.test(str))throw new Error(`مقدار ${key} در سطر ${i+2} معتبر نیست.`);return Number(str)}
    return {time,open:numeric('open'),high:numeric('high'),low:numeric('low'),close:numeric('close'),volume:index('volume')>=0?numeric('volume'):0}
  })
}
