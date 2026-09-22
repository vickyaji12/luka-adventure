(() => {
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", {alpha:false});
const W=1280,H=720;

const ui = {
  hud:document.getElementById("hud"), menu:document.getElementById("menu"),
  levels:document.getElementById("levelSelect"), settings:document.getElementById("settings"),
  credits:document.getElementById("credits"), pause:document.getElementById("pause"),
  over:document.getElementById("gameOver"), complete:document.getElementById("complete"),
  mobile:document.getElementById("mobileControls"), toast:document.getElementById("toast"),
  lives:document.getElementById("lives"), coins:document.getElementById("coins"),
  stars:document.getElementById("stars"), timer:document.getElementById("timer"),
  world:document.getElementById("worldLabel"), resultCoins:document.getElementById("resultCoins"),
  resultStars:document.getElementById("resultStars"), resultTime:document.getElementById("resultTime")
};

const settings = {
  sound: JSON.parse(localStorage.getItem("lukaSound") ?? "true"),
  shake: JSON.parse(localStorage.getItem("lukaShake") ?? "true")
};
document.getElementById("soundToggle").checked=settings.sound;
document.getElementById("shakeToggle").checked=settings.shake;

const keys = {left:false,right:false,jump:false};
let gameState="menu", last=0, accumulator=0, audioCtx=null, toastTimer=0;

const save = JSON.parse(localStorage.getItem("lukaSave") || '{"unlockedLevel":0,"best":{}}');

const levelData = {
  id:"1-1", name:"Meadow Run", width:9200, height:720, time:300,
  start:{x:130,y:450},
  platforms:[
    [0,590,900,130],[980,560,600,160],[1720,610,500,110],[2340,535,550,185],
    [3040,610,800,110],[3990,565,650,155],[4740,500,520,220],[5380,610,680,110],
    [6200,545,600,175],[6900,600,720,120],[7700,535,600,185],[8440,600,760,120]
  ],
  smallPlatforms:[
    [520,485,170,24],[1080,430,160,24],[1350,350,150,24],[1880,485,150,24],
    [2520,400,170,24],[3300,460,170,24],[4140,430,180,24],[4920,350,160,24],
    [5560,450,150,24],[6380,390,180,24],[7050,430,160,24],[7900,380,170,24]
  ],
  coins:[
    [280,500],[560,430],[600,430],[1110,375],[1160,375],[1390,295],
    [1800,550],[1910,430],[1970,430],[2450,480],[2570,345],[2640,345],
    [3200,560],[3340,405],[3410,405],[4070,515],[4180,375],[4250,375],
    [4810,450],[4950,295],[5020,295],[5480,560],[5620,415],[5690,415],
    [6310,495],[6430,355],[6500,355],[7000,550],[7080,395],[7160,395],
    [7800,485],[7950,345],[8020,345],[8560,550],[8660,550],[8760,550]
  ],
  stars:[[1430,285],[5000,285],[7980,315]],
  enemies:[
    {type:"walker",x:700,y:540,min:500,max:860},
    {type:"flyer",x:1180,y:300,min:1020,max:1480},
    {type:"walker",x:1840,y:560,min:1740,max:2160},
    {type:"turtle",x:2740,y:485,min:2400,max:2820},
    {type:"walker",x:3440,y:560,min:3100,max:3800},
    {type:"flyer",x:4270,y:330,min:4050,max:4550},
    {type:"walker",x:5000,y:450,min:4770,max:5200},
    {type:"plant",x:5730,y:548,min:0,max:0},
    {type:"walker",x:6600,y:495,min:6250,max:6750},
    {type:"turtle",x:7190,y:550,min:6950,max:7500},
    {type:"flyer",x:8050,y:300,min:7800,max:8300}
  ],
  questionBlocks:[[760,390,"coin"],[1250,305,"coin"],[2860,420,"star"],[4550,385,"coin"],[7500,390,"shield"]],
  pipes:[[1510,500,74,90],[5750,515,76,95],[8230,440,78,95]],
  water:[[1600,220,120,500],[2220,120,120,600],[3840,150,150,570],[4570,120,170,600]],
  checkpoints:[[1700,540],[3900,495],[6200,475],[7700,465]],
  flag:[9000,510]
};

function rect(x,y,w,h){return{x,y,w,h}}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function center(a){return{x:a.x+a.w/2,y:a.y+a.h/2}}
function beep(freq=440,dur=.06,type="square"){
  if(!settings.sound) return;
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type;o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(audioCtx.destination);
    o.start();g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.stop(audioCtx.currentTime+dur);
  }catch{}
}
function toast(msg){
  ui.toast.textContent=msg;ui.toast.classList.add("show");clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>ui.toast.classList.remove("show"),1300);
}

class Player{
  constructor(x,y){this.w=42;this.h=64;this.x=x;this.y=y;this.vx=0;this.vy=0;this.speed=330;this.jump=690;this.grounded=false;this.coyote=.1;this.jumpBuffer=0;this.lives=5;this.invuln=0;this.anim=0;this.face=1;this.dead=false;this.checkpoint={x,y};this.shield=0}
  update(dt){
    if(this.dead)return;
    if(keys.left&&!keys.right){this.vx=-this.speed;this.face=-1}
    else if(keys.right&&!keys.left){this.vx=this.speed;this.face=1}
    else this.vx*=Math.pow(.001,dt);
    if(this.grounded)this.coyote=.1;else this.coyote-=dt;
    this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
    if(this.jumpBuffer>0&&(this.grounded||this.coyote>0)){this.vy=-this.jump;this.grounded=false;this.coyote=0;this.jumpBuffer=0;beep(560,.08,"triangle")}
    this.vy+=1850*dt; this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.x=clamp(this.x,0,levelData.width-this.w);
    this.anim+=dt*(Math.abs(this.vx)>20?12:4);
    if(this.invuln>0)this.invuln-=dt;
    if(this.shield>0)this.shield-=dt;
    if(this.y>790)this.hurt(true);
  }
  requestJump(){this.jumpBuffer=.12}
  hurt(fall=false){
    if(this.invuln>0||this.dead)return;
    if(this.shield>0){this.shield=0;this.invuln=.7;beep(180,.12);toast("Shield broken!");return}
    this.lives--;beep(110,.16,"sawtooth");shake(12);
    if(this.lives<=0){this.dead=true;setTimeout(()=>showGameOver(),650);return}
    this.x=this.checkpoint.x;this.y=this.checkpoint.y;this.vx=0;this.vy=0;this.invuln=1.7;
    if(!fall)this.vy=-360;
  }
  draw(){
    if(this.invuln>0 && Math.floor(this.invuln*12)%2===0)return;
    const x=this.x-camera.x,y=this.y;
    ctx.save();ctx.translate(x+this.w/2,y+this.h/2);ctx.scale(this.face,1);
    // original adventurer character
    ctx.fillStyle="#e44a36";ctx.beginPath();ctx.moveTo(-20,-17);ctx.lineTo(-38,-9);ctx.lineTo(-20,-3);ctx.fill();
    ctx.fillStyle="#8a4e2a";ctx.beginPath();ctx.arc(0,-17,17,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#f2b27c";ctx.beginPath();ctx.arc(0,-7,14,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#28364b";ctx.fillRect(-13,7,26,27);
    ctx.fillStyle="#3f83b8";ctx.fillRect(-13,17,26,16);
    ctx.fillStyle="#d98d3b";ctx.fillRect(-15,34,11,9);ctx.fillRect(4,34,11,9);
    ctx.fillStyle="#3b2418";ctx.fillRect(-16,42,13,6);ctx.fillRect(3,42,13,6);
    ctx.fillStyle="#f7d34b";ctx.fillRect(-12,-22,24,5);
    ctx.fillStyle="#66b7d8";ctx.beginPath();ctx.ellipse(7,-23,6,3,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    if(this.shield>0){ctx.strokeStyle="rgba(116,223,255,.85)";ctx.lineWidth=4;ctx.beginPath();ctx.arc(x+21,y+32,37,0,Math.PI*2);ctx.stroke()}
  }
}

class Enemy{
  constructor(d){Object.assign(this,d);this.w=d.type==="flyer"?48:50;this.h=d.type==="plant"?58:46;this.vx=(d.type==="flyer"?90:65);this.dir=1;this.phase=Math.random()*10;this.dead=false}
  update(dt){
    if(this.dead)return;
    this.phase+=dt;
    if(this.type==="plant")return;
    this.x+=this.vx*this.dir*dt;
    if(this.x<=this.min){this.x=this.min;this.dir=1}
    if(this.x>=this.max){this.x=this.max;this.dir=-1}
    if(this.type==="flyer")this.y+=Math.sin(this.phase*2.4)*18*dt;
  }
  draw(){
    if(this.dead)return;
    const x=this.x-camera.x,y=this.y;
    ctx.save();ctx.translate(x+this.w/2,y+this.h/2);ctx.scale(this.dir,1);
    if(this.type==="flyer"){
      ctx.fillStyle="#fff4e8";ctx.beginPath();ctx.ellipse(0,5,21,15,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#d88948";ctx.beginPath();ctx.arc(0,-2,15,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(-20,-2,15,8,-.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(20,-2,15,8,.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#111";ctx.beginPath();ctx.arc(6,-5,3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#e65d43";ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(29,5);ctx.lineTo(15,8);ctx.fill();
    }else if(this.type==="plant"){
      ctx.fillStyle="#2e9b54";ctx.fillRect(-18,5,36,30);
      ctx.fillStyle="#e64b3e";ctx.beginPath();ctx.arc(0,-8,25,Math.PI,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff";for(let i=-12;i<=12;i+=12){ctx.beginPath();ctx.arc(i,-13,5,0,Math.PI*2);ctx.fill()}
      ctx.fillStyle="#151515";ctx.beginPath();ctx.arc(-8,-4,3,0,Math.PI*2);ctx.arc(8,-4,3,0,Math.PI*2);ctx.fill();
    }else{
      ctx.fillStyle=this.type==="turtle"?"#4e9b61":"#d95d4d";
      ctx.beginPath();ctx.ellipse(0,2,25,21,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=this.type==="turtle"?"#a8d66f":"#ffd06a";
      ctx.beginPath();ctx.arc(24,5,10,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(27,2,3,0,Math.PI*2);ctx.fill();ctx.fillStyle="#111";ctx.beginPath();ctx.arc(28,2,1.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#5b3422";ctx.fillRect(-18,19,8,7);ctx.fillRect(10,19,8,7);
    }
    ctx.restore();
  }
  get box(){return rect(this.x,this.y,this.w,this.h)}
}

class Coin{
  constructor(x,y){this.x=x;this.y=y;this.w=25;this.h=32;this.collected=false;this.t=Math.random()*6}
  update(dt){this.t+=dt}
  draw(){
    if(this.collected)return;
    const x=this.x-camera.x,y=this.y+Math.sin(this.t*4)*4;
    ctx.fillStyle="#ffd33d";ctx.strokeStyle="#8b5b0c";ctx.lineWidth=3;
    ctx.beginPath();ctx.ellipse(x+12,y+16,10,15,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#fff3a2";ctx.fillRect(x+9,y+6,3,18);
  }
  get box(){return rect(this.x,this.y,this.w,this.h)}
}
class Star{
  constructor(x,y){this.x=x;this.y=y;this.w=34;this.h=34;this.collected=false;this.t=Math.random()*5}
  update(dt){this.t+=dt}
  draw(){
    if(this.collected)return;
    const x=this.x-camera.x+17,y=this.y+17+Math.sin(this.t*3)*5;
    ctx.save();ctx.translate(x,y);ctx.rotate(this.t*.4);
    ctx.fillStyle="#ffe04d";ctx.strokeStyle="#9a6612";ctx.lineWidth=3;ctx.beginPath();
    for(let i=0;i<10;i++){let a=-Math.PI/2+i*Math.PI/5,r=i%2?8:17;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}
    ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  get box(){return rect(this.x,this.y,this.w,this.h)}
}
class Checkpoint{
  constructor(x,y){this.x=x;this.y=y;this.hit=false}
  draw(){const x=this.x-camera.x;ctx.fillStyle="#70472b";ctx.fillRect(x,this.y-65,6,65);ctx.fillStyle=this.hit?"#4ee08c":"#ffd84d";ctx.beginPath();ctx.moveTo(x+6,this.y-62);ctx.lineTo(x+42,this.y-50);ctx.lineTo(x+6,this.y-35);ctx.fill()}
}
class Question{
  constructor(x,y,type){this.x=x;this.y=y;this.w=54;this.h=54;this.type=type;this.used=false;this.bump=0}
  update(dt){this.bump=Math.max(0,this.bump-dt)}
  hit(){if(this.used)return;this.used=true;this.bump=.15;beep(720,.08);if(this.type==="star"){game.stars.push(new Star(this.x+10,this.y-42));toast("A hidden star!")}else if(this.type==="shield"){game.player.shield=5;toast("Shield power-up!");beep(900,.12,"triangle")}else{game.coins.push(new Coin(this.x+15,this.y-38));toast("+1 coin")}}
  draw(){const x=this.x-camera.x,y=this.y-this.bump*45;ctx.fillStyle=this.used?"#9b693d":"#ffd044";ctx.strokeStyle="#8a531b";ctx.lineWidth=3;ctx.fillRect(x,y,this.w,this.h);ctx.strokeRect(x,y,this.w,this.h);ctx.fillStyle=this.used?"#6d4c38":"#fff6b5";ctx.font="900 34px Arial";ctx.textAlign="center";ctx.fillText(this.used?"·":"?",x+27,y+39)}
}
class Pipe{
  constructor(x,y,w,h){this.x=x;this.y=y;this.w=w;this.h=h}
  draw(){const x=this.x-camera.x;ctx.fillStyle="#28a653";ctx.strokeStyle="#176a3c";ctx.lineWidth=4;ctx.fillRect(x+9,this.y+10,this.w-18,this.h);ctx.fillRect(x,this.y,this.w,22);ctx.strokeRect(x,this.y,this.w,22);ctx.strokeRect(x+9,this.y+10,this.w-18,this.h-10)}
  get box(){return rect(this.x,this.y,this.w,this.h)}
}

let game=null, camera={x:0,shake:0};
function shake(n){if(settings.shake)camera.shake=Math.max(camera.shake,n)}
function resetGame(){
  game={
    player:new Player(levelData.start.x,levelData.start.y),
    coins:levelData.coins.map(p=>new Coin(...p)),
    stars:levelData.stars.map(p=>new Star(...p)),
    enemies:levelData.enemies.map(d=>new Enemy(d)),
    questions:levelData.questionBlocks.map(d=>new Question(...d)),
    pipes:levelData.pipes.map(d=>new Pipe(...d)),
    checkpoints:levelData.checkpoints.map(p=>new Checkpoint(...p)),
    timer:levelData.time, coinCount:0, starCount:0, complete:false, timeTick:0,
    particles:[]
  };
  game.player.lives=5;
  camera.x=0;camera.shake=0;
  ui.world.textContent="WORLD 1-1";
  updateHUD();
}
function updateHUD(){
  if(!game)return;
  ui.lives.textContent="× "+String(game.player.lives).padStart(2,"0");
  ui.coins.textContent="× "+String(game.coinCount).padStart(2,"0");
  ui.stars.textContent="× "+game.starCount+"/3";
  ui.timer.textContent=Math.max(0,Math.ceil(game.timer));
}
function worldToScreenBox(b){return{x:b.x-camera.x,y:b.y,w:b.w,h:b.h}}
function resolvePlatforms(){
  const p=game.player; p.grounded=false;
  const solids=[...levelData.platforms,...levelData.smallPlatforms].map(a=>rect(...a));
  for(const s of solids){
    const wasBelow=p.y+p.h-p.vy*(1/60);
    if(overlap(p,s) && p.vy>=0 && wasBelow<=s.y+8){
      p.y=s.y-p.h;p.vy=0;p.grounded=true;
    }else if(overlap(p,s) && p.vy<0 && p.y>=s.y+s.h-12){
      p.y=s.y+s.h;p.vy=0;
    }
  }
  // pipe tops are solid
  for(const pipe of game.pipes){
    const s=pipe.box;
    if(overlap(p,s) && p.vy>=0 && p.y+p.h-p.vy*(1/60)<=s.y+10){p.y=s.y-p.h;p.vy=0;p.grounded=true}
  }
}
function updateGame(dt){
  if(gameState!=="playing")return;
  game.timer-=dt;game.timeTick+=dt;
  if(game.timer<=0){game.timer=0;game.player.hurt();game.timer=levelData.time}
  game.player.update(dt);
  resolvePlatforms();

  for(const c of game.coins){c.update(dt);if(!c.collected&&overlap(game.player,c.box)){c.collected=true;game.coinCount++;beep(880,.055,"triangle");addParticles(c.x+10,c.y+10,"coin")}}
  for(const s of game.stars){s.update(dt);if(!s.collected&&overlap(game.player,s.box)){s.collected=true;game.starCount++;beep(1020,.1,"triangle");toast("Star collected!");addParticles(s.x+15,s.y+15,"star")}}
  for(const q of game.questions){q.update(dt);q.draw; if(overlap(game.player,q) && game.player.vy<0 && game.player.y>=q.y+q.h-20){game.player.y=q.y+q.h;game.player.vy=80;q.hit()}}
  for(const e of game.enemies){
    e.update(dt);
    if(e.dead)continue;
    if(overlap(game.player,e.box)){
      const stomp=game.player.vy>80 && game.player.y+game.player.h<=e.y+18;
      if(stomp){e.dead=true;game.player.vy=-430;beep(230,.08,"square");addParticles(e.x+20,e.y+15,"hit")}
      else game.player.hurt();
    }
  }
  for(const cp of game.checkpoints){
    if(!cp.hit&&game.player.x>cp.x){cp.hit=true;game.player.checkpoint={x:cp.x+18,y:cp.y-game.player.h};toast("Checkpoint reached!");beep(660,.08)}
  }
  for(const w of levelData.water){
    const r=rect(...w);if(overlap(game.player,r)&&game.player.y+game.player.h>r.y+5)game.player.hurt(true);
  }
  const flag=rect(levelData.flag[0],levelData.flag[1]-120,45,120);
  if(overlap(game.player,flag))completeLevel();
  camera.x=clamp(game.player.x-W*.45,0,levelData.width-W);
  camera.x += (Math.random()-.5)*camera.shake;camera.shake*=.84;
  for(const p of game.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=500*dt}
  game.particles=game.particles.filter(p=>p.life>0);
  updateHUD();
}
function addParticles(x,y,type){for(let i=0;i<10;i++)game.particles.push({x,y,vx:(Math.random()-.5)*220,vy:-Math.random()*250-50,life:.6+Math.random()*.4,type})}

function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#168bd6");g.addColorStop(1,"#b8edff");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // sun
  ctx.fillStyle="rgba(255,242,169,.85)";ctx.beginPath();ctx.arc(1050,125,55,0,Math.PI*2);ctx.fill();
  // clouds parallax
  drawCloud(180-camera.x*.08,130,1.2);drawCloud(560-camera.x*.12,210,.8);drawCloud(1040-camera.x*.1,170,1.1);drawCloud(1450-camera.x*.08,115,.9);
  drawMountains(-camera.x*.15,400,"#78b8d7");drawMountains(700-camera.x*.22,445,"#5b9ec4");
  // distant castle
  const cx=1040-camera.x*.32;ctx.fillStyle="#eadfc7";ctx.fillRect(cx,250,260,170);
  ctx.fillStyle="#b94f57";ctx.beginPath();ctx.moveTo(cx+15,250);ctx.lineTo(cx+55,185);ctx.lineTo(cx+95,250);ctx.fill();
  ctx.beginPath();ctx.moveTo(cx+125,250);ctx.lineTo(cx+165,140);ctx.lineTo(cx+205,250);ctx.fill();
  ctx.beginPath();ctx.moveTo(cx+215,250);ctx.lineTo(cx+245,195);ctx.lineTo(cx+275,250);ctx.fill();
  ctx.fillStyle="#d0d8d9";ctx.fillRect(cx+42,220,25,75);ctx.fillRect(cx+152,175,25,100);ctx.fillRect(cx+225,220,20,70);
  ctx.fillStyle="#7dbb73";for(let i=0;i<14;i++){let x=(i*190-camera.x*.42)%1450;ctx.beginPath();ctx.arc(x,390-(i%3)*10,34,0,Math.PI*2);ctx.fill()}
}
function drawCloud(x,y,s){ctx.fillStyle="rgba(255,255,255,.72)";ctx.beginPath();ctx.arc(x,y,28*s,0,Math.PI*2);ctx.arc(x+35*s,y-12*s,35*s,0,Math.PI*2);ctx.arc(x+75*s,y,28*s,0,Math.PI*2);ctx.fill()}
function drawMountains(offset,y,color){ctx.fillStyle=color;for(let i=-1;i<7;i++){let x=offset+i*260;ctx.beginPath();ctx.moveTo(x,y+130);ctx.lineTo(x+130,y-100-(i%2)*40);ctx.lineTo(x+280,y+130);ctx.closePath();ctx.fill()}}
function drawWater(){
  for(const w of levelData.water){
    const x=w[0]-camera.x,y=w[1],ww=w[2],hh=w[3];ctx.fillStyle="rgba(36,160,217,.9)";ctx.fillRect(x,y,ww,hh);
    ctx.strokeStyle="rgba(180,245,255,.75)";ctx.lineWidth=3;
    for(let xx=x;xx<x+ww;xx+=30){ctx.beginPath();ctx.moveTo(xx,y+7);ctx.quadraticCurveTo(xx+8,y,xx+15,y+7);ctx.quadraticCurveTo(xx+22,y+14,xx+30,y+7);ctx.stroke()}
  }
}
function drawGround(a){
  const [x,y,w,h]=a,sx=x-camera.x;ctx.fillStyle="#9b5b2e";ctx.fillRect(sx,y,w,h);
  ctx.fillStyle="#5dbb52";ctx.fillRect(sx,y,w,17);ctx.fillStyle="#7ed85b";
  for(let i=0;i<w;i+=26){ctx.beginPath();ctx.arc(sx+i+8,y+5,8,Math.PI,Math.PI*2);ctx.fill()}
  ctx.fillStyle="rgba(91,47,25,.28)";for(let yy=y+35;yy<y+h;yy+=40)for(let xx=sx+20;xx<sx+w;xx+=70){ctx.beginPath();ctx.arc(xx+(yy%60),yy,7,0,Math.PI*2);ctx.fill()}
}
function drawFlag(){
  const x=levelData.flag[0]-camera.x,y=levelData.flag[1];ctx.fillStyle="#8b5a35";ctx.fillRect(x,y-120,7,120);
  ctx.fillStyle="#ff5b4e";ctx.beginPath();ctx.moveTo(x+7,y-115);ctx.lineTo(x+72,y-94);ctx.lineTo(x+7,y-72);ctx.fill();
  ctx.fillStyle="#ffd64d";ctx.beginPath();ctx.arc(x+3,y-123,10,0,Math.PI*2);ctx.fill()
}
function render(){
  ctx.setTransform(1,0,0,1,0,0);drawBackground();
  drawWater();
  for(const p of levelData.platforms)drawGround(p);
  for(const p of levelData.smallPlatforms)drawGround([p[0],p[1],p[2],120]);
  for(const pipe of game?.pipes||[])pipe.draw();
  for(const cp of game?.checkpoints||[])cp.draw();
  for(const q of game?.questions||[])q.draw();
  for(const c of game?.coins||[])c.draw();
  for(const s of game?.stars||[])s.draw();
  for(const e of game?.enemies||[])e.draw();
  drawFlag();
  if(game?.player)game.player.draw();
  for(const p of game?.particles||[]){ctx.fillStyle=p.type==="coin"?"#ffd33d":p.type==="star"?"#fff":"#f58a4c";ctx.fillRect(p.x-camera.x,p.y,5,5)}
}
function completeLevel(){
  if(game.complete)return;game.complete=true;gameState="complete";beep(880,.15,"triangle");setTimeout(()=>beep(1100,.2,"triangle"),120);
  save.unlockedLevel=Math.max(save.unlockedLevel,1);save.best[levelData.id]=Math.max(save.best[levelData.id]||0,game.starCount);localStorage.setItem("lukaSave",JSON.stringify(save));
  ui.resultCoins.textContent=game.coinCount;ui.resultStars.textContent=game.starCount+"/3";ui.resultTime.textContent=Math.ceil(game.timer);
  hideAll();ui.complete.classList.remove("hidden");
}
function showGameOver(){gameState="gameover";hideAll();ui.over.classList.remove("hidden")}
function startGame(){resetGame();hideAll();ui.hud.classList.remove("hidden");ui.mobile.classList.remove("hidden");gameState="playing";beep(660,.08)}
function hideAll(){for(const e of [ui.menu,ui.levels,ui.settings,ui.credits,ui.pause,ui.over,ui.complete])e.classList.add("hidden")}
function menu(){gameState="menu";hideAll();ui.hud.classList.add("hidden");ui.mobile.classList.add("hidden");ui.menu.classList.remove("hidden")}
function pause(){if(gameState==="playing"){gameState="paused";ui.pause.classList.remove("hidden")}else if(gameState==="paused"){gameState="playing";ui.pause.classList.add("hidden")}}
function restart(){startGame()}
function setKey(name,val){keys[name]=val}

window.addEventListener("keydown",e=>{
  if(["ArrowLeft","ArrowRight","ArrowUp","Space"].includes(e.code))e.preventDefault();
  if(e.code==="Escape"){pause();return}
  if(e.code==="ArrowLeft"||e.code==="KeyA")setKey("left",true);
  if(e.code==="ArrowRight"||e.code==="KeyD")setKey("right",true);
  if(e.code==="ArrowUp"||e.code==="KeyW"||e.code==="Space"){setKey("jump",true);if(gameState==="playing")game.player.requestJump()}
});
window.addEventListener("keyup",e=>{
  if(e.code==="ArrowLeft"||e.code==="KeyA")setKey("left",false);
  if(e.code==="ArrowRight"||e.code==="KeyD")setKey("right",false);
  if(e.code==="ArrowUp"||e.code==="KeyW"||e.code==="Space")setKey("jump",false);
});
function bindHold(id,key){
  const el=document.getElementById(id);
  const on=e=>{e.preventDefault();setKey(key,true);if(key==="jump"&&gameState==="playing")game.player.requestJump()};
  const off=e=>{e.preventDefault();setKey(key,false)};
  ["pointerdown","touchstart"].forEach(ev=>el.addEventListener(ev,on,{passive:false}));
  ["pointerup","pointercancel","pointerleave","touchend"].forEach(ev=>el.addEventListener(ev,off,{passive:false}));
}
bindHold("leftBtn","left");bindHold("rightBtn","right");bindHold("jumpBtn","jump");

document.getElementById("playBtn").onclick=startGame;
document.getElementById("levelsBtn").onclick=()=>{hideAll();ui.levels.classList.remove("hidden");gameState="levelselect"};
document.getElementById("settingsBtn").onclick=()=>{hideAll();ui.settings.classList.remove("hidden");gameState="settings"};
document.getElementById("creditsBtn").onclick=()=>{hideAll();ui.credits.classList.remove("hidden");gameState="credits"};
document.getElementById("levelBack").onclick=menu;document.getElementById("settingsBack").onclick=menu;document.getElementById("creditsBack").onclick=menu;
document.querySelector(".level-btn[data-level='0']").onclick=startGame;
document.getElementById("resumeBtn").onclick=pause;document.getElementById("restartBtn").onclick=restart;document.getElementById("pauseMenuBtn").onclick=menu;
document.getElementById("tryAgainBtn").onclick=restart;document.getElementById("gameOverMenuBtn").onclick=menu;
document.getElementById("nextBtn").onclick=startGame;document.getElementById("completeMenuBtn").onclick=menu;
document.getElementById("soundToggle").onchange=e=>{settings.sound=e.target.checked;localStorage.setItem("lukaSound",settings.sound)};
document.getElementById("shakeToggle").onchange=e=>{settings.shake=e.target.checked;localStorage.setItem("lukaShake",settings.shake)};

function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.aspectRatio=`${W}/${H}`;ctx.setTransform(dpr,0,0,dpr,0,0)}
window.addEventListener("resize",resize);resize();

function loop(t){
  if(!last)last=t;let dt=Math.min(.033,(t-last)/1000);last=t;
  updateGame(dt);render();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
menu();
})();
