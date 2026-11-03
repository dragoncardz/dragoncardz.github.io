// Invocation secrète : la caméra se retourne d'un coup, l'étoile arc-en-ciel fonce sur elle, flash blanc.
// Chargée à la demande. Le jeu enchaîne ensuite sur le nom et l'illustration de la carte.
window.SECRET3D=(function(){
if(!window.THREE)return null;
function cl(x,a,b){return Math.min(b,Math.max(a,x));}
function sm(a,b,x){var k=cl((x-a)/(b-a),0,1);return k*k*(3-2*k);}
function mix(a,b,k){return a+(b-a)*k;}

/* Temps de la scène, en secondes */
var T={tourne:.8,tourneFin:1.08,apparait:1.2,fonce:2.05,flash:2.5,fin:2.65};

var racine=document.createElement('div');
racine.style.cssText='position:fixed;inset:0;z-index:99992;display:none;background:#000;overflow:hidden';
racine.innerHTML='<canvas style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas><div style="position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none"></div>';
document.body.appendChild(racine);
var canvas=racine.querySelector('canvas'),fl=racine.lastChild;

var R;try{R=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});}catch(e){racine.remove();return null;}
var scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1,.1,700),fond=new THREE.Color(0x03030c),FOV=50,fovBase=50;
scene.background=fond;
var composer=null;
try{composer=new THREE.EffectComposer(R);composer.addPass(new THREE.RenderPass(scene,cam));composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(256,256),.7,.5,.9));}catch(e){composer=null;}
var mobile=/Mobi|Android|iPhone/i.test(navigator.userAgent);
function taille(){
  var W=racine.clientWidth||innerWidth,H=racine.clientHeight||innerHeight,pr=Math.min(window.devicePixelRatio||1,mobile?1.5:2);
  R.setPixelRatio(pr);R.setSize(W,H,false);if(composer){composer.setPixelRatio(pr);composer.setSize(W,H);}
  cam.aspect=W/H;fovBase=cam.aspect<1?Math.min(80,FOV/Math.pow(cam.aspect,.7)):FOV;
}
window.addEventListener('resize',function(){if(racine.style.display!=='none')taille();});

/* Ciel étoilé tout autour de la caméra : c'est lui qui rend la rotation visible */
(function(){
  var n=mobile?1200:3000,p=new Float32Array(n*3);
  for(var i=0;i<n;i++){var a=Math.random()*6.283,b=Math.acos(Math.random()*2-1),r=120+Math.random()*200;p[i*3]=r*Math.sin(b)*Math.cos(a);p[i*3+1]=r*Math.cos(b);p[i*3+2]=r*Math.sin(b)*Math.sin(a);}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xdfe6ff,size:1.05,transparent:true,opacity:.9,depthWrite:false})));
})();

/* Étoile arc-en-ciel */
function txHalo(){var c=document.createElement('canvas');c.width=c.height=256;var x=c.getContext('2d'),g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,255,255,.75)');g.addColorStop(.5,'rgba(255,255,255,.18)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,256,256);return new THREE.CanvasTexture(c);}
function txRayons(){
  var c=document.createElement('canvas');c.width=c.height=512;var x=c.getContext('2d');x.translate(256,256);x.globalCompositeOperation='lighter';
  for(var i=0;i<14;i++){
    var a=i/14*6.283,l=i%2?150:250,w=i%2?.09:.13,g=x.createRadialGradient(0,0,8,0,0,l);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'hsla('+(i/14*360)+',100%,62%,.95)');g.addColorStop(1,'hsla('+(i/14*360)+',100%,60%,0)');
    x.fillStyle=g;x.beginPath();x.moveTo(0,0);x.lineTo(Math.cos(a-w)*l,Math.sin(a-w)*l);x.lineTo(Math.cos(a)*l*1.02,Math.sin(a)*l*1.02);x.lineTo(Math.cos(a+w)*l,Math.sin(a+w)*l);x.fill();
  }
  return new THREE.CanvasTexture(c);
}
function sprite(tx){var s=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));s.visible=false;scene.add(s);return s;}
var TX_H=txHalo(),TX_R=txRayons(),coeur=sprite(TX_H),rayons=sprite(TX_R),rayons2=sprite(TX_R),traine=[];
for(var i=0;i<16;i++){var s=sprite(TX_H);s.material.color.setHSL(i/16,1,.6);traine.push(s);}

/* Déroulé */
var joue=false,t0=0,fin=null,sons=null,faits={},Z0=-170;
function son(n){if(!faits[n]){faits[n]=1;if(sons&&sons[n])sons[n]();}}
function retourDur(k){var a=k-1,s=1.1;return 1+(s+1)*a*a*a+s*a*a;}
function etape(t){
  if(t>=T.tourne-.3)son('alerte');if(t>=T.tourne)son('tourne');
  /* La caméra regarde devant elle, tremble, puis pivote d'un demi-tour */
  var kt=cl((t-T.tourne)/(T.tourneFin-T.tourne),0,1),ang=Math.PI*retourDur(kt);
  var se=.012*sm(T.tourne-.3,T.tourne,t)*(t<T.tourne?1:0)+.03*Math.exp(-Math.max(0,t-T.tourneFin)*6)*(t>=T.tourne?1:0)+.05*sm(T.fonce,T.flash,t);
  var yaw=ang+se*Math.sin(t*73),pitch=se*Math.sin(t*89)+mix(0,.02,kt);
  cam.position.set(0,0,0);
  cam.lookAt(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  /* Le champ s'ouvre pendant le demi-tour, puis se resserre vers l'étoile */
  cam.fov=fovBase+Math.sin(kt*Math.PI)*16-sm(T.apparait,T.fonce,t)*6;cam.updateProjectionMatrix();

  /* L'étoile : point lointain qui grossit, puis elle fonce sur la caméra */
  var vis=t>=T.apparait;
  coeur.visible=rayons.visible=rayons2.visible=vis;
  var pf=cl((t-T.fonce)/(T.fin-T.fonce),0,1),kf=Math.pow(pf,2.2),z=mix(Z0,-1.2,kf);
  if(vis){
    son('charge');if(t>=T.fonce)son('fonce');
    var pouls=1+Math.sin(t*16)*.08,gr=sm(T.apparait,T.fonce,t),base=mix(5,18,gr)*pouls*mix(1,1.8,pf);
    coeur.position.set(0,0,z);coeur.scale.setScalar(base*.9);
    rayons.position.set(0,0,z+.1);rayons.scale.setScalar(base*2.6);rayons.material.rotation=t*2.4;
    rayons2.position.set(0,0,z+.2);rayons2.scale.setScalar(base*1.9);rayons2.material.rotation=-t*3.3;rayons2.material.opacity=.8;
    fond.setRGB(mix(.012,.09,gr)+.02*Math.sin(t*5),.012,mix(.05,.16,gr));
  } else fond.setRGB(.012,.012,.047);
  traine.forEach(function(s,j){
    s.visible=pf>0&&pf<1;if(!s.visible)return;
    var k2=Math.pow(Math.max(0,pf-(j+1)*.016),2.2);
    s.position.set(0,0,mix(Z0,-1.2,k2));s.scale.setScalar(mix(9,3,j/16));s.material.opacity=.75*(1-j/18);
  });
  /* Flash blanc complet : le jeu prend le relais à la fin */
  fl.style.opacity=sm(T.flash,T.fin,t).toFixed(3);if(t>=T.flash)son('flash');
}
function rendu(){if(composer)composer.render();else R.render(scene,cam);}
function termine(){if(!joue)return;joue=false;fl.style.opacity=1;var f=fin;fin=null;if(f)f(true);}
function boucle(now){
  if(!joue)return;
  var t=(now-t0)/1000;
  if(t>=T.fin){etape(T.fin);rendu();termine();return;}
  requestAnimationFrame(boucle);
  etape(t);rendu();
}
function play(o){
  o=o||{};sons=o.sons||null;faits={};
  return new Promise(function(res){
    fin=res;fl.style.opacity=0;racine.style.display='block';taille();
    joue=true;t0=performance.now();requestAnimationFrame(boucle);
    /* Onglet en arrière-plan : on ne reste jamais bloqué */
    setTimeout(termine,(T.fin+2.5)*1000);
  });
}
return {play:play,ferme:function(){joue=false;racine.style.display='none';fl.style.opacity=0;},voir:function(t){faits={};sons=null;racine.style.display='block';taille();etape(t);rendu();},T:T};
})();
