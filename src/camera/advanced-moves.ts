import { clamp, drift } from './easing.ts';
import { calibration, planePoint, projectPoint, screenRay, type VirtualCamera } from './virtual-projection.ts';
import { advancedMoves, type CameraMove } from './moves.ts';
import type { CameraSceneConfig, LayerTransform } from './types.ts';

/** Layer blur in screen pixels, based on the separation between calibrated planes. */
export function focusBlur(depth: number, focus?: { depth: number; strength: number }): number {
  return focus ? clamp(Math.abs(depth-focus.depth)*24*focus.strength,0,12) : 0;
}

/** Advanced moves are evaluated in start-time order with the other virtual moves.
 * Pose adjustments are additive; focus uses the last started active focus move. */
export function applyAdvancedMove(camera: VirtualCamera, scene: CameraSceneConfig, move: CameraMove,
  seconds: number, intensity: number, targets: LayerTransform[]): boolean {
  if (!advancedMoves.includes(move.type)) return false;
  if (seconds < move.start) return true;
  const u=clamp((seconds-move.start)/move.duration,0,1), t=u*intensity;
  const c=calibration(scene.width,scene.height), f=c.focalLength;
  const layer=targets.find(target=>target.id===move.layerId);
  const target=planePoint(c,layer?.depth??.5,layer??{x:move.x,y:move.y});
  switch(move.type) {
    case 'dutch': {
      const roll=clamp(camera.roll+move.angle!*Math.PI/180*t,-Math.PI/6,Math.PI/6), delta=roll-camera.roll;
      // Rotate the image about the requested screen-space point.
      const x=camera.principal.x-move.x,y=camera.principal.y-move.y;
      camera.principal.x=move.x+x*Math.cos(delta)+y*Math.sin(delta);
      camera.principal.y=move.y-x*Math.sin(delta)+y*Math.cos(delta);
      camera.roll=roll; break;
    }
    case 'handheld': {
      if (u<=0||u>=1) break;
      const envelope=Math.sin(Math.PI*u)**2*move.strength!*intensity;
      const time=(seconds-move.start)*move.speed!;
      const noise=(channel:number)=>.7*drift(time*.73,move.seed!+channel*19)+.3*drift(time*1.91,move.seed!+channel*71);
      camera.x+=f*.008*envelope*noise(1);camera.y+=f*.008*envelope*noise(2);
      camera.yaw+=.012*envelope*noise(3);camera.pitch+=.012*envelope*noise(4);camera.roll+=.014*envelope*noise(5);
      break;
    }
    case 'impact': {
      if (u<=0||u>=1) break;
      const envelope=Math.exp(-5*u)*(1-u)**2*move.strength!*intensity;
      const wave=Math.sin(2*Math.PI*7*u), second=Math.sin(2*Math.PI*9*u);
      camera.x+=f*.025*envelope*wave;camera.y+=f*.02*envelope*second;camera.roll+=.04*envelope*wave;
      break;
    }
    case 'whip': {
      // A short smooth acceleration/deceleration, not an ordinary linear pan.
      const phase=u*u*(3-2*u);
      camera.yaw+=move.angle!*Math.PI/180*phase*intensity;
      if(move.blur && u>0 && u<1){
        const speed=Math.abs(move.angle!)/20*.35/move.duration*4*u*(1-u);
        camera.motionBlur=Math.max(camera.motionBlur??0,clamp(10*speed,0,10)*intensity);
      }
      break;
    }
    case 'dollyZoom': {
      const ray=screenRay(camera,camera.principal);
      const depth=(target.x-camera.x)*ray.x+(target.y-camera.y)*ray.y+(target.z-camera.z)*ray.z;
      if(depth<=f*.1)break;
      let distance=move.travel!*f*t;
      // Constrain travel before adjusting the lens, preserving their relationship.
      distance=clamp(distance,depth*(1-4*f/camera.focalLength),depth*(1-.25*f/camera.focalLength));
      if(ray.z>0)distance=clamp(distance,(-f-camera.z)/ray.z,(.35*f-camera.z)/ray.z);
      camera.x+=ray.x*distance;camera.y+=ray.y*distance;camera.z+=ray.z*distance;
      camera.focalLength*=1-distance/depth;
      break;
    }
    case 'rackFocus':
      camera.focus={depth:move.focusFrom!+( (layer?.depth??move.focusTo!)-move.focusFrom!)*t,strength:move.strength!*intensity};
      break;
    case 'orbit': {
      const original=projectPoint(camera,target,f*.1);
      const oldX=camera.x,oldY=camera.y,oldZ=camera.z;
      const rx=oldX-target.x,rz=oldZ-target.z,angle=move.angle!*Math.PI/180*t;
      const ratio=1+(move.radius!-1)*t;
      camera.x=clamp(target.x+(rx*Math.cos(angle)+rz*Math.sin(angle))*ratio,-2*f,2*f);
      camera.z=clamp(target.z+(-rx*Math.sin(angle)+rz*Math.cos(angle))*ratio,-f,.35*f);
      camera.y=clamp(oldY+move.elevation!*f*t,-2*f,2*f);
      const yaw=(x:number,z:number)=>Math.atan2(target.x-x,target.z-z);
      const pitch=(x:number,y:number,z:number)=>Math.atan2(target.y-y,Math.hypot(target.x-x,target.z-z));
      camera.yaw=clamp(camera.yaw+yaw(camera.x,camera.z)-yaw(oldX,oldZ),-.35,.35);
      camera.pitch=clamp(camera.pitch+pitch(camera.x,camera.y,camera.z)-pitch(oldX,oldY,oldZ),-.35,.35);
      const projected=projectPoint(camera,target,f*.1);
      if(original&&projected){camera.principal.x+=original.x-projected.x;camera.principal.y+=original.y-projected.y;}
      break;
    }
  }
  return true;
}
