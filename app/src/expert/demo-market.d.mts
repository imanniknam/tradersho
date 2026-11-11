export type DemoCandle={readonly open:number;readonly high:number;readonly low:number;readonly close:number;readonly volume:number}
export function createDemoMarket():{bars(timeframe?:string):readonly DemoCandle[];atr(period?:number,timeframe?:string):number}
export function wilderAtr(values:readonly DemoCandle[],period:number):number
