import { calibration, planeDistance, screenRay, type VirtualCamera } from '../camera/virtual-projection.ts';
export interface Point { x:number; y:number }
export interface View { x:number; y:number; scale:number; virtualCamera?: VirtualCamera }
export interface Bounds { left:number; top:number; width:number; height:number }

/** Map a pointer over the displayed canvas back through the composite camera transform. */
export function scenePoint(client:Point, bounds:Bounds, width:number, height:number, view:View):Point | null {
  if (bounds.width<=0 || bounds.height<=0 || view.scale<=0) return null;
  const u=(client.x-bounds.left)/bounds.width, v=(client.y-bounds.top)/bounds.height;
  if(u<0||u>1||v<0||v>1)return null;
  let x=u*width, y=v*height;
  if (view.virtualCamera) {
    // A perspective view has no unique 2D inverse; pick on the middle-depth plane.
    const c=calibration(width,height), camera=view.virtualCamera, z=planeDistance(c,.5);
    const ray=screenRay(camera,{x,y}); if (ray.z<=.1) return null;
    const distance=(z-camera.z)/ray.z; if (distance<=0) return null;
    x=width/2+(camera.x+distance*ray.x)*c.focalLength/z;
    y=height/2+(camera.y+distance*ray.y)*c.focalLength/z;
  }
  return {
    x:Math.round(width/2+(x-width/2)/view.scale+view.x),
    y:Math.round(height/2+(y-height/2)/view.scale+view.y),
  };
}
