var matMont;
// Kaméhaméha 3D de Goku. Chargé à la demande par le jeu, seulement quand un Goku peut lancer son Ultime.
window.FX3D=(function(){
var PIXEL='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
var racine=document.createElement('div');
racine.style.cssText='position:fixed;inset:0;z-index:99999;display:none;background:#080a18;cursor:pointer';
racine.innerHTML='<canvas style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>'+
  '<div class="vign" style="position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 35%,rgba(0,4,24,.88) 100%)"></div>'+
  '<div class="cri" style="position:absolute;left:0;right:0;top:12%;text-align:center;pointer-events:none;font-family:Bangers,Impact,sans-serif;font-size:clamp(44px,11vw,120px);letter-spacing:.05em;color:#fff;-webkit-text-stroke:2px #0b3a8c;text-shadow:0 0 28px #7fe7ff,0 5px 0 #0b3a8c"></div>'+
  '<div class="flash" style="position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0"></div>';
document.body.appendChild(racine);
function fail(m){console.warn('FX3D : '+m);}
if(!window.THREE){fail('La bibliothèque 3D n’a pas pu se charger. Vérifie ta connexion, puis recharge la page.');return;}
var canvas=racine.querySelector('canvas'),R;
try{R=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});}
catch(e){fail('Cet appareil ne permet pas d’afficher la 3D (WebGL indisponible). C’est le cas où le jeu garderait ses animations 2D.');return;}
var REDUIT=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Le déroulé : toute la scène se calcule à partir du seul temps t, ce qui permet de rejouer, ralentir ou inspecter n'importe quelle image */
var T={chargeFin:1.9,tir:2.05,impact:2.8,rayonFin:4.1,fin:6.6};
function cl(x,a,b){return Math.min(b,Math.max(a,x));}
function sm(a,b,x){var k=cl((x-a)/(b-a),0,1);return k*k*(3-2*k);}
function mix(a,b,k){return a+(b-a)*k;}
function rnd(i){var x=Math.sin(i*127.1+11.7)*43758.5453;return x-Math.floor(x);}
function V(x,y,z){return new THREE.Vector3(x,y,z);}

var scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x1a1030,.012);
var cam=new THREE.PerspectiveCamera(42,1,.1,300);
var HERO=V(-7,1.75,0),ENNEMI=V(7,1.75,0),MAINS=V(-5.7,1.55,.45),CIBLE=V(6.75,1.7,.05);
var DIR=CIBLE.clone().sub(MAINS),LONG=DIR.length();DIR.normalize();
var GLSL_BRUIT='float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*nz(p);p*=2.03;a*=.5;}return v;}';

/* Ciel, étoiles, montagnes */
var ciel=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{uDim:{value:0},uH:{value:new THREE.Color(0xf26b33)},uM:{value:new THREE.Color(0x29124d)},uTo:{value:new THREE.Color(0x05081a)}},
  vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec3 vP;uniform float uDim;uniform vec3 uH,uM,uTo;void main(){float h=clamp(vP.y*1.6+.05,0.,1.);vec3 c=mix(uH,uM,pow(h,.45));c=mix(c,uTo,h*h);c=mix(c,vec3(.015,.03,.09),uDim);gl_FragColor=vec4(c,1.);}'});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(150,32,16),ciel));
(function(){
  var n=70,g=new THREE.ConeGeometry(1,1,5),m=matMont=new THREE.MeshBasicMaterial({color:0x1b0f2a}),im=new THREE.InstancedMesh(g,m,n),o=new THREE.Object3D();
  for(var i=0;i<n;i++){var a=rnd(i)*6.283,r=42+rnd(i+90)*40,h=6+rnd(i+40)*20;o.position.set(Math.cos(a)*r,h/2-.5,Math.sin(a)*r);o.scale.set(6+rnd(i+7)*10,h,6+rnd(i+8)*10);o.rotation.y=rnd(i+3)*3;o.updateMatrix();im.setMatrixAt(i,o.matrix);}
  scene.add(im);
})();

/* Sol : il reçoit la lumière de la boule et du rayon, et garde la trace de l'impact */
var solU={uSolA:{value:new THREE.Color(0x331c17)},uSolB:{value:new THREE.Color(0x6b4529)},uBrume:{value:new THREE.Color(0x1a0f2b)},uA:{value:MAINS},uB:{value:MAINS.clone()},uRayon:{value:0},uCharge:{value:0},uCible:{value:CIBLE},uBrule:{value:0},uBoum:{value:0},uDim:{value:0}};
var sol=new THREE.Mesh(new THREE.CircleGeometry(150,64),new THREE.ShaderMaterial({uniforms:solU,
  vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:GLSL_BRUIT+'varying vec3 vW;uniform vec3 uA,uB,uCible;uniform float uRayon,uCharge,uBrule,uBoum,uDim;uniform vec3 uSolA,uSolB,uBrume;float seg(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;float k=clamp(dot(p-a,ab)/max(dot(ab,ab),.001),0.,1.);return length(p-a-ab*k);}void main(){vec2 p=vW.xz;float n=fbm(p*.45),m=fbm(p*2.2);vec3 c=mix(uSolA,uSolB,n)*(.75+.4*m);c*=mix(1.,.35,uDim);float dA=length(p-uA.xz);c+=vec3(.25,.65,1.)*uCharge*1.4*exp(-dA*.55);float d=seg(p,uA.xz,uB.xz);c+=vec3(.3,.72,1.)*uRayon*1.5*exp(-d*.5);float dC=length(p-uCible.xz);float crat=smoothstep(4.6+n*1.6,1.2,dC);c=mix(c,vec3(.03,.025,.04)*(.6+m),crat*uBrule);c+=vec3(1.,.5,.15)*uBrule*smoothstep(1.2,0.,abs(dC-4.+n*1.4))*(m*.8)*.6;c+=vec3(.5,.85,1.)*uBoum*2.5*exp(-dC*.28);float f=exp(-length(vW-cameraPosition)*.012);c=mix(uBrume,c,f);gl_FragColor=vec4(c,1.);}'}));
sol.rotation.x=-Math.PI/2;scene.add(sol);
scene.add(new THREE.HemisphereLight(0xffc9a0,0x20132f,1.0));
var lumBoule=new THREE.PointLight(0x7fd8ff,0,24,1.6);scene.add(lumBoule);
var lumImpact=new THREE.PointLight(0xbfe9ff,0,50,1.5);lumImpact.position.copy(CIBLE);lumImpact.position.y+=1;scene.add(lumImpact);

/* Rochers */
var rocheG=new THREE.IcosahedronGeometry(1,0),rocheM=new THREE.MeshLambertMaterial({color:0x6f4d3a,flatShading:true});
var fixes=new THREE.InstancedMesh(rocheG,rocheM,46),o3=new THREE.Object3D();
for(var i=0;i<46;i++){var a=rnd(i+200)*6.283,r=10+rnd(i+300)*28,s=.25+rnd(i+400)*1.5;o3.position.set(Math.cos(a)*r,s*.25,Math.sin(a)*r-6);o3.scale.set(s,s*.7,s);o3.rotation.set(rnd(i),rnd(i+1)*3,rnd(i+2));o3.updateMatrix();fixes.setMatrixAt(i,o3.matrix);}
scene.add(fixes);
var NV=16,volants=new THREE.InstancedMesh(rocheG,rocheM,NV);volants.frustumCulled=false;scene.add(volants);
var ND=44,eclats=new THREE.InstancedMesh(rocheG,rocheM,ND);eclats.frustumCulled=false;scene.add(eclats);

/* Cartes */
function carte(data,pos,rotY){
  var tx=new THREE.TextureLoader().load(data);tx.anisotropy=4;
  var bord=new THREE.MeshBasicMaterial({color:0xffc94a}),face=new THREE.MeshBasicMaterial({map:tx}),dos=new THREE.MeshBasicMaterial({color:0x7c2d12});
  var m=new THREE.Mesh(new THREE.BoxGeometry(2.3,3.3,.09),[bord,bord,bord,bord,face,dos]);
  m.position.copy(pos);m.rotation.y=rotY;scene.add(m);return {m:m,face:face,pos:pos.clone(),rotY:rotY};
}
var cHero=carte(PIXEL,HERO,.42),cEnnemi=carte(PIXEL,ENNEMI,-.42);

/* Halos */
function texHalo(stops){var c=document.createElement('canvas');c.width=c.height=256;var x=c.getContext('2d'),g=x.createRadialGradient(128,128,0,128,128,128);stops.forEach(function(s){g.addColorStop(s[0],s[1]);});x.fillStyle=g;x.fillRect(0,0,256,256);return new THREE.CanvasTexture(c);}
var TX_BLEU=texHalo([[0,'rgba(255,255,255,1)'],[.18,'rgba(190,240,255,.95)'],[.45,'rgba(70,170,255,.4)'],[1,'rgba(0,60,255,0)']]);
var TX_FUMEE=texHalo([[0,'rgba(255,255,255,.75)'],[.5,'rgba(255,255,255,.3)'],[1,'rgba(255,255,255,0)']]);
function halo(tx,add){var s=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,fog:false}));scene.add(s);return s;}
var haloBoule=halo(TX_BLEU,true),auraHero=halo(TX_BLEU,true),haloTete=halo(TX_BLEU,true),haloImpact=halo(TX_BLEU,true);
auraHero.position.copy(HERO);auraHero.position.z-=.3;haloBoule.position.copy(MAINS);
var fumees=[];for(i=0;i<16;i++){var f=halo(TX_FUMEE,false);f.material.color.set(0x4a4356);fumees.push(f);}

/* Matériau d'énergie : opaque au centre, transparent sur les bords, avec du bruit qui défile */
function energie(c1,c2,exp,force){return new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  uniforms:{uT:{value:0},uLen:{value:1},uC1:{value:new THREE.Color(c1)},uC2:{value:new THREE.Color(c2)},uExp:{value:exp},uF:{value:force},uOp:{value:1}},
  vertexShader:'varying vec3 vN,vV;varying float vX;varying vec3 vP;uniform float uT,uLen;void main(){vP=position;vX=position.x;vec3 p=position;float w=1.+.09*sin(p.x*uLen*2.6-uT*34.)+.05*sin(p.x*uLen*7.-uT*55.);p.yz*=w;vec4 mv=modelViewMatrix*vec4(p,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
  fragmentShader:GLSL_BRUIT+'varying vec3 vN,vV,vP;varying float vX;uniform float uT,uLen,uExp,uF,uOp;uniform vec3 uC1,uC2;void main(){float f=pow(abs(dot(normalize(vN),normalize(vV))),uExp);float a=atan(vP.y,vP.z);float n=fbm(vec2(vX*uLen*.55-uT*11.,a*1.6+uT*.8));float i=f*(.55+.9*n)*uF;vec3 c=mix(uC2,uC1,clamp(i,0.,1.));float deb=smoothstep(0.,.02,vX);gl_FragColor=vec4(c*i*deb*uOp,1.);}'});}

/* Boule d'énergie */
var mBoule=energie(0xffffff,0x35b6ff,.9,1.5),boule=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),mBoule);boule.position.copy(MAINS);scene.add(boule);

/* Rayon : trois tubes emboîtés, plus la tête et les anneaux */
var rayon=new THREE.Group();rayon.position.copy(MAINS);rayon.quaternion.setFromUnitVectors(V(1,0,0),DIR);scene.add(rayon);
var geoR=new THREE.CylinderGeometry(1,1,1,36,80,true);geoR.rotateZ(-Math.PI/2);geoR.translate(.5,0,0);
var tubes=[[.26,energie(0xffffff,0xc8f3ff,.7,2.1)],[.52,energie(0xe6fbff,0x35b6ff,1.5,1.3)],[.95,energie(0x8fdcff,0x0a52ff,2.8,.75)]].map(function(d){var m=new THREE.Mesh(geoR,d[1]);m.frustumCulled=false;m.userData.r=d[0];rayon.add(m);return m;});
var tete=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),energie(0xffffff,0x4cc4ff,1.0,1.7));rayon.add(tete);
var anneaux=[];for(i=0;i<7;i++){var an=new THREE.Mesh(new THREE.TorusGeometry(1,.035,8,48),new THREE.MeshBasicMaterial({color:0x9fe6ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));an.rotation.y=Math.PI/2;rayon.add(an);anneaux.push(an);}

/* Explosion : une sphère déformée par du bruit */
var explU={uT:{value:0},uOp:{value:0}};
var expl=new THREE.Mesh(new THREE.IcosahedronGeometry(1,5),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:explU,
  vertexShader:GLSL_BRUIT+'varying float vD;varying vec3 vN,vV;uniform float uT;void main(){vec3 d=normalize(position);float n=fbm(d.xy*3.+d.z*2.+uT*1.3);vD=n;vec3 p=position*(1.+(n-.5)*.75);vec4 mv=modelViewMatrix*vec4(p,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
  fragmentShader:'varying float vD;varying vec3 vN,vV;uniform float uOp;void main(){float f=abs(dot(normalize(vN),normalize(vV)));vec3 c=mix(vec3(.04,.25,1.),vec3(.62,.93,1.),smoothstep(.3,.7,vD));c=mix(c,vec3(1.),smoothstep(.55,1.,f*vD*1.7));gl_FragColor=vec4(c*(.3+f*1.1)*uOp,1.);}'}));
expl.position.copy(CIBLE);scene.add(expl);
var onde=new THREE.Mesh(new THREE.RingGeometry(.86,1,96),new THREE.MeshBasicMaterial({color:0xcff3ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
onde.rotation.x=-Math.PI/2;onde.position.set(CIBLE.x,.08,CIBLE.z);scene.add(onde);
var onde2=onde.clone();onde2.material=onde.material.clone();onde2.rotation.set(0,Math.PI/2,0);onde2.position.copy(CIBLE);scene.add(onde2);

/* Particules : toutes calculées dans le shader à partir de t */
var MAXP=7000;
function nuage(vsCorps,taille,couleur){
  var g=new THREE.BufferGeometry(),a=new Float32Array(MAXP*4);for(var i=0;i<MAXP*4;i++)a[i]=rnd(i*.37+taille);
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAXP*3),3));g.setAttribute('aS',new THREE.BufferAttribute(a,4));
  var m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uT:{value:0},uOn:{value:0},uTaille:{value:taille},uC:{value:new THREE.Color(couleur)},uA:{value:MAINS},uB:{value:CIBLE},uLen:{value:0},uEch:{value:1}},
    vertexShader:'attribute vec4 aS;uniform float uT,uOn,uTaille,uLen,uEch;uniform vec3 uA,uB;varying float vA;void main(){vec3 d=normalize(aS.xyz-.5+vec3(.0001));vec3 p;float a=1.;'+vsCorps+'vA=a*uOn;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=uTaille*uEch*(.5+aS.w)/max(.1,-mv.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying float vA;uniform vec3 uC;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float k=pow(1.-d*2.,1.6);gl_FragColor=vec4(uC*k*vA,1.);}'});
  var p=new THREE.Points(g,m);p.frustumCulled=false;scene.add(p);return p;
}
var pCharge=nuage('float ph=fract(aS.x*5.+uT*(.55+aS.y*.8));float r=mix(.15,6.5,pow(1.-ph,1.7));float an=aS.z*6.283+ph*5.;vec3 q=d*r;q=vec3(q.x*cos(an*.4)-q.z*sin(an*.4),q.y,q.x*sin(an*.4)+q.z*cos(an*.4));p=uA+q;a=smoothstep(0.,.25,ph)*(.5+ph);',46,0x9fe6ff);
var pRayon=nuage('float ph=fract(aS.x*3.+uT*(1.+aS.y*1.7));vec3 di=normalize(uB-uA);vec3 up=vec3(0.,1.,0.);vec3 si=normalize(cross(di,up));float an=aS.z*6.283+uT*3.;float r=(.45+aS.w*1.1)*(1.+ph*.9);p=uA+di*uLen*fract(aS.y*9.+uT*1.25*(.5+aS.x))+(si*cos(an)+up*sin(an))*r;a=(1.-ph)*.9;',34,0xbff0ff);
var pExpl=nuage('float dt=uT;float vit=3.+aS.w*17.;p=uB+d*vit*(1.-exp(-dt*1.5))/1.5;p.y+=-1.5*dt*dt;p.y=max(p.y,.05);a=smoothstep(3.4,.3,dt+aS.x*1.2);',42,0xffd9a0);

/* Dégâts */
var degC=document.createElement('canvas');degC.width=512;degC.height=170;(function(){var x=degC.getContext('2d');function d(){x.clearRect(0,0,512,170);x.font='130px Bangers, Impact, sans-serif';x.textAlign='center';x.textBaseline='middle';x.lineWidth=14;x.strokeStyle='#7a1c00';x.strokeText(window.__degTxt||'-13 600',256,88);x.fillStyle='#ffd23f';x.fillText(window.__degTxt||'-13 600',256,88);if(degT)degT.needsUpdate=true;}var degT=null;window.__degDraw=function(t){degT=t;d();};})();
var degTex=new THREE.CanvasTexture(degC);__degDraw(degTex);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){__degDraw(degTex);});
var deg=new THREE.Sprite(new THREE.SpriteMaterial({map:degTex,transparent:true,depthTest:false,depthWrite:false,fog:false}));scene.add(deg);

/* Rendu : avec halo lumineux (bloom) en qualité haute */
var composer=null,bloom=null,qual='haute',W=1,H=1;
try{
  composer=new THREE.EffectComposer(R);composer.addPass(new THREE.RenderPass(scene,cam));
  bloom=new THREE.UnrealBloomPass(new THREE.Vector2(256,256),.4,.45,.88);composer.addPass(bloom);
}catch(e){composer=null;}
function appliqueQualite(q){
  qual=q;var pr=Math.min(window.devicePixelRatio||1,q==='haute'?2:1);R.setPixelRatio(pr);if(composer)composer.setPixelRatio(pr);
  var n=q==='haute'?MAXP:1600;[pCharge,pRayon,pExpl].forEach(function(p){p.geometry.setDrawRange(0,n);p.material.uniforms.uEch.value=pr*(q==='haute'?1:1.5);});
  taille();
}
function taille(){
  W=racine.clientWidth||window.innerWidth;H=racine.clientHeight||window.innerHeight;R.setSize(W,H,false);if(composer)composer.setSize(W,H);
  cam.aspect=W/H;cam.fov=W/H<1?Math.min(82,42/Math.pow(W/H,.85)):42;cam.updateProjectionMatrix();
}
window.addEventListener('resize',taille);
canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();fail('Le téléphone a coupé la 3D faute de mémoire. Recharge la page, ou choisis la qualité basse.');});

/* Caméra */
var CLES=[
 [0,   [-2,2.4,11],[-4.5,1.8,0]],
 [1.5, [-10,1.35,5.6],[-5.9,1.8,.2]],
 [1.95,[-8.9,1.1,3.3],[-5.6,1.6,.4]],
 [2.2, [-8.8,.75,2.7],[0,1.7,0]],
 [2.72,[1.8,1.0,3.6],[7,1.7,0]],
 [3.05,[1.5,1.9,6.4],[7,2,0]],
 [4.3, [-.5,3.2,12],[6,2.2,0]],
 [6.6, [.5,3.6,14],[1.5,1.9,0]]];
var _p=V(0,0,0),_l=V(0,0,0);
function camera(t){
  var i=0;while(i<CLES.length-2&&t>CLES[i+1][0])i++;
  var a=CLES[i],b=CLES[i+1],k=sm(a[0],b[0],t);
  _p.set(mix(a[1][0],b[1][0],k),mix(a[1][1],b[1][1],k),mix(a[1][2],b[1][2],k));
  _l.set(mix(a[2][0],b[2][0],k),mix(a[2][1],b[2][1],k),mix(a[2][2],b[2][2],k));
  var sec=.012+.05*sm(.3,T.chargeFin,t)*(t<T.tir?1:0)+.14*(t>=T.tir&&t<T.impact?1:0)+.6*Math.exp(-Math.max(0,t-T.impact)*2.6)*(t>=T.impact?1:0)+.1*(t>=T.impact&&t<T.rayonFin?1:0);
  sec*=REDUIT?.15:1;
  _p.x+=sec*Math.sin(t*71.3);_p.y+=sec*Math.sin(t*93.7+1.);_p.z+=sec*.6*Math.sin(t*57.1+2.);_l.y+=sec*.5*Math.sin(t*83.+.5);
  cam.position.copy(_p);cam.lookAt(_l);
}

/* Le cri */
var cri=racine.querySelector('.cri'),criActuel='';
function dirCri(t){var s='';if(t>.15)s='KA';if(t>.5)s='KA… ME';if(t>.85)s='KA… ME… HA';if(t>1.25)s='KA… ME… HA… ME';if(t>=T.tir)s='HA !';if(t>T.tir+.95)s='';if(s!==criActuel){criActuel=s;cri.textContent=s;}cri.style.transform='scale('+(t>=T.tir?1.35+.25*Math.exp(-(t-T.tir)*7):1)+')';}

/* Une image de la scène, pour un instant t donné */
var flash=racine.querySelector('.flash'),vign=racine.querySelector('.vign');
function maj(t){
  var ch=sm(.05,T.chargeFin,t),apTir=t-T.tir,apImp=t-T.impact;
  var on=sm(T.tir,T.tir+.04,t)*(1-sm(T.rayonFin-.3,T.rayonFin,t));
  var lenK=cl((t-T.tir)/(T.impact-T.tir),0,1),len=LONG*lenK*lenK*(3-2*lenK);
  var bout=MAINS.clone().addScaledVector(DIR,len);
  var dim=sm(.2,1.4,t)*(1-sm(T.rayonFin,T.rayonFin+1.4,t));
  ciel.uniforms.uDim.value=dim*.92;solU.uDim.value=dim;scene.fog.density=mix(.012,.02,dim);

  /* Boule */
  var fin=1-sm(T.tir+.25,T.rayonFin-.1,t);
  var rB=(.1+.62*ch+.03*Math.sin(t*38))*(t<T.tir?1:mix(.6,1,fin));
  boule.visible=t<T.rayonFin;boule.scale.setScalar(rB);mBoule.uniforms.uT.value=t;mBoule.uniforms.uLen.value=4;
  haloBoule.visible=boule.visible;haloBoule.scale.setScalar(rB*3.4);haloBoule.material.opacity=.55;
  lumBoule.position.copy(MAINS);lumBoule.intensity=(ch*3.2+on*2.4)*(t<T.rayonFin?1:0);
  solU.uCharge.value=ch*(t<T.rayonFin?1:0);
  auraHero.scale.setScalar(3+ch*3.2+Math.sin(t*22)*.15);auraHero.material.opacity=ch*.28*(1-sm(T.rayonFin,T.rayonFin+.8,t));

  /* Rayon */
  rayon.visible=on>.001;
  var pulse=1+.08*Math.sin(t*46);
  tubes.forEach(function(m,i){var r=m.userData.r*pulse*on*(1+.35*sm(T.impact,T.impact+.15,t));m.scale.set(Math.max(len,.001),r,r);m.material.uniforms.uT.value=t;m.material.uniforms.uLen.value=Math.max(len,.1);});
  tete.position.set(len,0,0);tete.scale.setScalar(1.05*on*pulse);tete.visible=t<T.impact+.1;tete.material.uniforms.uT.value=t;tete.material.uniforms.uLen.value=3;
  haloTete.position.copy(bout);haloTete.visible=rayon.visible&&t<T.impact+.1;haloTete.scale.setScalar(3.2*on);haloTete.material.opacity=.6;
  anneaux.forEach(function(an,i){var k=(i/anneaux.length+t*1.5)%1,s=(.8+1.1*k)*on;an.position.set(k*len,0,0);an.scale.setScalar(Math.max(s,.001));an.material.opacity=(1-k)*.8*on;});
  solU.uB.value.copy(bout);solU.uRayon.value=on;

  /* Particules */
  var u=pCharge.material.uniforms;u.uT.value=t;u.uOn.value=sm(.02,.4,t)*(1-sm(T.tir,T.tir+.25,t));pCharge.visible=u.uOn.value>0;
  u=pRayon.material.uniforms;u.uT.value=t;u.uOn.value=on;u.uLen.value=len;pRayon.visible=on>0;
  u=pExpl.material.uniforms;u.uT.value=Math.max(apImp,0);u.uOn.value=apImp>0?1:0;pExpl.visible=apImp>0&&apImp<3.6;

  /* Cartes */
  var rec=t>=T.tir?.35*Math.exp(-apTir*3)*sm(0,.05,apTir)+.15*(t<T.rayonFin?1:Math.exp(-(t-T.rayonFin)*2)):0;
  cHero.m.position.set(HERO.x-rec+Math.sin(t*61)*.02*ch,HERO.y+.18*ch+Math.sin(t*2.2)*.03,HERO.z);
  var eh=1+ch*.12;cHero.face.color.setRGB(eh*.92,eh,eh*1.12);
  var touche=apImp>0,chute=touche?sm(0,.45,apImp):0,sec2=touche?.28*Math.exp(-apImp*1.4)*(t<T.rayonFin?1.6:1):0;
  cEnnemi.m.position.set(ENNEMI.x+1.3*chute+Math.sin(t*77)*sec2,ENNEMI.y-.55*sm(T.rayonFin,T.rayonFin+.7,t)+Math.sin(t*91)*sec2*.6,ENNEMI.z);
  cEnnemi.m.rotation.set(-.32*sm(T.rayonFin,T.rayonFin+.7,t),cEnnemi.rotY,-.16*chute);
  var gl=touche?(t<T.rayonFin?1.3:mix(1.3,.72,sm(T.rayonFin,T.rayonFin+.8,t))):1;cEnnemi.face.color.setRGB(gl*(touche?.95:1),gl,gl*(touche&&t<T.rayonFin?1.2:1));

  /* Rochers qui s'élèvent pendant la charge, puis sont soufflés */
  for(var i=0;i<NV;i++){
    var a=rnd(i+500)*6.283+t*(.25+rnd(i+1)*.35),r=2.2+rnd(i+600)*3.2,h=.05+ch*(1+rnd(i+700)*3.2)+Math.sin(t*1.7+i)*.1*ch,s=.08+rnd(i+800)*.26;
    var sf=t>T.tir?sm(0,1,apTir):0;
    o3.position.set(HERO.x+Math.cos(a)*r-sf*(4+rnd(i)*10),h+sf*(rnd(i+9)*2),HERO.z+Math.sin(a)*r+sf*(rnd(i+3)-.5)*6);
    o3.rotation.set(t*(rnd(i+2)*2),t*rnd(i+3),i);o3.scale.setScalar(s*(1-sf*.4));o3.updateMatrix();volants.setMatrixAt(i,o3.matrix);
  }
  volants.instanceMatrix.needsUpdate=true;
  /* Éclats de l'impact */
  eclats.visible=apImp>0;
  if(apImp>0){for(i=0;i<ND;i++){
    var az=rnd(i+900)*6.283,vh=4+rnd(i+910)*11,vy=3+rnd(i+920)*12,dt=apImp*(.55+rnd(i+930)*.45),y=1+vy*dt-5.2*dt*dt,x=vh*dt*(1-dt*.09);
    o3.position.set(CIBLE.x+Math.cos(az)*x,Math.max(.12,y),CIBLE.z+Math.sin(az)*x);o3.rotation.set(dt*(2+i%5),dt*(1+i%3),i);o3.scale.setScalar(.09+rnd(i+940)*.34);o3.updateMatrix();eclats.setMatrixAt(i,o3.matrix);
  }eclats.instanceMatrix.needsUpdate=true;}

  /* Impact */
  var ex=apImp>0?1-Math.exp(-apImp*3.2):0,exOp=apImp>0?sm(0,.04,apImp)*(1-sm(T.rayonFin-.25,T.rayonFin+.75,t)):0;
  expl.visible=exOp>0;expl.scale.setScalar(.5+ex*(t<T.rayonFin?2.7:3.4)+.1*Math.sin(t*33));explU.uT.value=t;explU.uOp.value=exOp*.62;
  haloImpact.position.copy(CIBLE);haloImpact.visible=exOp>0;haloImpact.scale.setScalar(3+ex*7);haloImpact.material.opacity=exOp*.32;
  lumImpact.intensity=exOp*3;
  var bo=apImp>0?Math.exp(-apImp*1.2):0;solU.uBoum.value=exOp*(.25+bo*.75);solU.uBrule.value=sm(0,.5,apImp);
  onde.visible=apImp>0&&apImp<1.7;onde.scale.setScalar(.5+apImp*15);onde.material.opacity=cl(1-apImp/1.7,0,1)*.9;
  onde2.visible=apImp>0&&apImp<.9;onde2.scale.setScalar(.5+apImp*9);onde2.material.opacity=cl(1-apImp/.9,0,1)*.65;
  fumees.forEach(function(f,i){var d=apImp-rnd(i+50)*.6;f.visible=d>0;if(d<=0)return;var a=rnd(i+60)*6.283,r=1+d*(.9+rnd(i+70)*1.5);f.position.set(CIBLE.x+Math.cos(a)*r,.6+d*(.45+rnd(i+80)*.7),CIBLE.z+Math.sin(a)*r*.7);f.scale.setScalar(2+d*2.1);f.material.opacity=sm(0,.5,d)*(1-sm(1.4,3.6,d))*.62*sm(T.rayonFin-.6,T.rayonFin+.2,t);});

  /* Dégâts */
  var dd=t-(T.impact+.95);deg.visible=dd>0&&dd<2.8;
  if(deg.visible){var pop=1+.6*Math.exp(-dd*7);deg.position.set(ENNEMI.x+.6,ENNEMI.y+2.6+dd*.18,ENNEMI.z+.8);deg.scale.set(4.2*pop,1.4*pop,1);deg.material.opacity=1-sm(2.2,2.8,dd);}

  /* Éclairs à l'écran */
  var fl=0;if(t>=T.tir)fl=Math.max(fl,.55*Math.exp(-apTir*12));if(apImp>=0)fl=Math.max(fl,Math.exp(-apImp*6.5));
  flash.style.opacity=(REDUIT?fl*.25:fl).toFixed(3);vign.style.opacity=dim.toFixed(3);
  dirCri(t);camera(t);
  if(bloom)bloom.strength=.32+.18*on;
}
function rendu(){if(composer&&qual==='haute')composer.render();else R.render(scene,cam);}
appliqueQualite(/Mobi|Android|iPhone/i.test(navigator.userAgent)?'basse':'haute');

/* Sons : décodés dès l'ouverture de la page. Le navigateur les laisse muets jusqu'au premier clic du joueur */
var ctx=null,maitre=null,mesure=null,bufK=null,bufE=null,actifs=[],sfxPret=Promise.resolve(),pic=0;
(function(){
  try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
  mesure=ctx.createAnalyser();mesure.fftSize=512;
  maitre=ctx.createDynamicsCompressor();maitre.connect(mesure);mesure.connect(ctx.destination);
  function charge(nom){return fetch(encodeURI(nom)).then(function(r){return r.arrayBuffer();}).then(function(b){return new Promise(function(ok){ctx.decodeAudioData(b,ok,function(){ok(null);});});}).catch(function(){return null;});}
  sfxPret=Promise.all([charge('assets/sound effect/Kamehameha Sound Effect.mp3'),charge('assets/sound effect/DBZ Explosion Sound Effect.mp3')]).then(function(r){bufK=r[0];bufE=r[1];});
  var oct=new Uint8Array(512);
  setInterval(function(){mesure.getByteTimeDomainData(oct);for(var k=0;k<512;k++)pic=Math.max(pic,Math.abs(oct[k]-128)/128);},40);
})();
function reveille(){if(ctx&&ctx.state!=='running'&&ctx.resume)ctx.resume();}
document.addEventListener('pointerdown',reveille,true);
function joue(buf,quand,decal,vol,fin,fondu){
  if(!buf)return;var s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buf;
  g.gain.setValueAtTime(.001,quand);g.gain.linearRampToValueAtTime(vol,quand+.12);g.gain.setValueAtTime(vol,fin-fondu);g.gain.linearRampToValueAtTime(.001,fin);
  s.connect(g);g.connect(maitre);s.start(quand,decal);s.stop(fin);actifs.push(s);
}
function sons(){
  if(!bufK||!bufE){
    if(window.sfxCharge)sfxCharge(1);
    setTimeout(function(){if(window.sfxBeam)sfxBeam();},T.tir*1000);
    setTimeout(function(){if(window.sfxBoom)sfxBoom();},T.impact*1000);
    return;
  }
  if(!ctx)return;var n=ctx.currentTime+.03;
  joue(bufK,n,6.4-T.tir,1.7,n+T.rayonFin,.3);
  joue(bufE,n+T.impact,.45,.9,n+T.fin+.5,1.4);
}
function coupeSons(){actifs.forEach(function(s){try{s.stop();}catch(e){}});actifs=[];}
function image(c,url,secours){
  new THREE.TextureLoader().load(url,function(tx){tx.anisotropy=4;texMiroir(tx);c.face.map=tx;c.face.needsUpdate=true;},undefined,function(){
    /* Carte sans illustration : son nom sur un fond simple */
    var cv=document.createElement('canvas');cv.width=256;cv.height=368;var x=cv.getContext('2d'),g=x.createLinearGradient(0,0,0,368);g.addColorStop(0,'#3b2a6b');g.addColorStop(1,'#120b2b');x.fillStyle=g;x.fillRect(0,0,256,368);
    x.fillStyle='#fff';x.font='bold 26px sans-serif';x.textAlign='center';x.fillText(secours||'',128,190,236);
    c.face.map=new THREE.CanvasTexture(cv);texMiroir(c.face.map);c.face.needsUpdate=true;
  });
}

/* Personnage 3D : le modèle n'a pas d'animation de combat, la pose est calculée à partir de la position voulue des mains et des pieds */
var modele=null,groupe=new THREE.Group(),os={},repos=[],qTete=new THREE.Quaternion(),qPiedL=new THREE.Quaternion(),qPiedR=new THREE.Quaternion(),modeleActif=false,modelePret=null;
var MAINS_FIN=V(HERO.x+1.16,2.27,0),doigts=[],flottants=[],AXE_X=V(1,0,0);
var qMainD=new THREE.Quaternion(),qMainG=new THREE.Quaternion(),repFD=V(0,0,0),repND=V(0,0,0),repFG=V(0,0,0),repNG=V(0,0,0);
var _A=V(0,0,0),_B=V(0,0,0),_C=V(0,0,0),_D=V(0,0,0),_E=V(0,0,0),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_q3=new THREE.Quaternion();
var AXE_Y=V(0,1,0),AXE_Z=V(0,0,1);
function tourne(b,q){b.getWorldQuaternion(_q2);_q2.premultiply(q);b.parent.getWorldQuaternion(_q3);b.quaternion.copy(_q3.invert().multiply(_q2));b.updateWorldMatrix(false,true);}
function vise(b,enfant,cible){b.getWorldPosition(_A);enfant.getWorldPosition(_B);_B.sub(_A).normalize();_C.copy(cible).sub(_A).normalize();_q.setFromUnitVectors(_B,_C);tourne(b,_q);}
function deuxOs(haut,bas,bout,cible,pole){
  haut.getWorldPosition(_D);bas.getWorldPosition(_A);bout.getWorldPosition(_B);
  var a=_A.distanceTo(_D),b=_B.distanceTo(_A);_C.copy(cible).sub(_D);var d=Math.min(_C.length(),a+b-.002);_C.normalize();
  var x=(a*a-b*b+d*d)/(2*d),h=Math.sqrt(Math.max(a*a-x*x,0));
  _E.copy(pole).addScaledVector(_C,-pole.dot(_C)).normalize();
  var coude=_D.clone().addScaledVector(_C,x).addScaledVector(_E,h),fin=_D.clone().addScaledVector(_C,d);
  vise(haut,bas,coude);vise(bas,bout,fin);
}
function monde(b,q){b.parent.getWorldQuaternion(_q3);b.quaternion.copy(_q3.invert().multiply(q));b.updateWorldMatrix(false,true);}
var CG=V(0,0,0),CD=V(0,0,0),POLE_D=V(-.7,-.65,.4),POLE_G=V(-.5,-.8,.15),POLE_J=V(1,.1,-.25),POLE_JB=V(.35,.1,.85),PJG=V(0,0,0),PJD=V(0,0,0);
/* Le geste, façon anime : des poses fortes calées sur le cri, atteintes d'un coup sec puis tenues.
   Chaque clé : [instant, durée du passage, élan, valeurs]. Positions relatives à Goku.
   Valeurs : main droite xyz, main gauche xyz, torsion, penché, accroupi, pied avant xz, pied arrière xz, poussée, doigts, paumes (0 libre, 1 boule, 2 tir), épaules */
var CLES_GESTE=[
 /* Départ, KA et Tension viennent du panneau de réglage. Les pieds de KA servent partout : Goku reste planté. */
 [0,   .01,0,  [-.206,2.24,.696, .015,1.58,.744,  -.976,-.294,.465, .272,-.516,-.432,.576, .009,.013,1,.22]],
 [.15, .1, 0,  [-.206,2.24,.696, .015,1.58,.744,  -.976,-.294,.465, .272,-.516,-.432,.576, .009,.25,1,.22]],
 /* La main droite reste au-dessus pendant toute la charge : les mains ne se croisent plus */
 [.5,  .1, 0,  [-.104,2.156,.54, .015,1.676,1.2,  -.966,-.22,.494,  .272,-.516,-.432,.576, .016,.35,1,.1]],
 [.85, .1, 0,  [.126,2.176,.496, .043,1.66,.867,  -.956,-.14,.522,  .272,-.516,-.432,.576, .023,.45,1,-.02]],
 [1.25,.1, 0,  [.356,2.196,.452, .071,1.644,.535, -.947,-.06,.551,  .272,-.516,-.432,.576, .03,.55,1,-.14]],
 [1.8, .16,0,  [.593,2.216,.408, .1,1.628,.192,   -.937,.014,.58,   .272,-.516,-.432,.576, .037,.65,1,-.25]],
 [2.05,.11,1.3,[1.02,2.22,.07,   1.02,2.32,-.07,  .04,-.16,.52,     .272,-.516,-.432,.576, .1,.3,2,.55]],
 [4.1, .9, 0,  [-.02,1.74,.74,   -.02,1.74,-.74,  .04,-.05,.22,     .272,-.516,-.432,.576, .03,.25,0,0]]];
var POSE=[];
/* Poignets : valeurs 17 à 22 de chaque pose (droit puis gauche : plier, incliner, tourner).
   Doigts : 23 à 28 pour la main droite, 29 à 34 pour la gauche (pouce, index, majeur, annulaire, auriculaire, écartement) */
/* Coudes : 35 et 36 pour le droit, 37 et 38 pour le gauche (orienter, plier) */
function completePose(v){while(v.length<39)v.push(0);return v;}
CLES_GESTE.forEach(function(c){completePose(c[3]);});
/* Réglages modifiables depuis le panneau, gardés d'une ouverture à l'autre sur cet ordinateur */
var REG={orbDebut:2.75,orbFin:.22,rayonDebut:6.2,rayonFin:4.3,hautDebut:2.1,hautFin:1.2,cadreY:2.1,fovTir:14,fovVol:30,arret:3.3,boule:.36,particules:.22,finRayon:.5,traits:1,tremble:1,vent:1,zoomPose:.5,secousse:1};
var DEFAUTS=JSON.stringify({cles:CLES_GESTE,reg:REG});
function appliqueReglages(o){
  if(!o)return;
  if(o.cles&&o.cles.length===CLES_GESTE.length)o.cles.forEach(function(c,i){CLES_GESTE[i][1]=c[1];CLES_GESTE[i][2]=c[2];CLES_GESTE[i][3]=completePose(c[3].slice());});
  if(o.reg)Object.keys(REG).forEach(function(k){if(typeof o.reg[k]==='number')REG[k]=o.reg[k];});
  if(o.cible&&o.cible.length===CLES_CIBLE.length)o.cible.forEach(function(c,i){CLES_CIBLE[i][1]=c[1];CLES_CIBLE[i][2]=c[2];CLES_CIBLE[i][3]=completePose(c[3].slice());});
  recalcTir();
}
/* Réglages validés : ceux du jeu. Le panneau de réglage peut les remplacer, sur l'ordinateur où il sert */
var VALIDES={"cles":[[0,0.01,0,[-0.206,2.24,0.696,-0.223,1.148,0.624,-1.064,-0.641,0.126,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,0.108,0.4375,1,0.61,-0.32,0.128,0.224,-3.104,0.064,3.136,0.06,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.448,0.0260000000000002,0.704,0.884]],[0.15,0.1,0,[-0.206,2.24,0.696,-0.223,1.148,0.624,-1.3,-0.516,0.126,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,0.039,0.4375,1,0.61,-0.32,0.128,0.224,-3.104,0.064,3.136,0.06,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.448,0.0260000000000002,0.704,0.884]],[0.5,0.1,0,[-0.25,2.24,0.74,-0.232,1.175,0.62,-1.5,-0.465,0.3,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,-0.012,0.4375,1,0.61,-0.32,0.128,0.224,-3.104,0.064,3.136,0.06,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.55,0.0260000000000002,0.95,0.884]],[0.85,0.1,0,[-0.33,2.235,0.8,-0.245,1.21,0.615,-1.62,-0.39,0.42,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,-0.06,0.4375,1,0.61,-0.32,0.128,0.224,-3.104,0.064,3.136,0.06,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.68,0.0260000000000002,1.25,0.884]],[1.25,0.1,0,[-0.38,2.23,0.85,-0.255,1.24,0.61,-1.69,-0.33,0.48,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,-0.09,0.4375,1,0.61,-0.32,0.128,0.224,-3.104,0.064,3.136,0.06,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.76,0.0260000000000002,1.45,0.884]],[1.8,0.16,0,[-0.401,2.226,0.881,-0.262,1.253,0.608,-1.724,-0.305,0.51,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,-0.105,0.4375,1,0.61,-0.32,0.128,0.224,-3.104,0.064,3.136,0.06,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.811,0.0260000000000002,1.589,0.884]],[2.05,0.11,1.3,[1.8,2.624,-0.132,1.8,1.592,0.384,-0.5080002441406251,-0.574666748046875,0.143,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,0.0226669921874999,0.4375,1,0.61,-1.44,-0.032,0.448,-1.088,0.544,-0.48,-0.03,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.672,-0.286,0.64,1.014]],[4.1,0.9,0,[1.8,2.624,-0.132,1.8,1.592,0.384,-0.5080002441406251,-0.574666748046875,0.143,0.16734472772441933,-0.33298026653880075,-0.3444146159023269,0.5212791660441063,0.0226669921874999,0.4375,1,0.61,-1.44,-0.032,0.448,-1.088,0.544,-0.48,-0.03,0.015,0,0,0,0,-0.045,0,0,0,0,0,-0.672,-0.286,0.64,1.014]]],"reg":{"orbDebut":0.032,"orbFin":0.288,"rayonDebut":7.4,"rayonFin":5.45,"hautDebut":3.303,"hautFin":1.2,"cadreY":2.18,"fovTir":14,"fovVol":30,"arret":3.3,"boule":0.1,"particules":0,"finRayon":0.1,"traits":1.5,"tremble":0,"vent":0,"zoomPose":0.5,"secousse":1},"cible":[[0,0.01,0,[0.45,2.3,0.25,0.5,2.42,-0.25,0.15,-0.05,0.2,0.4,-0.35,-0.4,0.35,0,0.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[2.3,0.25,0.6,[0.831,2.18,0.108,1.8,2.024,0.204,-0.016,-0.17,0.564,0.5,-0.35,-0.6,0.4,0.085,1.4875,0,0.13,-0.256,0,2.624,-0.544,0,-2.432,1.275,0,0,0,0,0,1.5,0,0,0,0,0,-0.608,1.118,0.768,1.222]],[2.8,0.09,1.4,[0.168,2.468,0.78,-0.019,2.348,-0.624,0,0.38,0.3,0.5,-0.35,-0.6,0.4,1.4,0.1875,0,-0.4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[3.4,0.5,0,[-0.35,2.35,0.8,-0.35,2.35,-0.8,0,0.45,0.35,0.5,-0.35,-0.6,0.4,2.2,0.15,0,-0.3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[4.1,0.8,0,[0.3,1.1,0.35,0.3,1.1,-0.35,0,-0.35,1,0.5,-0.3,-0.6,0.35,2.4,0.3,0,0.2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]]};
function chargeReglages(){
  appliqueReglages(VALIDES);DEFAUTS=JSON.stringify({cles:CLES_GESTE,reg:REG});
  if(!window.FX3D_EDITEUR)return;
  try{var s=localStorage.getItem('kame3d3');if(s)appliqueReglages(JSON.parse(s));}catch(e){}
}
function sauveReglages(){if(!window.FX3D_EDITEUR)return;try{localStorage.setItem('kame3d3',JSON.stringify({cles:CLES_GESTE,reg:REG,cible:CLES_CIBLE}));}catch(e){}}
/* Le rayon part d'entre les mains de la pose de tir */
function recalcTir(){
  var k=CLES_GESTE[6][3];
  if(modele){
    /* Le rayon part des vraies mains de la pose de tir, même si leur cible est hors de portée des bras */
    var pr=propre;propre=true;posture(CLES_GESTE[6][0]+CLES_GESTE[6][1]+.05);propre=pr;
    MAINS_FIN.set((WD.x+WG.x)/2+.14,(WD.y+WG.y)/2,(WD.z+WG.z)/2);
  } else MAINS_FIN.set(HERO.x+(k[0]+k[3])/2+.14,(k[1]+k[4])/2,(k[2]+k[5])/2);
  rayon.position.copy(MAINS_FIN);DIR.copy(CIBLE).sub(MAINS_FIN);LONG=DIR.length();DIR.normalize();rayon.quaternion.setFromUnitVectors(V(1,0,0),DIR);
}
function retour(k,s){if(s<=0)return k*k*(3-2*k);var a=k-1;return 1+(s+1)*a*a*a+s*a*a;}
/* Dernière pose de la charge : jusque-là, une courbe continue passe par toutes les poses, sans arrêt */
var FIN_COURBE=5,mixPoignet=1;
/* Pente de la courbe : nulle quand la valeur change de sens et bornée, pour ne jamais dépasser une pose ni créer d'aller-retour */
function pente(pa,pb,pc,ta,tb,tc){
  var s1=(pb-pa)/(tb-ta),s2=(pc-pb)/(tc-tb);if(s1*s2<=0)return 0;
  var m=(pc-pa)/(tc-ta),lim=3*Math.min(Math.abs(s1),Math.abs(s2));return Math.abs(m)>lim?(m>0?lim:-lim):m;
}
function calcPose(t){
  var i=0;while(i<CLES_GESTE.length-1&&t>=CLES_GESTE[i+1][0])i++;
  if(i<FIN_COURBE){
    var K=CLES_GESTE,a=K[i],b=K[i+1],dt=b[0]-a[0],u=(t-a[0])/dt,u2=u*u,u3=u2*u;
    var h0=2*u3-3*u2+1,h1=u3-2*u2+u,h2=-2*u3+3*u2,h3=u3-u2;
    var av0=K[Math.max(0,i-1)],ap1=K[Math.min(FIN_COURBE,i+2)];
    for(var j0=0;j0<a[3].length;j0++){
      var m0=i===0?0:pente(av0[3][j0],a[3][j0],b[3][j0],av0[0],a[0],b[0]),m1=i+1===FIN_COURBE?0:pente(a[3][j0],b[3][j0],ap1[3][j0],a[0],b[0],ap1[0]);
      POSE[j0]=h0*a[3][j0]+h1*dt*m0+h2*b[3][j0]+h3*dt*m1;
    }
    mixPoignet=1;
    return i;
  }
  /* La Tension est tenue telle quelle jusqu'au tir */
  if(i===FIN_COURBE){for(var j5=0;j5<CLES_GESTE[i][3].length;j5++)POSE[j5]=CLES_GESTE[i][3][j5];mixPoignet=1;return i;}
  var c=CLES_GESTE[i],av=CLES_GESTE[Math.max(0,i-1)][3],e=retour(cl((t-c[0])/c[1],0,1),c[2]);
  for(var j=0;j<c[3].length;j++)POSE[j]=av[j]+(c[3][j]-av[j])*e;
  mixPoignet=cl(e,0,1);
  return i;
}
/* Coup d'énergie à chaque pose : les vibrations repartent de plus belle */
function coup(t){var d=t-T.tir;return d>=0&&d<1.2?Math.exp(-d*7):0;}
var MD=new THREE.Matrix4(),MR=new THREE.Matrix4(),qR=new THREE.Quaternion(),_f=V(0,0,0),_n=V(0,0,0),_c=V(0,0,0);
function paume(b,repF,repN,q0,fx,fy,fz,nx,ny,nz,poids){
  if(poids<=0)return;
  _f.set(fx,fy,fz).normalize();_n.set(nx,ny,nz);_n.addScaledVector(_f,-_n.dot(_f)).normalize();_c.crossVectors(_f,_n);
  MD.makeBasis(_f,_n,_c);_c.crossVectors(repF,repN);MR.makeBasis(repF,repN,_c).invert();MD.multiply(MR);
  qR.setFromRotationMatrix(MD).multiply(q0);b.getWorldQuaternion(_q);_q.slerp(qR,poids);monde(b,_q);
}
/* Un bras : la main va à sa cible, « orienter » fait tourner le coude autour de l'axe épaule-main, « plier » replie l'avant-bras */
var _s=V(0,0,0),_ax=V(0,0,0),_po=V(0,0,0),_ce=V(0,0,0),_wr=V(0,0,0),_u=V(0,0,0),_f2=V(0,0,0),_qb=new THREE.Quaternion(),WD=V(0,0,0),WG=V(0,0,0);
function bras(ep,co,po,cible,pole,ori,pl,sortie){
  ep.getWorldPosition(_s);_ax.copy(cible).sub(_s).normalize();
  _po.copy(pole).applyAxisAngle(_ax,ori||0);
  deuxOs(ep,co,po,cible,_po);
  if(pl){
    ep.getWorldPosition(_s);co.getWorldPosition(_ce);po.getWorldPosition(_wr);
    _u.copy(_ce).sub(_s).normalize();_f2.copy(_wr).sub(_ce).normalize();
    _ax.crossVectors(_u,_f2);if(_ax.lengthSq()<1e-4)_ax.crossVectors(_u,_po);_ax.normalize();
    _qb.setFromAxisAngle(_ax,pl);tourne(co,_qb);
  }
  po.getWorldPosition(sortie);
}
var axPoignetD=null,axPoignetG=null;
function axesMain(q0,f,n){
  var inv=q0.clone().invert();
  return {tourner:f.clone().applyQuaternion(inv),incliner:n.clone().applyQuaternion(inv),plier:f.clone().cross(n).normalize().applyQuaternion(inv)};
}
function plie(b,ax,pl,inc,tou){
  if(!pl&&!inc&&!tou)return;
  _q.setFromAxisAngle(ax.tourner,tou);b.quaternion.multiply(_q);
  _q.setFromAxisAngle(ax.plier,pl);b.quaternion.multiply(_q);
  _q.setFromAxisAngle(ax.incliner,inc);b.quaternion.multiply(_q);
  b.updateWorldMatrix(false,true);
}
var _qA=new THREE.Quaternion(),_qB=new THREE.Quaternion(),_qE=new THREE.Quaternion();
function quatPoignet(ax,v,o,out){
  out.setFromAxisAngle(ax.tourner,v[o+2]);out.multiply(_qE.setFromAxisAngle(ax.plier,v[o]));out.multiply(_qE.setFromAxisAngle(ax.incliner,v[o+1]));
}
function pliePlusCourt(b,ax,Ka,Kb,o,k){
  quatPoignet(ax,Ka,o,_qA);quatPoignet(ax,Kb,o,_qB);_qA.slerp(_qB,k);b.quaternion.multiply(_qA);b.updateWorldMatrix(false,true);
}
function posture(t){
  if(!modele)return;
  repos.forEach(function(r){r[0].quaternion.copy(r[1]);});
  var i=calcPose(t),P=POSE,x0=HERO.x,y0=0;
  var tir=t>=T.tir&&t<T.rayonFin,charge=t<T.tir,cp=coup(t);
  var trem=((charge?.003+.009*sm(.4,T.chargeFin,t):(tir?.014:0))+.012*cp)*REG.tremble;
  var pX=Math.sin(t*37)*trem,pY=Math.sin(t*43+1)*trem,pZ=Math.sin(t*31+2)*trem;
  var souffle=(tir?0:Math.sin(t*2.6)*.02);
  /* En mode édition, le corps reste immobile pour que les poignées soient exactes */
  if(propre){pX=pY=pZ=souffle=0;}
  groupe.position.set(x0+P[13]+pX*.6,y0-P[8]+souffle+pY*.5,HERO.z+pZ*.6);
  groupe.updateMatrixWorld(true);
  /* Bassin : il tourne un peu avec le buste */
  _q.setFromAxisAngle(AXE_Y,P[6]*.35);tourne(os.bassin,_q);
  /* Pieds plantés au sol : c'est le corps qui bouge au-dessus */
  PJG.set(x0+P[9],.22,P[10]);PJD.set(x0+P[11],.22,P[12]);
  deuxOs(os.cuisseG,os.genouG,os.chevG,PJG,POLE_J);deuxOs(os.cuisseD,os.genouD,os.chevD,PJD,POLE_JB);
  monde(os.chevG,qPiedL);monde(os.chevD,qPiedR);
  /* Colonne : la torsion et le penché se répartissent sur trois os, ce qui évite l'effet de bloc */
  [os.buste,os.buste1b,os.buste2].forEach(function(b){_q.setFromAxisAngle(AXE_Z,P[7]*.4);tourne(b,_q);_q.setFromAxisAngle(AXE_Y,P[6]*.3);tourne(b,_q);});
  /* Épaules : reculées à la charge, jetées en avant au tir */
  _q.setFromAxisAngle(AXE_Y,P[16]*.7);tourne(os.clavD,_q);_q.setFromAxisAngle(AXE_Y,-P[16]*.7);tourne(os.clavG,_q);
  /* Mains */
  CD.set(x0+P[0]+pX,P[1]+pY,P[2]+pZ);CG.set(x0+P[3]-pZ,P[4]+pX,P[5]+pY);
  bras(os.epauleD,os.coudeD,os.poignetD,CD,POLE_D,P[35],P[36],WD);bras(os.epauleG,os.coudeG,os.poignetG,CG,POLE_G,P[37],P[38],WG);
  var pB=P[15]<=1?cl(P[15],0,1):1,pT=cl(P[15]-1,0,1);
  /* Paumes : l'une au-dessus de l'autre autour de la boule, puis ouvertes vers l'ennemi */
  if(pT>0){
    /* Poignets collés, doigts en griffes écartés vers l'extérieur */
    paume(os.poignetD,repFD,repND,qMainD,.3,.72,.62,1,-.3,0,pT);paume(os.poignetG,repFG,repNG,qMainG,.3,.72,-.62,1,-.3,0,pT);
  } else {
    /* Chaque paume regarde l'autre main : les mains peuvent rouler autour de la boule */
    var nx=WG.x-WD.x,ny=WG.y-WD.y,nz=WG.z-WD.z;
    paume(os.poignetD,repFD,repND,qMainD,1,.1,-.2,nx,ny,nz,pB);paume(os.poignetG,repFG,repNG,qMainG,1,-.1,-.2,-nx,-ny,-nz,pB);
  }
  /* Poignets réglés à la main, ajoutés à l'orientation calculée */
  if(i>FIN_COURBE&&mixPoignet<1){
    /* Entre deux poses, le poignet prend le chemin le plus court au lieu de faire un tour sur lui-même */
    var Kb=CLES_GESTE[i][3],Ka=CLES_GESTE[i-1][3];
    pliePlusCourt(os.poignetD,axPoignetD,Ka,Kb,17,mixPoignet);pliePlusCourt(os.poignetG,axPoignetG,Ka,Kb,20,mixPoignet);
  } else {
    plie(os.poignetD,axPoignetD,P[17],P[18],P[19]);plie(os.poignetG,axPoignetG,P[20],P[21],P[22]);
  }
  /* Doigts */
  var griffe=cl(P[15],0,1);
  doigts.forEach(function(d){
    _q.setFromAxisAngle(d[1],d[2]*(P[14]*d[3]+P[d[6]]));d[0].quaternion.multiply(_q);
    if(d[5]){_q.setFromAxisAngle(d[4],d[2]*d[5]*(griffe+P[d[7]]));d[0].quaternion.multiply(_q);}
  });
  /* Tête : elle fixe l'ennemi et suit le corps avec un léger retard */
  _q.setFromAxisAngle(AXE_Z,-P[7]*.35);_q2.copy(_q).multiply(qTete);
  monde(os.tete,_q2);
  /* Cheveux, kimono et ceinture dans le souffle de l'énergie */
  var vent=((charge?.03+.13*sm(.1,1.6,t):(tir?.22:.04*(1-sm(T.rayonFin,T.fin,t))))+.1*cp)*REG.vent;
  flottants.forEach(function(f){
    var a=vent*f[1]*(1+f[2]*.5),s1=Math.sin(t*(11+f[3]*7)+f[3]*6.3+f[2]*.8),s2=Math.sin(t*(8+f[3]*5)+f[3]*9.1+f[2]*.6);
    _q.setFromAxisAngle(AXE_Z,a*s1);f[0].quaternion.multiply(_q);_q.setFromAxisAngle(AXE_X,a*s2);f[0].quaternion.multiply(_q);
  });
  /* La boule reste entre les mains */
  if(t<T.tir){MAINS.set((WD.x+WG.x)/2+.1,(WD.y+WG.y)/2,(WD.z+WG.z)/2);}else MAINS.copy(MAINS_FIN);
  boule.position.copy(MAINS);haloBoule.position.copy(MAINS);
}
var propre=false;
/* Traits de vitesse façon manga */
var traits=document.createElement('div');
traits.style.cssText='position:absolute;inset:-25%;pointer-events:none;opacity:0;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.95) 0 .5deg,transparent .5deg 3.1deg,rgba(10,20,50,.9) 3.1deg 3.5deg,transparent 3.5deg 7deg);-webkit-mask-image:radial-gradient(circle,transparent 34%,#000 66%);mask-image:radial-gradient(circle,transparent 34%,#000 66%)';
racine.insertBefore(traits,racine.querySelector('.cri'));
/* Éclairs autour des mains */
var arcs=[];for(var ia=0;ia<7;ia++){var ga=new THREE.BufferGeometry();ga.setAttribute('position',new THREE.BufferAttribute(new Float32Array(30),3));var la=new THREE.Line(ga,new THREE.LineBasicMaterial({color:0xd8f6ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));la.frustumCulled=false;la.visible=false;scene.add(la);arcs.push(la);}
/* Poussière soufflée derrière Goku pendant le rayon */
var poussiere=[];for(var ip=0;ip<14;ip++){var sp=halo(TX_FUMEE,false);sp.material.color.set(0xb9a28a);sp.visible=false;poussiere.push(sp);}
function effetsAnime(t){
  var ap=t-T.tir,cp=coup(t);
  /* Traits : par à-coups à chaque pose, très forts au tir */
  var o=t<T.tir?.04+.3*sm(.4,T.tir,t):(t<T.impact+.05?.95:(t<T.impact+.6?.95*Math.exp(-(t-T.impact)*5):0));
  o=Math.min(1,o*REG.traits);traits.style.opacity=(REDUIT?o*.3:o).toFixed(3);
  traits.style.transform='rotate('+(Math.floor(t*20)*37%360)+'deg)';
  /* Changement brusque de couleur à l'impact, comme dans l'anime */
  var ai=t-T.impact,pal=ai>=0&&ai<.42&&!REDUIT?(Math.floor(ai*14)%2?'hue-rotate(-75deg) saturate(1.9) contrast(1.15)':'hue-rotate(25deg) saturate(1.5) brightness(1.1)'):'';
  if(canvas.style.filter!==pal)canvas.style.filter=pal;
  var marche=ch1(t),pas=Math.floor(t*18);
  arcs.forEach(function(a,i){
    a.visible=marche>0;if(!a.visible)return;
    a.material.opacity=marche*(rnd(pas*3+i)>.3?.95:.15);
    var pa=a.geometry.attributes.position,ang=rnd(pas*7+i)*6.283,dep=rnd(pas+i*5)*.5,r=.45+rnd(pas*2+i)*.55+.5*marche;
    for(var k=0;k<10;k++){var f=k/9,an=ang+f*(1.2+rnd(i+pas)),rr=dep+(r-dep)*f,j=(1-f)*.0+.14*Math.sin((pas+k+i)*12.9898);
      pa.setXYZ(k,MAINS.x+Math.cos(an)*rr+j,MAINS.y+Math.sin(an)*rr+j*.8,MAINS.z+Math.sin(an*1.7+i)*rr*.6+j);}
    pa.needsUpdate=true;
  });
  poussiere.forEach(function(p,i){
    var d=ap-rnd(i+20)*.5;p.visible=d>0&&t<T.rayonFin+1;if(!p.visible)return;
    var cyc=(d*.9+rnd(i+30))%1;
    p.position.set(HERO.x-.8-cyc*7,.25+cyc*(.6+rnd(i+40)*1.5),HERO.z+(rnd(i+50)-.5)*3*(.3+cyc));
    p.scale.setScalar(.8+cyc*3.2);p.material.opacity=(1-cyc)*.55*(1-sm(T.rayonFin,T.rayonFin+1,t));
  });
}
function ch1(t){return sm(.4,1.5,t)*(1-sm(T.tir+.15,T.tir+.2,t));}
/* Tunnel d'énergie vu de l'intérieur du rayon */
var tunnelU={uT:{value:0},uOp:{value:0}};
var tunnel=new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.1,LONG+14,40,1,true),new THREE.ShaderMaterial({uniforms:tunnelU,transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,fog:false,
  vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:GLSL_BRUIT+'varying vec2 vU;uniform float uT,uOp;void main(){float n=fbm(vec2(vU.x*36.,vU.y*3.-uT*7.));float s=smoothstep(.42,.8,n);vec3 c=mix(vec3(.05,.3,1.),vec3(.8,.97,1.),s);float bout=1.-smoothstep(.66,.76,vU.y);gl_FragColor=vec4(c*(.14+s)*uOp*bout,1.);}'}));
tunnel.visible=false;tunnel.frustumCulled=false;scene.add(tunnel);
var TUNNEL_Y=V(0,1,0);
var _vue=V(0,0,0),_fin=V(0,0,0),_pos0=V(0,0,0),_vue0=V(0,0,0),fovBase=42,vueLibre=null;
function cameraFx(t){
  var A=T.tir+.2,finVol=T.impact+.5,sec=0,suivi=cibleActive?(POSE2[13]||0)*.7:0;
  _pos0.copy(cam.position);cam.getWorldDirection(_vue0);
  fovBase=cam.fov;var fov=fovBase;
  var d=Math.min(LONG,LONG*(function(){var k=cl((t-T.tir)/(T.impact-T.tir),0,1);return k*k*(3-2*k);})());
  _fin.copy(MAINS_FIN).addScaledVector(DIR,d);
  var vol=t>=A&&t<finVol;
  tunnel.visible=vol;
  /* Pendant le vol, l'adversaire reste visible par-dessus l'explosion : on le voit encaisser */
  [cEnnemi.face,cEnnemi.m.material[0]].forEach(function(m){if(m.depthTest===vol){m.depthTest=!vol;m.transparent=vol;m.needsUpdate=true;}});
  cEnnemi.m.renderOrder=vol?20:0;
  cri.style.visibility=vol?'hidden':'visible';
  if(t<A){
    /* Tour autour de Goku : de derrière lui, par son côté où sont les mains, jusqu'à la face */
    var k=sm(0,T.tir,t),th=mix(REG.orbDebut,REG.orbFin,k),r=mix(REG.rayonDebut,REG.rayonFin,k),h=mix(REG.hautDebut,REG.hautFin,k);
    var cx=HERO.x+.15,cz=.1;
    var ci=coup(t)*REG.zoomPose;
    cam.position.set(cx+Math.cos(th)*(r-ci),h,cz+Math.sin(th)*(r-ci));
    _vue.set(cx,REG.cadreY,cz+.1);
    sec=.004+.016*sm(.5,T.tir,t);
    if(t>=T.tir)sec=.16;
    fov=fovBase+(t>=T.tir?REG.fovTir*(t-T.tir)/.2:0);
  } else if(vol){
    /* On devient le Kaméhaméha : la caméra file juste devant la tête du rayon */
    /* La caméra accompagne le Goku visé quand il est projeté, et les éclats ne viennent pas le cacher */
    var maxX=CIBLE.x-REG.arret+suivi,px=Math.min(_fin.x+1,maxX);
    cam.position.set(px,_fin.y+.18,_fin.z+.04);
    _vue.copy(CIBLE);_vue.x+=suivi;_vue.y=1.75;
    /* Le rayon ne passe pas devant la caméra : le Goku visé reste bien visible jusqu'au choc */
    if(cibleActive){eclats.visible=false;rayon.visible=false;pRayon.visible=false;}
    sec=.05+.28*Math.exp(-Math.max(0,t-T.impact)*5)*(t>=T.impact?1:0);
    fov=fovBase+REG.fovVol*(1-sm(T.impact-.1,T.impact+.2,t)*.45)*(cibleActive?.5:1);
    tete.visible=false;haloTete.visible=false;haloBoule.visible=false;boule.visible=false;
    tunnel.position.copy(MAINS_FIN).addScaledVector(DIR,LONG/2);tunnel.quaternion.setFromUnitVectors(TUNNEL_Y,DIR);
    tunnelU.uT.value=t;tunnelU.uOp.value=(1-sm(T.impact-.08,T.impact+.28,t))*.95;
    /* La carte adverse se tourne vers le rayon, pour le prendre de plein fouet */
    cEnnemi.m.rotation.y=-Math.PI/2+.1;
    explU.uOp.value*=mix(.28,1,sm(.15,.5,t-T.impact));
    expl.scale.multiplyScalar(mix(.35,1,sm(.05,.5,t-T.impact)));
    haloImpact.scale.multiplyScalar(mix(.3,1,sm(.05,.5,t-T.impact)));
    /* Un personnage 3D n'est pas dessiné par-dessus l'explosion : on la garde discrète pour bien le voir encaisser */
    if(cibleActive){explU.uOp.value*=.45;haloImpact.material.opacity*=.3;expl.scale.multiplyScalar(.75);}
  } else {
    /* Retour progressif au plan large */
    var br=sm(finVol,finVol+.7,t),ro=mix(-Math.PI/2+.1,cEnnemi.rotY,br);cEnnemi.m.rotation.y=ro;
    _vue.copy(_pos0).add(_vue0);
    cam.position.set(mix(CIBLE.x-REG.arret+suivi,_pos0.x,br),mix(CIBLE.y+.75,_pos0.y,br),mix(.04,_pos0.z,br));
    _vue.set(mix(CIBLE.x+suivi,_vue.x,br),mix(1.75,_vue.y,br),mix(CIBLE.z,_vue.z,br));
    fov=fovBase+REG.fovVol*.55*(1-br);
  }
  var s=(REDUIT?sec*.2:sec)*REG.secousse;
  /* Vue libre du panneau : on tourne autour de Goku à la souris, sans secousses */
  if(vueLibre){var cxV=vueLibre.cx==null?HERO.x:vueLibre.cx;s=0;fov=fovBase;cam.position.set(cxV+Math.cos(vueLibre.az)*Math.cos(vueLibre.el)*vueLibre.r,1.9+Math.sin(vueLibre.el)*vueLibre.r,Math.sin(vueLibre.az)*Math.cos(vueLibre.el)*vueLibre.r);_vue.set(cxV+.1,1.9,0);}
  cam.position.x+=s*Math.sin(t*71.3);cam.position.y+=s*Math.sin(t*93.7+1);cam.position.z+=s*.6*Math.sin(t*57.1+2);
  cam.lookAt(_vue);
  cam.fov=fov;cam.updateProjectionMatrix();cam.fov=fovBase;
  /* L'aura reste toujours derrière Goku, sinon elle blanchit sa tête */
  _vue.copy(HERO).sub(cam.position);_vue.y=0;_vue.normalize();auraHero.position.copy(HERO).addScaledVector(_vue,1.8);auraHero.position.y=2;
  /* Le passage dans le rayon se fait derrière un éclair */
  if(vol&&t>=T.impact)flash.style.opacity=Math.min(+flash.style.opacity,.3).toFixed(3);
  var fc=Math.exp(-Math.abs(t-A)*26);if(!REDUIT)flash.style.opacity=Math.max(+flash.style.opacity,fc).toFixed(3);
}
function majFx(t){
  if(modeleActif)posture(t);
  posturesCible(t);
  maj(t);
  if(modeleActif){
    /* Plus petites qu'avec une carte, pour que l'énergie ne cache pas le personnage */
    var cible=t<T.tir?REG.boule:1;boule.scale.multiplyScalar(cible);haloBoule.scale.multiplyScalar(cible*.9);haloBoule.material.opacity=.45;
    /* Caméra très proche : moins de particules et un rayon plus fin au départ, pour garder Goku et ses mains visibles */
    pCharge.material.uniforms.uOn.value*=REG.particules;pCharge.material.uniforms.uTaille.value=22;auraHero.material.opacity*=.45;
    var fin2=mix(REG.finRayon,1,sm(T.tir+.3,T.impact,t));rayon.scale.set(1,fin2,fin2);
    haloTete.scale.multiplyScalar(fin2);pRayon.material.uniforms.uOn.value*=mix(.25,1,sm(T.tir+.4,T.impact,t));
    effetsAnime(t);
  } else {traits.style.opacity=0;canvas.style.filter='';arcs.forEach(function(a){a.visible=false;});poussiere.forEach(function(p){p.visible=false;});}
  if(modeleActif)cameraFx(t);else tunnel.visible=false;
  /* En format vertical, le dernier plan recule pour montrer les deux combattants */
  if(cam.aspect<1)cam.position.z+=10*sm(T.rayonFin,T.rayonFin+1.2,t);
  if(propre){boule.visible=haloBoule.visible=pCharge.visible=pRayon.visible=rayon.visible=haloTete.visible=auraHero.visible=false;pExpl.visible=expl.visible=haloImpact.visible=onde.visible=onde2.visible=eclats.visible=volants.visible=tunnel.visible=deg.visible=false;fumees.forEach(function(f){f.visible=false;});lumImpact.intensity=0;lumBoule.intensity=0;solU.uBoum.value=0;solU.uRayon.value=0;solU.uCharge.value=0;traits.style.opacity=0;canvas.style.filter='';flash.style.opacity=0;arcs.forEach(function(a){a.visible=false;});poussiere.forEach(function(p){p.visible=false;});}else{auraHero.visible=true;volants.visible=true;}
}
/* Décor selon le Terrain : ciel (horizon, milieu, haut), sol (deux teintes), brume, montagnes, rochers */
var DECORS={
 defaut:{ciel:[0xf26b33,0x29124d,0x05081a],sol:[0x331c17,0x6b4529],brume:0x1a0f2b,mont:0x1b0f2a,roche:0x6f4d3a},
 pl_froid:{ciel:[0xa5f3fc,0x312e81,0x0b0a2a],sol:[0x7ea3cc,0xdbeafe],brume:0x8fb4d9,mont:0x1e1b4b,roche:0x93c5fd},
 pleine_lune:{ciel:[0x312e81,0x0d0c2a,0x020208],sol:[0x171538,0x38335a],brume:0x0d0c2a,mont:0x08071a,roche:0x4b4a6b,lune:true},
 arene:{ciel:[0xfde68a,0x60a5fa,0x1d4ed8],sol:[0xa89f91,0xd6cfc2],brume:0xc9d7e8,mont:0x7c8a6b,roche:0xb9b1a3},
 pl_namek:{ciel:[0x86efac,0x115e59,0x042f2e],sol:[0x166534,0x4ade80],brume:0x4fb98a,mont:0x0f4c46,roche:0x2dd4bf},
 labo:{ciel:[0x7f1d1d,0x2a0c0c,0x0c0505],sol:[0x27272a,0x52525b],brume:0x2a1212,mont:0x18181b,roche:0x71717a},
 vaisseau_babidi:{ciel:[0xf0abfc,0x3b0764,0x12021f],sol:[0x2e1065,0x581c87],brume:0x4c1d6f,mont:0x1e0a3c,roche:0x7e22ce},
 kaios:{ciel:[0xfef08a,0x0e7490,0x083344],sol:[0x4d7c0f,0x84cc16],brume:0x7fb8a0,mont:0x0e7490,roche:0xa3e635},
 neant:{ciel:[0xf8fafc,0xcbd5e1,0x64748b],sol:[0x94a3b8,0xe2e8f0],brume:0xdfe6ee,mont:null,roche:0x94a3b8},
 /* Sagas de l'Histoire, quand aucun Terrain n'est actif */
 saga_db:{ciel:[0xbfe3ff,0x4aa3e8,0x1c5fb0],sol:[0x5d8a3a,0x9cbf55],brume:0xbcdcf0,mont:0x5f8f7a,roche:0xa08a6a},
 saga_z:{ciel:[0xf7d7a0,0x7bb6d9,0x2a5f8f],sol:[0x8a6a45,0xc9a66b],brume:0xd9c2a0,mont:0x7a5a45,roche:0x8a6a4f},
 saga_gt:{ciel:[0xef6a4a,0x5b1a3f,0x12051f],sol:[0x3a2430,0x6b3f46],brume:0x4a1e34,mont:0x25101f,roche:0x6d4c54},
 saga_s:{ciel:[0x7dd3fc,0x3b3fb0,0x120b3a],sol:[0x3d3f66,0x6c6fa3],brume:0x4b4f96,mont:0x1c1b4a,roche:0x7b7fb8}
};
var lune=null,decorActuel=null,decorImg={};
function decor(id){
  id=DECORS[id]?id:'defaut';if(id===decorActuel)return;decorActuel=id;
  var D=DECORS[id];
  ciel.uniforms.uH.value.setHex(D.ciel[0]);ciel.uniforms.uM.value.setHex(D.ciel[1]);ciel.uniforms.uTo.value.setHex(D.ciel[2]);
  solU.uSolA.value.setHex(D.sol[0]);solU.uSolB.value.setHex(D.sol[1]);solU.uBrume.value.setHex(D.brume);scene.fog.color.setHex(D.brume);
  matMont.visible=D.mont!==null;if(D.mont!==null)matMont.color.setHex(D.mont);rocheM.color.setHex(D.roche);
  if(D.lune&&!lune){
    var cv=document.createElement('canvas');cv.width=cv.height=256;var x=cv.getContext('2d'),g=x.createRadialGradient(128,128,70,128,128,128);
    g.addColorStop(0,'rgba(254,243,199,1)');g.addColorStop(.3,'rgba(254,243,199,.35)');g.addColorStop(1,'rgba(254,243,199,0)');x.fillStyle=g;x.fillRect(0,0,256,256);
    x.fillStyle='#fef3c7';x.beginPath();x.arc(128,128,72,0,6.3);x.fill();x.fillStyle='rgba(180,160,120,.3)';[[105,105,16],[150,120,11],[125,160,20]].forEach(function(c){x.beginPath();x.arc(c[0],c[1],c[2],0,6.3);x.fill();});
    lune=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false,fog:false}));lune.position.set(-20,44,-90);lune.scale.setScalar(44);scene.add(lune);
  }
  if(lune)lune.visible=!!D.lune;
  /* Si le joueur a déposé une image pour ce Terrain, elle remplace le ciel */
  scene.background=null;ciel_mesh(true);
  if(id==='defaut')return;
  function pose(tx){if(decorActuel!==id)return;scene.background=tx;ciel_mesh(false);matMont.visible=false;}
  if(decorImg[id]){if(decorImg[id]!=='non')pose(decorImg[id]);return;}
  new THREE.TextureLoader().load('assets/terrains/'+id+'.webp',function(tx){decorImg[id]=tx;pose(tx);},undefined,function(){decorImg[id]='non';});
}
function ciel_mesh(v){scene.children.forEach(function(o){if(o.material===ciel)o.visible=v;});}
/* Quand l'ennemi lance l'attaque, l'image est retournée : il tire de la droite vers la gauche */
var miroirOn=false;
function texMiroir(tx){if(!tx)return;tx.wrapS=THREE.RepeatWrapping;tx.repeat.x=miroirOn?-1:1;tx.offset.x=miroirOn?1:0;tx.needsUpdate=true;}
function miroir(on){
  miroirOn=!!on;canvas.style.transform=miroirOn?'scaleX(-1)':'';
  texMiroir(degTex);texMiroir(cHero.face.map);texMiroir(cEnnemi.face.map);
}
/* Goku visé : un second modèle qui encaisse le rayon. Mêmes valeurs que les poses de Goku, vues depuis l'autre côté :
   l'avant va vers Goku qui attaque, et « poussée » est le recul du personnage. */
var CLES_CIBLE=[
 [0,   .01,0,  [.45,2.3,.25,    .5,2.42,-.25,  .15,-.05,.2,  .4,-.35,-.4,.35,   0,  .6,0,0]],
 [2.3, .25,.6, [.42,2.72,-.02,  .42,2.56,.02,  0,-.12,.4,    .5,-.35,-.6,.4,    0,  .8,0,.3]],
 [2.8, .09,1.4,[-.5,2.6,.85,    -.5,2.6,-.85,  0,.55,.3,     .5,-.35,-.6,.4,    1.4,.1,0,-.4]],
 [3.4, .5, 0,  [-.35,2.35,.8,   -.35,2.35,-.8, 0,.45,.35,    .5,-.35,-.6,.4,    2.2,.15,0,-.3]],
 [4.1, .8, 0,  [.3,1.1,.35,     .3,1.1,-.35,   0,-.35,1,     .5,-.3,-.6,.35,    2.4,.3,0,.2]]];
CLES_CIBLE.forEach(function(c){completePose(c[3]);});
var DEFAUT_CIBLE=JSON.stringify(CLES_CIBLE);
var ax2D=null,ax2G=null,W2D=V(0,0,0),W2G=V(0,0,0);
var groupe2=new THREE.Group(),os2=null,repos2=[],doigts2=[],qTete2=new THREE.Quaternion(),qPiedL2=new THREE.Quaternion(),qPiedR2=new THREE.Quaternion(),cibleActive=false;
groupe2.visible=false;scene.add(groupe2);
var POSE2=[],_c1=V(0,0,0),_c2=V(0,0,0),_c3=V(0,0,0),_c4=V(0,0,0),P2D=V(.6,-.7,-.3),P2G=V(.6,-.7,.3),P2J=V(-1,.1,.25),P2JB=V(-.35,.1,-.85);
function posturesCible(t){
  if(!cibleActive||!os2)return;
  repos2.forEach(function(r){r[0].quaternion.copy(r[1]);});
  var K=CLES_CIBLE,i=0;while(i<K.length-1&&t>=K[i+1][0])i++;
  var c=K[i],av=K[Math.max(0,i-1)][3],e=retour(cl((t-c[0])/c[1],0,1),c[2]),P=POSE2;
  for(var j=0;j<c[3].length;j++)P[j]=av[j]+(c[3][j]-av[j])*e;
  var sec=t>=T.impact&&t<T.rayonFin?.04*(propre?0:1):0;
  var x0=ENNEMI.x+P[13]+Math.sin(t*67)*sec;
  groupe2.position.set(x0,-P[8]+Math.sin(t*79)*sec*.5,ENNEMI.z+Math.sin(t*53)*sec);
  groupe2.updateMatrixWorld(true);
  _q.setFromAxisAngle(AXE_Y,P[6]*.35);tourne(os2.bassin,_q);
  /* Les pieds suivent le recul : Goku glisse sur le sol */
  _c1.set(x0-P[9],.22,-P[10]);_c2.set(x0-P[11],.22,-P[12]);
  deuxOs(os2.cuisseG,os2.genouG,os2.chevG,_c1,P2J);deuxOs(os2.cuisseD,os2.genouD,os2.chevD,_c2,P2JB);
  monde(os2.chevG,qPiedL2);monde(os2.chevD,qPiedR2);
  [os2.buste,os2.buste1b,os2.buste2].forEach(function(b){_q.setFromAxisAngle(AXE_Z,-P[7]*.4);tourne(b,_q);_q.setFromAxisAngle(AXE_Y,P[6]*.3);tourne(b,_q);});
  _q.setFromAxisAngle(AXE_Y,-P[16]*.7);tourne(os2.clavD,_q);_q.setFromAxisAngle(AXE_Y,P[16]*.7);tourne(os2.clavG,_q);
  _c3.set(x0-P[0],P[1],-P[2]);_c4.set(x0-P[3],P[4],-P[5]);
  bras(os2.epauleD,os2.coudeD,os2.poignetD,_c3,P2D,P[35],P[36],W2D);bras(os2.epauleG,os2.coudeG,os2.poignetG,_c4,P2G,P[37],P[38],W2G);
  plie(os2.poignetD,ax2D,P[17],P[18],P[19]);plie(os2.poignetG,ax2G,P[20],P[21],P[22]);
  doigts2.forEach(function(d){
    _q.setFromAxisAngle(d[1],d[2]*(P[14]*d[3]+P[d[6]]));d[0].quaternion.multiply(_q);
    if(d[5]&&P[d[7]]){_q.setFromAxisAngle(d[4],d[2]*d[5]*P[d[7]]);d[0].quaternion.multiply(_q);}
  });
  /* La tête part en arrière avec le choc */
  _q.setFromAxisAngle(AXE_Z,P[7]*.6);_q2.copy(_q).multiply(qTete2);monde(os2.tete,_q2);
}
function osDe(racineM){
  function trouve(pre){var r=null;racineM.traverse(function(o){if(!r&&o.isBone&&o.name.indexOf(pre)===0&&/^\d/.test(o.name.slice(pre.length)))r=o;});return r;}
  return {cuisseG:trouve('THIGH_L_'),genouG:trouve('CLANK_L_'),chevG:trouve('TOE1_L_'),cuisseD:trouve('THIGH_R_'),genouD:trouve('CLANK_R_'),chevD:trouve('TOE1_R_'),
    buste:trouve('SPINE1_'),buste1b:trouve('SPINE2_'),buste2:trouve('SPINE3_'),tete:trouve('HEAD_'),bassin:trouve('WAIST_'),clavD:trouve('CLAVICLE_R_'),clavG:trouve('CLAVICLE_L_'),
    epauleG:trouve('SHOULDER_L_'),coudeG:trouve('ELBOW_L_'),poignetG:trouve('WRIST_L_'),epauleD:trouve('SHOULDER_R_'),coudeD:trouve('ELBOW_R_'),poignetD:trouve('WRIST_R_')};
}
function creeCible(scene0){
  if(!THREE.SkeletonUtils)return;
  var m2=THREE.SkeletonUtils.clone(scene0);groupe2.add(m2);groupe2.scale.setScalar(2);groupe2.rotation.y=-Math.PI/2;groupe2.position.copy(ENNEMI);groupe2.position.y=0;
  var av=V(-1,0,0),qw=new THREE.Quaternion();
  m2.traverse(function(o){
    if(o.isMesh)o.frustumCulled=false;
    if(o.isBone){
      repos2.push([o,o.quaternion.clone()]);
      var mf=o.name.replace(/_\d+$/,'').match(/^F_(THUMB|FORE|MIDDLE|MEDICINAL|LITTLE)([123])_(L|R)$/);
      if(mf){
        var base=mf[3]==='R'?23:29,ec=mf[2]==='1'?{THUMB:.35,FORE:.2,MIDDLE:.06,MEDICINAL:-.08,LITTLE:-.24}[mf[1]]:0;
        doigts2.push([o,null,mf[3]==='R'?1:-1,mf[1]==='THUMB'?.35:1,null,ec,base+{THUMB:0,FORE:1,MIDDLE:2,MEDICINAL:3,LITTLE:4}[mf[1]],base+5]);
      }
    }
  });
  groupe2.updateMatrixWorld(true);os2=osDe(m2);
  doigts2.forEach(function(d){d[0].getWorldQuaternion(qw);var inv=qw.clone().invert();d[1]=av.clone().applyQuaternion(inv);d[4]=V(0,1,0).applyQuaternion(inv);});
  os2.tete.getWorldQuaternion(qTete2);os2.chevG.getWorldQuaternion(qPiedL2);os2.chevD.getWorldQuaternion(qPiedR2);
  /* Axes des poignets, mesurés sur la pose de repos comme pour l'autre Goku */
  var pa=V(0,0,0),pb=V(0,0,0),q0=new THREE.Quaternion();
  os2.poignetD.getWorldPosition(pb);os2.coudeD.getWorldPosition(pa);os2.poignetD.getWorldQuaternion(q0);ax2D=axesMain(q0,pb.clone().sub(pa).normalize(),V(0,-1,0));
  os2.poignetG.getWorldPosition(pb);os2.coudeG.getWorldPosition(pa);os2.poignetG.getWorldQuaternion(q0);ax2G=axesMain(q0,pb.clone().sub(pa).normalize(),V(0,-1,0));
}
function activeCible(oui){cibleActive=!!(oui&&os2);groupe2.visible=cibleActive;cEnnemi.m.visible=!cibleActive;}
function chargeModele(){
  if(modelePret)return modelePret;
  modelePret=new Promise(function(ok){
    if(!THREE.GLTFLoader){ok(false);return;}
    new THREE.GLTFLoader().load(encodeURI('assets/3D assets/dbsz_cc_goku_base.glb'),function(g){
      modele=g.scene;
      modele.traverse(function(o){if(o.isMesh&&o.material&&o.material.map){o.material.map.encoding=THREE.LinearEncoding;o.material.needsUpdate=true;}});
      creeCible(modele);
      groupe.add(modele);groupe.scale.setScalar(2);groupe.rotation.y=Math.PI/2;scene.add(groupe);
      modele.traverse(function(o){
        if(o.isMesh){o.frustumCulled=false;var m=o.material;if(m&&m.map){m.map.encoding=THREE.LinearEncoding;m.needsUpdate=true;}}
        if(o.isBone)repos.push([o,o.quaternion.clone()]);
      });
      function trouve(pre){var r=null;modele.traverse(function(o){if(!r&&o.isBone&&o.name.indexOf(pre)===0&&/^\d/.test(o.name.slice(pre.length)))r=o;});return r;}
      os={cuisseG:trouve('THIGH_L_'),genouG:trouve('CLANK_L_'),chevG:trouve('TOE1_L_'),cuisseD:trouve('THIGH_R_'),genouD:trouve('CLANK_R_'),chevD:trouve('TOE1_R_'),
        buste:trouve('SPINE1_'),buste1b:trouve('SPINE2_'),buste2:trouve('SPINE3_'),tete:trouve('HEAD_'),bassin:trouve('WAIST_'),clavD:trouve('CLAVICLE_R_'),clavG:trouve('CLAVICLE_L_'),
        epauleG:trouve('SHOULDER_L_'),coudeG:trouve('ELBOW_L_'),poignetG:trouve('WRIST_L_'),epauleD:trouve('SHOULDER_R_'),coudeD:trouve('ELBOW_R_'),poignetD:trouve('WRIST_R_')};
      groupe.updateMatrixWorld(true);
      os.tete.getWorldQuaternion(qTete);os.chevG.getWorldQuaternion(qPiedL);os.chevD.getWorldQuaternion(qPiedR);
      os.poignetD.getWorldQuaternion(qMainD);os.poignetG.getWorldQuaternion(qMainG);
      /* Au repos, en croix et vu du monde : le modèle regarde vers +x, sa main droite pointe vers -z... mesuré sur les os */
      var pa=V(0,0,0),pb=V(0,0,0);
      os.poignetD.getWorldPosition(pb);os.coudeD.getWorldPosition(pa);repFD.copy(pb).sub(pa).normalize();repND.set(0,-1,0);
      os.poignetG.getWorldPosition(pb);os.coudeG.getWorldPosition(pa);repFG.copy(pb).sub(pa).normalize();repNG.set(0,-1,0);
      axPoignetD=axesMain(qMainD,repFD,repND);axPoignetG=axesMain(qMainG,repFG,repNG);
      /* Doigts : l'axe de flexion est l'axe avant du corps, exprimé dans le repère de chaque os */
      var av=V(1,0,0),qw=new THREE.Quaternion();
      modele.traverse(function(o){
        if(!o.isBone)return;var n=o.name.replace(/_\d+$/,'');
        var mf=n.match(/^F_(THUMB|FORE|MIDDLE|MEDICINAL|LITTLE)([123])_(L|R)$/);
        if(mf){
          o.getWorldQuaternion(qw);var inv=qw.clone().invert(),ax=av.clone().applyQuaternion(inv),axH=V(0,1,0).applyQuaternion(inv);
          /* Écart des doigts, seulement à leur base */
          var ec=mf[2]==='1'?{THUMB:.35,FORE:.2,MIDDLE:.06,MEDICINAL:-.08,LITTLE:-.24}[mf[1]]:0;
          var base=mf[3]==='R'?23:29;
          doigts.push([o,ax,mf[3]==='R'?1:-1,mf[1]==='THUMB'?.35:1,axH,ec,base+{THUMB:0,FORE:1,MIDDLE:2,MEDICINAL:3,LITTLE:4}[mf[1]],base+5]);return;
        }
        var mh=n.match(/^HAIR_\d+_(\d+)$/);
        if(mh){flottants.push([o,.22,+mh[1],rnd(flottants.length+1)]);return;}
        /* Seule la ceinture flotte : les os « JIGGLE » déforment trop le kimono et la peau */
        var mj=n.match(/^OBI(\d)_?[LR]?$/);
        if(mj)flottants.push([o,1,+mj[1],rnd(flottants.length+1)]);
      });
      ok(true);
    },null,function(e){console.warn('FX3D : modèle illisible',e);ok(false);});
  });
  return modelePret;
}
function activeModele(oui){
  modeleActif=!!(oui&&modele);groupe.visible=modeleActif;cHero.m.visible=!modeleActif;
  if(modeleActif){
    /* Le plan du tir recule pour garder Goku à l'image */
    /* Contre-plongée à la charge, puis Goku de face, les mains vers la caméra */
    CLES[0]=[0,[-2.6,1.7,9.5],[-5.4,2.3,0]];CLES[1]=[1.5,[-4.5,.95,5.2],[-6.4,2.5,.2]];
    CLES[2]=[1.98,[-3.7,1.35,2.5],[-6.5,2.4,.1]];CLES[3]=[2.32,[-4,1.5,3],[-6,2.3,0]];
    recalcTir();MAINS.copy(MAINS_FIN);
  }
}

chargeReglages();
return {
  /* Pour le panneau de réglage */
  T:T,cles:CLES_GESTE,reg:REG,racine:racine,
  defauts:function(){return JSON.parse(DEFAUTS);},
  applique:function(o){appliqueReglages(o);sauveReglages();},
  sauve:sauveReglages,
  recalc:recalcTir,
  dessine:function(x,sansEffets){propre=!!sansEffets;majFx(x);rendu();},
  clesCible:CLES_CIBLE,defautCible:function(){return JSON.parse(DEFAUT_CIBLE);},
  ouvre:function(foe){if(foe){image(cEnnemi,foe);activeCible(/goku_db\.webp/.test(foe));}activeModele(true);racine.style.display='block';taille();},
  taille:taille,
  vueLibre:function(v){vueLibre=v;},
  HERO:HERO,
  /* Poignées de l'éditeur : où sont les os, à l'écran et dans la scène */
  ENNEMI:ENNEMI,
  points:function(deCible){
    var o=deCible?os2:os;if(!modele||!o||!o.poignetD)return {};var r={};
    function f(n,b){var v=V(0,0,0);b.getWorldPosition(v);r[n]=v;}
    f('mainD',o.poignetD);f('mainG',o.poignetG);f('coudeD',o.coudeD);f('coudeG',o.coudeG);
    f('piedD',o.chevD);f('piedG',o.chevG);f('buste',o.buste2);f('bassin',o.bassin);
    return r;
  },
  decor:decor,miroir:miroir,
  ecran:function(v){var p=v.clone().project(cam),x=(p.x+1)/2*racine.clientWidth;return [miroirOn?racine.clientWidth-x:x,(1-p.y)/2*racine.clientHeight,p.z];},
  rayonSouris:function(cx,cy){
    var b=canvas.getBoundingClientRect(),ra=new THREE.Raycaster(),nx=(cx-b.left)/b.width*2-1;
    ra.setFromCamera(new THREE.Vector2(miroirOn?-nx:nx,1-(cy-b.top)/b.height*2),cam);return ra.ray;
  },
  planCamera:function(cx,cy,o){
    var n=V(0,0,0);cam.getWorldDirection(n);var out=V(0,0,0);
    return this.rayonSouris(cx,cy).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n,o),out)?out:null;
  },
  planSol:function(cx,cy){
    var out=V(0,0,0);return this.rayonSouris(cx,cy).intersectPlane(new THREE.Plane(V(0,1,0),-.22),out)?out:null;
  },
  /* Valeur d'« orienter » pour amener le coude vers un point */
  orientCoude:function(droit,pt,deCible){
    var o=deCible?os2:os,ep=droit?o.epauleD:o.epauleG,c=deCible?(droit?_c3:_c4):(droit?CD:CG),po=deCible?(droit?P2D:P2G):(droit?POLE_D:POLE_G),S=V(0,0,0);ep.getWorldPosition(S);
    var a=c.clone().sub(S).normalize();
    var e0=po.clone().addScaledVector(a,-po.dot(a)).normalize(),d=pt.clone().sub(S);
    var e1=d.addScaledVector(a,-d.dot(a)).normalize();
    return Math.atan2(a.dot(e0.clone().cross(e1)),e0.dot(e1));
  },
  chargeModele:chargeModele,
  voir:function(x,mod,sansEffets,foe){propre=!!sansEffets;if(foe){image(cEnnemi,foe);activeCible(/goku_db\.webp/.test(foe));}activeModele(mod);taille();racine.style.display='block';function dessine(){majFx(x);rendu();}dessine();requestAnimationFrame(function(){dessine();requestAnimationFrame(dessine);});},
  ferme:function(){racine.style.display='none';},
  etatSon:function(){var p=pic;pic=0;return {etat:ctx&&ctx.state,k:!!bufK,e:!!bufE,pic:+p.toFixed(3)};},
  play:function(o){
    reveille();
    return new Promise(function(ok){
      propre=false;miroir(o.miroir);decor(o.terrain);image(cHero,o.hero,o.nomHero);image(cEnnemi,o.foe,o.nomFoe);
      window.__degTxt=o.degats;__degDraw(degTex);
      /* Si les sons ne sont pas encore prêts, on les attend un court instant */
      Promise.race([Promise.all([sfxPret,o.modele?chargeModele():null]),new Promise(function(r){setTimeout(r,o.modele?6000:1500);})]).then(function(){
        activeModele(o.modele);activeCible(o.modele&&/goku_db\.webp/.test(o.foe));
        sons();
        if(typeof Music!=='undefined'&&Music.duck)Music.duck(T.fin+.5);
        taille();racine.style.display='block';
        var t=0,last=performance.now(),fini=false;
        function fin(){
          if(fini)return;fini=true;clearTimeout(garde);racine.onclick=null;
          racine.style.display='none';cri.textContent='';criActuel='';flash.style.opacity=0;traits.style.opacity=0;canvas.style.filter='';miroir(false);ok();
        }
        function image1(now){
          if(fini)return;t=Math.max(0,(now-last)/1000);
          majFx(t);rendu();
          if(t>=T.fin){fin();return;}
          requestAnimationFrame(image1);
        }
        /* Filet de sécurité si l'onglet passe en arrière-plan ; toucher l'écran passe l'animation */
        var garde=setTimeout(fin,(T.fin+3)*1000);
        racine.onclick=function(){coupeSons();fin();};
        majFx(0);rendu();requestAnimationFrame(image1);
      });
    });
  }
};

})();
