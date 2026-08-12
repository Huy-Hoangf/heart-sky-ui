const canvas = document.getElementById('heartCanvas');
const app = document.getElementById('app');
const modePanel = document.getElementById('modePanel');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const launchWrap = document.getElementById('launchWrap');
const launchButton = document.getElementById('launchButton');
const buttons = [...document.querySelectorAll('.mode-btn')];
const HOLD_DURATION = 200;

window.addEventListener('error', () => app?.classList.add('render-fallback'));

// 2-tone heart palettes: heart colors deliberately sit apart from each background.
const themes = {
  predawn: {
    label: 'Pre-dawn', icon: 'orbit',
    rayA: [1.00, 0.88, 0.50], rayB: [1.00, 0.26, 0.58],
    bgA: [0.36, 0.32, 0.68], bgB: [0.18, 0.18, 0.44], bgC: [0.05, 0.08, 0.24],
  },
  sunrise: {
    label: 'Sunrise', icon: 'sunrise',
    rayA: [0.05, 0.12, 0.72], rayB: [0.62, 0.92, 0.95],
    bgA: [1.00, 0.78, 0.52], bgB: [0.94, 0.42, 0.30], bgC: [0.98, 0.62, 0.38],
  },
  daytime: {
    label: 'Daytime', icon: 'sun',
    rayA: [0.92, 0.10, 0.34], rayB: [1.00, 0.70, 0.18],
    bgA: [0.58, 0.92, 0.84], bgB: [0.32, 0.72, 0.78], bgC: [0.70, 0.88, 0.58],
  },
  dusk: {
    label: 'Dusk', icon: 'dusk',
    rayA: [1.00, 0.90, 0.70], rayB: [0.70, 0.98, 0.86],
    bgA: [0.62, 0.28, 0.56], bgB: [0.36, 0.16, 0.42], bgC: [0.18, 0.16, 0.36],
  },
  sunset: {
    label: 'Sunset', icon: 'sunset',
    rayA: [0.00, 0.18, 0.98], rayB: [0.22, 1.00, 1.00],
    bgA: [0.88, 0.30, 0.18], bgB: [0.54, 0.08, 0.28], bgC: [0.22, 0.10, 0.44],
  },
  night: {
    label: 'Night', icon: 'moon',
    rayA: [1.00, 0.82, 0.42], rayB: [0.96, 0.30, 0.56],
    bgA: [0.10, 0.26, 0.34], bgB: [0.04, 0.12, 0.24], bgC: [0.02, 0.04, 0.12],
  },
};

let W = innerWidth, H = innerHeight, dpr = 1;
let lastTime = performance.now(), elapsed = 0;
let activeTheme = 'daytime';
let rayA = [...themes.daytime.rayA], rayB = [...themes.daytime.rayB];
let bgA = [...themes.daytime.bgA], bgB = [...themes.daytime.bgB], bgC = [...themes.daytime.bgC];
let targetRayA=[...rayA], targetRayB=[...rayB], targetBgA=[...bgA], targetBgB=[...bgB], targetBgC=[...bgC];
let idleMix = 1, idleMixV = 0, idleTarget = 1;
let launched = false, reveal = 0, revealV = 0, revealTarget = 0;
let holdActive = false, holdReady = false, holdStart = 0, holdFrame = 0;

const pointer = {
  tx: innerWidth*.5, ty: innerHeight*.5,
  x: innerWidth*.5, y: innerHeight*.5,
  prevX: innerWidth*.5, prevY: innerHeight*.5,
  vx:0, vy:0, down:false,
  strength:0, targetStrength:0, strengthV:0,
  lastImpulseX:innerWidth*.5,lastImpulseY:innerHeight*.5,lastImpulseT:0,
  lastMoveT:0,
};

// A short history of brush impulses. Instead of bending one single line,
// nearby fibers receive overlapping, decaying impulses -> carpet/rug-like movement.
const IMPULSE_COUNT = 9;
const impulses = Array.from({length:IMPULSE_COUNT},()=>({x:-9999,y:-9999,vx:0,vy:0,age:99,strength:0}));
let impulseCursor = 0;
const impulsePos = new Float32Array(IMPULSE_COUNT*2);
const impulseVel = new Float32Array(IMPULSE_COUNT*2);
const impulseAge = new Float32Array(IMPULSE_COUNT);
const impulseStrength = new Float32Array(IMPULSE_COUNT);

const gl = canvas.getContext('webgl', {
  alpha:false, antialias:true, premultipliedAlpha:false,
  powerPreference:'high-performance', preserveDrawingBuffer:false,
});
if (!gl) {
  if (launchWrap) launchWrap.textContent = 'Trình duyệt này không hỗ trợ WebGL.';
  throw new Error('WebGL unavailable');
}

function compile(type, source){
  const sh=gl.createShader(type); gl.shaderSource(sh,source); gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
function makeProgram(vs,fs){
  const p=gl.createProgram(); gl.attachShader(p,compile(gl.VERTEX_SHADER,vs)); gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ---------- soft animated background ----------
const BG_VS=`
attribute vec2 a_position; varying vec2 v_uv;
void main(){v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.);}`;
const BG_FS=`
precision highp float; varying vec2 v_uv;
uniform vec2 u_resolution,u_pointer; uniform float u_time,u_pointerStrength; uniform vec3 u_bgA,u_bgB,u_bgC;
float blob(vec2 uv,vec2 c,float r){float d=length(uv-c);return 1.-smoothstep(r*.12,r,d);}
void main(){
  vec2 uv=v_uv; float asp=u_resolution.x/max(u_resolution.y,1.);
  vec2 p=vec2((uv.x-.5)*asp,uv.y-.5); float t=u_time;
  vec2 c1=vec2(-.44+sin(t*.055)*.12,.34+cos(t*.047)*.10);
  vec2 c2=vec2(.08+cos(t*.041+1.7)*.17,.20+sin(t*.046+.4)*.12);
  vec2 c3=vec2(.52+sin(t*.034+2.4)*.13,-.20+cos(t*.039+1.1)*.11);
  vec2 c4=vec2(-.08+cos(t*.028+.8)*.22,-.45+sin(t*.034+2.1)*.11);
  vec2 mp=vec2((u_pointer.x/u_resolution.x-.5)*asp,.5-u_pointer.y/u_resolution.y);
  float touch=blob(p,mp,.62)*u_pointerStrength;
  float b1=blob(p,c1,1.02), b2=blob(p,c2,.98), b3=blob(p,c3,1.02), b4=blob(p,c4,1.14);
  vec3 col=vec3(.945,.955,.990);
  col=mix(col,u_bgA,b1*.94); col=mix(col,u_bgB,b2*.88); col=mix(col,u_bgC,b3*.84);
  col=mix(col,mix(u_bgA,u_bgB,.5),b4*.56);
  col=mix(col,mix(u_bgB,u_bgC,.46),touch*.20);
  float mobile=1.0-smoothstep(.78,1.18,asp);
  float stage=1.0-smoothstep(.10,.60,length(vec2((uv.x-.5)*asp,uv.y-.55)));
  vec3 stageTone=mix(vec3(.18,.20,.36),vec3(.055,.070,.18),mobile);
  col=mix(col,mix(col,stageTone,.40+.28*mobile),stage*(.40+.24*mobile));
  col=mix(col,vec3(1.),.006);
  gl_FragColor=vec4(col,1.);
}`;
const bgProgram=makeProgram(BG_VS,BG_FS);
const bgBuffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,bgBuffer);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const bgLoc={
  pos:gl.getAttribLocation(bgProgram,'a_position'),res:gl.getUniformLocation(bgProgram,'u_resolution'),
  time:gl.getUniformLocation(bgProgram,'u_time'),pointer:gl.getUniformLocation(bgProgram,'u_pointer'),
  pointerStrength:gl.getUniformLocation(bgProgram,'u_pointerStrength'),
  a:gl.getUniformLocation(bgProgram,'u_bgA'),b:gl.getUniformLocation(bgProgram,'u_bgB'),c:gl.getUniformLocation(bgProgram,'u_bgC')
};

// ---------- fiber shader ----------
// Rays still LOOK like thin rays. Motion is what changes: each ray is segmented and
// responds to a soft brush field made from recent pointer impulses. Neighboring rays
// receive a weaker version of the same force, so interaction feels like brushing a rug.
const HEART_VS=`
precision highp float;
attribute vec2 a_heart; attribute vec2 a_core;
attribute float a_tint,a_alpha,a_size,a_phase,a_depth,a_s;
attribute vec4 a_inst;
uniform vec2 u_resolution,u_center,u_pointer;
uniform float u_scale,u_time,u_dpr,u_idleMix,u_reveal,u_liftPass;
uniform float u_pointerStrength;
uniform vec3 u_rayA,u_rayB;
uniform vec2 u_impulsePos[9];
uniform vec2 u_impulseVel[9];
uniform float u_impulseAge[9];
uniform float u_impulseStrength[9];
varying vec4 v_color;
varying float v_sparkle;
varying vec2 v_local;

float sat(float x){return clamp(x,0.,1.);} 
float smoothPulse(float x){return x*x*(3.0-2.0*x);} 

void main(){
  float t=u_time-a_inst.w;
  float globalT=u_time;
  float heartScale=max(a_inst.z,.12);
  float smallHeart=1.0-smoothstep(.34,.72,heartScale);
  vec2 instCenter=u_center+a_inst.xy*u_scale;
  vec2 hp=a_heart;

  // Default auto motion: a soft continuous ripple. It is visible enough to read,
  // but fades out automatically while the user is actively interacting.
  float beatPhase=mod(t,1.18);
  float beatA=exp(-pow((beatPhase-.10)/.052,2.0));
  float beatB=exp(-pow((beatPhase-.25)/.072,2.0));
  float smallBeatBoost=mix(1.52,1.0,smoothstep(.42,.92,heartScale));
  float heartbeat=(beatA*.050 + beatB*.032) * smallBeatBoost * u_idleMix;
  float beatEnergy=(beatA + beatB*.72) * u_idleMix;
  float waveFront=fract(beatPhase/1.18);
  float rippleBoost=.58;
  float breath=1.0 + heartbeat + (sin(t*.18)*.0022 + sin(t*.075+1.1)*.0012) * u_idleMix;
  float nx=sin(hp.y*.070+t*.14+a_phase*.074);
  float ny=cos(hp.x*.064-t*.12+a_phase*.066);
  float sway=sin(t*.16+a_phase*.19+a_depth*2.1);
  vec2 flow=(vec2(nx,ny)*(.013+a_depth*.007) + vec2(sway*.004,sin(t*.13+a_phase*.13)*.003)) * u_idleMix * mix(.28,1.0,1.0-smallHeart);
  hp=hp*breath+flow;

  vec2 drift=vec2(sin(t*.026)+.28*sin(t*.014+1.7),cos(t*.024+.5)+.24*sin(t*.012+2.2))*u_scale*.008*heartScale*mix(.42,1.0,1.0-smallHeart);
  float innerLayer=smoothstep(.18,.64,a_s)*(1.0-smoothstep(.66,1.0,a_s))*(1.0-a_depth);
  float edgeInset=smoothstep(.62,1.0,a_s);
  float layerScale=.972 + (a_depth-.5)*.010*smoothstep(.20,1.0,a_s) - innerLayer*.030 - edgeInset*(.018+.052*smallHeart) - smallHeart*.024;
  vec2 endp=instCenter+hp*u_scale*heartScale*layerScale+drift*(.25+a_depth*.55);
  vec2 start=instCenter+a_core*u_scale*heartScale*(1.+sin(t*.20+a_phase*.05)*.012)+drift*.035;
  float reveal=smoothstep(0.0,1.0,u_reveal);
  float bloom=1.0-pow(1.0-reveal,2.4);
  endp=mix(start,endp,bloom);
  vec2 ray=endp-start;
  float len2=max(dot(ray,ray),1.0);
  vec2 tangent=normalize(ray+vec2(.001));
  vec2 normal=vec2(-tangent.y,tangent.x);

  vec2 basePos=mix(start,endp,a_s);
  vec2 displacement=vec2(0.0);
  float tipFlex=a_s*a_s;
  float interactScale=mix(2.65,1.0,1.0-smallHeart);
  float smallBrushRadius=max(18.0,u_scale*heartScale*7.2);

  // Multiple decaying brush samples create a soft temporal trail rather than a sharp kink.
  for(int i=0;i<9;i++){
    vec2 ip=u_impulsePos[i];
    vec2 iv=u_impulseVel[i];
    float age=u_impulseAge[i];
    float is=u_impulseStrength[i];

    float hitS=sat(dot(ip-start,ray)/len2);
    vec2 hitPoint=start+ray*hitS;
    float d=length(ip-hitPoint);
    float radius=mix(min(u_resolution.x,u_resolution.y)*.182,smallBrushRadius,smallHeart);
    float nearRay=1.0-smoothstep(radius*.10,radius,d);

    // Fiber response: close fibers bend most; neighboring fibers bend less.
    float local=a_s-hitS;
    float aroundHit=exp(-abs(local)*4.6);
    float downstream=smoothstep(-.10,.18,local);
    float shortTail=exp(-max(local,0.0)*2.8);
    float tail=sat((local+.10)/.48);
    tail=smoothPulse(tail)*shortTail;

    // Older impulses continue moving, but fade quickly and smoothly.
    float decay=exp(-age*1.24);
    float speed=min(length(iv),1200.0);
    vec2 dir = speed>2.0 ? normalize(iv) : normal;
    vec2 side=vec2(-dir.y,dir.x);
    vec2 fromBrush=basePos-ip;
    float along=dot(fromBrush,dir);
    float cross=dot(fromBrush,side);
    float sweep=exp(-(cross*cross)/(radius*radius*.74) - (along*along)/(radius*radius*3.8));
    float fingertip=1.0-smoothstep(radius*.06,radius*.92,length(fromBrush));
    float comb=sat(sweep*.62 + fingertip*.24);

    // The brush behaves like a soft palm of fibers, so no single sharp point forms.
    float bodyWeight=.30*aroundHit + .20*downstream*tail + .52*comb;
    vec2 brush=dir*(2.65+4.40*tail+2.10*comb)*bodyWeight;
    vec2 nap=side*clamp(-cross/radius,-1.0,1.0)*(2.35+3.80*tail)*comb;

    // Small damped overshoot after the pointer has passed: rope-like, but not wavy/cartoonish.
    float vN=dot(iv,normal);
    float overshoot=sin(age*2.35 - tail*.72) * exp(-age*1.62);
    vec2 elastic=normal*clamp(vN/1250.0,-1.0,1.0)*(1.80+2.90*tail)*overshoot*downstream*tail;

    displacement += (brush + nap + elastic) * max(nearRay,comb*.72) * decay * is * interactScale;
  }

  vec2 pointerVector=u_pointer-basePos;
  float pointerDistance=length(pointerVector);
  float fieldRadius=mix(min(u_resolution.x,u_resolution.y)*.255,smallBrushRadius*1.15,smallHeart);
  float field=1.0-smoothstep(fieldRadius*.06,fieldRadius,pointerDistance);
  vec2 pointerDir=pointerDistance>1.0 ? pointerVector/pointerDistance : normal;
  float liveFiber=smoothstep(.14,1.0,a_s);
  float magnetic=field*u_pointerStrength*liveFiber*reveal*interactScale;
  displacement += pointerDir*magnetic*(.70+.82*tipFlex);
  displacement += normal*sin(pointerDistance*.014-t*2.2+a_phase*.23)*field*field*u_pointerStrength*(.86+1.45*tipFlex)*reveal*interactScale;

  // Tip flexibility + subtle auto-ripple make the default motion easier to notice.
  float micro=sin(t*.13+a_phase*.14+a_s*1.62)*(.07+.24*tipFlex);
  float wave1 = sin(t*.42 - a_s*6.2 + a_phase*.48);
  float wave2 = sin(t*.30 + a_s*4.5 + a_phase*.33);
  float wave3 = sin(t*.22 + hp.x*.045 - hp.y*.030 + a_phase*.20);
  float idleRipple = wave1*.54 + wave2*.32 + wave3*.14;
  float tipBloom=smoothstep(.42,1.0,a_s);
  float edgeContain=1.0-.70*smoothstep(.84,1.0,a_s);
  displacement += normal*micro*(.022+.044*a_depth) * (.25 + .75*u_idleMix) * rippleBoost * reveal * edgeContain;
  displacement += normal*idleRipple*(.075 + .28*tipFlex) * (.055 + .070*a_depth) * u_idleMix * rippleBoost * reveal * edgeContain;
  displacement += tangent*sin(t*.20+a_phase*.21)*(.020+.050*tipBloom)*u_idleMix*reveal * edgeContain;
  float pulseWave=exp(-pow((a_s-waveFront)/.062,2.0))*beatEnergy*reveal;
  displacement += normal*pulseWave*(.42+.92*tipFlex)*edgeContain;

  float smallClean=mix(.46,1.0,smoothstep(.34,.86,heartScale));
  displacement *= (.42+.58*heartScale) * smallClean;
  vec2 pos=basePos+displacement;
  if(u_liftPass>.5) pos += vec2(0.0,u_scale*.018*heartScale);
  v_local=(pos-instCenter)/(u_scale*heartScale*(1.0-.052*smallHeart));
  vec2 clip=(pos/u_resolution)*2.-1.;
  gl_Position=vec4(clip*vec2(1.,-1.),0.,1.);
  gl_PointSize=a_size*u_dpr*(.55+.45*sqrt(heartScale));

  float organicTint=sat(a_tint + .07*sin(a_phase*.77+globalT*.032) + .05*sin(a_depth*5.2+globalT*.024));
  float twoTone=smoothstep(.10,.90,organicTint);
  vec3 driftA=mix(u_rayA,u_rayB,.08+.045*sin(globalT*.024+a_depth*2.6));
  vec3 driftB=mix(u_rayB,u_rayA,.07+.040*sin(globalT*.021+a_phase*.19));
  vec3 col=mix(driftA,driftB,twoTone);
  float waveGlow=pulseWave*(.24+.34*smoothstep(.48,1.0,a_s));
  float innerHalo=exp(-pow((a_s-.30)/.19,2.0))*smoothstep(.18,1.0,reveal);
  float mobileBoost=1.0+smoothstep(0.0,.78,u_resolution.x/u_resolution.y)*.42;
  col=mix(col,vec3(1.0,.95,.92),waveGlow*.74);
  col=mix(col,vec3(1.0,.88,.84),innerHalo*.10);
  col=mix(col,vec3(1.0),.055*(mobileBoost-1.0));
  float rootFade=smoothstep(.18,.50,a_s);
  float layerAlpha=(mix(.42,1.02,a_depth) + innerLayer*.28)*mobileBoost;
  float edge=smoothstep(.76,1.0,a_s);
  float sparkleSeed=sin(a_phase*37.13 + floor(t*2.0)*1.73);
  float sparkle=edge*step(.982,sparkleSeed)*(.06+.36*beatEnergy)*smoothstep(.36,1.0,heartScale);
  float alpha=a_alpha*layerAlpha*mix(.006,.94,pow(a_s,.92))*mix(.08,1.0,rootFade)*smoothstep(.015,.56,reveal);
  alpha += innerHalo*.012*a_alpha*reveal + sparkle*.026*reveal;
  float shimmer=.992+.008*sin(t*.28+a_phase*.17+a_s*2.4);
  shimmer += .003*smoothstep(.84,1.0,a_s)*sin(t*.50+a_phase*.31) + sparkle*.06;
  if(u_liftPass>.5){
    float liftAlpha=alpha*(.15+.18*smoothstep(.30,1.0,a_s))*smoothstep(.05,.70,reveal);
    v_color=vec4(vec3(.035,.045,.14),liftAlpha);
    v_sparkle=0.0;
    return;
  }
  v_color=vec4(col,alpha*shimmer);
  v_sparkle=sparkle*(1.0-smallHeart);
}`;
const HEART_FS=`
precision mediump float; varying vec4 v_color; varying float v_sparkle; varying vec2 v_local; uniform float u_pointPass;
float insideHeart(vec2 q){
  vec2 p=vec2(q.x/17.3,(-q.y+1.18)/14.8);
  float a=p.x*p.x+p.y*p.y-1.0;
  float f=a*a*a-p.x*p.x*p.y*p.y*p.y;
  return step(f,0.0);
}
void main(){
  if(insideHeart(v_local)<.5) discard;
  if(u_pointPass>.5){
    vec2 q=gl_PointCoord-.5;float d=length(q);
    float a=smoothstep(.42,.05,d)*v_color.a*v_sparkle*3.0;
    if(a<.006)discard; gl_FragColor=vec4(v_color.rgb,a);
  } else gl_FragColor=v_color;
}`;

const heartProgram=makeProgram(HEART_VS,HEART_FS);
const heartBuffer=gl.createBuffer(), pointBuffer=gl.createBuffer();
const STRIDE=14*4;
const heartLoc={
  heart:gl.getAttribLocation(heartProgram,'a_heart'), core:gl.getAttribLocation(heartProgram,'a_core'),
  tint:gl.getAttribLocation(heartProgram,'a_tint'), alpha:gl.getAttribLocation(heartProgram,'a_alpha'),
  size:gl.getAttribLocation(heartProgram,'a_size'), phase:gl.getAttribLocation(heartProgram,'a_phase'),
  depth:gl.getAttribLocation(heartProgram,'a_depth'), s:gl.getAttribLocation(heartProgram,'a_s'),
  inst:gl.getAttribLocation(heartProgram,'a_inst'),
  res:gl.getUniformLocation(heartProgram,'u_resolution'), center:gl.getUniformLocation(heartProgram,'u_center'),
  scale:gl.getUniformLocation(heartProgram,'u_scale'), time:gl.getUniformLocation(heartProgram,'u_time'),
  rayA:gl.getUniformLocation(heartProgram,'u_rayA'), rayB:gl.getUniformLocation(heartProgram,'u_rayB'),
  dpr:gl.getUniformLocation(heartProgram,'u_dpr'), idleMix:gl.getUniformLocation(heartProgram,'u_idleMix'), reveal:gl.getUniformLocation(heartProgram,'u_reveal'),
  liftPass:gl.getUniformLocation(heartProgram,'u_liftPass'),
  pointer:gl.getUniformLocation(heartProgram,'u_pointer'), pointerStrength:gl.getUniformLocation(heartProgram,'u_pointerStrength'), pointPass:gl.getUniformLocation(heartProgram,'u_pointPass'),
  impulsePos:gl.getUniformLocation(heartProgram,'u_impulsePos[0]'),
  impulseVel:gl.getUniformLocation(heartProgram,'u_impulseVel[0]'),
  impulseAge:gl.getUniformLocation(heartProgram,'u_impulseAge[0]'),
  impulseStrength:gl.getUniformLocation(heartProgram,'u_impulseStrength[0]'),
};

function bindHeartAttributes(buffer){
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  const attrs=[[heartLoc.heart,2,0],[heartLoc.core,2,2],[heartLoc.tint,1,4],[heartLoc.alpha,1,5],[heartLoc.size,1,6],[heartLoc.phase,1,7],[heartLoc.depth,1,8],[heartLoc.s,1,9],[heartLoc.inst,4,10]];
  for(const [loc,size,off] of attrs){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,STRIDE,off*4);}
}

function heartPoint(t){
  const s=Math.sin(t);
  let x=16*s*s*s;
  let y=-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t));
  if (y > 5.0) y = 5.0 + (y - 5.0) * .72;
  if (y < -7.4) y = -7.4 + (y + 7.4) * .96;
  const body = Math.max(0, 1 - Math.min(1, Math.abs(y - .2) / 13.8));
  const lobes = Math.max(0, 1 - Math.min(1, Math.abs(y + 4.1) / 5.1));
  x *= 1.020 + body * .040 + lobes * .075;
  y = y*.925 - .18;
  if (W <= 760) y *= 1.15;
  return {x, y};
}
function particleCount(){if(W<=430)return 680;if(W<=760)return 820;if(W<=1200)return 920;return 1120;}
function segmentsPerRay(){return W<=760?12:12;}
const HEART_INSTANCES=[
  {x:0,y:0,scale:1,beat:0,count:1},
];

function buildGeometry(){
  const baseN=particleCount(), segs=segmentsPerRay();
  const counts=HEART_INSTANCES.map((inst,index)=>Math.max(index===0?24:64,Math.round(baseN*inst.count)));
  const totalPoints=counts.reduce((sum,count)=>sum+count,0);
  const rayVerts=totalPoints*segs*2;
  const rays=new Float32Array(rayVerts*14), points=new Float32Array(totalPoints*14);
  let rp=0, pp=0;
  HEART_INSTANCES.forEach((inst,instIndex)=>{
  const n=counts[instIndex];
  for(let i=0;i<n;i++){
    // More even angular distribution = smoother carpet-like local response.
    const smallInst=inst.scale<.5;
    const seed=(instIndex*.137 + inst.scale*.19) % 1;
    const jitter=smallInst ? (.28 + (instIndex%4)*.055) : .35;
    const tt=(((i+jitter*Math.random())/n)+seed)*Math.PI*2;
    const edge=heartPoint(tt), layerRoll=Math.random();
    const outerLayer=smallInst ? layerRoll>.48 : layerRoll>.66;
    const middleLayer=smallInst ? layerRoll>.18 && layerRoll<=.48 : layerRoll>.26 && layerRoll<=.66;
    const r=outerLayer
      ? (smallInst ? .80+Math.pow(Math.random(),.74)*.145 : .78+Math.pow(Math.random(),.72)*.125)
      : middleLayer
        ? (smallInst ? .50+Math.pow(Math.random(),.78)*.275 : .52+Math.pow(Math.random(),.78)*.25)
        : (smallInst ? .24+Math.pow(Math.random(),.90)*.30 : .28+Math.pow(Math.random(),.88)*.28);
    let hx=edge.x*r, hy=edge.y*r;
    const bottomRound=Math.max(0,Math.min(1,(hy-1.85)/5.25));
    const bottomX=Math.min(1,Math.abs(hx)/6.4);
    const bottomCenter=1.0-bottomX;
    const roundedTip=bottomRound*bottomRound*bottomCenter;
    const tipLimit=7.18 - Math.pow(bottomX,.78)*2.95;
    if(hy>tipLimit) hy=tipLimit+(hy-tipLimit)*(.16+.42*bottomX);
    hx *= 1.0 + bottomRound*.11 + bottomCenter*bottomRound*.20;
    hy -= roundedTip*.46;
    const centralColumn=Math.max(0,1-Math.min(1,Math.abs(hx)/2.35))*Math.max(0,Math.min(1,(hy+10.5)/15.5));
    if(!smallInst && centralColumn>.68 && Math.random()<(.38 + bottomRound*.22)) hx += (Math.random()<.5?-1:1) * (.38 + Math.random()*(.62 + bottomRound*.34));
    const phase=Math.random()*Math.PI*2;
    const depth=smallInst
      ? outerLayer ? .74+Math.random()*.26 : middleLayer ? .38+Math.random()*.28 : .10+Math.random()*.24
      : outerLayer ? .66+Math.random()*.34 : middleLayer ? .32+Math.random()*.34 : .06+Math.random()*.24;
    const rootS=smallInst ? .010+Math.random()*.026 : .018+Math.random()*.055;
    const rootBase=outerLayer ? .10 : middleLayer ? .08 : .055;
    const rootJitter=rootBase*(smallInst ? .22 : 1.0)*(1-centralColumn*.55);
    const ca=Math.random()*Math.PI*2, cr=Math.random()*rootJitter;
    const cx=hx*rootS+Math.cos(ca)*cr*(smallInst ? 1.25 : 1.0), cy=hy*rootS+Math.sin(ca)*cr*(smallInst ? .70 : 1.0);
    const rawTint=Math.random()*0.92 + 0.04 + (Math.random()-0.5)*0.10;
    const bottomness=Math.max(0,Math.min(1,(hy-1.5)/12.0));
    const centerline=Math.max(0,1-Math.min(1,Math.abs(hx)/4.8));
    const trunkSoft=bottomness*centerline;
    const tintBase=Math.max(0,Math.min(1,rawTint));
    const tint=0.5 + (tintBase-0.5)*(1-0.15*trunkSoft);
    const alphaBase=smallInst
      ? outerLayer ? .36+Math.random()*.13 : middleLayer ? .30+Math.random()*.12 : .15+Math.random()*.08
      : outerLayer ? .24+Math.random()*.12 : middleLayer ? .34+Math.random()*.16 : .20+Math.random()*.12;
    const sizeBase=smallInst
      ? outerLayer ? .68+Math.random()*.20 : middleLayer ? .64+Math.random()*.15 : .50+Math.random()*.12
      : outerLayer ? .76+Math.random()*.34 : middleLayer ? .84+Math.random()*.34 : .64+Math.random()*.22;
    const alpha=alphaBase*(1-0.88*trunkSoft)*(1-0.52*centralColumn)*(1-.28*bottomRound*centerline)*(1-.18*roundedTip);
    const size=sizeBase*(1-0.34*trunkSoft)*(1-0.22*centralColumn)*(1-.18*bottomRound*centerline)*(1-.12*roundedTip);
    const write=(arr,base,s)=>{arr[base]=hx;arr[base+1]=hy;arr[base+2]=cx;arr[base+3]=cy;arr[base+4]=tint;arr[base+5]=alpha;arr[base+6]=size;arr[base+7]=phase;arr[base+8]=depth;arr[base+9]=s;arr[base+10]=inst.x;arr[base+11]=inst.y;arr[base+12]=inst.scale;arr[base+13]=inst.beat;};
    for(let j=0;j<segs;j++){
      const s0=j/segs,s1=(j+1)/segs;
      write(rays,rp,s0);rp+=14; write(rays,rp,s1);rp+=14;
    }
    write(points,pp,1);pp+=14;
  }
  });
  gl.bindBuffer(gl.ARRAY_BUFFER,heartBuffer);gl.bufferData(gl.ARRAY_BUFFER,rays,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,points,gl.STATIC_DRAW);
  heartBuffer.count=rayVerts; pointBuffer.count=totalPoints;
}

function layout(){
  const mobile=W<=760, landscape=mobile&&W>H;
  if(landscape){const scale=Math.min(W/43,H/31.7);return{cx:W*.51,cy:H*.57,scale};}
  if(mobile){
    const safeTop=Math.max(82,H*.11),safeBottom=Math.max(38,H*.05),usableH=H-safeTop-safeBottom;
    const scale=Math.min(W/32.8,usableH/34.0), halfH=17.0*scale;
    let cy=safeTop+usableH*.51; cy=Math.max(safeTop+halfH,Math.min(H-safeBottom-halfH,cy));
    return{cx:W*.50,cy,scale};
  }
  return{cx:W*.50,cy:H*.57,scale:Math.min(W/30.6,H/26.0)};
}

function resize(){
  W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,W<=760?2.05:1.9);
  canvas.width=Math.max(1,Math.round(W*dpr));canvas.height=Math.max(1,Math.round(H*dpr));
  canvas.style.width=`${W}px`;canvas.style.height=`${H}px`;gl.viewport(0,0,canvas.width,canvas.height);buildGeometry();
}

function spring(value,velocity,target,dt,frequency=2.0,damping=.96){
  const omega=2*Math.PI*frequency;
  const a=(target-value)*omega*omega-2*damping*omega*velocity;
  velocity+=a*dt; value+=velocity*dt; return[value,velocity];
}

function addImpulse(x,y,vx,vy,strength=1){
  const imp=impulses[impulseCursor];
  imp.x=x;imp.y=y;imp.vx=vx;imp.vy=vy;imp.age=0;imp.strength=strength;
  impulseCursor=(impulseCursor+1)%IMPULSE_COUNT;
}

function updatePointer(dt){
  const oldX=pointer.x, oldY=pointer.y;
  [pointer.x,pointer.vx]=spring(pointer.x,pointer.vx,pointer.tx,dt,1.32,.986);
  [pointer.y,pointer.vy]=spring(pointer.y,pointer.vy,pointer.ty,dt,1.32,.986);
  [pointer.strength,pointer.strengthV]=spring(pointer.strength,pointer.strengthV,pointer.targetStrength,dt,1.24,.986);

  const dx=pointer.x-oldX, dy=pointer.y-oldY;
  const speed=Math.hypot(dx,dy)/Math.max(dt,.001);
  const dist=Math.hypot(pointer.x-pointer.lastImpulseX,pointer.y-pointer.lastImpulseY);
  const since=elapsed-pointer.lastImpulseT;
  if(pointer.strength>.025 && speed>7 && (dist>6 || since>.028)){
    const vscale=Math.min(1.0, speed/760);
    addImpulse(pointer.x,pointer.y,pointer.vx,pointer.vy,.20+.62*vscale);
    pointer.lastImpulseX=pointer.x;pointer.lastImpulseY=pointer.y;pointer.lastImpulseT=elapsed;
  }

  const activeInteract = pointer.down || ((elapsed - pointer.lastMoveT) < 0.22 && pointer.targetStrength > 0.001);
  if (!pointer.down && (elapsed - pointer.lastMoveT) > 0.24) pointer.targetStrength = 0;
  idleTarget = activeInteract ? 0 : 1;
  [idleMix,idleMixV] = spring(idleMix,idleMixV,idleTarget,dt,1.55,.92);

  for(const imp of impulses){imp.age+=dt;}
}

function packImpulses(){
  for(let i=0;i<IMPULSE_COUNT;i++){
    const imp=impulses[i];
    impulsePos[i*2]=imp.x; impulsePos[i*2+1]=imp.y;
    impulseVel[i*2]=imp.vx; impulseVel[i*2+1]=imp.vy;
    impulseAge[i]=imp.age;
    impulseStrength[i]=imp.strength;
  }
}

function smoothColor(cur,target,dt,speed=2.0){const k=1-Math.exp(-speed*dt);for(let i=0;i<3;i++)cur[i]+=(target[i]-cur[i])*k;}

function drawBackground(){
  gl.disable(gl.BLEND);gl.useProgram(bgProgram);gl.bindBuffer(gl.ARRAY_BUFFER,bgBuffer);
  gl.enableVertexAttribArray(bgLoc.pos);gl.vertexAttribPointer(bgLoc.pos,2,gl.FLOAT,false,0,0);
  gl.uniform2f(bgLoc.res,W,H);gl.uniform1f(bgLoc.time,elapsed);
  gl.uniform2f(bgLoc.pointer,pointer.x,pointer.y);gl.uniform1f(bgLoc.pointerStrength,pointer.strength);
  gl.uniform3fv(bgLoc.a,bgA);gl.uniform3fv(bgLoc.b,bgB);gl.uniform3fv(bgLoc.c,bgC);
  gl.drawArrays(gl.TRIANGLES,0,3);
}

function setHeartUniforms(){
  const {cx,cy,scale}=layout();
  gl.uniform2f(heartLoc.res,W,H);gl.uniform2f(heartLoc.center,cx,cy);gl.uniform1f(heartLoc.scale,scale);gl.uniform1f(heartLoc.time,elapsed);
  gl.uniform3fv(heartLoc.rayA,rayA);gl.uniform3fv(heartLoc.rayB,rayB);gl.uniform1f(heartLoc.dpr,dpr);gl.uniform1f(heartLoc.idleMix,idleMix);gl.uniform1f(heartLoc.reveal,reveal);
  gl.uniform2f(heartLoc.pointer,pointer.x,pointer.y);gl.uniform1f(heartLoc.pointerStrength,pointer.strength);
  packImpulses();
  gl.uniform2fv(heartLoc.impulsePos,impulsePos);gl.uniform2fv(heartLoc.impulseVel,impulseVel);
  gl.uniform1fv(heartLoc.impulseAge,impulseAge);gl.uniform1fv(heartLoc.impulseStrength,impulseStrength);
}

function drawHeart(){
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(heartProgram);setHeartUniforms();
  bindHeartAttributes(heartBuffer);
  gl.uniform1f(heartLoc.liftPass,1);gl.uniform1f(heartLoc.pointPass,0);gl.drawArrays(gl.LINES,0,heartBuffer.count);
  gl.uniform1f(heartLoc.liftPass,0);gl.uniform1f(heartLoc.pointPass,0);gl.drawArrays(gl.LINES,0,heartBuffer.count);
  bindHeartAttributes(pointBuffer);gl.uniform1f(heartLoc.pointPass,1);gl.drawArrays(gl.POINTS,0,pointBuffer.count);
}

function render(now){
  let dt=(now-lastTime)/1000;lastTime=now;dt=Math.min(Math.max(dt,1/240),1/30);elapsed+=dt;
  [reveal,revealV]=spring(reveal,revealV,revealTarget,dt,1.08,.90);
  updatePointer(dt);
  smoothColor(rayA,targetRayA,dt,1.75);smoothColor(rayB,targetRayB,dt,1.75);
  smoothColor(bgA,targetBgA,dt,.72);smoothColor(bgB,targetBgB,dt,.72);smoothColor(bgC,targetBgC,dt,.72);
  drawBackground();drawHeart();requestAnimationFrame(render);
}

function selectTheme(name){
  if(!themes[name])return;activeTheme=name;app.dataset.theme=name;const t=themes[name];
  targetRayA=[...t.rayA];targetRayB=[...t.rayB];targetBgA=[...t.bgA];targetBgB=[...t.bgB];targetBgC=[...t.bgC];
  if(themeIcon) themeIcon.className=`theme-symbol icon-${t.icon}`;
  themeToggle.setAttribute('aria-label',`Màu hiện tại: ${t.label}`);
  buttons.forEach(b=>b.classList.toggle('active',b.dataset.theme===name));localStorage.setItem('heart-theme',name);closeMenu();
}
function openMenu(){modePanel.classList.remove('closed');themeToggle.setAttribute('aria-expanded','true');}
function closeMenu(){modePanel.classList.add('closed');themeToggle.setAttribute('aria-expanded','false');}
function toggleMenu(){modePanel.classList.contains('closed')?openMenu():closeMenu();}
buttons.forEach(b=>b.addEventListener('click',()=>selectTheme(b.dataset.theme)));
themeToggle.addEventListener('click',toggleMenu);
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.theme-menu-wrap'))closeMenu();});

function launchHeart(){
  if(launched) return;
  launched=true;
  revealTarget=1;
  app.classList.remove('awaiting-launch');
  app.classList.add('launched');
  launchButton?.classList.remove('holding','ready');
  launchButton?.style.setProperty('--hold','1');
  window.setTimeout(()=>launchWrap?.setAttribute('aria-hidden','true'),780);
}

function setHoldProgress(value){
  launchButton?.style.setProperty('--hold',String(Math.max(0,Math.min(1,value))));
}

function stopHoldAnimation(){
  if(holdFrame) cancelAnimationFrame(holdFrame);
  holdFrame=0;
}

function updateHold(now){
  if(!holdActive || launched) return;
  const progress=Math.min(1,(now-holdStart)/HOLD_DURATION);
  setHoldProgress(progress);
  if(progress>=1 && !holdReady){
    holdReady=true;
    launchButton?.classList.add('ready');
  }
  holdFrame=requestAnimationFrame(updateHold);
}

function startHold(e){
  if(launched) return;
  e?.preventDefault();
  if(e?.pointerId !== undefined) launchButton?.setPointerCapture?.(e.pointerId);
  holdActive=true;
  holdReady=false;
  holdStart=performance.now();
  launchButton?.classList.add('holding');
  launchButton?.classList.remove('ready');
  setHoldProgress(0);
  stopHoldAnimation();
  holdFrame=requestAnimationFrame(updateHold);
}

function releaseHold(e){
  if(!holdActive || launched) return;
  e?.preventDefault();
  holdActive=false;
  stopHoldAnimation();
  const progress=Math.min(1,(performance.now()-holdStart)/HOLD_DURATION);
  if(progress>=1 || holdReady){
    launchHeart();
    return;
  }
  holdReady=false;
  launchButton?.classList.remove('holding','ready');
  setHoldProgress(0);
}

function cancelHold(){
  if(!holdActive || launched) return;
  holdActive=false;
  holdReady=false;
  stopHoldAnimation();
  launchButton?.classList.remove('holding','ready');
  setHoldProgress(0);
}

launchButton?.addEventListener('pointerdown',startHold);
launchButton?.addEventListener('pointerup',releaseHold);
launchButton?.addEventListener('pointercancel',cancelHold);
launchButton?.addEventListener('pointerleave',cancelHold);
launchButton?.addEventListener('click',e=>e.preventDefault());
launchButton?.addEventListener('contextmenu',e=>e.preventDefault());
launchButton?.addEventListener('selectstart',e=>e.preventDefault());
launchButton?.addEventListener('dragstart',e=>e.preventDefault());
launchButton?.addEventListener('keydown',e=>{
  if((e.key===' ' || e.key==='Enter') && !holdActive) startHold(e);
});
launchButton?.addEventListener('keyup',e=>{
  if(e.key===' ' || e.key==='Enter') releaseHold(e);
});

function setPointer(x,y,on=true){
  if(!launched) return;
  pointer.tx=x;pointer.ty=y;pointer.targetStrength=on?.98:0;
  if(on) pointer.lastMoveT = elapsed;
}

canvas.addEventListener('pointerdown',e=>{if(!launched)return;pointer.down=true;setPointer(e.clientX,e.clientY,true);pointer.lastMoveT=elapsed;addImpulse(e.clientX,e.clientY,0,0,.72);});
canvas.addEventListener('pointermove',e=>setPointer(e.clientX,e.clientY,true));
canvas.addEventListener('pointerup',()=>{pointer.down=false;pointer.targetStrength=0;});
canvas.addEventListener('pointercancel',()=>{pointer.down=false;pointer.targetStrength=0;});
canvas.addEventListener('pointerleave',()=>{pointer.down=false;pointer.targetStrength=0;});

let resizeTimer;
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,90);},{passive:true});
addEventListener('orientationchange',()=>setTimeout(resize,180),{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)lastTime=performance.now();});

const saved=localStorage.getItem('heart-theme');
if(saved&&themes[saved]){
  activeTheme=saved;app.dataset.theme=saved;const t=themes[saved];
  rayA=[...t.rayA];rayB=[...t.rayB];bgA=[...t.bgA];bgB=[...t.bgB];bgC=[...t.bgC];
  targetRayA=[...rayA];targetRayB=[...rayB];targetBgA=[...bgA];targetBgB=[...bgB];targetBgC=[...bgC];
  if(themeIcon) themeIcon.className=`theme-symbol icon-${t.icon}`;
  themeToggle.setAttribute('aria-label',`Màu hiện tại: ${t.label}`);
  buttons.forEach(b=>b.classList.toggle('active',b.dataset.theme===saved));
}

resize();requestAnimationFrame(render);
