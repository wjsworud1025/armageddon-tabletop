import * as T from '../vendor/three.module.min.js';

// Inspect a piece in its world pose with the same renderer as the board.
// Clones share the original geometry; this view owns only one plain material.
export function createSightPicker(){
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.01,300);
  scene.background=new T.Color(0x353936);
  scene.overrideMaterial=new T.MeshStandardMaterial({color:0xb5aaa0,roughness:.85,side:T.DoubleSide});
  scene.add(new T.HemisphereLight(0xfff7e8,0x5d6262,2));
  const sun=new T.DirectionalLight(0xffffff,2.5);scene.add(sun);
  const center=new T.Vector3(),ray=new T.Raycaster();
  let object=null,yaw=0,pitch=.26,radius=1,zoom=1;
  function clear(){if(object)scene.remove(object);object=null;}
  function show(root,heading){
    clear();object=root.clone(true);object.visible=true;scene.add(object);
    object.updateMatrixWorld(true);
    const ball=new T.Box3().setFromObject(object,true).getBoundingSphere(new T.Sphere());
    center.copy(ball.center);radius=ball.radius;yaw=heading;pitch=.26;zoom=1;
  }
  function project(w,h){
    const aspect=w/h,half=radius*Math.max(1,1/aspect)*1.18/zoom;
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
    camera.position.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch))
      .multiplyScalar(radius+12).add(center);
    camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    sun.position.copy(camera.position).add(new T.Vector3(-3,5,1));sun.target.position.copy(center);sun.target.updateMatrixWorld(true);
  }
  return {show,clear,
    draw(renderer,w,h){project(w,h);renderer.render(scene,camera)},
    orbit(dx,dy){yaw-=dx*.009;pitch=T.MathUtils.clamp(pitch+dy*.009,-1.54,1.54)},
    scale(dy){zoom=T.MathUtils.clamp(zoom*Math.exp(-dy*.0014),.65,4)},
    sample(ndc,w,h){
      project(w,h);ray.setFromCamera(ndc,camera);
      return ray.intersectObject(object,true)[0]?.point??null;
    }
  };
}
