import {randomInt} from 'node:crypto'
import {deflateSync} from 'node:zlib'
// Raster glyphs avoid exposing the answer as SVG text or image metadata.
const glyphs=['01110/10001/10011/10101/11001/10001/01110','00100/01100/00100/00100/00100/00100/01110','01110/10001/00001/00010/00100/01000/11111','11110/00001/00001/01110/00001/00001/11110','00010/00110/01010/10010/11111/00010/00010','11111/10000/10000/11110/00001/00001/11110','01110/10000/10000/11110/10001/10001/01110','11111/00001/00010/00100/01000/01000/01000','01110/10001/10001/01110/10001/10001/01110','01110/10001/10001/01111/00001/00001/01110']
const crc32=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
const chunk=(type,data)=>{const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc])}
export function makeCaptcha(){
 const answer=String(randomInt(1000000)).padStart(6,'0'),w=190,h=64,pixels=Buffer.alloc(w*h*3)
 const phase=randomInt(628)/100,period=randomInt(14,25),amplitude=randomInt(2,5)
 for(let p=0;p<w*h;p++){pixels[p*3]=247;pixels[p*3+1]=246;pixels[p*3+2]=255}
 const dot=(x,y,color)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<w&&y>=0&&y<h){const p=(y*w+x)*3;pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2]}}
 for(let i=0;i<950;i++)dot(randomInt(w),randomInt(h),[190,180,220])
 for(let n=0;n<answer.length;n++){
  const rows=glyphs[Number(answer[n])].split('/'),angle=(randomInt(-13,14)/180)*Math.PI,ox=8+n*29,oy=randomInt(13,21),sx=randomInt(35,41)/10,sy=randomInt(38,44)/10
  const color=[randomInt(20,55),randomInt(25,60),randomInt(55,90)]
  for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(rows[y][x]==='1')for(let dy=0;dy<Math.ceil(sy);dy++)for(let dx=0;dx<Math.ceil(sx);dx++){
   const a=x*sx+dx,b=y*sy+dy,px=ox+a*Math.cos(angle)-b*Math.sin(angle),py=oy+a*Math.sin(angle)+b*Math.cos(angle)
   dot(px,py+Math.sin(px/period+phase)*amplitude,color)
  }
 }
 for(let line=0;line<2;line++){const offset=randomInt(19,43),wave=randomInt(17,33);for(let x=0;x<w;x++)dot(x,offset+Math.sin(x/wave+phase)*8,[155,139,199])}
 const raw=Buffer.alloc(h*(w*3+1));for(let y=0;y<h;y++)pixels.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3)
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w,0);hdr.writeUInt32BE(h,4);hdr[8]=8;hdr[9]=2
 return {answer,png:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}
}
