const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function cropRegion(width,height,zoom=1,centerX=.5,centerY=.5){
  const size=Math.min(width,height)/clamp(zoom,1,4);
  return{x:clamp(centerX*width-size/2,0,width-size),y:clamp(centerY*height-size/2,0,height-size),size};
}
export function containRect(width,height,size){
  const scale=size/Math.max(width,height),w=width*scale,h=height*scale;
  return{x:(size-w)/2,y:(size-h)/2,width:w,height:h};
}
