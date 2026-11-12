(() => {
  'use strict';
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const mapCanvas = document.getElementById('minimap'), mctx = mapCanvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const W = 2400, H = 1700, exit = {x:2240,y:230};
  const player = {x:170,y:1460,vx:0,vy:0,angle:-.75,stamina:100,flash:true,battery:100};
  const bear = {x:1780,y:1390,vx:0,vy:0,angle:0,mode:'search',alert:0,stun:0};
  const markers = [{x:650,y:1300,got:false},{x:1195,y:900,got:false},{x:1740,y:560,got:false}];
  const keys = new Set(), trees = [], stones = [], ferns = [], motes = [];
  let running=false,paused=false,dead=false,won=false,last=0,elapsed=0,toastTimer=0,flashPulse=0,noise=0, sound=false,audioCtx=null;
  let cw=0,ch=0,dpr=1,camera={x:0,y:0},shake=0;
  const rand=(seed=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296})(728391);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  // A quiet, winding service trail connects the lost hiker to the ranger gate.
  const trail = new Path2D();
  trail.moveTo(100,1540); trail.bezierCurveTo(450,1540,400,1280,720,1220); trail.bezierCurveTo(970,1170,900,930,1190,850); trail.bezierCurveTo(1500,770,1450,570,1730,500); trail.bezierCurveTo(1970,440,1950,270,2290,210);
  function pathPoint(t){
    const segs=[[[100,1540],[450,1540],[400,1280],[720,1220]],[[720,1220],[970,1170],[900,930],[1190,850]],[[1190,850],[1500,770],[1450,570],[1730,500]],[[1730,500],[1970,440],[1950,270],[2290,210]]];
    let q=t*4,i=Math.min(3,Math.floor(q)),u=q-i,s=segs[i],v=1-u;
    return {x:v*v*v*s[0][0]+3*v*v*u*s[1][0]+3*v*u*u*s[2][0]+u*u*u*s[3][0],y:v*v*v*s[0][1]+3*v*v*u*s[1][1]+3*v*u*u*s[2][1]+u*u*u*s[3][1]};
  }
  // Generate a dense but navigable forest. Clearings are deliberately left around the trail and landmarks.
  function nearTrail(x,y){for(let i=0;i<=45;i++){let p=pathPoint(i/45);if(Math.hypot(x-p.x,y-p.y)<92)return true}return false}
  for(let i=0;i<460;i++){
    const x=35+rand()*(W-70),y=35+rand()*(H-70);
    if(nearTrail(x,y)||Math.hypot(x-170,y-1460)<105||Math.hypot(x-exit.x,y-exit.y)<120||markers.some(m=>Math.hypot(x-m.x,y-m.y)<90))continue;
    let scale=.72+rand()*.8;trees.push({x,y,r:15+scale*13,scale,shade:Math.floor(rand()*4),lean:(rand()-.5)*.24,seed:rand()});
  }
  for(let i=0;i<530;i++){stones.push({x:rand()*W,y:rand()*H,r:1+rand()*3,shade:rand()});if(i<230)ferns.push({x:rand()*W,y:rand()*H,s:.5+rand()*.8,a:rand()*6.28})}
  for(let i=0;i<90;i++)motes.push({x:rand()*W,y:rand()*H,r:1+rand()*2,v:10+rand()*25,phase:rand()*6.28});
  const palettes=[['#172c26','#20382e','#304636'],['#182a27','#20332d','#2d4035'],['#1b2b24','#28392e','#3a4631'],['#142823','#1f372c','#334535']];
  function resize(){dpr=Math.min(devicePixelRatio||1,2);cw=innerWidth;ch=innerHeight;canvas.width=Math.floor(cw*dpr);canvas.height=Math.floor(ch*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
  addEventListener('resize',resize);resize();
  function worldToScreen(x,y){return {x:x-camera.x+cw/2,y:y-camera.y+ch/2}}
  function drawTerrain(){
    ctx.fillStyle='#192923';ctx.fillRect(0,0,cw,ch);
    // broad, quiet ground variation
    for(let i=0;i<stones.length;i++){let s=stones[i],p=worldToScreen(s.x,s.y);if(p.x<-5||p.x>cw+5||p.y<-5||p.y>ch+5)continue;ctx.fillStyle=s.shade>.5?'rgba(130,143,108,.07)':'rgba(3,12,10,.12)';ctx.beginPath();ctx.ellipse(p.x,p.y,s.r*1.6,s.r,0,0,6.28);ctx.fill()}
    ctx.save();ctx.translate(cw/2-camera.x,ch/2-camera.y);
    // wet, faintly reflective trail edges and compacted earth
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(6,12,11,.75)';ctx.lineWidth=118;ctx.stroke(trail);
    ctx.strokeStyle='#344137';ctx.lineWidth=105;ctx.stroke(trail);
    ctx.strokeStyle='rgba(121,117,87,.16)';ctx.lineWidth=76;ctx.stroke(trail);
    ctx.strokeStyle='rgba(198,180,126,.055)';ctx.lineWidth=2;ctx.setLineDash([2,16]);ctx.stroke(trail);ctx.setLineDash([]);
    ctx.restore();
    // small wet leaf and fern marks in clearings
    for(const f of ferns){let p=worldToScreen(f.x,f.y);if(p.x<-20||p.x>cw+20||p.y<-20||p.y>ch+20)continue;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(f.a);ctx.strokeStyle='rgba(96,126,79,.24)';ctx.lineWidth=2;for(let j=-2;j<=2;j++){ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(j*5,-8*f.s,j*10,-15*f.s);ctx.stroke()}ctx.restore()}
  }
  function drawTree(t){
    const p=worldToScreen(t.x,t.y),r=t.r;if(p.x<-r*2||p.x>cw+r*2||p.y<-r*2||p.y>ch+r*2)return;
    const colors=palettes[t.shade];
    ctx.fillStyle='rgba(3,9,8,.35)';ctx.beginPath();ctx.ellipse(p.x+5,p.y+9,r*1.12,r*.7,0,0,6.28);ctx.fill();
    ctx.fillStyle='#322b21';ctx.beginPath();ctx.ellipse(p.x,p.y+3,r*.28,r*.34,t.lean,0,6.28);ctx.fill();
    ctx.fillStyle=colors[0];ctx.beginPath();ctx.arc(p.x,p.y-r*.17,r,0,6.28);ctx.fill();
    ctx.fillStyle=colors[1];ctx.beginPath();ctx.ellipse(p.x-r*.18,p.y-r*.26,r*.76,r*.57,-.25,0,6.28);ctx.fill();
    ctx.fillStyle=colors[2];ctx.beginPath();ctx.ellipse(p.x-r*.33,p.y-r*.46,r*.42,r*.27,-.3,0,6.28);ctx.fill();
    ctx.fillStyle='rgba(174,184,139,.08)';ctx.beginPath();ctx.ellipse(p.x-r*.42,p.y-r*.58,r*.17,r*.1,-.4,0,6.28);ctx.fill();
    // visible bark and low roots catch the hiker's beam
    ctx.strokeStyle='rgba(127,121,84,.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,p.y-r*.1);ctx.lineTo(p.x+2,p.y+r*.28);ctx.moveTo(p.x,p.y+r*.19);ctx.lineTo(p.x-r*.25,p.y+r*.39);ctx.moveTo(p.x+1,p.y+r*.23);ctx.lineTo(p.x+r*.24,p.y+r*.4);ctx.stroke();
  }
  function drawMarker(m,i){
    const p=worldToScreen(m.x,m.y);if(p.x<-55||p.x>cw+55||p.y<-55||p.y>ch+55)return;
    if(m.got){ctx.fillStyle='rgba(219,192,132,.12)';ctx.beginPath();ctx.arc(p.x,p.y,25,0,6.28);ctx.fill();return}
    const pulse=.5+.5*Math.sin(elapsed*2.7+i);
    ctx.fillStyle=`rgba(234,199,119,${.1+pulse*.11})`;ctx.beginPath();ctx.arc(p.x,p.y,20+pulse*5,0,6.28);ctx.fill();
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-.16);ctx.fillStyle='#b8a879';ctx.fillRect(-10,-13,20,27);ctx.fillStyle='#e7d798';ctx.fillRect(-8,-11,16,5);ctx.fillStyle='#536655';ctx.fillRect(-7,-3,14,13);ctx.strokeStyle='rgba(245,231,173,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-5,3);ctx.lineTo(5,3);ctx.moveTo(0,-2);ctx.lineTo(0,8);ctx.stroke();ctx.restore();
  }
  function drawExit(){let p=worldToScreen(exit.x,exit.y);ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='rgba(159,222,171,.13)';ctx.beginPath();ctx.arc(0,0,47,0,6.28);ctx.fill();ctx.strokeStyle='#78927a';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-28,18);ctx.lineTo(-28,-20);ctx.quadraticCurveTo(0,-46,28,-20);ctx.lineTo(28,18);ctx.stroke();ctx.fillStyle='#ced5ab';ctx.fillRect(-17,-5,34,13);ctx.fillStyle='#18231c';ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText('RANGER',0,4);ctx.restore()}
  function drawPlayer(){
    const p=worldToScreen(player.x,player.y);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(player.angle);
    ctx.fillStyle='rgba(0,0,0,.4)';ctx.beginPath();ctx.ellipse(0,7,12,7,0,0,6.28);ctx.fill();
    ctx.fillStyle='#b9aa82';ctx.beginPath();ctx.ellipse(0,0,7,10,0,0,6.28);ctx.fill();ctx.fillStyle='#d3c59c';ctx.beginPath();ctx.arc(0,-6,5.2,0,6.28);ctx.fill();
    ctx.fillStyle='#2d3931';ctx.fillRect(-8,-1,16,8);ctx.fillStyle='#c2b588';ctx.fillRect(-3,-8,6,3);
    ctx.fillStyle='#d6c985';ctx.beginPath();ctx.arc(7,-3,2,0,6.28);ctx.fill();
    if(player.flash){ctx.fillStyle='#e8dfad';ctx.beginPath();ctx.arc(10,-2,2,0,6.28);ctx.fill()}
    ctx.restore();
  }
  function drawBear(){
    const p=worldToScreen(bear.x,bear.y);if(p.x<-100||p.x>cw+100||p.y<-100||p.y>ch+100)return;
    const d=dist(player,bear),inBeam=player.flash&&player.battery>0&&d<390&&Math.abs(Math.atan2(Math.sin(Math.atan2(bear.y-player.y,bear.x-player.x)-player.angle),Math.cos(Math.atan2(bear.y-player.y,bear.x-player.x)-player.angle)))<.49;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(bear.angle);
    const grow=1+Math.min(.2,bear.alert*.12);ctx.scale(grow,grow);
    ctx.fillStyle='rgba(0,0,0,.52)';ctx.beginPath();ctx.ellipse(-1,13,31,15,0,0,6.28);ctx.fill();
    // broad, low-slung silhouette, heavy shoulders and unmistakable round ears
    ctx.fillStyle='#171c18';ctx.beginPath();ctx.ellipse(0,0,28,17,0,0,6.28);ctx.fill();ctx.beginPath();ctx.ellipse(19,-4,15,12,-.1,0,6.28);ctx.fill();
    ctx.beginPath();ctx.arc(27,-14,5.5,0,6.28);ctx.arc(14,-15,5,0,6.28);ctx.fill();
    ctx.fillStyle='#26251c';ctx.beginPath();ctx.ellipse(28,1,7,5,.25,0,6.28);ctx.fill();
    ctx.fillStyle='#090d0b';for(const x of [-18,-5,13,22]){ctx.beginPath();ctx.ellipse(x,11,5,4,0,0,6.28);ctx.fill()}
    ctx.fillStyle=inBeam?'#ffcd72':(bear.alert>.35?'#d75b45':'#a85b43');ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=inBeam?13:7;ctx.beginPath();ctx.arc(31,-4,1.8,0,6.28);ctx.fill();ctx.beginPath();ctx.arc(21,-4,1.5,0,6.28);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(130,113,80,.24)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-14,-10);ctx.quadraticCurveTo(0,-17,13,-12);ctx.stroke();ctx.restore();
  }
  function drawLighting(){
    const p=worldToScreen(player.x,player.y);
    const dark=ctx.createRadialGradient(p.x,p.y,25,p.x,p.y,Math.max(cw,ch)*.76);
    dark.addColorStop(0,'rgba(4,9,10,.18)');dark.addColorStop(.24,'rgba(4,9,10,.32)');dark.addColorStop(.62,'rgba(3,8,9,.78)');dark.addColorStop(1,'rgba(2,6,8,.94)');ctx.fillStyle=dark;ctx.fillRect(0,0,cw,ch);
    if(player.flash&&player.battery>0){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(player.angle);
      ctx.globalCompositeOperation='screen';const cone=ctx.createRadialGradient(0,0,14,140,0,440);cone.addColorStop(0,'rgba(240,219,161,.3)');cone.addColorStop(.55,'rgba(218,204,154,.16)');cone.addColorStop(1,'rgba(218,204,154,0)');
      ctx.fillStyle=cone;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,450,-.55,.55);ctx.closePath();ctx.fill();ctx.restore();
    }
    // moonlight puddles and drifting ground mist
    ctx.globalCompositeOperation='screen';for(const f of motes){let x=(f.x+elapsed*f.v)%W,y=f.y+Math.sin(elapsed+f.phase)*8,p=worldToScreen(x,y);if(p.x<-4||p.x>cw+4||p.y<-4||p.y>ch+4)continue;ctx.fillStyle=`rgba(190,207,167,${.04+Math.sin(elapsed*1.7+f.phase)*.025})`;ctx.beginPath();ctx.arc(p.x,p.y,f.r,0,6.28);ctx.fill()}ctx.globalCompositeOperation='source-over';
    const vignette=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*.28,cw/2,ch/2,Math.max(cw,ch)*.72);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.3)');ctx.fillStyle=vignette;ctx.fillRect(0,0,cw,ch);
  }
  function drawMinimap(){
    const w=mapCanvas.width,h=mapCanvas.height;mctx.fillStyle='#192922';mctx.fillRect(0,0,w,h);
    mctx.save();mctx.scale(w/W,h/H);mctx.lineCap='round';mctx.lineWidth=90;mctx.strokeStyle='#344137';mctx.stroke(trail);
    for(const t of trees){mctx.fillStyle='#101e19';mctx.beginPath();mctx.arc(t.x,t.y,t.r*.7,0,6.28);mctx.fill()}
    for(const m of markers)if(!m.got){mctx.fillStyle='#d5bc77';mctx.fillRect(m.x-16,m.y-16,32,32)}
    mctx.fillStyle='#9bcca1';mctx.fillRect(exit.x-17,exit.y-17,34,34);
    mctx.fillStyle='#f4d781';mctx.beginPath();mctx.arc(player.x,player.y,29,0,6.28);mctx.fill();
    mctx.fillStyle='#c95442';mctx.beginPath();mctx.arc(bear.x,bear.y,23,0,6.28);mctx.fill();mctx.restore();
  }
  function draw(){
    ctx.clearRect(0,0,cw,ch);drawTerrain();
    // Items and silhouettes are depth sorted with the trees, so the forest has real layering.
    let objects=trees.map(t=>({y:t.y,type:'tree',o:t}));markers.forEach((m,i)=>objects.push({y:m.y,type:'marker',o:m,i}));objects.push({y:exit.y,type:'exit'});objects.push({y:bear.y,type:'bear'});objects.push({y:player.y,type:'player'});
    objects.sort((a,b)=>a.y-b.y);for(const obj of objects){if(obj.type==='tree')drawTree(obj.o);else if(obj.type==='marker')drawMarker(obj.o,obj.i);else if(obj.type==='exit')drawExit();else if(obj.type==='bear')drawBear();else drawPlayer()}
    drawLighting();drawMinimap();
  }
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
  function updateHud(){
    $('staminaBar').style.width=player.stamina+'%';$('staminaText').textContent=Math.round(player.stamina)+'%';
    $('batteryBar').style.width=player.battery+'%';$('batteryText').textContent=Math.round(player.battery)+'%';$('batteryBar').style.background=player.battery<22?'#df765e':'linear-gradient(90deg,#d4ad61,#e9cf91)';
    $('flashTouch').classList.toggle('light-off',!player.flash);$('dangerBar').style.width=clamp(bear.alert*100,0,100)+'%';
    const d=dist(player,bear),level=clamp(Math.max(bear.alert,(d<280?.9:d<480?.55:0)),0,1);
    $('dangerText').textContent=level>.75?'CLOSE':level>.32?'NEAR':'QUIET';$('dangerNote').textContent=level>.75?'It knows exactly where you are.':level>.32?'Something is following your light.':'Keep to the trail. Move softly.';
    const got=markers.filter(m=>m.got).length;$('markerCount').textContent=`${got} / 3`;
    $('objectiveText').childNodes[0].textContent=got===3?'Reach the ranger gate ':'Find the trail markers ';
  }
  function playTone(freq,duration=.08,type='sine',vol=.025){if(!sound)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch(_){}}
  function update(dt){
    if(!running||paused||dead||won)return;
    elapsed+=dt;flashPulse+=dt;
    const ix=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    const iy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    const moving=ix!==0||iy!==0,tryingRun=keys.has('shift')&&moving&&player.stamina>2;
    const speed=(tryingRun?195:118)*(nearTrail(player.x,player.y)?1:.82);
    const norm=Math.hypot(ix,iy)||1,targetX=ix/norm*speed,targetY=iy/norm*speed;
    const accel=moving?9:7;player.vx+=(targetX-player.vx)*Math.min(1,dt*accel);player.vy+=(targetY-player.vy)*Math.min(1,dt*accel);
    let nx=clamp(player.x+player.vx*dt,18,W-18),ny=clamp(player.y+player.vy*dt,18,H-18);
    // Trees are solid; sliding along a trunk is more forgiving than stopping dead.
    for(const t of trees){if(Math.abs(nx-t.x)>t.r+17||Math.abs(ny-t.y)>t.r+17)continue;let dx=nx-t.x,dy=ny-t.y,d=Math.hypot(dx,dy),min=t.r*.74+10;if(d<min){if(d<.01){dx=1;d=1}nx=t.x+dx/d*min;ny=t.y+dy/d*min}}
    player.x=nx;player.y=ny;if(moving)player.angle=Math.atan2(iy,ix);
    if(tryingRun){player.stamina=Math.max(0,player.stamina-25*dt);noise=Math.min(1,noise+dt*.85)}else{player.stamina=Math.min(100,player.stamina+13*dt);noise=Math.max(0,noise-dt*.3)}
    if(player.flash){player.battery=Math.max(0,player.battery-1.6*dt);if(player.battery===0)player.flash=false}
    for(let i=0;i<markers.length;i++){const m=markers[i];if(!m.got&&dist(player,m)<35){m.got=true;player.battery=Math.min(100,player.battery+20);showToast(['Marker 01 recovered — the trail is still there. (+ light)','Marker 02 recovered — you hear the gate chain. (+ light)','All markers found. The ranger gate is lit. (+ light)'][i]);playTone(590,.22,'sine',.04);setTimeout(()=>playTone(790,.3,'sine',.03),110)}}
    // The bear searches in the timber until it hears a sprint or catches the hiker's scent.
    let d=dist(player,bear),toPlayer=Math.atan2(player.y-bear.y,player.x-bear.x);
    const beamAngle=Math.atan2(bear.y-player.y,bear.x-player.x)-player.angle;
    const shining=player.flash&&player.battery>0&&d<430&&Math.abs(Math.atan2(Math.sin(beamAngle),Math.cos(beamAngle)))<.52;
    if(shining&&d<260){bear.stun=Math.min(.8,bear.stun+dt);bear.alert=Math.max(0,bear.alert-dt*.95)}else bear.stun=Math.max(0,bear.stun-dt);
    const hearing=d<720&&(noise>.08||d<210);
    if(hearing)bear.alert=Math.min(1,bear.alert+dt*(noise>.3?.36:.2));else bear.alert=Math.max(0,bear.alert-dt*.065);
    let target;
    if(bear.alert>.14||hearing){target={x:player.x,y:player.y};bear.mode='hunt'}else{target={x:player.x+Math.sin(elapsed*.21)*260,y:player.y+Math.cos(elapsed*.18)*210};bear.mode='search'}
    let desired=target?Math.atan2(target.y-bear.y,target.x-bear.x):toPlayer;
    if(shining&&d<250)desired=toPlayer+Math.PI;
    bear.angle=desired;
    const bearSpeed=bear.stun>0?24:(bear.mode==='hunt'?(d<260?151:107+bear.alert*25):68);
    const bx=Math.cos(desired)*bearSpeed,by=Math.sin(desired)*bearSpeed;bear.vx+=(bx-bear.vx)*Math.min(1,dt*2);bear.vy+=(by-bear.vy)*Math.min(1,dt*2);
    bear.x=clamp(bear.x+bear.vx*dt,30,W-30);bear.y=clamp(bear.y+bear.vy*dt,30,H-30);
    // Gently nudge the animal around trunks rather than allowing it to get stuck.
    for(const t of trees){let dx=bear.x-t.x,dy=bear.y-t.y,d2=Math.hypot(dx,dy),min=t.r*.76+19;if(d2<min&&d2>.01){bear.x=t.x+dx/d2*min;bear.y=t.y+dy/d2*min}}
    d=dist(player,bear);if(d<34){dead=true;endGame(false)}
    if(markers.every(m=>m.got)&&dist(player,exit)<66){won=true;endGame(true)}
    camera.x+=(player.x-camera.x)*Math.min(1,dt*4);camera.y+=(player.y-camera.y)*Math.min(1,dt*4);
    if(shake>0)shake=Math.max(0,shake-dt*20);
    updateHud();
  }
  function endGame(success){
    running=false;const el=$('centerMessage');el.innerHTML=success?'YOU FOUND THE WAY HOME.<small>BLACKPINE FOREST • 12:16 AM</small>':'THE WOODS GO QUIET.<small>The trail is still out there. Try again.</small>';el.classList.add('show');
    setTimeout(()=>{el.classList.remove('show');$('overlay').classList.remove('hidden');$('startBtn').textContent=success?'WALK THE TRAIL AGAIN  →':'TRY AGAIN  →';$('intro-copy')},2300);
    playTone(success?440:95,success?.35:.6,success?'sine':'triangle',.05);
  }
  function frame(time){const dt=Math.min(.04,(time-last)/1000||0);last=time;if(!paused)update(dt);draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);
  function start(){
    if(dead||won){location.reload();return}
    running=true;paused=false;$('overlay').classList.add('hidden');$('centerMessage').classList.remove('show');last=performance.now();playTone(260,.16,'triangle',.025);
  }
  $('startBtn').addEventListener('click',start);
  $('pauseBtn').addEventListener('click',()=>{if(!running)return;paused=!paused;$('centerMessage').innerHTML=paused?'PAUSED<small>TAKE A BREATH. LISTEN.</small>':'';$('centerMessage').classList.toggle('show',paused)});
  $('soundBtn').addEventListener('click',()=>{sound=!sound;$('soundBtn').style.color=sound?'#e4bd70':'';playTone(520,.08)});
  function toggleFlash(){player.flash=!player.flash&&player.battery>0;playTone(player.flash?380:180,.05,'sine',.02)}
  addEventListener('keydown',e=>{let key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();keys.add(key);if(key==='f'&&!e.repeat)toggleFlash();if(key==='escape'||key==='p')if(running){paused=!paused;$('centerMessage').innerHTML=paused?'PAUSED<small>TAKE A BREATH. LISTEN.</small>':'';$('centerMessage').classList.toggle('show',paused)}});
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('[data-dir]').forEach(btn=>{const key={up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright'}[btn.dataset.dir];const down=e=>{e.preventDefault();keys.add(key);btn.setPointerCapture?.(e.pointerId)};const up=e=>{e.preventDefault();keys.delete(key)};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('lostpointercapture',up)});
  const runTouch=$('runTouch');runTouch.addEventListener('pointerdown',e=>{e.preventDefault();keys.add('shift');runTouch.setPointerCapture?.(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>runTouch.addEventListener(ev,()=>keys.delete('shift')));
  $('flashTouch').addEventListener('pointerdown',e=>{e.preventDefault();toggleFlash()});
  updateHud();
})();
