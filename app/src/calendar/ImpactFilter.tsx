const levels=[['high','زیاد'],['medium','متوسط'],['low','کم']] as const
export default function ImpactFilter({value,onChange,label='اهمیت رویداد'}:{value:string;onChange:(value:string)=>void;label?:string}){
 const selected=value==='all'?levels.map(([id])=>id):value.split(',')
 return <fieldset className="impact-filter"><legend>{label}</legend><div><button type="button" aria-pressed={value==='all'} onClick={()=>onChange('all')}>همه</button>{levels.map(([id,title])=><button type="button" key={id} className={'impact-choice '+id} aria-pressed={selected.includes(id)} onClick={()=>{const next=levels.map(([key])=>key).filter(key=>key===id?!selected.includes(key):selected.includes(key));onChange(next.length?next.join(','):'none')}}><i aria-hidden="true"/>{title}</button>)}</div></fieldset>
}
