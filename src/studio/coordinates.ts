export interface Point { x:number; y:number }
export interface View { x:number; y:number; scale:number }
export interface Bounds { left:number; top:number; width:number; height:number }

/** Map a pointer over the displayed canvas back through the composite camera transform. */
export function scenePoint(client:Point, bounds:Bounds, width:number, height:number, view:View):Point | null {
  if (bounds.width<=0 || bounds.height<=0 || view.scale<=0) return null;
  const u=(client.x-bounds.left)/bounds.width, v=(client.y-bounds.top)/bounds.height;
  if(u<0||u>1||v<0||v>1)return null;
  return {
    x:Math.round(width/2+(u*width-width/2)/view.scale+view.x),
    y:Math.round(height/2+(v*height-height/2)/view.scale+view.y),
  };
}
