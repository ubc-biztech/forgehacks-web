import { MeshCanvas } from './mesh-canvas.js';

const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, n) => a.map(v => v * n);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a, 1 / Math.hypot(...a));
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const SILVER = 'rgba(227,228,223,.64)';
const QUIET = 'rgba(193,198,191,.22)';
const RED = '#ff553e';
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// Small orthographic mesh renderer. Geometry stays in world space; one camera
// projects all joints, circuit traces and assembly layers consistently.
class Wireframe {
  constructor(canvas) {
    this.canvas = canvas;
    this.mesh = new MeshCanvas(canvas);
    this.ctx = this.mesh.gl;
    this.width = 1;
    this.height = 1;
    this.items = [];
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.width = width;
    this.height = height;
    this.mesh.resize(width, height);
  }

  begin({ yaw = .6, elevation = .32, scale = 1, center = [0, 0, 150], offset = [.5, .5] } = {}) {
    this.items.length = 0;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    this.project = point => {
      const [x, y, z] = sub(point, center);
      const across = x * cy - y * sy;
      const depth = x * sy + y * cy;
      return [this.width * offset[0] + across * scale, this.height * offset[1] + (depth * se - z * ce) * scale, depth * ce + z * se];
    };
  }

  path(points, stroke = SILVER, fill = null, width = .7, close = false, dash = []) {
    const projected = points.map(this.project);
    this.items.push({ points: projected, stroke, fill, width, close, dash });
  }

  ring(center, radius, axis = [0, 0, 1], stroke = SILVER, segments = 32) {
    const n = unit(axis), u = unit(cross(n, Math.abs(n[2]) > .9 ? [0, 1, 0] : [0, 0, 1])), v = cross(n, u);
    const points = Array.from({ length: segments }, (_, i) => add(center, add(mul(u, Math.cos(i / segments * TAU) * radius), mul(v, Math.sin(i / segments * TAU) * radius))));
    this.path(points, stroke, null, .7, true);
  }

  cylinder(a, b, r1, r2 = r1, { stroke = SILVER, segments = 20, rings = 2, fill = 'rgba(10,12,11,.7)' } = {}) {
    const axis = unit(sub(b, a)), u = unit(cross(axis, Math.abs(axis[2]) > .9 ? [0, 1, 0] : [0, 0, 1])), v = cross(axis, u);
    const loop = (at, r) => Array.from({ length: segments }, (_, i) => add(at, add(mul(u, Math.cos(i / segments * TAU) * r), mul(v, Math.sin(i / segments * TAU) * r))));
    const base = loop(a, r1), top = loop(b, r2);
    for (let i = 0; i < segments; i++) this.path([base[i], base[(i+1)%segments], top[(i+1)%segments], top[i]], stroke, fill, .55, true);
    this.path(top, stroke, fill, .85, true);
    this.path(base, stroke, null, .85, true);
    for (let j = 1; j < rings; j++) this.path(loop(add(a, mul(sub(b, a), j / rings)), mix(r1, r2, j / rings)), QUIET, null, .5, true);
  }

  box(center, size, { stroke = SILVER, fill = 'rgba(13,15,14,.9)' } = {}) {
    const [x, y, z] = center, [w, d, h] = size.map(n => n / 2);
    const p = [[x-w,y-d,z-h],[x+w,y-d,z-h],[x+w,y+d,z-h],[x-w,y+d,z-h],[x-w,y-d,z+h],[x+w,y-d,z+h],[x+w,y+d,z+h],[x-w,y+d,z+h]];
    for (const ids of [[0,1,2,3],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]]) this.path(ids.map(i => p[i]), stroke, fill, .7, true);
  }

  beam(a, b, width, depth) {
    const axis = unit(sub(b, a)), side = unit(cross(axis, [0, 1, 0]));
    const section = (at, w) => [add(at, add(mul(side,w),[0,-depth/2,0])),add(at, add(mul(side,-w),[0,-depth/2,0])),add(at, add(mul(side,-w),[0,depth/2,0])),add(at, add(mul(side,w),[0,depth/2,0]))];
    const p = [...section(a,width/2),...section(b,width*.36)];
    for (const ids of [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]) this.path(ids.map(i => p[i]), SILVER, 'rgba(11,13,12,.82)', .9, true);
    for (let i=1;i<7;i++) this.path(section(add(a,mul(sub(b,a),i/7)),mix(width/2,width*.36,i/7)),QUIET,null,.55,true);
    for (const sign of [-1,1]) this.path([add(a,add(mul(side,width*.26),[0,sign*(depth/2+.1),0])),add(b,add(mul(side,width*.17),[0,sign*(depth/2+.1),0]))],QUIET);
  }

  render() {
    this.mesh.render(this.items);
  }
}

function armPose(time) {
  const cycle = time / 10, phase = cycle % 1;
  const source = Math.floor(cycle) % 2 ? -28 : -110;
  const destination = source === -110 ? -28 : -110;
  const poses = [
    [0, -35, 225, 24], [.12, source, 150, 24], [.24, source, 83, 24],
    [.30, source, 83, 16], [.43, source, 175, 16],
    [.59, destination, 175, 16], [.71, destination, 83, 16],
    [.77, destination, 83, 24], [.86, destination, 153, 24], [1, -35, 225, 24]
  ];
  const next = poses.findIndex(pose => pose[0] > phase);
  const a = poses[Math.max(0, next - 1)], b = poses[next];
  const t = smooth((phase - a[0]) / (b[0] - a[0]));
  const [x, z, opening] = [1, 2, 3].map(index => mix(a[index], b[index], t));
  const payload = phase < .30 ? [source, 0, 19] : phase < .71 ? [x, 0, z - 64] : [destination, 0, 19];
  return { x, z, opening, payload, phase };
}

function drawArm(r, time, pointer, scroll) {
  const pose = armPose(time);
  const scale = Math.min(r.width / 330, r.height / 320);
  r.begin({ yaw: -.5 + pointer.x * .12 + scroll * .18, elevation: .3 + pointer.y * .045, scale, center: [-8, 0, 126], offset: [.5, .5] });
  for (let i = -3; i <= 3; i++) {
    r.path([[-150,i*30,-3],[125,i*30,-3]], 'rgba(185,190,181,.09)');
    r.path([[-120+i*40,-90,-3],[-120+i*40,90,-3]], 'rgba(185,190,181,.09)');
  }
  r.ring([60,0,-2],65,[0,0,1],'rgba(255,85,62,.25)',48);
  r.box([60,0,3],[92,78,8]);
  for (const x of [25,95]) for (const y of [-28,28]) r.cylinder([x,y,7],[x,y,12],4,4,{segments:8});
  r.cylinder([60,0,8],[60,0,23],35,35,{rings:3,segments:24});
  r.cylinder([60,0,23],[60,0,52],27,23,{rings:4,segments:24});
  r.cylinder([60,0,52],[60,0,63],27,27,{segments:24});

  // Solve the shoulder and elbow together; the wrist stays vertical throughout
  // the work cycle, and both links retain their actual lengths.
  const shoulder = [60,0,78], wrist = [pose.x,0,pose.z];
  const dx = wrist[0] - shoulder[0], dz = wrist[2] - shoulder[2];
  const reach = Math.hypot(dx, dz), upper = 149, forearm = 130;
  const angle = Math.atan2(dz, dx) - Math.acos(clamp((upper*upper + reach*reach - forearm*forearm) / (2*upper*reach), -1, 1));
  const elbow = add(shoulder, [Math.cos(angle)*upper,0,Math.sin(angle)*upper]);
  r.beam(shoulder, elbow, 40, 36);
  r.beam(elbow, wrist, 31, 29);
  const joint = (point, radius, depth) => {
    r.cylinder(add(point,[0,-depth/2,0]),add(point,[0,depth/2,0]),radius,radius,{rings:3,segments:24});
    for (const sign of [-1,1]) {
      r.ring(add(point,[0,sign*(depth/2+.3),0]),radius*.76,[0,1,0],SILVER,24);
      r.ring(add(point,[0,sign*(depth/2+.4),0]),radius*.43,[0,1,0],QUIET,24);
      for (let i=0;i<6;i++) {
        const theta=i/6*TAU;
        r.ring(add(point,[Math.cos(theta)*radius*.83,sign*(depth/2+.6),Math.sin(theta)*radius*.83]),1.6,[0,1,0],QUIET,8);
      }
    }
  };
  joint(shoulder,29,53); joint(elbow,25,48); joint(wrist,17,35);
  r.cylinder(wrist,add(wrist,[0,0,-26]),12,11,{rings:3,segments:20});
  r.box(add(wrist,[0,0,-32]),[56,18,10]);
  for (const sign of [-1,1]) {
    const root = add(wrist,[sign*pose.opening,0,-37]);
    const tip = add(wrist,[sign*pose.opening,0,-64]);
    r.beam(root,tip,5,13);
    r.beam(tip,add(tip,[-sign*5,0,0]),4,13);
  }
  const cable = [];
  const start = add(shoulder,[-22,-25,0]), middle = add(elbow,[0,-29,20]), end = add(wrist,[0,-22,0]);
  for (let i=0;i<=32;i++) {
    const t=i/32,u=1-t;
    cable.push(add(add(mul(start,u*u),mul(middle,2*u*t)),mul(end,t*t)));
  }
  r.path(cable,'rgba(230,232,225,.7)',null,1.4);
  r.path(cable.map(point=>add(point,[-3,0,0])),QUIET,null,.8);
  r.ring(add(elbow,[0,24.5,0]),18,[0,1,0],RED,32);

  for (const x of [-110,-28]) {
    const occupied = Math.abs(pose.payload[0]-x)<1 && pose.payload[2]<20;
    r.box([x,0,8],[51,50,8],{stroke:QUIET});
    r.box([x,0,12.5],[43,42,1],{stroke:'rgba(255,85,62,.5)',fill:'rgba(36,24,20,.95)'});
    for (const side of [-1,1]) for (let i=0;i<4;i++) {
      const y=-12+i*8;
      r.path([[x+side*13,y,13.2],[x+side*20,y,13.2]],occupied?'rgba(255,85,62,.8)':QUIET);
    }
    r.ring([x,0,13.3],15,[0,0,1],QUIET,32);
  }
  r.box(pose.payload,[22,24,10],{stroke:RED,fill:'rgba(49,24,18,.98)'});
  r.box(add(pose.payload,[0,0,5.5]),[15,17,1],{stroke:'rgba(255,155,127,.85)'});
  for (const side of [-1,1]) for (let i=0;i<4;i++) {
    const y=-9+i*6;
    r.path([add(pose.payload,[side*11,y,0]),add(pose.payload,[side*15,y,-3])],SILVER);
  }
  r.render();
}

function drawAssembly(r, time, pointer, progress) {
  const spread=1-clamp(progress), seatedBoard=24;
  const board=seatedBoard+(1-smooth((progress-.12)/.4))*63;
  const top=50+(1-smooth((progress-.52)/.36))*133;
  const scale=Math.min(r.width/330,r.height/340)*mix(1.14,1.5,1-spread);
  r.begin({yaw:.62+pointer.x*.15+progress*.16,elevation:.48+pointer.y*.06,scale,center:[0,0,mix(91,28,1-spread)],offset:[.5,.54]});
  // Mounts stay on the base. Only the board translates; the dashed gap is an
  // assembly guide, not a post that changes length as the user scrolls.
  for(const x of [-67,67]) for(const y of [-46,46]) {
    r.cylinder([x,y,3.5],[x,y,seatedBoard-1.5],2.8,2.8,{stroke:QUIET,segments:12});
    if(board-seatedBoard>.5) r.path([[x,y,seatedBoard-1.5],[x,y,board-1.5]],'rgba(255,85,62,'+(.2*(board-seatedBoard)/63)+')',null,.6,false,[2,5]);
  }
  r.box([0,0,0],[158,116,7],{stroke:'rgba(220,225,215,.4)'});
  r.box([0,0,board],[150,108,3],{stroke:SILVER,fill:'rgba(40,25,21,.92)'});
  for(const x of [-67,67]) for(const y of [-46,46]) r.ring([x,y,board+1.7],3,[0,0,1],RED,12);
  for(let i=0;i<10;i++) {
    const y=-37+i*8;
    r.path([[-61,y,board+2],[-39,y,board+2],[-27,y*.55,board+2],[-15,y*.55,board+2]],i%3===0?'rgba(255,85,62,.7)':QUIET);
    r.path([[15,y*.55,board+2],[28,y*.55,board+2],[40,y,board+2],[58,y,board+2]],QUIET);
    r.ring([-61,y,board+2],1.2,[0,0,1],SILVER,8);
  }
  const chipZ=board+8+(1-smooth((progress-.38)/.3))*22;
  r.box([0,0,chipZ],[35,35,8],{stroke:RED});
  r.box([0,0,chipZ+4.2],[25,25,.6],{stroke:QUIET});
  for(let i=0;i<8;i++) for(const sign of [-1,1]) {
    const n=-14+i*4;
    // Pins move with the chip and meet fixed pads when it seats.
    r.path([[sign*17.5,n,chipZ],[sign*21,n,chipZ],[sign*23,n,chipZ-6],[sign*25,n,chipZ-6]],SILVER);
    r.path([[n,sign*17.5,chipZ],[n,sign*21,chipZ],[n,sign*23,chipZ-6],[n,sign*25,chipZ-6]],SILVER);
    r.box([sign*24,n,board+1.85],[3,2,.4],{stroke:QUIET,fill:'#343630'});
    r.box([n,sign*24,board+1.85],[2,3,.4],{stroke:QUIET,fill:'#343630'});
  }
  for(let i=0;i<12;i++) for(const y of [-47,47]) {
    const x=-43+i*7.8;
    r.box([x,y,board+6],[5,7,8],{stroke:QUIET});
    r.cylinder([x,y,board+10],[x,y,board+14],.7,.7,{segments:4,stroke:SILVER});
  }
  r.box([-68,0,board+7],[16,18,10]);
  r.box([-77,0,board+7],[.7,12,5],{stroke:SILVER,fill:'#050606'});
  for(const y of [-26,26]) r.cylinder([49,y,board+2],[49,y,board+14],5,5,{rings:2,segments:12});
  // The display's rigid connector mates with a socket on the board.
  r.box([0,32,board+5],[45,5,7],{stroke:QUIET});
  for(const x of [-19,-6,7,20]) {
    r.ring([x,32,board+8.6],1,[0,0,1],QUIET,8);
    r.path([[x,26,top-2.5],[x,32,top-7],[x,32,top-17.5]],SILVER);
  }
  const connectorGap=top-17.5-(board+8.5);
  if(connectorGap>.5) for(const x of [-19,20]) r.path([[x,32,board+8.5],[x,32,top-17.5]],'rgba(255,85,62,'+(.16*clamp(connectorGap/70))+')',null,.6,false,[2,5]);
  r.box([0,0,top],[79,57,5],{stroke:SILVER});
  r.box([0,0,top+3],[65,43,.8],{stroke:'rgba(255,85,62,.75)',fill:'rgba(8,9,8,.95)'});
  const wave=[];
  for(let i=0;i<=48;i++) {
    const x=-27+i*54/48;
    wave.push([x,Math.sin(i*.28-time*1.4)*7*clamp((progress-.9)/.1),top+3.6]);
  }
  r.path(wave,'rgba(255,85,62,.9)',null,1);
  r.render();
}

export function mountHardware(canvas, { reducedMotion, getProgress = () => 0 }) {
  const renderer=new Wireframe(canvas);
  if(!renderer.ctx) return;
  let visible=false, frame=0, last=0, elapsed=0, pointer={x:0,y:0}, target={x:0,y:0}, progress=0;
  const isArm=canvas.dataset.scene==='arm';
  const draw=isArm?drawArm:drawAssembly;
  const parent=canvas.parentElement;
  const fine=matchMedia('(pointer: fine)');

  function render(now) {
    frame=0;
    if(!visible||document.hidden||renderer.mesh.lost) return;
    const nextProgress = reducedMotion.matches ? (isArm ? 0 : 1) : getProgress();
    const dt=last?Math.min((now-last)/1000,.05):0;
    last=now;
    if(!reducedMotion.matches) elapsed+=dt;
    const ease=reducedMotion.matches?1:1-Math.exp(-dt*7);
    pointer.x=mix(pointer.x,target.x,ease);
    pointer.y=mix(pointer.y,target.y,ease);
    // Scroll is the timeline. Smoothing it separately makes the model trail its
    // progress line, and a fast reverse can continue assembling in the wrong direction.
    progress=nextProgress;
    draw(renderer,elapsed,pointer,progress);
    parent.classList.add('scene-ready');
    const pointerMoving = Math.abs(pointer.x-target.x)+Math.abs(pointer.y-target.y)>.001;
    if(!reducedMotion.matches&&(isArm||progress>.9||pointerMoving)) frame=requestAnimationFrame(render);
  }
  function wake() {if(!frame&&visible&&!document.hidden) frame=requestAnimationFrame(render);}
  function stop() {cancelAnimationFrame(frame);frame=0;last=0;}
  renderer.mesh.onLost=()=>{stop();parent.classList.remove('scene-ready');};
  renderer.mesh.onRestore=()=>{renderer.resize();wake();};
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();else stop();});
  observer.observe(parent);
  const resize=new ResizeObserver(()=>{renderer.resize();wake();});
  resize.observe(parent);
  parent.addEventListener('pointermove',event=>{
    if(!fine.matches||reducedMotion.matches) return;
    const rect=parent.getBoundingClientRect();
    target={x:clamp((event.clientX-rect.left)/rect.width*2-1,-1,1),y:clamp((event.clientY-rect.top)/rect.height*2-1,-1,1)};
    wake();
  },{passive:true});
  parent.addEventListener('pointerleave',()=>{target={x:0,y:0};wake();});
  document.addEventListener('visibilitychange',()=>document.hidden?stop():wake());
  reducedMotion.addEventListener('change',()=>{stop();target={x:0,y:0};wake();});
  renderer.resize();
  return { wake };
}

function drawFigure(r, kind, active, time) {
  r.begin({yaw:.65,elevation:.44,scale:Math.min(r.width/230,r.height/160),center:[0,0,29],offset:[.5,.57]});
  if(kind==='network') {
    const points=[[-57,-20,0],[36,-36,0],[40,43,0]];
    for(const p of points) r.path([[0,0,0],p],'rgba(255,85,62,.65)');
    r.box([0,0,5],[28,28,10],{stroke:RED});
    points.forEach((p,i)=>{
      const z=7+active*(i===1?23:10);
      r.box([p[0],p[1],z],[38,46,4]);
      r.ring([p[0],p[1]-9,z+2.5],5,[0,0,1],SILVER,16);
      r.path([[p[0]-9,p[1]+3,z+2.5],[p[0]+9,p[1]+3,z+2.5]],QUIET);
      r.path([[p[0]-6,p[1]+9,z+2.5],[p[0]+6,p[1]+9,z+2.5]],QUIET);
    });
  } else if(kind==='chip') {
    r.box([0,0,0],[88,88,3],{stroke:QUIET});
    const z=13+active*23;
    r.box([0,0,z],[54,54,12],{stroke:RED});
    r.box([0,0,z+6.5],[36,36,1]);
    for(let i=0;i<8;i++) for(const sign of [-1,1]) {
      const n=-21+i*6;
      r.path([[sign*28,n,z],[sign*36,n,z-5],[sign*36,n,2]],SILVER);
      r.path([[n,sign*28,z],[n,sign*36,z-5],[n,sign*36,2]],SILVER);
      r.path([[sign*36,n,1],[sign*43,n,1]],QUIET);
    }
  } else if(kind==='scope') {
    r.box([0,0,24],[104,47,65]);
    r.path([[-43,24,45],[24,24,45],[24,24,8],[-43,24,8]],RED,'#090a09',.8,true);
    for(let i=0;i<5;i++) r.path([[-40,24.2,13+i*6],[21,24.2,13+i*6]],QUIET,null,.4);
    const wave=[];
    for(let i=0;i<=64;i++) wave.push([-40+i*61/64,24.4,27+Math.sin(i*.24-time*2)*11*(.3+active*.7)]);
    r.path(wave,RED,null,.95);
    for(const z of [14,34,48]) {
      r.cylinder([37,24,z],[37,29,z],4,4,{segments:12});
      r.path([[37,29.1,z],[37+Math.cos(active*3)*3,29.1,z+Math.sin(active*3)*3]],RED);
    }
    r.box([-31,0,-11],[9,34,5]);r.box([31,0,-11],[9,34,5]);
  } else {
    for(let i=0;i<3;i++) {
      const x=(i-1)*active*34, z=i*(9+active*11);
      r.box([x,0,z],[76,56,3],{stroke:i===1?RED:SILVER});
      for(const dx of [-30,30]) for(const y of [-21,21]) r.ring([x+dx,y,z+1.7],2,[0,0,1],QUIET,8);
      r.box([x,0,z+6],[21,18,9],{stroke:QUIET});
    }
  }
  r.render();
}

export function mountFigure(element, reducedMotion) {
  const canvas=document.createElement('canvas');
  element.append(canvas);
  const r=new Wireframe(canvas);
  if(!r.ctx) return;
  const card=element.closest('article');
  let visible=false, hovered=false, active=0, target=0, frame=0, last=0, time=0, previewed=false, previewTimer;
  function tick(now) {
    frame=0;
    if(!visible||document.hidden||r.mesh.lost) return;
    const dt=Math.min((now-last)/1000,.05)||.016;last=now;time+=dt;
    active=reducedMotion.matches?0:mix(active,target,1-Math.exp(-dt*7));
    drawFigure(r,element.dataset.figure,active,time);
    if(!reducedMotion.matches&&(Math.abs(active-target)>.002||(hovered&&element.dataset.figure==='scope'))) frame=requestAnimationFrame(tick);
  }
  function wake(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(tick);}
  function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
  r.mesh.onLost=stop;
  r.mesh.onRestore=()=>{r.resize();wake();};
  const observer=new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(!visible){stop();return;}
    if(!previewed&&!reducedMotion.matches){previewed=true;target=1;previewTimer=setTimeout(()=>{if(!hovered)target=0;wake();},1100);}
    wake();
  },{threshold:.25});
  observer.observe(element);
  new ResizeObserver(()=>{r.resize();wake();}).observe(element);
  card.addEventListener('pointerenter',()=>{hovered=true;target=1;wake();});
  card.addEventListener('pointerleave',()=>{hovered=false;target=0;wake();});
  reducedMotion.addEventListener('change',()=>{clearTimeout(previewTimer);target=0;stop();wake();});
  document.addEventListener('visibilitychange',()=>document.hidden?stop():wake());
  r.resize();
}
