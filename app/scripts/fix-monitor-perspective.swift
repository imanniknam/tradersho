import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
// Inverse homography on the existing pixels, no image generation or chart redrawing.
let args=CommandLine.arguments
if args.count != 3 { fatalError("Usage: swift fix-monitor-perspective.swift input.png output.png") }
let input=URL(fileURLWithPath:args[1]), output=URL(fileURLWithPath:args[2])
guard let source=CGImageSourceCreateWithURL(input as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else { fatalError("Cannot load image") }
let width=image.width,height=image.height
var pixels=[UInt8](repeating:0,count:width*height*4)
let space=CGColorSpace(name:CGColorSpace.sRGB)!
pixels.withUnsafeMutableBytes { ptr in
 let context=CGContext(data:ptr.baseAddress,width:width,height:height,bitsPerComponent:8,bytesPerRow:width*4,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
 context.draw(image,in:CGRect(x:0,y:0,width:width,height:height))
}
let original=pixels
// Coordinates measured on the approved 2172 x 724 photographs (top-left origin).
let src:[[Double]]=[[201,31],[653,130],[653,426],[201,446]]
let dst:[[Double]]=[[201,31],[653,130],[653,426],[201,466]]
var m=[[Double]]()
for i in 0..<4 {
 let x=dst[i][0], y=dst[i][1], u=src[i][0], v=src[i][1]
 m.append([x,y,1,0,0,0,-u*x,-u*y,u]);m.append([0,0,0,x,y,1,-v*x,-v*y,v])
}
for col in 0..<8 {
 let pivot=(col..<8).max(by:{abs(m[$0][col]) < abs(m[$1][col])})!
 m.swapAt(col,pivot);let divisor=m[col][col]
 for j in col...8 {m[col][j] /= divisor}
 for row in 0..<8 where row != col {let factor=m[row][col];for j in col...8 {m[row][j] -= factor*m[col][j]}}
}
let h=(0..<8).map{m[$0][8]}
func inside(_ x:Double,_ y:Double)->Bool {
 for i in 0..<4 {let a=dst[i], b=dst[(i+1)%4];if (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]) < 0 {return false}}
 return true
}
var changed=0
for y in 30...467 {for x in 200...654 {
 let px=Double(x)+0.5,py=Double(y)+0.5
 if !inside(px,py) {continue}
 let den=h[6]*px+h[7]*py+1
 let sx=(h[0]*px+h[1]*py+h[2])/den-0.5, sy=(h[3]*px+h[4]*py+h[5])/den-0.5
 let ix=Int(floor(sx)),iy=Int(floor(sy)),fx=sx-Double(ix),fy=sy-Double(iy)
 if ix<0 || iy<0 || ix+1>=width || iy+1>=height {continue}
 for c in 0..<4 {
  let a=Double(original[(iy*width+ix)*4+c]),b=Double(original[(iy*width+ix+1)*4+c]),d=Double(original[((iy+1)*width+ix)*4+c]),e=Double(original[((iy+1)*width+ix+1)*4+c])
  pixels[(y*width+x)*4+c]=UInt8(max(0,min(255,((a*(1-fx)+b*fx)*(1-fy)+(d*(1-fx)+e*fx)*fy).rounded())))
 }
 changed += 1
}}
// Assert every decoded pixel outside the screen polygon is unchanged.
for y in 0..<height {for x in 0..<width where !inside(Double(x)+0.5,Double(y)+0.5) {let i=(y*width+x)*4;assert(pixels[i..<i+4].elementsEqual(original[i..<i+4]))}}
let data=Data(pixels),provider=CGDataProvider(data:data as CFData)!
let result=CGImage(width:width,height:height,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:width*4,space:space,bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:provider,decode:nil,shouldInterpolate:false,intent:.defaultIntent)!
let destination=CGImageDestinationCreateWithURL(output as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(destination,result,nil);assert(CGImageDestinationFinalize(destination))
print("Warped \(changed) screen pixels; all pixels outside screen polygon unchanged; \(width)x\(height)")
