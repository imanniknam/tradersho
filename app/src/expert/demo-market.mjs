// Deterministic, synthetic OHLC for education only. Never a broker/market feed.
// The factory is shared with the network-isolated iframe through source injection.
export function createDemoMarket(){
 const minutes={M1:1,M5:5,M15:15,M30:30,H1:60,H4:240,D1:1440},cache=new Map(),end=1170,count=256;
 const point=t=>4013+Math.sin(t/15*.43)*9+Math.cos(t/15*.17)*15+Math.max(-39,Math.min(39,t/15-39))*.22+Math.sin(t/15*1.7+1)*2;
 function bars(timeframe='M15'){
  if(!Object.hasOwn(minutes,timeframe))throw new RangeError('Unsupported demo timeframe');
  if(cache.has(timeframe))return cache.get(timeframe);
  const width=minutes[timeframe],finish=Math.floor(end/width)*width,result=[];
  for(let start=finish-count*width;start<finish;start+=width){let open=point(start),close=open,high=open,low=open,volume=0;
   for(let t=start;t<start+width;t++){close=point(t+1);const wick=.12+(Math.abs(t)%7)*.025;high=Math.max(high,point(t)+wick,close+wick);low=Math.min(low,point(t)-wick,close-wick);volume+=12+Math.abs(t*17)%54;}
   result.push(Object.freeze({open,high,low,close,volume}));
  }
  const immutable=Object.freeze(result);cache.set(timeframe,immutable);return immutable;
 }
 function atr(period=14,timeframe='M15'){
  if(!Number.isInteger(period)||period<1||period>200)throw new RangeError('ATR period must be 1..200');
  return wilderAtr(bars(timeframe),period);
 }
 return Object.freeze({bars,atr});
}

export function wilderAtr(values,period){
 if(!Number.isInteger(period)||period<1||values.length<=period)throw new RangeError('Insufficient ATR history');
 const ranges=values.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-values[i].close),Math.abs(b.low-values[i].close)));
 if(ranges.some(v=>!Number.isFinite(v)||v<0))throw new RangeError('Invalid OHLC');
 let value=ranges.slice(0,period).reduce((sum,v)=>sum+v,0)/period;
 for(let i=period;i<ranges.length;i++)value=(value*(period-1)+ranges[i])/period;
 return value;
}
