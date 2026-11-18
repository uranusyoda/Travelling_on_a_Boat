import * as THREE from 'three';

const TAU = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Static scenery is packed into spatial batches, so the individual planks,
// roof seams, railing posts and ropes do not each require a draw call.
function sceneryBatch(group) {
  const cells = new Map();
  const geometry = new Map();
  const scratch = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const rotation = new THREE.Quaternion();
  const palette = new Map();

  function color(hex) {
    if (!palette.has(hex)) palette.set(hex, new THREE.Color(hex));
    return palette.get(hex);
  }
  function cell(x, z) {
    const key = Math.floor(x / 38) + ',' + Math.floor(z / 38);
    if (!cells.has(key)) cells.set(key, { positions: [], normals: [], colors: [] });
    return cells.get(key);
  }
  function primitive(key, create) {
    if (!geometry.has(key)) geometry.set(key, create());
    return geometry.get(key);
  }
  function emit(shape, point, size, tint, orient) {
    const chunk = cell(point.x, point.z);
    const rgb = color(tint);
    matrix.compose(point, orient, size);
    normalMatrix.getNormalMatrix(matrix);
    const p = shape.attributes.position;
    const n = shape.attributes.normal;
    const count = shape.index ? shape.index.count : p.count;
    for (let i = 0; i < count; i++) {
      const j = shape.index ? shape.index.getX(i) : i;
      scratch.fromBufferAttribute(p, j).applyMatrix4(matrix);
      chunk.positions.push(scratch.x, scratch.y, scratch.z);
      scratch.fromBufferAttribute(n, j).applyNormalMatrix(normalMatrix);
      chunk.normals.push(scratch.x, scratch.y, scratch.z);
      chunk.colors.push(rgb.r, rgb.g, rgb.b);
    }
  }
  function put(shape, x, y, z, sx, sy, sz, hex, rx = 0, ry = 0, rz = 0) {
    rotation.setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    emit(shape, new THREE.Vector3(x, y, z), new THREE.Vector3(sx, sy, sz), hex, rotation);
  }
  function box(x, y, z, w, h, d, hex, ry = 0, rx = 0, rz = 0) {
    put(primitive('box', () => new THREE.BoxGeometry()), x, y, z, w, h, d, hex, rx, ry, rz);
  }
  function taper(x, y, z, bottom, top, height, hex, sides = 12) {
    const ratio = top / bottom;
    const key = 't/' + ratio.toFixed(4) + '/' + sides;
    put(primitive(key, () => new THREE.CylinderGeometry(ratio, 1, 1, sides)), x, y, z, bottom, height, bottom, hex);
  }
  function beam(a, b, width, hex, square = false, depth = width) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    if (length < 0.0001) return;
    rotation.setFromUnitVectors(up, dir.multiplyScalar(1 / length));
    const shape = square
      ? primitive('box', () => new THREE.BoxGeometry())
      : primitive('rod', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
    emit(shape, new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), new THREE.Vector3(width, length, depth), hex, rotation);
  }
  function ring(x, y, z, radius, thickness, hex, rx = 0, ry = 0, start = 0, arc = TAU) {
    const key = 'ring/' + [thickness / radius, arc].join('/');
    const shape = primitive(key, () => new THREE.TorusGeometry(1, thickness / radius, 6, Math.max(4, Math.ceil(32 * arc / TAU)), arc));
    put(shape, x, y, z, radius, radius, radius, hex, rx, ry, start);
  }
  function triangle(a, b, c, hex) {
    const chunk = cell((a.x+b.x+c.x)/3, (a.z+b.z+c.z)/3);
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b,a), new THREE.Vector3().subVectors(c,a)).normalize();
    const rgb = color(hex);
    for (const p of [a,b,c]) {
      chunk.positions.push(p.x,p.y,p.z);
      chunk.normals.push(normal.x,normal.y,normal.z);
      chunk.colors.push(rgb.r,rgb.g,rgb.b);
    }
  }
  function build() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.89, metalness: 0.025 });
    for (const [key, chunk] of cells) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(chunk.positions, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(chunk.normals, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(chunk.colors, 3));
      geom.computeBoundingSphere();
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = 'Harbour ' + key;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const g of geometry.values()) g.dispose();
  }
  return { box, taper, beam, ring, triangle, build };
}

const v = (x, y, z) => new THREE.Vector3(x,y,z);
const wood = ['#b3895c','#b99065','#ad8157','#c09a6c','#ac845d','#bd9367','#ae8761'];
const timber = '#785a43', tar = '#383b35', brass = '#a68044', rope = '#bc9a67';
const milk = '#f2e2bf', red = '#a64c36', green = '#365d53';

export function createHarbor() {
  const group = new THREE.Group();
  group.name = 'Qingjia harbour';
  const s = sceneryBatch(group);
  const rand = seededRandom(53179);
  const choose = list => list[Math.floor(rand()*list.length)];
  const obstacles = [];
  const mapFeatures = [];
  function sag(a, b, amount, width = .055, tint = rope) {
    const segments = 8;
    let last = a;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const p = new THREE.Vector3().lerpVectors(a,b,t);
      p.y -= 4*amount*t*(1-t);
      s.beam(last,p,width,tint);
      last = p;
    }
  }

  // Waterfront land footprints use the same perimeter for collision and map.
  function island(x, z, rx, rz, height, sides, rock, grass, collision = true) {
    const phase = rand()*TAU;
    const rings = [[],[],[],[]];
    const faces = [];
    const center = v(x,height,z);
    for (let i=0; i<sides; i++) {
      const angle = TAU*i/sides;
      const radius = 1 + .07*Math.sin(3*angle+phase) + .055*Math.cos(5*angle+phase) + (rand()-.5)*.13;
      const dx = Math.cos(angle)*rx*radius, dz = Math.sin(angle)*rz*radius;
      const lip = .72+rand()*.15, middle=.38+rand()*.11;
      rings[0].push(v(x+dx,-1.9,z+dz));
      rings[1].push(v(x+dx*(.95+rand()*.035),.33+rand()*.35,z+dz*(.95+rand()*.035)));
      rings[2].push(v(x+dx*lip,height*(.47+rand()*.18),z+dz*lip));
      rings[3].push(v(x+dx*middle,height*(.75+rand()*.17),z+dz*middle));
    }
    function face(a,b,c,col) { s.triangle(a,b,c,col); faces.push([a,b,c]); }
    for (let i=0; i<sides; i++) {
      const j=(i+1)%sides;
      for (let k=0; k<3; k++) {
        const palette = k===0 ? rock : k===1 ? rock : grass;
        const a = rings[k][i], b=rings[k][j], c=rings[k+1][j], d=rings[k+1][i];
        face(a,d,b,choose(palette));
        face(b,d,c,choose(palette));
      }
      face(rings[3][i],center,rings[3][j],choose(grass));
    }
    const outline=rings[1].map(p=>({x:p.x,z:p.z}));
    mapFeatures.push({ type:'island', x,z, points:outline });
    if (collision) {
      const low=Math.min(...outline.map(p=>p.z));
      const high=Math.max(...outline.map(p=>p.z));
      const slices=Math.ceil((high-low)/2.2), step=(high-low)/slices;
      for (let j=0; j<slices; j++) {
        const at=low+(j+.5)*step, hits=[];
        for (let i=0;i<sides;i++) {
          const a=outline[i], b=outline[(i+1)%sides];
          if ((a.z<=at && b.z>at) || (b.z<=at && a.z>at)) hits.push(a.x+(at-a.z)/(b.z-a.z)*(b.x-a.x));
        }
        hits.sort((a,b)=>a-b);
        for (let i=0;i+1<hits.length;i+=2) {
          obstacles.push({ x:(hits[i]+hits[i+1])/2, z:at, hx:(hits[i+1]-hits[i])/2, hz:step/2 });
        }
      }
    }
    function elevation(px,pz) {
      for (const [a,b,c] of faces) {
        const abx=b.x-a.x, abz=b.z-a.z, acx=c.x-a.x, acz=c.z-a.z;
        const det=abx*acz-acx*abz;
        if (Math.abs(det)<1e-7) continue;
        const u=((px-a.x)*acz-(pz-a.z)*acx)/det;
        const t=(abx*(pz-a.z)-abz*(px-a.x))/det;
        if (u>=-.001 && t>=-.001 && t+u<=1.001) return a.y+u*(b.y-a.y)+t*(c.y-a.y);
      }
      return -.7;
    }
    return elevation;
  }
  const rock=['#807f70','#939181','#a3a08b','#777c72','#939088','#b0aa96'];
  const turf=['#75815c','#828d65','#919969','#9ca476','#939e72'];
  const farRock=['#8b9e99','#9aa8a0','#829a97','#a2ada1'];
  const farGrass=['#92a992','#a1b098','#879e88','#a5ac8e'];
  const west=island(-38,5,24.6,31.5,4.4,29,rock,turf);
  const cape=island(-25,-26,11.2,10.1,3.7,21,rock,turf);
  const east=island(31,-42,11.6,7.8,3.4,17,rock,turf);
  const outer=island(-24,-76,20,7.2,4.8,20,farRock,farGrass);
  island(63,-78,28,9.8,7.5,26,farRock,farGrass);
  island(-83,-88,37,13,10.5,25,farRock,farGrass);
  island(-35,-150,57,17,12,31,farRock,farGrass);
  island(63,-159,45,18,15,28,farRock,farGrass);
  island(-101,21,31,32,10,24,farRock,farGrass);
  island(67,45,17,9.3,5.2,21,farRock,farGrass);

  // Cracked tidal boulders break the shoreline at human scale. Their low
  // relief keeps the passage to the north and east of the pier navigable.
  function shorelineRock(x,y,z,r,h) {
    const angles=7, base=[], shoulder=[];
    const phase=rand()*TAU;
    const top=v(x-r*.12,y+h,z+r*.03);
    for(let k=0;k<angles;k++) {
      const a=phase+k*TAU/angles, w=r*(.82+rand()*.18);
      const xx=w*Math.cos(a), zz=.84*w*Math.sin(a);
      base.push(v(x+xx,y-.15,z+zz));
      shoulder.push(v(x+xx*(.64+rand()*.16),y+h*(.48+rand()*.30),z+zz*.74));
    }
    for(let k=0;k<angles;k++) {
      const j=(k+1)%angles;
      s.triangle(base[k],shoulder[k],base[j],choose(rock));
      s.triangle(base[j],shoulder[k],shoulder[j],choose(rock));
      s.triangle(shoulder[k],top,shoulder[j],choose(['#a8a591','#a4a38f','#aaa68f','#b0aa99']));
    }
    if(y<.3 && y+h>.10) obstacles.push({x,z,radius:r*.84});
  }
  for(const [sample,x,z,dx,dz,n] of [
    [cape,-17.2,-25.0,2.8,4.9,9],[cape,-23.4,-17.8,4.1,2.5,9],
    [west,-18.4,-4.8,3.4,4.3,8],[east,24.3,-39.4,3.8,3.4,8],
    [west,-17.4,16.6,3.4,4.8,7]
  ]) {
    for(let i=0;i<n;i++){
      const xx=x+(rand()-.5)*dx*2, zz=z+(rand()-.5)*dz*2;
      const y=Math.max(-.40,sample(xx,zz)-.14);
      shorelineRock(xx,y,zz,.54+rand()*.86,.32+rand()*.69);
    }
  }

  // Hand-laid decking, exposed joists, braced piles and timber grain.
  function dock(x,z,w,d,top,walkAlongZ=true) {
    const span=walkAlongZ?d:w, count=Math.round(span/.38);
    const face=span/count;
    s.box(x,top-.23,z,w-.13,.3,d-.13,timber);
    for(let i=0;i<count;i++) {
      const offset=(i+.5)*face-span/2;
      const xx=x+(walkAlongZ?0:offset), zz=z+(walkAlongZ?offset:0);
      const yy=top+(rand()-.5)*.015;
      const bw=walkAlongZ?w+rand()*.045:face-.018;
      const bd=walkAlongZ?face-.018:d+rand()*.045;
      s.box(xx,yy-.065,zz,bw,.13,bd,choose(wood));
      for(let j=0;j<2;j++){
        const along=(rand()-.5)*.56;
        const across=(rand()-.5)*.15;
        s.box(xx+(walkAlongZ?along*bw:across),yy+.002,zz+(walkAlongZ?across:along*bd),
          walkAlongZ?.16+rand()*.59:.013,.006,walkAlongZ?.013:.16+rand()*.59,'#916e4e');
      }
    }
    const edge=walkAlongZ?w/2:d/2;
    for(const side of [-1,1]){
      const across=(edge-.18)*side;
      s.box(x+(walkAlongZ?across:0),top-.34,z+(walkAlongZ?0:across),
        walkAlongZ?.22:w,.43,walkAlongZ?d:.22,'#846347');
    }
    obstacles.push({x,z,hx:w/2,hz:d/2});
    mapFeatures.push({type:'dock',x,z,hx:w/2,hz:d/2});
  }
  const dx=-5.8, deck=1.03;
  dock(dx,1,4.4,26,deck);
  dock(-12.28,10.8,8.60,3.25,deck,false);
  const sections=[-11.55,-7.25,-3.0,1.25,5.55,9.80,13.50];
  function pile(x,z,length,cap=true) {
    const bottom=-1.25;
    s.taper(x,(bottom+length)/2,z,.215,.203,length-bottom,timber,11);
    s.taper(x,.12,z,.217,.216,.44,'#536254',11);
    if(cap) {
      s.taper(x,length+.016,z,.199,.19,.037,'#b99b70',11);
      s.taper(x,length-.19,z,.212,.212,.056,tar,11);
    }
  }
  for (const side of [-1,1]) {
    for(let i=0;i<sections.length;i++) {
      const zz=sections[i], xx=dx+side*2.03;
      const tall=side<0 || i===0 || i===sections.length-1;
      pile(xx,zz,tall?1.77:1.30);
      if(i<sections.length-1) {
        s.beam(v(xx,-.23,zz),v(xx,.70,sections[i+1]),.16,timber,true);
        if(side<0 && (zz<4 || zz>10)) sag(v(xx,1.60,zz),v(xx,1.60,sections[i+1]),.26,.053);
      }
    }
  }
  for(const x of [-15.55,-11.7]) for(const zz of [9.46,12.15]) pile(x,zz,1.55);

  // Small cast-iron cleats and suspended rubber fenders on the berth face.
  for(const z of [-9.1,-2.4,5.2,11.0]) {
    s.box(-3.91,1.07,z,.40,.08,.58,tar);
    s.taper(-3.91,1.18,z,.105,.125,.20,tar,9);
    s.box(-3.91,1.29,z,.17,.10,.59,'#494c43');
    s.ring(-3.50,.48,z+.45,.38,.105,'#383d39',0,Math.PI/2);
    sag(v(-3.62,1.04,z+.33),v(-3.51,.83,z+.46),.021,.043);
  }
  // Lobster pots are slatted cages with arched ribs, a dark inner funnel
  // and floats, in addition to the wooden shipping crates at the landing.
  function crate(x,z,w,d,h,level=deck) {
    const frame='#a78156';
    s.box(x,level+h/2,z,w,h,d,'#957348');
    for(const side of [-1,1]) {
      for(const e of [-1,1]) s.box(x+e*(w/2-.047),level+h/2,z+side*d/2,.095,h+.015,.055,frame);
      for(const yy of [.09,h-.09]) s.box(x,level+yy,z+side*d/2,w,.11,.065,'#b3905d');
      for(let i=1;i<4;i++) s.box(x-w/2+w*i/4,level+h/2,z+side*(d/2+.002),.012,h-.22,.011,'#6e573f');
      s.beam(v(x-w*.42,level+.13,z+side*(d/2+.043)),v(x+w*.42,level+h-.13,z+side*(d/2+.043)),.09,'#c5a06a',true);
      for(const e of [-1,1]) s.box(x+side*w/2,level+h/2,z+e*(d/2-.055),.063,h,.10,frame);
    }
    for(const offset of [-.28,.28]) s.box(x+w*offset,level+h+.008,z,.085,.023,d,'#bc9561');
  }
  crate(-7.02,7.05,1.22,.97,.84); crate(-6.64,8.22,1.17,1.0,.83);
  crate(-7.01,7.08,.91,.78,.60,deck+.85);
  function lobsterPot(x,z) {
    const wide=.90, len=1.23, radius=wide/2;
    s.box(x,deck+.06,z,wide,.11,len,'#806341');
    for(let i=0;i<=4;i++) {
      const zz=z-len/2+i*len/4;
      let a;
      for(let j=0;j<=8;j++) {
        const ang=j*Math.PI/8;
        const b=v(x+radius*Math.cos(ang),deck+.12+radius*Math.sin(ang),zz);
        if(a) s.beam(a,b,.042,timber);
        a=b;
      }
    }
    for(let j=0;j<=8;j++) {
      const ang=j*Math.PI/8;
      const xx=x+radius*Math.cos(ang), yy=deck+.11+radius*Math.sin(ang);
      s.beam(v(xx,yy,z-len/2),v(xx,yy,z+len/2),.053,'#be9867');
    }
  }
  lobsterPot(-6.75,-9.25); lobsterPot(-6.35,-7.79);
  for (let i=0;i<5;i++) s.ring(-5.10,deck+.035+i*.014,8.87,.25+i*.046,.034,rope,Math.PI/2);
  function barrel(x,z,level) {
    s.taper(x,level+.22,z,.31,.37,.44,'#976744',13);
    s.taper(x,level+.65,z,.37,.31,.42,'#a0704a',13);
    for(const [dy,r] of [[.13,.335],[.42,.377],[.72,.339]]) s.taper(x,level+dy,z,r,r,.065,tar,13);
    s.taper(x,level+.873,z,.29,.29,.02,'#b58b60',13);
  }
  barrel(-6.66,11.12,deck); barrel(-7.24,10.72,deck);
  function lifeRing(x,y,z,angle=0) {
    s.ring(x,y,z,.345,.086,'#ca643f',0,angle);
    for(let i=0;i<4;i++) s.ring(x,y,z,.345,.089,'#f1dfb4',0,angle,i*Math.PI/2+.12,.34);
  }
  s.box(-7.1,1.80,-4.3,.18,1.8,.15,tar);
  s.box(-7.1,2.01,-4.3,.13,.62,.75,'#436a60');
  lifeRing(-7.00,1.99,-4.3,Math.PI/2);

  // Gabled maritime buildings. Local +Z is the entrance, giving the
  // boathouse a large harbour-facing sliding door.
  function cottage(x,z,base,w,d,h,heading,wall,roof,large=false) {
    const cos=Math.cos(heading), sin=Math.sin(heading);
    const world=(u,y,f)=>v(x+u*cos+f*sin,base+y,z-u*sin+f*cos);
    function box(u,y,f,bw,bh,bd,hex) { const p=world(u,y,f);s.box(p.x,p.y,p.z,bw,bh,bd,hex,heading); }
    const front=d/2, half=w/2, rise=w*(large?.31:.41);
    box(0,-.30,0,w+.24,.9,d+.24,'#8d8975');
    box(0,h/2,0,w,h,d,wall);
    for(const side of [-1,1]) {
      const end=front*side;
      const a=world(-half,h,end), b=world(half,h,end), c=world(0,h+rise,end);
      if(side===1) s.triangle(a,b,c,wall); else s.triangle(b,a,c,wall);
      for(let k=1;k<Math.ceil(w/.44);k++) {
        const u=-half+k*.44;
        const top=h+rise*(1-Math.abs(u)/half);
        box(u,top/2,end+side*.013,.025,top-.04,.032,large?'#934f40':wall);
      }
      for (const sign of [-1,1]) {
        const u=sign*(half+.04);
        box(u,h/2,end,.13,h+.05,.16,large?'#e1cba2':milk);
        s.beam(world(0,h+rise+.09,end+side*.2),world(sign*(half+.24),h-.025,end+side*.2),.16,milk,true);
      }
    }
    for(const sign of [-1,1]) {
      const pitch=Math.atan2(rise,half);
      const p=world(sign*(half+.19)/2,h+rise/2-.008,0);
      s.box(p.x,p.y,p.z,(half+.27)/Math.cos(pitch),.14,d+.55,roof,heading,0,-sign*pitch);
      for(let i=0;i<=Math.floor((d+.3)/.50);i++) {
        const f=-front-.12+i*.50;
        s.beam(world(0,h+rise+.103,f),world(sign*(half+.25),h-.065,f),.058,roof,true);
      }
      box(sign*(half+.18),h-.035,0,.14,.15,d+.60,milk);
      for(const f of [-d*.27,d*.22]){
        box(sign*(half+.022),h*.57,f,.085,h*.45,Math.min(1.02,d*.21),milk);
        box(sign*(half+.069),h*.57,f,.052,h*.38,Math.min(.84,d*.17),'#405e60');
        box(sign*(half+.106),h*.57,f,.023,h*.38,.036,milk);
        box(sign*(half+.108),h*.57,f,.023,.042,Math.min(.85,d*.17),milk);
      }
    }
    box(0,h+rise+.081,0,.16,.14,d+.57,roof);
    const dw=large?w*.58:w*.25, dh=large?h*.82:h*.73, du=large?0:-w*.19;
    box(du,dh/2,front+.05,dw+.23,dh+.15,.12,milk);
    box(du,dh/2,front+.13,dw,dh,.12,large?green:'#6e8274');
    for(let i=1;i<Math.ceil(dw/.32);i++) box(du-dw/2+i*.32,dh/2,front+.20,.023,dh-.05,.016,'#3d5850');
    if(large) {
      box(du,dh/2,front+.218,.052,dh,.033,timber);
      for(const sign of [-1,1]) {
        s.beam(world(.04*sign,.18,front+.23),world(sign*(dw/2-.10),dh-.12,front+.23),.095,'#90a18a',true);
      }
      box(0,h+.34,front+.04,.68,.43,.09,milk);
      box(0,h+.34,front+.10,.55,.31,.04,'#496661');
    } else {
      box(w*.25,h*.55,front+.035,w*.24,h*.34,.10,milk);
      box(w*.25,h*.55,front+.09,w*.19,h*.28,.06,'#466365');
      box(w*.25,h*.55,front+.13,.04,h*.28,.02,milk);
      box(w*.25,h*.55,front+.13,w*.19,.04,.02,milk);
    }
    box(du,.022,front+.32,dw+.46,.16,.57,'#a69d87');
    const stack=world(-w*.23,h+rise*.77,-d*.22);
    s.box(stack.x,stack.y+.32,stack.z,.44,.97,.48,'#9d6c52',heading);
    s.box(stack.x,stack.y+.86,stack.z,.54,.12,.55,'#b9ab8b',heading);
  }
  // Quayside storehouse stands on a proper timber apron at the foot of the hill.
  const quayTop=1.88;
  dock(-16.8,5.6,7.0,10.0,quayTop);
  for(const z of [1.0,4.0,7.0,10.0]) pile(-13.49,z,quayTop+.04,false);
  cottage(-17.58,4.18,quayTop+.08,5.1,6.2,2.95,1.30,'#aa6049','#635f55',true);
  crate(-14.65,8.34,1.07,.86,.87,quayTop);barrel(-14.17,7.38,quayTop);
  for(let i=0;i<5;i++) {
    const h=(quayTop-deck)*(i+1)/5;
    s.box(-12.16-i*.255,deck+h/2,9.92,.265,h,1.35,wood[i]);
  }
  const houses=[
    [-24,-1.8,3.2,4.5,2.45,.53,'#e1c79b','#a45c43'],
    [-29,5.0,3.7,5.0,2.7,1.05,'#dccaac','#925243'],
    [-32,-3.7,3.35,4.45,2.45,.20,'#cead78','#655d50'],
    [-34,12.5,3.2,5.0,2.55,1.20,'#aac0ad','#8b5340'],
    [-42,1.6,4.2,4.6,2.6,1.0,'#ddbd88','#846452'],
    [-29,15.7,2.95,3.8,2.45,1.38,'#cda16d','#9a5b44'],
    [-37,-9.5,2.7,4.4,2.0,.85,'#daae8a','#965f4f']
  ];
  for(const [x,z,w,d,h,heading,wall,roof] of houses) cottage(x,z,west(x,z)+.02,w,d,h,heading,wall,roof);
  for(const [x,z] of [[-25,-4.8],[-34,7.9],[-37,-2.4]]) {
    const y=west(x,z);
    s.taper(x,y+2.2,z,.075,.046,4.40,'#76684f',7);
    s.box(x,y+4.17,z,.84,.095,.10,'#76684f');
  }
  sag(v(-25,west(-25,-4.8)+4.20,-4.8),v(-37,west(-37,-2.4)+4.20,-2.4),.56,.025,tar);

  const lx=-24,lz=-26,foot=cape(lx,lz);
  s.taper(lx,foot-.16,lz,2.0,1.93,.58,'#9e9a85',14);
  s.taper(lx,foot+.28,lz,1.58,1.53,.52,'#b9ad8f',20);
  let lower=.54;
  const tower=[[2.45,1.49,1.35,'#f3dfb8'],[1.44,1.35,1.26,'#a84b36'],[2.00,1.26,1.13,'#f2dfbc']];
  for(const [h,rb,rt,col] of tower) {
    s.taper(lx,foot+lower+h/2,lz,rb,rt,h,col,24);
    lower+=h;
  }
  function towerWindow(y,r,theta,h,w) {
    const x=lx+Math.sin(theta)*r,z=lz+Math.cos(theta)*r;
    s.box(x,foot+y,z,w+.14,h+.16,.09,'#ddcba5',theta);
    s.box(x+Math.sin(theta)*.056,foot+y,z+Math.cos(theta)*.056,w,h,.07,'#455b56',theta);
  }
  towerWindow(1.34,1.44,.50,1.63,.73);towerWindow(3.02,1.34,-.37,.53,.30);towerWindow(5.25,1.18,1.05,.66,.34);
  const lantern=foot+lower;
  s.taper(lx,lantern+.055,lz,1.19,1.50,.21,'#697267',24);
  s.taper(lx,lantern+.21,lz,1.55,1.55,.13,'#505e56',24);
  s.ring(lx,lantern+.79,lz,1.43,.045,'#465750',Math.PI/2);
  s.ring(lx,lantern+.52,lz,1.43,.024,'#465750',Math.PI/2);
  for(let i=0;i<14;i++) {
    const angle=i*TAU/14;
    s.taper(lx+1.43*Math.sin(angle),lantern+.51,lz+1.43*Math.cos(angle),.035,.035,.59,'#465750',6);
  }
  s.taper(lx,lantern+.82,lz,.80,.80,1.16,'#94aea0',12);
  // Sun catches different panes of the lantern room.
  for (const [angle,glaze] of [[.26,'#d3cba0'],[.78,'#e3d8aa'],[1.31,'#aec0a8']]) {
    s.box(lx+.79*Math.sin(angle),lantern+.83,lz+.79*Math.cos(angle),.39,.92,.034,glaze,angle);
  }
  for(let i=0;i<12;i++) {
    const a=i*TAU/12;
    s.taper(lx+.835*Math.sin(a),lantern+.86,lz+.835*Math.cos(a),.045,.045,1.21,'#42564e',7);
  }
  s.taper(lx,lantern+1.50,lz,.96,1.03,.14,'#7d4937',20);
  s.taper(lx,lantern+1.92,lz,1.06,.12,.76,'#ab553f',20);
  s.taper(lx,lantern+2.45,lz,.091,.037,.42,'#4e5649',8);
  cottage(-27.85,-24.40,cape(-27.85,-24.40),2.74,3.68,1.80,1.05,'#e2d2ae','#9f5843');
  mapFeatures.push({type:'lighthouse',x:lx,z:lz});

  function pine(x,y,z,h) {
    s.taper(x,y+h*.28,z,h*.038,h*.025,h*.55,'#735f4a',6);
    s.taper(x,y+h*.51,z,h*.22,h*.014,h*.51,choose(['#56694f','#5b7357','#536f5b']),7);
    s.taper(x,y+h*.71,z,h*.165,h*.01,h*.42,choose(['#6b805d','#667b60']),7);
    s.taper(x,y+h*.86,z,h*.10,0,h*.31,'#798966',7);
  }
  for(const [sample,x,z,rx,rz,count] of [
    [west,-42,10,11,11,22],[west,-37,-14,9,4,9],[cape,-31,-28,3,2,5],
    [east,30,-42,5,3,13],[outer,-29,-76,8,2,10]
  ]) {
    for(let i=0;i<count;i++){
      const a=rand()*TAU, r=Math.sqrt(rand()), xx=x+rx*r*Math.cos(a),zz=z+rz*r*Math.sin(a);
      const yy=sample(xx,zz);
      if(yy>.9) pine(xx,yy-.05,zz,2.1+rand()*2.5);
    }
  }
  function buoy(x,z,starboard) {
    const col=starboard?'#367767':'#ba5439';
    s.taper(x,.17,z,.62,.77,.50,col,12);
    s.taper(x,.48,z,.77,.50,.20,col,12);
    s.taper(x,.77,z,.43,.31,.46,col,12);
    s.taper(x,1.28,z,.18,.16,.66,col,10);
    s.taper(x,1.22,z,.185,.185,.18,'#ead9b1',10);
    s.taper(x,1.88,z,.21,starboard?.013:.21,.48,col,10);
    obstacles.push({x,z,radius:.75});
    mapFeatures.push({type:'buoy',x,z,starboard});
  }
  buoy(-2.6,-17.8,false);buoy(9.2,-20.4,true);
  buoy(1.7,-42.3,false);buoy(15.6,-44.2,true);
  buoy(8.0,-67.5,false);buoy(23.0,-70.4,true);

  // Gulls have two swept, folded wings rather than a flat chevron.
  function gull(x,y,z,yaw,w) {
    function g(u,h,f) { return v(x+w*(u*Math.cos(yaw)+f*Math.sin(yaw)),y+w*h,z+w*(-u*Math.sin(yaw)+f*Math.cos(yaw))); }
    for(const side of [-1,1]) {
      const a=g(0,0,-.05),b=g(side*.47,.16,.035),c=g(side*.48,.14,.19),tip=g(side*.87,.11,.26);
      s.triangle(a,b,c,'#efe6d1'); s.triangle(a,c,b,'#d9d3bf');
      s.triangle(b,tip,c,'#716e62');s.triangle(b,c,tip,'#857e6e');
    }
  }
  gull(-10,9,-27,.24,1.05);gull(-7.6,10,-29,.43,.86);gull(13.8,7.1,-31,.70,1.05);
  s.build();
  return {group,obstacles,mapFeatures};
}
