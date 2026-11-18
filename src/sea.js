import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function surfaceHeight(x,z,t) {
  return .075*Math.sin(.36*x+.24*z+t*1.05)+.041*Math.sin(.68*z-.17*x-t*.83)+.022*Math.sin(.89*x+.62*z+t*1.26);
}

const waveGLSL = `
float waves(vec2 p, float t) {
  return .075*sin(.36*p.x+.24*p.y+t*1.05)+.041*sin(.68*p.y-.17*p.x-t*.83)+.022*sin(.89*p.x+.62*p.y+t*1.26);
}
`;

export function createSea(scene) {
  const water = new Reflector(new THREE.PlaneGeometry(720,720,264,264), {
    textureWidth: 640, textureHeight: 480, multisample: 0, clipBias:.002,
    shader: {
      name:'Coastal water',
      uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},clock:{value:0},deep:{value:new THREE.Color('#367f8c')},shoal:{value:new THREE.Color('#53a7a6')},crest:{value:new THREE.Color('#e0e9d3')},ring:{value:new THREE.Vector3(0,0,-100)}},
      vertexShader:`uniform mat4 textureMatrix;uniform float clock;varying vec4 mirrorUv;varying vec3 point;
        `+waveGLSL+`
        void main(){
          vec3 p=position; vec2 xz=vec2(p.x,-p.y); p.z=waves(xz,clock);
          point=(modelMatrix*vec4(p,1.)).xyz;
          mirrorUv=textureMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        }`,
      fragmentShader:`uniform sampler2D tDiffuse;uniform float clock;uniform vec3 deep,shoal,crest,ring;
        varying vec4 mirrorUv;varying vec3 point;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec2 p=point.xz; float t=clock; float dist=length(cameraPosition-point);float farFade=1.-smoothstep(32.,124.,dist);
          float slow=noise2(p*.065); float shallows=1.-smoothstep(8.,98.,distance(p,vec2(-14.,-7.)));
          float band=p.y*2.9+p.x*.82+3.9*noise2(p*.48+vec2(t*.1,0.))+t*.71;
          float rip=sin(band),micro=sin(p.y*7.1-p.x*1.8+5.*noise2(p*1.6)+t*.84);
          vec2 offset=vec2(sin(band*.83)+.45*micro,rip+.38*micro)*(.0012+.0028*farFade);
          vec3 refl=texture2D(tDiffuse,clamp(mirrorUv.xy/mirrorUv.w+offset,.001,.999)).rgb;
          vec3 eye=normalize(cameraPosition-point);
          float fres=pow(1.-abs(eye.y),3.);
          vec3 base=mix(deep,shoal,clamp(.12+.40*slow+.53*shallows,0.,1.));
          vec3 water=mix(base,refl,clamp(.19+.48*fres,.18,.68));
          float stroke=smoothstep(.968,.995,rip)*smoothstep(.59,.79,noise2(vec2(p.x*.68,p.y*.96)+vec2(.07*t,0.)));
          float fine=smoothstep(.948,.995,micro)*smoothstep(.72,.9,noise2(vec2(.47*p.x,.89*p.y))) ;
          float distanceRing=length(p-ring.xy);float age=t-ring.z;
          float spread=max(0.,age*3.1-distanceRing);
          float ringFoam=(1.-smoothstep(0.,.55,abs(distanceRing-age*3.1))+.38*(1.-smoothstep(.1,.8,abs(spread-1.2)))*step(1.,spread));
          ringFoam*=step(0.,age)*(1.-smoothstep(.3,3.2,age));
          water=mix(water,crest,clamp((stroke*.57+fine*.24)*farFade+ringFoam*.51,0.,1.));
          water+=.017*rip*farFade;
          water=mix(water,vec3(.58,.73,.70),smoothstep(80.,260.,dist)*.57);
          gl_FragColor=vec4(water,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }
  });
  water.rotation.x=-Math.PI/2;
  water.renderOrder=-1;
  scene.add(water);
  return {
    update(t){water.material.uniforms.clock.value=t},
    disturb(x,z,t){water.material.uniforms.ring.value.set(x,z,t)}
  };
}

export function addSky(scene){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(440,40,20),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{zenith:{value:new THREE.Color('#78adc3')},horizon:{value:new THREE.Color('#d3dfcf')},cloud:{value:new THREE.Color('#fbf1d7')}},
    vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 zenith,horizon,cloud;varying vec3 dir;
    float h(vec2 p){return fract(sin(dot(p,vec2(31.445,92.671)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){vec3 d=normalize(dir);vec3 col=mix(horizon,zenith,pow(clamp(d.y*1.8,0.,1.),.60));
    vec2 uv=d.xz/max(.025,d.y+.035)*vec2(.47,1.1);float v=n(uv)*.57+n(uv*2.1)*.28+n(uv*4.4)*.15;
    float clouds=smoothstep(.60,.76,v)*smoothstep(.007,.08,d.y)*(1.-smoothstep(.38,.83,d.y))*.70;
    col=mix(col,cloud,clouds);gl_FragColor=vec4(col,1.);
    #include <colorspace_fragment>
    }`
  }));
  sky.renderOrder=-10;
  scene.add(sky);
  scene.background=new THREE.Color('#caddd2');
  scene.fog=new THREE.FogExp2('#cddacc',.0065);
}

export function createWake(scene){
  const count=120,dummy=new THREE.Object3D();
  const geometries=new THREE.CircleGeometry(1,8);
  geometries.rotateX(-Math.PI/2);
  const material=new THREE.MeshBasicMaterial({color:'#ecedcb',transparent:true,opacity:.65,depthWrite:false});
  const mesh=new THREE.InstancedMesh(geometries,material,count);mesh.frustumCulled=false;
  const marks=Array.from({length:count},()=>({age:6}));let next=0,accum=0;
  scene.add(mesh);
  return function update(dt,s,t,clear=false){
    if(clear){marks.forEach(m=>m.age=6);accum=0}
    const speed=Math.abs(s.speed),sn=Math.sin(s.heading),cs=Math.cos(s.heading);
    if(speed>.38){accum+=dt*Math.min(38,6+speed*4)}
    while(accum>=1){accum--;
      const side=next%2?1:-1,off=(.60+Math.random()*.33)*side;
      const back=s.speed>=0?1.9:-1.95;
      marks[next]={x:s.x-sn*back+cs*off,z:s.z+cs*back+sn*off,dx:cs*side*(.25+speed*.09),dz:sn*side*(.25+speed*.09),rot:-s.heading+side*.30,age:0,size:.12+Math.random()*.24};
      next=(next+1)%count;
    }
    marks.forEach((m,i)=>{
      m.age+=dt;
      if(m.age>=3.8){dummy.scale.setScalar(0)}else{
        m.x+=m.dx*dt;m.z+=m.dz*dt;
        const k=m.size*Math.max(0,1-m.age/3.8);
        dummy.position.set(m.x,surfaceHeight(m.x,m.z,t)+.048,m.z);
        dummy.rotation.y=m.rot;dummy.scale.set(k*.74,1,k*(1.7+m.age*.8));
      }
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
  };
}
