import './style.css';
import * as THREE from 'three';
import { createBoat } from './boat.js';
import { createHarbor } from './harbor.js';
import { createNavigation } from './physics.js';
import { createSea, addSky, surfaceHeight, createWake } from './sea.js';
import { createHarborAudio } from './audio.js';
import { drawChart } from './chart.js';
import { icon, loadIcons } from './icons.js';

const get=id=>document.getElementById(id);
const viewport=get('viewport'),guide=get('guide'),chartDialog=get('chart-dialog');
const held=new Set(),touches=new Map(),audio=createHarborAudio();
let navigation,harbor,scene,renderer,camera,boat,sea,wake;
let paused=false,viewMode=0,clock=0,frameTime=0,hudTime=0,toastTimer,drag=null,orbit=0;
const look=new THREE.Vector3(),wantedLook=new THREE.Vector3(),wantedEye=new THREE.Vector3();
const pointer=new THREE.Vector2(),ray=new THREE.Raycaster(),waterPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
let cameraHeading=0;
loadIcons();
get('speed-scale').innerHTML='<b></b>'.repeat(20);

function notice(message){
  const el=get('notice');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1400);
}
function clearInput(){held.clear();touches.clear();document.querySelectorAll('[data-drive].active').forEach(el=>el.classList.remove('active'))}
function setPause(value){
  paused=value;clearInput();
  get('pause').classList.toggle('stopped',paused);get('pause').setAttribute('aria-label',paused?'继续航行':'暂停航行');
  get('pause').querySelector('i').innerHTML=icon(paused?'play':'pause');
  get('pause-label').textContent=paused?'已暂停':'模拟运行中';
  get('pause-screen').hidden=!paused;audio.update(navigation?.state.speed??0,paused);
}
function modalOpen(){return guide.open||chartDialog.open}
function showDialog(el){if(!navigation||modalOpen())return;clearInput();el.showModal();if(el===chartDialog)paintCharts(navigation.state);audio.update(0,true)}
function switchView(){
  if(!navigation||modalOpen())return;
  viewMode=(viewMode+1)%2;orbit=0;
  get('view-label').textContent=['跟随视角','高位视角'][viewMode];
}
get('pause').onclick=()=>setPause(!paused);
get('resume').onclick=()=>setPause(false);
get('help').onclick=()=>showDialog(guide);
get('chart-button').onclick=()=>showDialog(chartDialog);
get('view').onclick=switchView;
get('sound').onclick=async()=>{
  try {
    const enabled=await audio.toggle();
    get('sound').querySelector('i').innerHTML=icon(enabled?'sound':'muted');
    get('sound').setAttribute('aria-pressed',String(enabled));
    get('sound').title=enabled?'关闭海港声音':'开启海港声音';
    get('sound').setAttribute('aria-label',get('sound').title);
    audio.update(navigation?.state.speed??0,paused||modalOpen());
  }catch{notice('当前浏览器未能开启声音')}
};
for(const dialog of [guide,chartDialog]){
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()});
  dialog.addEventListener('close',()=>{clearInput();if(navigation)audio.update(navigation.state.speed,paused)});
}
get('return').onclick=()=>{
  navigation.reset();clearInput();orbit=0;viewMode=0;get('view-label').textContent='跟随视角';
  updateCamera(navigation.state,1,true);wake(0,navigation.state,clock,true);
  guide.close();setPause(false);notice('已回到西侧泊位');
};
const bindings={KeyW:'forward',ArrowUp:'forward',KeyS:'reverse',ArrowDown:'reverse',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'brake'};
window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||!navigation)return;
  if(modalOpen()){if(e.code==='KeyM'&&chartDialog.open){e.preventDefault();chartDialog.close()}return}
  if(e.code==='Space'&&e.target instanceof HTMLButtonElement&&e.target.matches(':focus-visible'))return;
  if(bindings[e.code]){e.preventDefault();if(!paused)held.add(e.code);return}
  if(e.repeat)return;
  if(e.code==='KeyP')setPause(!paused);
  if(e.code==='KeyC')switchView();
  if(e.code==='KeyM')showDialog(chartDialog);
});
window.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();audio.update(0,true)}frameTime=0});
for(const button of document.querySelectorAll('[data-drive]')){
  button.onpointerdown=e=>{e.preventDefault();if(paused||modalOpen())return;button.setPointerCapture(e.pointerId);touches.set(e.pointerId,button.dataset.drive);button.classList.add('active')};
  const release=e=>{touches.delete(e.pointerId);button.classList.remove('active')};
  button.onpointerup=release;button.onpointercancel=release;button.onlostpointercapture=release;
}
function inputs(){
  const pressed=new Set(touches.values());for(const key of held)pressed.add(bindings[key]);
  return {throttle:Number(pressed.has('forward'))-Number(pressed.has('reverse')),steer:Number(pressed.has('right'))-Number(pressed.has('left')),brake:pressed.has('brake')||(pressed.has('forward')&&pressed.has('reverse'))};
}

function compassAt(deg) {
  const canvas=get('compass'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2);
  if(!w||!h)return;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#46635ed9';ctx.fillStyle='#2d4c49';ctx.textAlign='center';ctx.font='bold 10px Menlo, monospace';
  const dirs=['N','NE','E','SE','S','SW','W','NW'],px=w<160?2.1:2.9;
  for(let tick=Math.floor((deg-w/(2*px))/5)*5;tick<=deg+w/(2*px);tick+=5){
    const x=w/2+(tick-deg)*px,mark=((tick%360)+360)%360,major=mark%15===0;
    ctx.beginPath();ctx.moveTo(x,8);ctx.lineTo(x,major?16:12);ctx.stroke();
    if(major)ctx.fillText(mark%45===0?dirs[mark/45]:mark,x,28);
  }
}
function paintCharts(state){
  drawChart(get('minimap'),state,harbor.obstacles,harbor.mapFeatures);
  if(chartDialog.open)drawChart(get('bigmap'),state,harbor.obstacles,harbor.mapFeatures,true);
}
function updateHud(s){
  const speed=Math.abs(s.speed)*1.94384,deg=(Math.round(THREE.MathUtils.radToDeg(s.heading))+360)%360;
  get('speed').textContent=(s.speed<-.07?'−':'')+speed.toFixed(1);get('heading').textContent=String(deg).padStart(3,'0');
  get('location').textContent=Math.hypot(s.x+5.8,s.z-2)<17?'西侧泊位':Math.hypot(s.x+24,s.z+26)<24?'灯塔岬角':s.z < -60?'外湾航道':'青岬内湾';
  const bars=get('speed-scale').children;for(let i=0;i<bars.length;i++)bars[i].classList.toggle('lit',i===0||i<speed/17*bars.length);
  compassAt(deg);paintCharts(s);
}

function updateCamera(s,dt,snap=false){
  const angleDelta=Math.atan2(Math.sin(s.heading-cameraHeading),Math.cos(s.heading-cameraHeading));
  cameraHeading=snap?s.heading:cameraHeading+angleDelta*(1-Math.exp(-dt*2.8));
  const aspect=viewport.clientWidth/Math.max(1,viewport.clientHeight);
  const portrait=aspect<.85;
  const followAngle=(portrait?.76:.66)+orbit-cameraHeading;
  const flat=viewMode===0?(portrait?14:12.4):(portrait?21:22);
  const height=viewMode===0?(portrait?6.2:5.5):16;
  wantedEye.set(s.x+Math.sin(followAngle)*flat,height,s.z+Math.cos(followAngle)*flat);
  const ahead=portrait?1.1:1.7;
  wantedLook.set(s.x+Math.sin(cameraHeading)*ahead,viewMode===0?(portrait?2.1:2.95):1.0,s.z-Math.cos(cameraHeading)*ahead);
  const k=snap?1:1-Math.exp(-dt*4.5);
  camera.position.lerp(wantedEye,k);look.lerp(wantedLook,k);camera.lookAt(look);
}
function onResize(){
  if(!renderer)return;const w=viewport.clientWidth,h=viewport.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.fov=w/h<.85?53:46;camera.updateProjectionMatrix();
  if(navigation)updateHud(navigation.state);
}
function addLighting(){
  scene.add(new THREE.HemisphereLight('#fffae6','#9cb4a6',1.85));
  const sun=new THREE.DirectionalLight('#fff0cb',2.5);
  sun.position.set(-23,38,24);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:.5,far:145});
  sun.shadow.mapSize.set(1536,1536);sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;
  sun.target.position.set(-8,0,-10);scene.add(sun,sun.target);
}
function waterInteraction(){
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{if(paused||modalOpen()||drag||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:orbit,moved:false};canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;if(Math.abs(dx)+Math.abs(e.clientY-drag.y)>6)drag.moved=true;if(drag.moved)orbit=drag.start-dx*.007});
  canvas.addEventListener('pointerup',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    if(!drag.moved&&!paused){const rect=canvas.getBoundingClientRect();pointer.set(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height);ray.setFromCamera(pointer,camera);
      const p=ray.ray.intersectPlane(waterPlane,new THREE.Vector3());if(p)sea.disturb(p.x,p.z,clock)}
    drag=null;
  });
  canvas.addEventListener('lostpointercapture',()=>drag=null);
}

function frame(ms){
  const dt=frameTime?Math.min((ms-frameTime)/1000,.1):0;frameTime=ms;
  if(document.hidden)return;
  const stopped=paused||modalOpen(),control=inputs();
  if(!stopped){navigation.step(dt,control);clock+=dt}
  const s=navigation.state;
  if(!stopped){
    boat.position.set(s.x,surfaceHeight(s.x,s.z,clock),s.z);
    boat.rotation.order='YXZ';boat.rotation.y=-s.heading;
    const dz=.9,cs=Math.cos(s.heading),sn=Math.sin(s.heading);
    boat.rotation.x=.66*(surfaceHeight(s.x+sn*dz,s.z-cs*dz,clock)-surfaceHeight(s.x-sn*dz,s.z+cs*dz,clock))/(2*dz);
    boat.rotation.z=.07*Math.sin(clock*.94+s.x*.28)+s.turnRate*Math.min(.17,Math.abs(s.speed)*.028);
    boat.userData.update(clock,s.speed,control.steer);sea.update(clock);wake(dt,s,clock);
    updateCamera(s,dt);audio.update(s.speed,false);
  }
  hudTime+=dt;if(hudTime>.11){updateHud(s);hudTime=0}
  renderer.render(scene,camera);
}
async function start(){
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.65));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.99;
  renderer.domElement.setAttribute('aria-label','驾驶场景，拖动环顾小船，点水面产生涟漪');viewport.append(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(46,1,.16,540);
  addSky(scene);addLighting();harbor=createHarbor();scene.add(harbor.group);
  boat=createBoat();scene.add(boat);sea=createSea(scene);wake=createWake(scene);
  navigation=await createNavigation(harbor.obstacles);boat.position.set(0,0,2);
  waterInteraction();onResize();updateCamera(navigation.state,1,true);wake(0,navigation.state,0,true);
  window.addEventListener('resize',onResize);updateHud(navigation.state);
  renderer.setAnimationLoop(frame);get('loading').hidden=true;
}
start().catch(error=>{
  console.error(error);get('loading').querySelector('.loading-wheel').hidden=true;
  get('loading-text').textContent='港口未能载入。请使用支持 WebGL 2 的浏览器，开启图形加速后刷新。';
});
