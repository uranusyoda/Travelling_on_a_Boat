import * as THREE from 'three';

const sunMist=new THREE.Color('#cddacc');
const rainMist=new THREE.Color('#93a9a7');
const stormMist=new THREE.Color('#52666d');
const denseMist=new THREE.Color('#c2cdc8');
const lightningColor=new THREE.Color('#f2f0da');
const clamp=THREE.MathUtils.clamp;

function rainField(scene) {
  const count=760, seeds=new Float32Array(count*2*3), positions=new Float32Array(count*2*3);
  let bits=17413;
  const random=()=>{bits=(Math.imul(bits,1664525)+1013904223)>>>0;return bits/4294967296;};
  for(let i=0;i<count;i++){
    const a=random(),b=random(),c=random();
    for(let end=0;end<2;end++) {
      const index=(i*2+end)*3;
      seeds.set([a,b,c],index);
      positions[index+1]=end;
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,3));
  const uniforms={
    t:{value:0},translation:{value:new THREE.Vector2()},viewer:{value:new THREE.Vector3()},
    wind:{value:new THREE.Vector2()},amount:{value:0},color:{value:new THREE.Color('#e1e8e2')}
  };
  const mat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms,
    vertexShader:`attribute vec3 seed;uniform float t,amount;uniform vec2 translation,wind;uniform vec3 viewer;varying float alpha;
    void main(){
      vec2 p=viewer.xz+mod(seed.xz*41.+translation-viewer.xz+20.5,41.)-20.5;
      float y=mod(seed.y*34.-t*(10.5+seed.x*3.0),34.);
      float tip=position.y;
      vec2 lean=wind*(.015+.008*seed.y)*tip;
      vec3 drop=vec3(p.x-lean.x,y+tip*(.45+.27*seed.y),p.y-lean.y);
      float d=length(drop-viewer);
      alpha=(.21+.29*seed.z)*amount*smoothstep(.42,2.,d)*(1.-smoothstep(14.,26.,d));
      gl_Position=projectionMatrix*viewMatrix*vec4(drop,1.);
    }`,
    fragmentShader:`varying float alpha;uniform vec3 color;void main(){gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
    }`
  });
  const drops=new THREE.LineSegments(geometry,mat);
  drops.name='Windblown rain';drops.frustumCulled=false;drops.renderOrder=4;
  drops.visible=false;scene.add(drops);
  return function(dt,t,e,camera){
    drops.visible=e.rain>.007;
    uniforms.t.value=t;
    uniforms.translation.value.x+=dt*e.windSpeed*e.windX*.56;
    uniforms.translation.value.y+=dt*e.windSpeed*e.windZ*.56;
    uniforms.viewer.value.copy(camera.position);
    uniforms.wind.value.set(e.windX*e.windSpeed,e.windZ*e.windSpeed);
    uniforms.amount.value=e.rain;
    geometry.setDrawRange(0,2*Math.ceil(count*clamp(e.rain,0,1)));
  };
}

function lightning(scene) {
  const positions=new Float32Array(96*3);
  const geometry=new THREE.BufferGeometry();
  const positionAttribute=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positionAttribute);
  const material=new THREE.LineBasicMaterial({color:'#f0f3df',transparent:true,opacity:0,depthWrite:false,fog:false});
  const bolt=new THREE.LineSegments(geometry,material);
  bolt.name='Distant lightning';bolt.frustumCulled=false;bolt.renderOrder=2;
  bolt.visible=false;scene.add(bolt);
  const forward=new THREE.Vector3();
  let timeToStrike=2.2,age=Infinity;
  function strike(camera){
    camera.getWorldDirection(forward);
    forward.y=0;forward.normalize();
    const distance=73+Math.random()*20, side=(Math.random()-.5)*distance*.74;
    const x=camera.position.x+forward.x*distance-forward.z*side;
    const z=camera.position.z+forward.z*distance+forward.x*side;
    const start=new THREE.Vector3(x+4,30+Math.random()*5,z);
    let idx=0;
    function segment(a,b) {
      positions.set([a.x,a.y,a.z,b.x,b.y,b.z],idx);idx+=6;
    }
    let a=start;
    for(let i=0;i<11;i++){
      const b=a.clone();
      b.x+=(Math.random()-.69)*3.3;b.z+=(Math.random()-.5)*1.9;b.y-=start.y/11;
      segment(a,b);
      if(i===3 || i===6){
        const sign=i===3?-1:1;
        let twig=a;
        for(let j=0;j<3;j++){
          const tip=twig.clone().add(new THREE.Vector3(sign*(1+Math.random()*2.1),-1.8-Math.random(),(Math.random()-.5)*2));
          segment(twig,tip);twig=tip;
        }
      }
      a=b;
    }
    geometry.setDrawRange(0,idx/3);positionAttribute.needsUpdate=true;
  }
  return (dt,storm,camera)=>{
    if(storm<.14){timeToStrike=2.2;age=Infinity;bolt.visible=false;return 0;}
    timeToStrike-=dt*(.35+.65*storm);
    if(timeToStrike<=0){
      strike(camera);age=0;timeToStrike=10.5+Math.random()*7.5;
    }else age+=dt;
    const flash=age<.46 ? storm*Math.exp(-age*8.5) : 0;
    bolt.visible=flash>.035;
    material.opacity=Math.min(.95,flash*2.5);
    return flash;
  };
}

export function addSky(scene) {
  const uniforms={
    zenith:{value:new THREE.Color('#78adc3')},horizon:{value:sunMist.clone()},
    fairCloud:{value:new THREE.Color('#fbf1d7')},rainSky:{value:new THREE.Color('#758e94')},
    stormSky:{value:new THREE.Color('#394d60')},cloudBase:{value:new THREE.Color('#9aabb0')},
    stormCloud:{value:new THREE.Color('#455865')},windScroll:{value:new THREE.Vector2()},
    overcast:{value:0},fogLevel:{value:0},storm:{value:0},flash:{value:0}
  };
  const sky=new THREE.Mesh(new THREE.SphereGeometry(437,36,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms,
    vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      uniform vec3 zenith,horizon,fairCloud,rainSky,stormSky,cloudBase,stormCloud;
      uniform vec2 windScroll;uniform float overcast,fogLevel,storm,flash;varying vec3 dir;
      float h(vec2 p){return fract(sin(dot(p,vec2(31.445,92.671)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 d=normalize(dir);float up=clamp(d.y,0.,1.);
        vec3 upper=mix(zenith,rainSky,overcast);upper=mix(upper,stormSky,storm);
        vec3 col=mix(horizon,upper,pow(clamp(up*1.8,0.,1.),.60));
        vec2 uv=d.xz/max(.026,up+.035)*vec2(.47,1.1)-windScroll;
        float v=n(uv)*.54+n(uv*2.1)*.28+n(uv*4.4)*.13+n(uv*8.1)*.05;
        float coverage=smoothstep(mix(.60,.24,overcast),mix(.76,.63,overcast),v);
        float visible=smoothstep(.007,.085,up)*(1.-smoothstep(.38,1.32,up)*(1.-overcast));
        vec3 cloud=mix(fairCloud,mix(cloudBase,stormCloud,storm)*(.72+.53*v),overcast);
        col=mix(col,cloud,coverage*visible*mix(.70,.95,overcast));
        col=mix(col,horizon,fogLevel*(.86-.22*up));
        col=mix(col,vec3(.90,.91,.85),flash*(.26+.16*(1.-up)));
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`
  }));
  sky.name='Coastal atmosphere';sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  scene.background=sunMist.clone();scene.fog=new THREE.FogExp2(sunMist,.0065);
  const rain=rainField(scene),bolt=lightning(scene);
  function update(dt,t,env,camera) {
    sky.position.copy(camera.position);
    const flash=bolt(dt,env.storm,camera);
    const horizon=uniforms.horizon.value.copy(sunMist).lerp(rainMist,env.overcast)
      .lerp(stormMist,env.storm).lerp(denseMist,env.fog*.90).lerp(lightningColor,flash*.35);
    scene.fog.color.copy(horizon);scene.background.copy(horizon);
    scene.fog.density=.0065+.005*env.rain+.043*env.fog+.005*env.storm;
    uniforms.overcast.value=env.overcast;uniforms.storm.value=env.storm;
    uniforms.fogLevel.value=env.fog;uniforms.flash.value=flash;
    const drift=dt*(.0007+.0012*env.windSpeed);
    uniforms.windScroll.value.x+=drift*env.windX;
    uniforms.windScroll.value.y+=drift*env.windZ;
    rain(dt,t,env,camera);
    return flash;
  }
  update.update=update;
  return update;
}
