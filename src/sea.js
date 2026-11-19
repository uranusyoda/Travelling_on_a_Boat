import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export { addSky } from './atmosphere.js';

const TAU = Math.PI * 2;
const waveBands = [
  { frequency: .355, spread: 0, weight: .55, phase: .2 },
  { frequency: .56, spread: .32, weight: .265, phase: 2.45 },
  { frequency: .83, spread: -.51, weight: .13, phase: 1.26 },
  { frequency: 1.29, spread: .74, weight: .055, phase: 3.56 }
];
const fair = {windX:.45,windZ:-.893,windSpeed:4,waveX:.34,waveZ:-.94,waveHeight:.3,overcast:0,rain:0,storm:0};

function ripple(distance, age) {
  const behind = 3.2*age-distance;
  if(age<0 || age>4.4 || behind<0 || behind>2.3) return 0;
  const window = Math.sin(Math.PI*behind/2.3);
  return .13*Math.sin(behind*4.8)*window*window*(1-age/4.4)/(1+.10*distance);
}

// The same float coefficients drive GPU displacement and buoyancy queries.
function sampleHeight(x,z,waves,rings,time) {
  let y=0;
  for(const w of waves) y+=w.w*Math.sin(w.x*x+w.y*z+w.z);
  for(const r of rings) {
    const age=time-r.z;
    if(age>=0 && age<4.4) y+=ripple(Math.hypot(x-r.x,z-r.y),age);
  }
  return y;
}

// Fine concentric rings follow the viewer. Outer rings need few triangles.
// The mesh stays in the Reflector's native XY plane, then rotates to sea level.
function seaGeometry() {
  const positions=[0,0,0], indices=[];
  const rings=88,sectors=168;
  for(let i=1;i<=rings;i++) {
    const u=i/rings;
    const r=35*u+70*u*u+530*u**5;
    for(let j=0;j<sectors;j++) {
      const a=TAU*j/sectors;
      positions.push(r*Math.cos(a),r*Math.sin(a),0);
      const current=1+(i-1)*sectors+j;
      const next=1+(i-1)*sectors+(j+1)%sectors;
      if(i===1) indices.push(0,current,next);
      else indices.push(current-sectors,current,next, current-sectors,next,next-sectors);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

const waveGLSL = `
uniform vec4 bands[4];
uniform vec3 rings[4];
uniform float clock;
float ringHeight(vec2 p,vec3 ring) {
  float age=clock-ring.z;
  if(age<0. || age>4.4) return 0.;
  float dist=length(p-ring.xy), behind=3.2*age-dist;
  if(behind<0. || behind>2.3) return 0.;
  float envelope=sin(3.14159265*behind/2.3);
  return .13*sin(behind*4.8)*envelope*envelope*(1.-age/4.4)/(1.+.10*dist);
}
`;

// The old public helper remains available to callers that used the original
// fair-weather scene without a running instance.
export function surfaceHeight(x,z,t) {
  return .075*Math.sin(.36*x+.24*z+t*1.05)+.041*Math.sin(.68*z-.17*x-t*.83)+.022*Math.sin(.89*x+.62*z+t*1.26);
}

export function createSea(scene) {
  const shader = {
    name:'Coastal water',
    uniforms: {
      color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},clock:{value:0},
      bands:{value:waveBands.map(()=>new THREE.Vector4())},
      rings:{value:Array.from({length:4},()=>new THREE.Vector3(0,0,-100))},
      deep:{value:new THREE.Color('#367f8c')},shoal:{value:new THREE.Color('#53a7a6')},
      crest:{value:new THREE.Color('#e0e9d3')},mist:{value:new THREE.Color('#cddacc')},
      mistDensity:{value:.0065},cloud:{value:0},rough:{value:.24},rain:{value:0},grainPhase:{value:0},
      windScroll:{value:new THREE.Vector2()},waveDir:{value:new THREE.Vector2(.34,-.94)}
    },
    vertexShader:waveGLSL+`
      uniform mat4 textureMatrix;
      varying vec4 mirrorUv;varying vec3 point;varying vec2 slope;
      void main() {
        vec3 p=position;
        vec2 xz=(modelMatrix*vec4(p,1.)).xz;
        float y=0.;slope=vec2(0.);
        for(int i=0;i<4;i++) {
          vec4 w=bands[i];
          float phase=dot(w.xy,xz)+w.z;
          y+=w.w*sin(phase);
          slope+=w.w*w.xy*cos(phase);
        }
        for(int j=0;j<4;j++) y+=ringHeight(xz,rings[j]);
        p.z=y;
        point=(modelMatrix*vec4(p,1.)).xyz;
        mirrorUv=textureMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader:waveGLSL+`
      uniform sampler2D tDiffuse;uniform vec3 deep,shoal,crest,mist;
      uniform vec2 windScroll,waveDir;uniform float mistDensity,cloud,rough,rain,grainPhase;
      varying vec4 mirrorUv;varying vec3 point;varying vec2 slope;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=point.xz;float dist=length(cameraPosition-point);
        float farFade=1.-smoothstep(30.,125.,dist);
        float slow=noise2(p*.065), shallows=1.-smoothstep(8.,98.,distance(p,vec2(-14.,-7.)));
        vec2 grain=p-windScroll;
        float band=dot(grain,waveDir)*2.3+grainPhase+4.1*noise2(grain*.43);
        float rip=sin(band),micro=sin(dot(grain,vec2(-1.8,7.1))+5.*noise2(grain*1.6));
        float motion=smoothstep(0.,.28,rough);
        vec2 offset=(vec2(cos(band)+.40*micro,rip+.30*micro)*(.0008+.002*farFade)*motion)
                    +slope*(.018+.028*farFade);
        vec3 refl=texture2D(tDiffuse,clamp(mirrorUv.xy/mirrorUv.w+offset,.001,.999)).rgb;
        vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
        float fres=pow(1.-clamp(dot(normal,normalize(cameraPosition-point)),0.,1.),3.);
        vec3 base=mix(deep,shoal,clamp(.12+.40*slow+.53*shallows,0.,1.));
        base=mix(base,base*vec3(.47,.60,.69),cloud);
        vec3 water=mix(base,refl,clamp(.18+.50*fres,.18,.72));
        float stroke=smoothstep(.953,.996,rip)*smoothstep(.58,.80,noise2(grain*vec2(.68,.96)));
        float fine=smoothstep(.95,.996,micro)*smoothstep(.72,.9,noise2(grain*vec2(.47,.89)));
        float whitecap=smoothstep(.115,.42,length(slope))*smoothstep(.08,.75,point.y)*smoothstep(.4,.79,noise2(grain*.82));
        float ringFoam=0.;
        for(int j=0;j<4;j++) {
          float age=clock-rings[j].z;
          if(age>=0. && age<4.4){
            float behind=3.2*age-length(p-rings[j].xy);
            float strokes=(1.-smoothstep(.02,.30,abs(behind)))+.38*(1.-smoothstep(.08,.47,abs(behind-1.1)));
            ringFoam+=strokes*(1.-smoothstep(.3,4.4,age));
          }
        }
        float rainRings=0.;
        if(rain>.008 && farFade>.01) {
          vec2 g=p*2.15;
          float seed=hash(floor(g));
          float age=fract(clock*1.43+seed);
          vec2 center=vec2(.3+.4*seed,.3+.4*hash(floor(g)+vec2(13.,2.)));
          rainRings=(1.-smoothstep(.014,.048,abs(length(fract(g)-center)-age*.32)))*(1.-age)*rain;
        }
        float foam=(stroke*.43+fine*.17)*motion+whitecap*.63+ringFoam*.63+rainRings*.19;
        water=mix(water,crest,clamp(foam*farFade,0.,.92));
        water+=.011*rip*farFade*motion;
        float fogMix=1.-exp(-mistDensity*mistDensity*dist*dist);
        gl_FragColor=vec4(water,1.);
        #include <tonemapping_fragment>
        gl_FragColor.rgb=mix(gl_FragColor.rgb,mist,clamp(fogMix,0.,1.));
        #include <colorspace_fragment>
      }`
  };
  const water=new Reflector(seaGeometry(),{textureWidth:640,textureHeight:480,multisample:0,clipBias:.002,shader});
  water.name='Wind-driven harbour water';water.rotation.x=-Math.PI/2;water.renderOrder=-1;
  scene.add(water);
  const uniforms=water.material.uniforms;
  const bands=uniforms.bands.value,rings=uniforms.rings.value;
  let clock=0, nextRing=0, initial=true;
  const anchor=new THREE.Vector2();
  const reflect=water.onBeforeRender;
  water.onBeforeRender=function(renderer,scene,camera,...rest){
    if(!camera.isArrayCamera) {
      anchor.set(camera.position.x,camera.position.z);
      this.position.set(anchor.x,0,anchor.y);
      this.updateMatrixWorld();
    }
    if(scene.fog) {
      uniforms.mist.value.copy(scene.fog.color);
      uniforms.mistDensity.value=scene.fog.density??.0065;
    }
    reflect.call(this,renderer,scene,camera,...rest);
  };
  const phases=waveBands.map(w=>w.phase);
  function update(dt,t,env=fair) {
    if(t===undefined){t=dt;dt=Math.max(0,t-clock);}
    clock=t;uniforms.clock.value=t;
    const heading=Math.atan2(env.waveZ,env.waveX);
    const halfHeight=Math.max(0,env.waveHeight)/2;
    for(let i=0;i<waveBands.length;i++){
      const spec=waveBands[i], w=bands[i], a=heading+spec.spread;
      const kx=spec.frequency*Math.cos(a), kz=spec.frequency*Math.sin(a);
      // Pivot a changing wave field around the viewer. Even at the edge of
      // the bay, rotating the direction does not teleport crests past the boat.
      if(!initial) phases[i]+=(w.x-kx)*anchor.x+(w.y-kz)*anchor.y;
      phases[i]=(phases[i]-dt*Math.sqrt(9.81*spec.frequency)*(1+Math.min(22,env.windSpeed)*.009))%TAU;
      w.set(kx,kz,phases[i],halfHeight*spec.weight);
    }
    initial=false;
    uniforms.cloud.value=env.overcast;
    uniforms.rain.value=env.rain;
    uniforms.rough.value=env.waveHeight;
    const bearing=uniforms.waveDir.value,scroll=uniforms.windScroll.value;
    const change=((bearing.x-env.waveX)*(anchor.x-scroll.x)+(bearing.y-env.waveZ)*(anchor.y-scroll.y))*2.3;
    uniforms.grainPhase.value=(uniforms.grainPhase.value+change)%TAU;
    bearing.set(env.waveX,env.waveZ);
    const drift=(.12+.095*env.windSpeed)*dt;
    uniforms.windScroll.value.x+=drift*env.windX;
    uniforms.windScroll.value.y+=drift*env.windZ;
  }
  update(0,0);
  return {
    update,
    height:(x,z)=>sampleHeight(x,z,bands,rings,clock),
    disturb(x,z,t=clock) {rings[nextRing].set(x,z,t);nextRing=(nextRing+1)%rings.length;}
  };
}

export function createWake(scene) {
  const count=120,dummy=new THREE.Object3D(),normal=new THREE.Vector3();
  const geometry=new THREE.CircleGeometry(1,10);
  geometry.rotateX(-Math.PI/2);
  const material=new THREE.MeshBasicMaterial({color:'#e7ebd2',transparent:true,opacity:.63,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  mesh.name='Stern wake';mesh.frustumCulled=false;
  const marks=Array.from({length:count},()=>({age:6}));
  let next=0,accum=0;
  scene.add(mesh);mesh.count=0;
  function update(dt,s,t,height,clear=false){
    if(typeof height!=='function'){clear=Boolean(height)||clear;height=(x,z)=>surfaceHeight(x,z,t);}
    if(clear){marks.forEach(m=>m.age=6);accum=0;}
    const speed=Math.abs(s.speed),sn=Math.sin(s.heading),cs=Math.cos(s.heading);
    if(speed>.38)accum+=dt*Math.min(38,6+speed*4);
    while(accum>=1){
      accum--;
      const side=next%2?1:-1,off=(.62+Math.random()*.32)*side;
      const back=s.speed>=0?1.94:-1.98;
      Object.assign(marks[next],{x:s.x-sn*back+cs*off,z:s.z+cs*back+sn*off,dx:cs*side*(.25+speed*.09),dz:sn*side*(.25+speed*.09),rot:-s.heading+side*.30,age:0,size:.12+Math.random()*.24});
      next=(next+1)%count;
    }
    let live=0;
    for(const m of marks) {
      m.age+=dt;if(m.age>=3.8)continue;
      m.x+=m.dx*dt;m.z+=m.dz*dt;
      const k=m.size*(1-m.age/3.8);
      const y=height(m.x,m.z), sx=(height(m.x+.20,m.z)-y)*5, sz=(height(m.x,m.z+.20)-y)*5;
      dummy.position.set(m.x,y+.055,m.z);
      normal.set(-sx,1,-sz).normalize();
      dummy.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP,normal);
      dummy.rotateY(m.rot);dummy.scale.set(k*.74,1,k*(1.7+m.age*.8));
      dummy.updateMatrix();mesh.setMatrixAt(live++,dummy.matrix);
    }
    mesh.count=live;mesh.instanceMatrix.needsUpdate=true;
  }
  update.update=update;
  return update;
}
