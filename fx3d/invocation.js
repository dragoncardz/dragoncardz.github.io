// Invocation en 3D : chargée à la demande par le jeu. Si elle ne peut pas s'afficher, le jeu garde l'ancienne animation.
window.INVOC3D=(function(){
if(!window.THREE)return null;
function cl(x,a,b){return Math.min(b,Math.max(a,x));}
function sm(a,b,x){var k=cl((x-a)/(b-a),0,1);return k*k*(3-2*k);}
function mix(a,b,k){return a+(b-a)*k;}
function rnd(i){var x=Math.sin(i*127.1+11.7)*43758.5453;return x-Math.floor(x);}
function retour(k){var a=k-1,s=1.5;return 1+(s+1)*a*a*a+s*a*a;}
var REDUIT=(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)||document.body.classList.contains('calm');

/* Réglages modifiables dans l'éditeur (?editinvoc=1) */
var REG={introPause:.5,etoileEcart:.23,etoileAttente:.55,chuteEcart:.2,chuteDuree:.75,flipDuree:.42,sortieDuree:.32,
  camAe:-.35,camYe:.9,camZe:10,visYe:1.2,camAc:.22,camYc:.4,camZc:9,visYc:.45,camZ:8.2,camY:.1,camAngle:0,visY:0,dosToutes:0,fov:42,carte:1,pileX:0,pileY:-.05,pileEcart:.1,distEtoiles:16,
  vitesseCalme:.03,vitesseChute:.34,rayons:1,particules:1,bloom:.6,zoomRare:1.35,
  etoiles:[[-3.6,2.2],[3.5,2.6],[-1.5,3.4],[1.6,1.3],[0,2.9]]};
/* Réglages validés avec l'éditeur */
var DEFAUTS=null,VALIDES={"introPause":0,"etoileEcart":0.35,"etoileAttente":2,"chuteEcart":0.45125,"chuteDuree":0.587,"flipDuree":0.298,"sortieDuree":0.361,"camAe":-0.35,"camYe":0.9,"camZe":10,"visYe":1.2,"camAc":0.22,"camYc":0.4,"camZc":9,"visYc":0.45,"camZ":5.34,"camY":0.96,"camAngle":-0.048,"visY":0.03,"dosToutes":0,"fov":25,"carte":0.5,"pileX":0.51,"pileY":-0.14,"pileEcart":0.365,"distEtoiles":40,"vitesseCalme":0.02625,"vitesseChute":0.33025,"rayons":1.65,"particules":0.99,"bloom":0.184,"zoomRare":1,"etoiles":[[-27.714,-7.127],[16.096,8.306],[-2.133,-5.252],[12.526,-6.107],[-7.377,7.609]]};
function appliqueReg(o){if(!o)return;Object.keys(REG).forEach(function(k){if(k==='etoiles'){if(Array.isArray(o.etoiles)&&o.etoiles.length===5)REG.etoiles=o.etoiles.map(function(p){return [+p[0],+p[1]];});}else if(typeof o[k]==='number')REG[k]=o[k];});}
appliqueReg(VALIDES);DEFAUTS=JSON.stringify(REG);
function sauve(){if(!window.FX3D_EDITEUR)return;try{localStorage.setItem('invoc3d',JSON.stringify(REG));}catch(e){}}
if(window.FX3D_EDITEUR){try{appliqueReg(JSON.parse(localStorage.getItem('invoc3d')));}catch(e){}}

var racine=document.createElement('div');
racine.style.cssText='position:fixed;inset:0;z-index:99990;display:none;background:#04040f;cursor:pointer;overflow:hidden;font-family:Bangers,Impact,sans-serif';
racine.innerHTML='<canvas style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>'+
  '<div class="iv-fl" style="position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none"></div>'+
  '<div class="iv-ti" style="position:absolute;left:0;right:0;top:9%;text-align:center;pointer-events:none;color:#fff;opacity:0;text-shadow:0 0 22px var(--c,#fff),0 4px 0 rgba(0,0,0,.6)"><div class="iv-r" style="font-size:clamp(20px,4vw,34px);letter-spacing:.14em"></div><div class="iv-n" style="font-size:clamp(34px,7vw,66px);letter-spacing:.04em"></div></div>'+
  '<div class="iv-hi" style="position:absolute;left:0;right:0;bottom:6%;text-align:center;pointer-events:none;color:#eaf1ff;font:800 15px Nunito,Trebuchet MS,sans-serif;text-shadow:0 1px 4px #000"></div>'+
  '<button class="iv-sk btn ghost small" style="position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:12px">Tout passer</button>';
document.body.appendChild(racine);
var canvas=racine.querySelector('canvas'),fl=racine.querySelector('.iv-fl'),ti=racine.querySelector('.iv-ti'),hi=racine.querySelector('.iv-hi'),sk=racine.querySelector('.iv-sk');

var R;try{R=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});}catch(e){racine.remove();return null;}
var scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(REG.fov,1,.1,500);
var composer=null,bloom=null;
try{composer=new THREE.EffectComposer(R);composer.addPass(new THREE.RenderPass(scene,cam));bloom=new THREE.UnrealBloomPass(new THREE.Vector2(256,256),REG.bloom,.5,.8);composer.addPass(bloom);}catch(e){composer=null;}
var mobile=/Mobi|Android|iPhone/i.test(navigator.userAgent);
function taille(){
  var W=racine.clientWidth||innerWidth,H=racine.clientHeight||innerHeight,pr=Math.min(window.devicePixelRatio||1,mobile?1.5:2);
  R.setPixelRatio(pr);R.setSize(W,H,false);if(composer){composer.setPixelRatio(pr);composer.setSize(W,H);}
  cam.aspect=W/H;reglageFov();
}
function reglageFov(){cam.fov=cam.aspect<1?Math.min(85,REG.fov/Math.pow(cam.aspect,.9)):REG.fov;cam.updateProjectionMatrix();}
window.addEventListener('resize',taille);

/* Fond : nébuleuse qui prend la couleur de la rareté */
var fondU={uT:{value:0},uC:{value:new THREE.Color(0x24306e)},uF:{value:0}};
var BRUIT='float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*nz(p);p*=2.03;a*=.5;}return v;}';
scene.add(new THREE.Mesh(new THREE.SphereGeometry(300,32,18),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:fondU,
  vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:BRUIT+'varying vec3 vP;uniform float uT,uF;uniform vec3 uC;void main(){vec2 q=vP.xy*3.+vP.z;float n=fbm(q+uT*.03),m=fbm(q*2.1-uT*.05);vec3 c=mix(vec3(.012,.012,.05),uC*.42,smoothstep(.35,.85,n));c+=uC*.25*smoothstep(.55,.9,m);c+=uC*uF*(1.-smoothstep(0.,1.1,length(vP.xy)));gl_FragColor=vec4(c,1.);}'})));

/* Étoiles qui filent : chaque segment va de la profondeur vers la caméra */
var NB=mobile?700:1500,gE=new THREE.BufferGeometry(),posE=new Float32Array(NB*6),sE=new Float32Array(NB*8);
for(var i=0;i<NB;i++){var a=rnd(i)*6.283,ra=2.2+rnd(i+900)*26,x=Math.cos(a)*ra,y=Math.sin(a)*ra,z=rnd(i+1800);for(var e=0;e<2;e++){posE[i*6+e*3]=x;posE[i*6+e*3+1]=y;posE[i*6+e*3+2]=e;sE[i*8+e*4]=z;sE[i*8+e*4+1]=rnd(i+2700);}}
gE.setAttribute('position',new THREE.BufferAttribute(posE,3));gE.setAttribute('aS',new THREE.BufferAttribute(sE,4));
var etU={uP:{value:0},uL:{value:.002}};
var etoilesFil=new THREE.LineSegments(gE,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:etU,
  vertexShader:'attribute vec4 aS;uniform float uP,uL;varying float vA;void main(){float f=fract(aS.x+uP+position.z*uL);vec3 p=vec3(position.xy,mix(-190.,10.,f));vA=f*(.4+aS.y*.6)*smoothstep(0.,.06,f)*(1.-smoothstep(.92,1.,f));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
  fragmentShader:'varying float vA;void main(){gl_FragColor=vec4(vec3(.82,.9,1.)*vA,1.);}'}));
etoilesFil.frustumCulled=false;scene.add(etoilesFil);

/* Textures */
function texHalo(st){var c=document.createElement('canvas');c.width=c.height=256;var x=c.getContext('2d'),g=x.createRadialGradient(128,128,0,128,128,128);st.forEach(function(s){g.addColorStop(s[0],s[1]);});x.fillStyle=g;x.fillRect(0,0,256,256);return new THREE.CanvasTexture(c);}
var TX_HALO=texHalo([[0,'rgba(255,255,255,1)'],[.16,'rgba(255,255,255,.85)'],[.42,'rgba(255,255,255,.25)'],[1,'rgba(255,255,255,0)']]);
var TX_RAYONS=(function(){var c=document.createElement('canvas');c.width=c.height=512;var x=c.getContext('2d');x.translate(256,256);for(var i=0;i<26;i++){var a=i/26*6.283+rnd(i)*.1,l=.7+rnd(i+9)*.3,w=.02+rnd(i+5)*.05;var g=x.createRadialGradient(0,0,20,0,0,256*l);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.moveTo(0,0);x.lineTo(Math.cos(a-w)*256,Math.sin(a-w)*256);x.lineTo(Math.cos(a+w)*256,Math.sin(a+w)*256);x.fill();}return new THREE.CanvasTexture(c);})();
function sprite(tx,add){var s=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending}));scene.add(s);return s;}

/* Étoiles de rareté et leur traîne */
var orbes=[];for(i=0;i<8;i++){var o={tete:sprite(TX_HALO,true),traine:[]};for(var q=0;q<7;q++)o.traine.push(sprite(TX_HALO,true));o.tete.visible=false;o.traine.forEach(function(s){s.visible=false;});orbes.push(o);}

/* Effets du retournement */
var halo=sprite(TX_HALO,true),rayons=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:TX_RAYONS,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));scene.add(rayons);
var rayons2=rayons.clone();rayons2.material=rayons.material.clone();scene.add(rayons2);
var onde=new THREE.Mesh(new THREE.RingGeometry(.92,1,96),new THREE.MeshBasicMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));scene.add(onde);
var NP=mobile?500:1400,gP=new THREE.BufferGeometry(),sP=new Float32Array(NP*4);for(i=0;i<NP*4;i++)sP[i]=rnd(i*.41+3);
gP.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NP*3),3));gP.setAttribute('aS',new THREE.BufferAttribute(sP,4));
var partU={uT:{value:9},uN:{value:0},uC:{value:new THREE.Color(0xffffff)},uO:{value:new THREE.Vector3()},uE:{value:1}};
var parts=new THREE.Points(gP,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:partU,
  vertexShader:'attribute vec4 aS;uniform float uT,uN;uniform vec3 uO;uniform float uE;varying float vA;void main(){vec3 d=normalize(aS.xyz-.5+.0001);float v=1.5+aS.w*5.5*uN;float k=(1.-exp(-uT*2.4))/2.4;vec3 p=uO+d*v*k;p.y-=.55*uT*uT;vA=step(aS.x,uN)*(1.-smoothstep(.4,1.5,uT+aS.y*.4));vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(14.+aS.w*26.)*uE/max(.1,-mv.z);gl_Position=projectionMatrix*mv;}',
  fragmentShader:'varying float vA;uniform vec3 uC;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(uC*pow(1.-d*2.,1.4)*vA,1.);}'}));
parts.frustumCulled=false;scene.add(parts);
function eteintEffets(){halo.visible=rayons.visible=rayons2.visible=onde.visible=parts.visible=false;}eteintEffets();

/* Cartes */
var LC=2.3,HC=3.3,geoC=new THREE.BoxGeometry(LC,HC,.05);
var cartes=[];
function matBord(col){return new THREE.MeshBasicMaterial({color:col});}
function chargeImg(src){return new Promise(function(ok){var im=new Image();im.onload=function(){ok(im);};im.onerror=function(){ok(null);};im.src=src;});}
var dosTx=null;
function faitDos(){
  if(dosTx)return Promise.resolve(dosTx);
  return chargeImg((typeof ART_DIR!=='undefined'?ART_DIR:'assets/cartes/')+'dos_cartes.webp').then(function(im){
    var c=document.createElement('canvas');c.width=358;c.height=512;var x=c.getContext('2d');
    if(im)x.drawImage(im,0,0,358,512);
    else{var g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'#7c2d12');g.addColorStop(1,'#2a0d05');x.fillStyle=g;x.fillRect(0,0,358,512);x.fillStyle='#ffb000';x.beginPath();x.arc(179,256,70,0,6.3);x.fill();x.fillStyle='#b91c1c';x.font='bold 54px sans-serif';x.textAlign='center';x.fillText('★',179,274);}
    dosTx=new THREE.CanvasTexture(c);return dosTx;
  });
}
function coupe(x,t,lmax){var s=t;while(s.length>3&&x.measureText(s).width>lmax)s=s.slice(0,-1);return s===t?t:s.slice(0,-1)+'…';}
/* Dessine la face d'une carte : illustration, cadre de rareté, nom et stats */
function faitFace(id,neuf){
  var c=CARDS[id],rr=RAR[c.rar],base=(typeof ART_DIR!=='undefined'?ART_DIR:'assets/cartes/');
  return chargeImg(base+id+'.webp').then(function(im){
    if(im||typeof svgArt!=='function')return im;
    var sv=svgArt(id);if(sv.indexOf('xmlns')<0)sv=sv.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');if(!/<svg[^>]*swidth=/.test(sv))sv=sv.replace('<svg','<svg width="512" height="512"');return chargeImg('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(sv));
  }).then(function(im){
    var cv=document.createElement('canvas');cv.width=512;cv.height=734;var x=cv.getContext('2d');
    x.fillStyle=rr.col;x.fillRect(0,0,512,734);x.fillStyle='#17132b';x.fillRect(14,14,484,706);
    if(im){var ra=Math.max(484/(im.width||1),500/(im.height||1)),w=im.width*ra,h=im.height*ra;x.save();x.beginPath();x.rect(14,14,484,500);x.clip();x.drawImage(im,14+(484-w)/2,14+(500-h)/2,w,h);x.restore();}
    var g=x.createLinearGradient(0,514,0,720);g.addColorStop(0,'#3a2a55');g.addColorStop(1,'#14102a');x.fillStyle=g;x.fillRect(14,514,484,206);
    x.fillStyle=rr.col;x.fillRect(14,510,484,6);
    x.textAlign='center';x.fillStyle='#fff';x.font='900 40px Nunito,Trebuchet MS,sans-serif';x.fillText(coupe(x,c.n,450),256,566);
    x.font='800 25px Nunito,Trebuchet MS,sans-serif';x.fillStyle=rr.col;x.fillText(rr.n.toUpperCase()+' · '+(TYPEN[c.t]||''),256,604);
    x.fillStyle='#eef3ff';x.font='800 25px Nunito,Trebuchet MS,sans-serif';
    var st=c.t==='p'?'ATK '+fmt(c.a)+'  DEF '+fmt(c.d)+'  PV '+fmt(c.h):(c.t==='t'?'+'+fmt(c.a)+' ATK   +'+fmt(c.d)+' DEF':(c.c!=null?'Coût : '+c.c+' Ki':''));
    x.fillText(coupe(x,st,460),256,660);
    if(neuf){x.fillStyle='#ff3b5c';x.fillRect(370,30,114,50);x.fillStyle='#fff';x.font='900 34px Nunito,sans-serif';x.fillText('NEW',427,67);}
    var tx=new THREE.CanvasTexture(cv);tx.anisotropy=4;return tx;
  });
}
function videCartes(){cartes.forEach(function(k){scene.remove(k.m);k.m.material.forEach(function(m){m.dispose();});if(k.face)k.face.dispose();});cartes=[];}
function creeCartes(ids,isNew){
  videCartes();
  var ordre=ids.map(function(id,i){return i;}).sort(function(a,b){return RIDX[CARDS[ids[a]].rar]-RIDX[CARDS[ids[b]].rar]||a-b;});
  return faitDos().then(function(dos){
    return Promise.all(ordre.map(function(i){return faitFace(ids[i],isNew&&isNew[i]);})).then(function(fa){
      cartes=ordre.map(function(i,k){
        var c=CARDS[ids[i]],col=RAR[c.rar].col,b=matBord(col);
        var m=new THREE.Mesh(geoC,[b,b,b,b,new THREE.MeshBasicMaterial({map:fa[k]}),new THREE.MeshBasicMaterial({map:dos})]);
        m.visible=false;scene.add(m);
        return {m:m,face:fa[k],id:ids[i],c:c,ri:RIDX[c.rar],col:new THREE.Color(col),flip:null,sort:null,spin:(rnd(k+3)-.5)*2.4};
      });
    });
  });
}

/* Temps de l'intro */
function nbC(){return cartes.length||5;}
function debutChute(){return REG.introPause+nbC()*REG.etoileEcart+REG.etoileAttente;}
function finIntro(){return debutChute()+(nbC()-1)*REG.chuteEcart+REG.chuteDuree;}
var phase=0,_v=new THREE.Vector3();
function placeOrbe(o,x,y,z,taille,col,op){o.position.set(x,y,z);o.scale.setScalar(taille);o.material.color.copy(col);o.material.opacity=op;o.visible=op>.002;}
/* Position d'un point de la chute, de l'étoile à la pile */
function chemin(k,p,out){
  var E=REG.etoiles[k%5],decal=k>=5?.9:0,px=REG.pileX,py=REG.pileY-k*.03,pz=-k*REG.pileEcart;
  var f=1-Math.pow(1-p,3);
  out.set(mix(E[0]+decal,px,f),mix(E[1],py,f)+Math.sin(p*3.14)*.35,mix(-REG.distEtoiles,pz,f));return out;
}
function deDos(i){return i===0||REG.dosToutes>0;}
function intro(t){
  var dc=debutChute();
  cartes.forEach(function(k,i){
    var o=orbes[i],vis=sm(REG.introPause+i*REG.etoileEcart,REG.introPause+i*REG.etoileEcart+.18,t);
    var ri=k.ri,taille=(1.2+ri*.42)*(1+.14*Math.sin(t*5+i));
    var fi=dc+i*REG.chuteEcart,p=cl((t-fi)/REG.chuteDuree,0,1);
    /* Étoile fixe, puis comète qui plonge vers la pile */
    chemin(i,p,_v);
    placeOrbe(o.tete,_v.x,_v.y,_v.z,taille*mix(1,.62,p),k.col,vis*(p>=1?0:1));
    o.traine.forEach(function(s,j){
      if(p<=0||p>=1){s.visible=false;return;}
      var v2=chemin(i,Math.max(0,p-(j+1)*.035),new THREE.Vector3());
      placeOrbe(s,v2.x,v2.y,v2.z,taille*.55*(1-j/7),k.col,.5*(1-j/7));
    });
    /* La carte apparaît dans la comète, de dos, en tournoyant */
    k.m.visible=p>.04;
    if(k.m.visible){
      var es=retour(cl(p*1.1,0,1))*REG.carte;k.m.scale.setScalar(Math.max(.01,es));
      k.m.position.copy(_v);k.m.rotation.set(0,deDos(i)?Math.PI:0,k.spin*(1-sm(.2,1,p))*2.2);
    }
  });
}
/* Pendant le jeu : pile, retournement, sortie */
var cur=0,mode='attente',T0=0,fin=null,sons=null,dernierFlip=null;
function jeu(t){
  var ef=null;
  orbes.forEach(function(o){o.tete.visible=false;o.traine.forEach(function(s){s.visible=false;});});
  cartes.forEach(function(k,i){
    var n=i-cur;k.m.visible=k.sort==null||t-k.sort<REG.sortieDuree;
    if(!k.m.visible)return;
    var cible=Math.max(0,n),x=REG.pileX,y=REG.pileY-cible*.03,z=-cible*REG.pileEcart,ry=deDos(i)?Math.PI:0,rz=0,es=REG.carte;
    if(k.flip!=null){
      var pf=cl((t-k.flip)/REG.flipDuree,0,1),e=pf*pf*(3-2*pf);
      if(k.auto)ry=0;else{ry=Math.PI*(1-e);z+=Math.sin(pf*3.14)*.7;}
      var dt=t-k.flip;if(k.ri>=4){var zo=sm(.1,.7,dt)*(REG.zoomRare-1);es*=1+zo;z+=.1;ry+=Math.sin(dt*1.6)*.1*sm(.4,1,dt);}
      ef={k:k,dt:dt};
    }
    if(k.sort!=null){var ps=cl((t-k.sort)/REG.sortieDuree,0,1);x+=ps*ps*9;y+=ps*.8;rz=-ps*.9;}
    k.m.position.set(x,y,z);k.m.rotation.set(0,ry,rz);k.m.scale.setScalar(es);
  });
  effets(ef,t);
}
function effets(ef,t){
  if(!ef||!ef.k||ef.k.sort!=null){eteintEffets();fondU.uF.value*=.92;fl.style.opacity=0;return;}
  var k=ef.k,dt=ef.dt,ri=k.ri,fort=ri>=4,z0=k.m.position;
  fondU.uC.value.lerp(k.col,.08);
  var ap=sm(.1,.3,dt),coef=(.45+ri*.22)*REG.rayons;
  var duree=fort?1:Math.exp(-Math.max(0,dt-.2)*1.3);
  halo.visible=true;halo.position.set(z0.x,z0.y,z0.z-.2);halo.scale.setScalar((5+ri*1.3)*(fort?1.3:1));halo.material.color.copy(k.col);halo.material.opacity=Math.min(.75,ap*duree*coef*.5);
  rayons.visible=ri>=1;rayons.position.set(z0.x,z0.y,z0.z-.3);rayons.scale.setScalar(9+ri*2.6);rayons.rotation.z=t*.35;rayons.material.color.copy(k.col);rayons.material.opacity=Math.min(.7,ap*duree*coef*.42);
  rayons2.visible=ri>=3;rayons2.position.set(z0.x,z0.y,z0.z-.32);rayons2.scale.setScalar(12+ri*3);rayons2.rotation.z=-t*.22;rayons2.material.color.copy(k.col);rayons2.material.opacity=Math.min(.45,ap*duree*coef*.24);
  var o=dt-.16;onde.visible=o>0&&o<1.1&&ri>=1;if(onde.visible){onde.position.set(z0.x,z0.y,z0.z-.1);onde.scale.setScalar(.6+o*(5+ri*2.2));onde.material.color.copy(k.col);onde.material.opacity=cl(1-o/1.1,0,1)*.9;}
  parts.visible=o>0&&o<2&&REG.particules>0&&ri>=1;
  if(parts.visible){partU.uT.value=o;partU.uN.value=cl((.25+ri*.16)*REG.particules,0,1);partU.uC.value.copy(k.col);partU.uO.value.set(z0.x,z0.y,z0.z);}
  fondU.uF.value=mix(fondU.uF.value,(fort?.9:.35)*ap,.12);
  var f=dt>=.16?(fort?.95:Math.min(.35,ri*.08))*Math.exp(-(dt-.16)*7):0;fl.style.opacity=(REDUIT?f*.2:f).toFixed(3);
  if(fort&&!REDUIT){var se=.05*Math.exp(-dt*2.2);cam.position.x+=se*Math.sin(t*67);cam.position.y+=se*Math.sin(t*81);}
}
/* La caméra passe par trois positions : étoiles, chute, pile */
function placeCam(t){
  var dc=debutChute(),fi=finIntro(),a,y,z,v;
  if(mode!=='intro'||t>=fi){a=REG.camAngle;y=REG.camY;z=REG.camZ;v=REG.visY;}
  else if(t<dc){var k=sm(0,dc,t);a=mix(REG.camAe,REG.camAc,k);y=mix(REG.camYe,REG.camYc,k);z=mix(REG.camZe,REG.camZc,k);v=mix(REG.visYe,REG.visYc,k);}
  else{var k2=sm(dc,fi,t);a=mix(REG.camAc,REG.camAngle,k2);y=mix(REG.camYc,REG.camY,k2);z=mix(REG.camZc,REG.camZ,k2);v=mix(REG.visYc,REG.visY,k2);}
  cam.position.set(REG.pileX+Math.sin(a)*z,y,Math.cos(a)*z);
  if(!REDUIT)cam.position.y+=Math.sin(t*.6)*.02;
  cam.lookAt(REG.pileX,REG.pileY+v,0);
}
function rendu(){bloomVal();if(composer)composer.render();else R.render(scene,cam);}
function bloomVal(){if(bloom)bloom.strength=REG.bloom;}

/* Lecture */
var t=0,last=0,joue=false;
function vitesse(tt){var dc=debutChute();return tt<dc?REG.vitesseCalme:(tt<finIntro()+.1?REG.vitesseChute:REG.vitesseCalme);}
var vCour=.03;
function boucle(now){
  if(!joue)return;
  requestAnimationFrame(boucle);
  var dt=Math.min(.05,(now-last)/1000||0);last=now;t+=dt;
  vCour+=(vitesse(t)-vCour)*Math.min(1,dt*4);phase+=vCour*dt*(REDUIT?.2:1);etU.uP.value=phase;etU.uL.value=mix(.0015,.05,cl((vCour-.03)/.3,0,1));fondU.uT.value=t;
  placeCam(t);
  if(mode==='intro'){
    var dc=debutChute();
    cartes.forEach(function(k,i){
      var se=REG.introPause+i*REG.etoileEcart;if(!k._gl&&t>=se){k._gl=1;if(sons&&sons.etoile)sons.etoile(k.ri);}
      var fi=dc+i*REG.chuteEcart;if(!k._ch&&t>=fi){k._ch=1;if(sons&&sons.chute)sons.chute();}
    });
    intro(t);
    if(t>=finIntro()){mode='front';hi.textContent='Touche la carte pour la retourner';}
  } else jeu(t);
  if(mode==='titre'&&t-cartes[cur].flip>1.1){mode='shown';hi.textContent='Touche pour continuer';}
  rendu();
}
function titre(k){
  ti.style.setProperty('--c',RAR[k.c.rar].col);ti.querySelector('.iv-r').textContent=RAR[k.c.rar].n.toUpperCase();ti.querySelector('.iv-r').style.color=RAR[k.c.rar].col;ti.querySelector('.iv-n').textContent=k.c.n;
  ti.style.transition='opacity .35s';ti.style.opacity=1;
}
/* Carte déjà de face : elle se présente sans se retourner, avec les effets de sa rareté */
function revele(k){
  k.flip=t;k.auto=true;hi.textContent='';if(sons&&sons.flip)sons.flip(k);
  if(k.ri>=4){mode='titre';setTimeout(function(){if(joue&&cartes[cur]===k)titre(k);},260);}
  else{mode='shown';hi.textContent='Touche pour continuer';}
}
function action(){
  if(mode==='intro'){return;}
  var k=cartes[cur];if(!k)return;
  if(mode==='front'){
    k.flip=t;hi.textContent='';
    if(sons&&sons.flip)sons.flip(k);
    if(k.ri>=4){mode='titre';setTimeout(function(){if(joue&&cartes[cur]===k)titre(k);},260);}
    else{mode='shown';hi.textContent='Touche pour continuer';}
  } else if(mode==='shown'){
    k.sort=t;ti.style.opacity=0;if(sons&&sons.sortie)sons.sortie();cur++;
    if(cur>=cartes.length){mode='fini';hi.textContent='';setTimeout(termine,Math.round(REG.sortieDuree*1000)+60);}
    else if(deDos(cur)){mode='front';hi.textContent='Touche la carte pour la retourner';}
    else revele(cartes[cur]);
  }
}
function termine(){
  if(!joue)return;joue=false;racine.style.display='none';racine.onclick=null;sk.onclick=null;
  fl.style.opacity=0;ti.style.opacity=0;eteintEffets();videCartes();
  var f=fin;fin=null;if(f)f();
}
function play(o){
  return creeCartes(o.ids,o.isNew).then(function(){
    return new Promise(function(ok){
      fin=ok;sons=o.sons||null;cur=0;t=0;mode='intro';fondU.uC.value.setHex(0x24306e);fondU.uF.value=0;vCour=REG.vitesseCalme;hi.textContent='';ti.style.opacity=0;
      racine.style.display='block';sk.style.display='';taille();
      racine.onclick=action;sk.onclick=function(e){e.stopPropagation();termine();};
      joue=true;last=performance.now();requestAnimationFrame(boucle);
    });
  });
}
return {
  play:play,reg:REG,racine:racine,taille:taille,
  defauts:function(){return JSON.parse(DEFAUTS);},applique:function(o){appliqueReg(o);sauve();reglageFov();},sauve:sauve,reglageFov:reglageFov,
  /* Pour l'éditeur : affiche l'intro à un instant précis, ou une carte retournée */
  ouvre:function(ids){return creeCartes(ids).then(function(){racine.style.display='block';sk.style.display='none';hi.textContent='';racine.onclick=null;taille();});},
  ferme:function(){racine.style.display='none';},
  voirIntro:function(x){mode='intro';t=x;eteintEffets();fl.style.opacity=0;ti.style.opacity=0;placeCam(x);etU.uP.value=x*.03;fondU.uC.value.setHex(0x24306e);fondU.uF.value=0;intro(x);rendu();},
  voirFlip:function(i,dt,tt){
    cur=i;mode='shown';t=tt;cartes.forEach(function(k,j){k.flip=j===i?tt-dt:null;k.auto=j===i&&!deDos(i);k.sort=j<i?-9:null;});
    placeCam(tt);jeu(tt);
    if(cartes[i]&&cartes[i].ri>=4&&dt>.3)titre(cartes[i]);else ti.style.opacity=0;
    rendu();
  },
  pileEcran:function(){var p=new THREE.Vector3(REG.pileX,REG.pileY,0).project(cam);return [(p.x+1)/2*racine.clientWidth,(1-p.y)/2*racine.clientHeight];},
  pileDepuis:function(cx,cy){
    var b=canvas.getBoundingClientRect(),ra=new THREE.Raycaster();ra.setFromCamera(new THREE.Vector2((cx-b.left)/b.width*2-1,1-(cy-b.top)/b.height*2),cam);
    var out=new THREE.Vector3();if(ra.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),out)){REG.pileX=+out.x.toFixed(3);REG.pileY=+out.y.toFixed(3);return true;}return false;
  },
  etoileEcran:function(i,x0){var E=REG.etoiles[i],p=new THREE.Vector3(E[0],E[1],-REG.distEtoiles).project(cam);return [(p.x+1)/2*racine.clientWidth,(1-p.y)/2*racine.clientHeight];},
  etoileDepuis:function(i,cx,cy){
    var b=canvas.getBoundingClientRect(),ra=new THREE.Raycaster();ra.setFromCamera(new THREE.Vector2((cx-b.left)/b.width*2-1,1-(cy-b.top)/b.height*2),cam);
    var out=new THREE.Vector3();if(ra.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),REG.distEtoiles),out)){REG.etoiles[i]=[+out.x.toFixed(3),+out.y.toFixed(3)];return true;}return false;
  },
  fin:{debutChute:debutChute,finIntro:finIntro}
};
})();
