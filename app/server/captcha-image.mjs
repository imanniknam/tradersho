import {randomInt} from 'node:crypto'
import {deflateSync} from 'node:zlib'
// Raster glyphs avoid exposing the answer as SVG text or image metadata.
const glyphs=['111/101/101/101/111','010/110/010/010/111','111/001/111/100/111','111/001/111/001/111','101/101/111/001/001','111/100/111/001/111','111/100/111/101/111','111/001/010/010/010','111/101/111/101/111','111/101/111/001/111']
const crc32=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
const chunk=(type,data)=>{const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc])}
export function makeCaptcha(){
 const answer=String(randomInt(10000,100000)),w=190,h=64,pixels=Buffer.alloc(w*h*3)
 for(let p=0;p<w*h;p++){pixels[p*3]=247;pixels[p*3+1]=246;pixels[p*3+2]=255}
 const dot=(x,y,color)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<w&&y>=0&&y<h){const p=(y*w+x)*3;pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2]}}
 for(let i=0;i<700;i++)dot(randomInt(w),randomInt(h),[190,180,220])
 for(let n=0;n<answer.length;n++){
  const rows=glyphs[Number(answer[n])].split('/'),angle=(randomInt(-12,13)/180)*Math.PI,ox=14+n*35,oy=randomInt(13,22)
  for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(rows[y][x]==='1')for(let dy=0;dy<6;dy++)for(let dx=0;dx<6;dx++){
   const a=x*6+dx,b=y*6+dy;dot(ox+a*Math.cos(angle)-b*Math.sin(angle),oy+a*Math.sin(angle)+b*Math.cos(angle),[25,35,66])
  }
 }
 for(let x=0;x<w;x++){const y=32+Math.sin(x/27)*9;dot(x,y,[155,139,199])}
 const raw=Buffer.alloc(h*(w*3+1));for(let y=0;y<h;y++)pixels.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3)
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w,0);hdr.writeUInt32BE(h,4);hdr[8]=8;hdr[9]=2
 return {answer,png:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}
}
