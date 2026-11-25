// Parts are baked to one indexed, vertex-painted mesh per game piece. This
// keeps a table full of decorated miniatures affordable to draw and pick.
const libraries = new WeakMap();

export const paint = {
  blue: 0x254c91, blueLight: 0x4675b3, blueShade: 0x172f58,
  brass: 0xaf803d, gold: 0xd5ac5c, steel: 0xa0a3a0, iron: 0x42494d,
  black: 0x262728, leather: 0x614334, orange: 0xb4412b, red: 0x8b2d2a,
  cream: 0xe6ddbd, bone: 0xe9cd96, flesh: 0xc68e6b,
  green: 0x718e36, olive: 0x53632b, lightGreen: 0x9ba952,
  rust: 0x814c31, sand: 0xb38a5b, stone: 0x968577, teal: 0x5bd5ca,
};

function resources(T) {
  if (!libraries.has(T)) {
    const tile=128, pixels=new Uint8Array(tile*tile*4), random=seeded(714), noise=new Float32Array(16*16);
    for(let i=0;i<noise.length;i++) noise[i]=random();
    for(let y=0;y<tile;y++) for(let x=0;x<tile;x++) {
      const ix=x>>3, iy=y>>3, tx=(x%8)/8, ty=(y%8)/8;
      const sample=(dx,dy)=>noise[((iy+dy)%16)*16+(ix+dx)%16];
      const grain=(sample(0,0)*(1-tx)+sample(1,0)*tx)*(1-ty)+(sample(0,1)*(1-tx)+sample(1,1)*tx)*ty;
      const value=Math.round(224+grain*23+random()*8);
      pixels.set([value,value,value,255],4*(y*tile+x));
    }
    const map=new T.DataTexture(pixels,tile,tile);
    map.wrapS=map.wrapT=T.RepeatWrapping;
    map.magFilter=T.LinearFilter;
    map.minFilter=T.LinearMipmapLinearFilter;
    map.generateMipmaps=true;
    map.needsUpdate=true;
    libraries.set(T, {
      primitives: new Map(),
      colors: new Map(),
      material: new T.MeshStandardMaterial({vertexColors: true, map, roughness: 0.82, metalness: 0.13}),
      finished: new Map(),
    });
  }
  return libraries.get(T);
}

function primitive(T, key, create) {
  const map = resources(T).primitives;
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
}

export class Sculpt {
  constructor(T, group = new T.Group(), compactCurves = false) {
    this.T = T;
    this.group = group;
    this.compactCurves = compactCurves;
  }
  place(object, xyz, rotation = [0,0,0], scale = [1,1,1]) {
    object.position.set(...xyz);
    object.rotation.set(...rotation);
    object.scale.set(...scale);
    this.group.add(object);
    return object;
  }
  child(xyz = [0,0,0], rotation, scale) {
    return new Sculpt(this.T, this.place(new this.T.Group(), xyz, rotation, scale),this.compactCurves);
  }
  part(geometry, color, xyz, size, rotation) {
    const node = new this.T.Object3D();
    node.userData = {geometry, color};
    return this.place(node, xyz, rotation, size);
  }
  box(color, xyz, size, rotation) {
    return this.part(primitive(this.T, 'box', () => new this.T.BoxGeometry(1,1,1)), color, xyz, size, rotation);
  }
  oval(color, xyz, radii, rotation) {
    const sides=this.compactCurves?(Math.max(...radii)<.061?6:9):12;
    const rings=Math.round(sides*2/3);
    return this.part(primitive(this.T,'sphere'+sides,()=>new this.T.SphereGeometry(1,sides,rings)),color,xyz,radii,rotation);
  }
  cylinder(color, xyz, top, bottom, height, segments = 12, rotation, stretch = [1,1,1]) {
    const widest = Math.max(top,bottom);
    const a = top/widest, b = bottom/widest;
    const geometry = primitive(this.T, 'tube' + [a,b,segments], () => new this.T.CylinderGeometry(a,b,1,segments));
    return this.part(geometry, color, xyz, [widest*stretch[0],height*stretch[1],widest*stretch[2]], rotation);
  }
  link(color, from, to, lower, upper = lower, segments = 10) {
    const T = this.T;
    const vector = new T.Vector3(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
    const node = this.cylinder(color, from.map((v,i)=>(v+to[i])/2), upper, lower, vector.length(), segments);
    node.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vector.normalize());
    return node;
  }
  plate(color, points, depth, xyz = [0,0,0], rotation, bevel = 0) {
    const T = this.T;
    const shape = new T.Shape();
    shape.moveTo(...points[0]);
    for (const point of points.slice(1)) shape.lineTo(...point);
    shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, {depth, bevelEnabled: bevel > 0, bevelSegments: 1, steps: 1, bevelThickness: bevel, bevelSize: bevel});
    geometry.translate(0,0,-depth/2);
    return this.part(geometry,color,xyz,[1,1,1],rotation);
  }
}

function bake(T, group) {
  const lib = resources(T);
  const positions = [], normals = [], colors = [], uvs = [], indices = [];
  const v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
  group.updateMatrixWorld(true);
  group.traverse(node => {
    const {geometry,color} = node.userData;
    if (!geometry) return;
    if (!lib.colors.has(color)) lib.colors.set(color, new T.Color(color));
    const pigment = lib.colors.get(color);
    const offset = positions.length/3;
    const {position, normal, color:vertexPaint} = geometry.attributes;
    nm.getNormalMatrix(node.matrixWorld);
    for (let i=0; i<position.count; i++) {
      v.fromBufferAttribute(position,i).applyMatrix4(node.matrixWorld);
      n.fromBufferAttribute(normal,i).applyNormalMatrix(nm);
      positions.push(v.x,v.y,v.z);
      normals.push(n.x,n.y,n.z);
      const wash=.94+.095*Math.max(0,n.y)+.04*Math.max(0,n.z);
      if(vertexPaint) colors.push(vertexPaint.getX(i)*wash,vertexPaint.getY(i)*wash,vertexPaint.getZ(i)*wash);
      else colors.push(pigment.r*wash,pigment.g*wash,pigment.b*wash);
      // A shared planar field avoids stretching a single texture across every
      // differently sized rivet, sleeve and wall section.
      uvs.push((v.x+.37*v.y)*2.2,(v.z+.73*v.y)*2.2);
    }
    if (geometry.index) {
      for (const i of geometry.index.array) indices.push(i+offset);
    } else {
      for (let i=0; i<position.count; i++) indices.push(i+offset);
    }
  });
  const combined = new T.BufferGeometry();
  combined.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  combined.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  combined.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  combined.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  combined.setIndex(indices);
  combined.computeBoundingBox();
  combined.computeBoundingSphere();
  return combined;
}

export function castGeometry(T, item, draw) {
  const lib = resources(T);
  const key = [item.kind,item.variant ?? 0,item.baseWidth,item.baseDepth].join('/');
  if (!lib.finished.has(key)) {
    const sculpt = new Sculpt(T);
    draw(sculpt);
    lib.finished.set(key,bake(T,sculpt.group));
  }
  return lib.finished.get(key);
}

export function castPiece(T, item, draw) {
  const geometry=castGeometry(T,item,draw);
  const group = new T.Group(), mesh = new T.Mesh(geometry,resources(T).material);
  group.name = item.kind;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

export function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(1664525,value)+1013904223) >>> 0) / 4294967296);
}

export function plinth(s, width, depth, seed) {
  const p = paint;
  s.cylinder(0x876142,[0,.060,0],.475,.5,.12,44,undefined,[width,1,depth]);
  s.cylinder(p.sand,[0,.128,0],.47,.475,.02,44,undefined,[width,1,depth]);
  const rng = seeded(seed+117);
  for (let i=0;i<24;i++) {
    const angle = rng()*2*Math.PI, r = Math.sqrt(rng())*.43;
    const x = Math.sin(angle)*r*width, z = Math.cos(angle)*r*depth;
    const size = (.008 + rng()*.034)*Math.min(width,1.5);
    s.cylinder([0x9e774c,0xc5a57b,0x927862,0x68605b][i%4],[x,.14+size*.18,z],size*.68,size,size*.65,5,[0,angle,0],[1.4,1,.8]);
  }
}
