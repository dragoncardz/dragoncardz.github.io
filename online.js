/* =====================================================================
   DRAGON CARD Z — MODE ONLINE (comptes, sauvegarde cloud, Arène, classement, amis)
   Serveur : Supabase (voir supabase/schema.sql et supabase/LISEZMOI.txt).
   ===================================================================== */

/* Configuration : remplis ces deux valeurs avec celles de ton projet Supabase
   (Project Settings > API : « Project URL » et la clé « anon public » / « publishable »).
   La clé publique est faite pour être visible : la sécurité vient des règles du schéma. */
var SUPA_URL='https://tugraajxznhtyqwzkosb.supabase.co';
var SUPA_KEY='sb_publishable_iEhjmAoVo3xE-qJUM81mKw_4EANtdiE';

var Online=(function(){
  var SESS_KEY='dczo_session',SYNC_KEY='dczo_sync',OWNER_KEY='dczo_owner';
  var sess=null,me=null,rank=null,tab='account',lbTab='all',pushTimer=null,dirty=false,lastSync=null,busyNet=false,opps=null,friendsData=null,friendsLoading=false,searchRes=null,msg='';

  function configured(){return !!(SUPA_URL&&SUPA_KEY);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}
  function season(){var d=new Date();return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');}

  /* ---------- Appels réseau ---------- */
  async function req(path,opt){
    opt=opt||{};
    if(opt.auth!==false)await ensureFresh();
    /* La clé publique va dans « apikey » ; « Authorization » ne porte que le jeton d'un joueur connecté */
    var h={'apikey':SUPA_KEY,'Content-Type':'application/json'};
    if(sess&&opt.auth!==false)h.Authorization='Bearer '+sess.access_token;
    if(opt.prefer)h.Prefer=opt.prefer;
    var r;
    try{r=await fetch(SUPA_URL+path,{method:opt.method||'GET',headers:h,body:opt.body!=null?JSON.stringify(opt.body):undefined,keepalive:!!opt.keepalive});}
    catch(e){throw new Error(frErr(String(e&&e.message||e)));}
    var txt=await r.text(),data=null;try{data=txt?JSON.parse(txt):null;}catch(e){data=txt;}
    if(!r.ok){var m=(data&&(data.msg||data.message||data.error_description||data.error))||('Erreur '+r.status);throw new Error(frErr(m,data&&data.error_code));}
    return data;
  }
  function frErr(m,code){
    var C={invalid_credentials:'Email ou mot de passe incorrect.',user_already_exists:'Un compte existe déjà avec cet email.',email_exists:'Un compte existe déjà avec cet email.',
      email_not_confirmed:'Confirme d’abord ton email (regarde ta boîte de réception et les spams).',weak_password:'Mot de passe trop faible : 8 caractères minimum.',
      email_address_invalid:'Adresse email invalide.',validation_failed:'Écris ton email et ton mot de passe.',over_email_send_rate_limit:'Trop d’emails envoyés pour le moment : réessaie dans une heure.',
      over_request_rate_limit:'Trop de tentatives : patiente quelques minutes.',signup_disabled:'Les inscriptions sont fermées pour le moment.'};
    m=String(m||'').replace(/\.$/,'');
    if(/invalid format|validate email/i.test(m))return C.email_address_invalid;
    if(code&&C[code])return C[code];
    var T={'Invalid login credentials':C.invalid_credentials,'User already registered':C.user_already_exists,'Email not confirmed':C.email_not_confirmed,
      'missing email or phone':'Écris ton adresse email.','Unable to validate email address: invalid format':C.email_address_invalid,'email rate limit exceeded':C.over_email_send_rate_limit};
    if(T[m])return T[m];
    if(/Password should be/i.test(m))return C.weak_password;
    if(/duplicate key.*pseudo/i.test(m)||/profiles_pseudo_unique/.test(m))return 'Ce pseudo est déjà pris.';
    if(/Failed to fetch|NetworkError/i.test(m))return 'Impossible de joindre le serveur. Vérifie ta connexion.';
    return m;
  }

  /* ---------- Session ---------- */
  function saveSess(s){sess=s;lsSet(SESS_KEY,s?JSON.stringify(s):null);}
  function setSessFromToken(d){saveSess({access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Math.floor(Date.now()/1000)+(d.expires_in||3600),user:d.user||(sess&&sess.user)});}
  async function ensureFresh(){
    if(!sess||!sess.refresh_token)return;
    if(sess.expires_at-60>Date.now()/1000)return;
    try{var d=await req('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:sess.refresh_token}});setSessFromToken(d);}
    catch(e){saveSess(null);me=null;throw new Error('Ta session a expiré : reconnecte-toi.');}
  }
  function uid(){return sess&&sess.user&&sess.user.id;}

  async function signUp(email,pass,pseudo){
    if(!/^[A-Za-z0-9_-]{3,16}$/.test(pseudo))throw new Error('Pseudo : 3 à 16 caractères (lettres, chiffres, _ ou -).');
    var taken=await req('/rest/v1/profiles?select=id&pseudo=ilike.'+encodeURIComponent(pseudo),{auth:false});
    if(taken&&taken.length)throw new Error('Ce pseudo est déjà pris.');
    var d=await req('/auth/v1/signup?redirect_to='+encodeURIComponent(location.href.split('#')[0]),{method:'POST',auth:false,body:{email:email,password:pass,data:{pseudo:pseudo}}});
    if(d&&d.access_token){setSessFromToken(d);await afterLogin(true);return 'ok';}
    return 'confirm';
  }
  async function signIn(email,pass){
    var d=await req('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:email,password:pass}});
    setSessFromToken(d);await afterLogin(true);
  }
  async function signOut(){
    if(dirty)await pushSave().catch(function(){});
    try{await req('/auth/v1/logout',{method:'POST'});}catch(e){}
    saveSess(null);me=null;rank=null;opps=null;friendsData=null;lsSet(OWNER_KEY,null);lsSet(SYNC_KEY,null);
  }
  async function resetPassword(email){await req('/auth/v1/recover?redirect_to='+encodeURIComponent(location.href.split('#')[0]),{method:'POST',auth:false,body:{email:email}});}
  async function setPassword(pass){await req('/auth/v1/user',{method:'PUT',body:{password:pass}});}

  /* Retour depuis un lien reçu par email (confirmation de compte ou mot de passe oublié) */
  function readHash(){
    if(!location.hash||location.hash.indexOf('access_token=')<0)return null;
    var p={};location.hash.slice(1).split('&').forEach(function(kv){var i=kv.indexOf('=');p[decodeURIComponent(kv.slice(0,i))]=decodeURIComponent(kv.slice(i+1));});
    history.replaceState(null,'',location.pathname+location.search);
    return p;
  }

  /* ---------- Profil ---------- */
  async function loadMe(){
    var r=await req('/rest/v1/profiles?select=id,pseudo,level&id=eq.'+uid());
    me=r&&r[0]||null;
    if(!me){
      var ps=sess.user&&sess.user.user_metadata&&sess.user.user_metadata.pseudo;
      if(!ps)return null;
      try{r=await req('/rest/v1/profiles',{method:'POST',prefer:'return=representation',body:{id:uid(),pseudo:ps,level:meta.lvl||1}});me=r&&r[0];}
      catch(e){me=null;msg=e.message+' Choisis un autre pseudo.';return null;}
    }
    await loadRank();
    return me;
  }
  async function createProfile(ps){
    if(!/^[A-Za-z0-9_-]{3,16}$/.test(ps))throw new Error('Pseudo : 3 à 16 caractères (lettres, chiffres, _ ou -).');
    var r=await req('/rest/v1/profiles',{method:'POST',prefer:'return=representation',body:{id:uid(),pseudo:ps,level:meta.lvl||1}});
    me=r&&r[0];await loadRank();await pushProfile();
  }
  async function loadRank(){var r=await req('/rest/v1/ranks?select=pts,wins,losses,season,season_pts&user_id=eq.'+uid());rank=r&&r[0]||{pts:1000,wins:0,losses:0,season:season(),season_pts:0};}
  function defenseData(){
    var aw={};myTeam.forEach(function(id){aw[id]=awakeOf(id);});
    return {team:myTeam.slice(0,TEAM_SIZE),aw:aw,deck:myDeck.slice(0,DECK_MAX)};
  }
  function showcaseData(){
    var cards={};Object.keys(col).forEach(function(id){if(CARDS[id]&&col[id]>0)cards[id]=col[id];});
    return {cards:cards,n:Object.keys(cards).length,story:Object.keys(prog.cleared||{}).length,tower:(meta.tower&&meta.tower.best)||0};
  }
  async function pushProfile(){
    if(!me)return;
    await req('/rest/v1/profiles?id=eq.'+uid(),{method:'PATCH',body:{level:meta.lvl||1,defense:defenseData(),showcase:showcaseData()}});
  }

  /* ---------- Sauvegarde cloud ---------- */
  function collectSave(){
    var keys={};
    for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('dcz')===0&&k.indexOf('dczo_')!==0)keys[k]=lsGet(k);}
    return {v:1,keys:keys,sum:{lvl:meta.lvl||1,cards:distinctOwned(),zeni:zeni,story:Object.keys(prog.cleared||{}).length}};
  }
  function applySave(d){
    if(!d||!d.keys)return;
    var old=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('dcz')===0&&k.indexOf('dczo_')!==0)old.push(k);}
    old.forEach(function(k){lsSet(k,null);});
    Object.keys(d.keys).forEach(function(k){if(k.indexOf('dcz')===0&&k.indexOf('dczo_')!==0)lsSet(k,d.keys[k]);});
  }
  async function fetchSave(){var r=await req('/rest/v1/saves?select=data,updated_at&user_id=eq.'+uid());return r&&r[0]||null;}
  async function pushSave(keepalive){
    if(!uid()||!me)return;
    clearTimeout(pushTimer);dirty=false;
    var r=await req('/rest/v1/saves',{method:'POST',prefer:'resolution=merge-duplicates,return=representation',keepalive:keepalive,body:{user_id:uid(),data:collectSave()}});
    lastSync=r&&r[0]?r[0].updated_at:new Date().toISOString();lsSet(SYNC_KEY,lastSync);lsSet(OWNER_KEY,uid());
    pushProfile().catch(function(){});
    refreshUI();
  }
  function markDirty(){
    if(!uid()||!me||lsGet(OWNER_KEY)!==uid())return;
    dirty=true;clearTimeout(pushTimer);pushTimer=setTimeout(function(){pushSave().catch(function(){});},8000);
  }
  function sumTxt(s){return s?('niveau '+s.lvl+', '+s.cards+' cartes différentes, '+s.zeni+' Zénis, '+s.story+' combats d’Histoire'):'';}
  /* À la connexion : décide quelle sauvegarde garder */
  async function syncOnLogin(interactive){
    var cloud=await fetchSave(),owner=lsGet(OWNER_KEY),synced=lsGet(SYNC_KEY);
    if(!cloud){await pushSave();if(interactive)toast('☁ Sauvegarde envoyée','Ta progression est maintenant liée à ton compte');return;}
    if(owner===uid()&&synced&&cloud.updated_at<=synced){await pushSave();return;}
    if(owner===uid()&&!dirty){applySave(cloud.data);lsSet(SYNC_KEY,cloud.updated_at);lsSet(OWNER_KEY,uid());location.reload();return;}
    var loc=collectSave().sum,cs=cloud.data&&cloud.data.sum;
    openModal('<h3 class="mtitle">Quelle sauvegarde garder ?</h3><p style="font-weight:800">Ton compte a déjà une sauvegarde dans le cloud.</p>'+
      '<div class="abl"><b>☁ Cloud</b> ('+new Date(cloud.updated_at).toLocaleString('fr-FR')+')<br>'+esc(sumTxt(cs))+'</div>'+
      '<div class="abl"><b>📱 Cet appareil</b><br>'+esc(sumTxt(loc))+'</div>'+
      '<p class="hint">L’autre sauvegarde sera remplacée.</p>'+
      '<div class="endbtns"><button class="btn big" onclick="Online.keepCloud()">Garder le cloud</button><button class="btn blue big" onclick="Online.keepLocal()">Garder cet appareil</button></div>');
    Online._pending=cloud;
  }
  async function keepCloud(){var c=Online._pending;if(!c)return;applySave(c.data);lsSet(SYNC_KEY,c.updated_at);lsSet(OWNER_KEY,uid());location.reload();}
  async function keepLocal(){closeModal();lsSet(OWNER_KEY,uid());await pushSave();toast('☁ Sauvegarde envoyée','Le cloud contient maintenant la progression de cet appareil');}

  async function afterLogin(interactive){
    await loadMe();
    if(me)await syncOnLogin(interactive);
    refreshUI();
  }

  /* ---------- Arène (PvP asynchrone) ---------- */
  async function findOpponents(){
    var p=rank?rank.pts:1000,res=[];
    for(var span of [150,400,2000]){
      res=await req('/rest/v1/ranks?select=user_id,pts,wins,losses,profiles(pseudo,level,defense)&user_id=neq.'+uid()+'&pts=gte.'+(p-span)+'&pts=lte.'+(p+span)+'&limit=30');
      res=(res||[]).filter(function(r){return r.profiles&&validTeam(r.profiles.defense).length;});
      if(res.length>=5)break;
    }
    res.sort(function(){return Math.random()-.5;});
    opps=res.slice(0,6);
  }
  function validTeam(def){
    var seen={},out=[];((def&&def.team)||[]).forEach(function(id){if(typeof id==='string'&&CARDS[id]&&CARDS[id].t==='p'&&!CARDS[id].en&&!seen[id]&&out.length<TEAM_SIZE){seen[id]=1;out.push(id);}});
    return out;
  }
  function validDeck(def){
    var out=((def&&def.deck)||[]).filter(function(id){return typeof id==='string'&&CARDS[id]&&CARDS[id].t!=='p';}).slice(0,DECK_MAX);
    if(out.length<10){var pool=Object.keys(CARDS).filter(function(id){var c=CARDS[id];return (c.t==='q'||c.t==='o')&&!c.en&&RIDX[c.rar]<=3;});while(out.length<16)out.push(pool[Math.floor(Math.random()*pool.length)]);}
    return out;
  }
  function validAw(def){var aw={};var src=(def&&def.aw)||{};Object.keys(src).forEach(function(id){var n=parseInt(src[id],10);if(CARDS[id]&&n>=0)aw[id]=Math.min(5,n);});return aw;}
  function fight(o,ranked){
    var team=validTeam(o.profiles.defense);if(!team.length){toast('Équipe invalide','Cet adversaire n’a pas d’équipe de défense');return;}
    if(!myTeam.length){toast('Pas d’équipe','Compose ton équipe dans l’écran Deck');return;}
    var L={pvp:true,ranked:!!ranked,id:'pvp',oppId:o.user_id,name:o.profiles.pseudo,boss:team[0],team:team.join(','),deck:validDeck(o.profiles.defense).join(','),aw:validAw(o.profiles.defense),
      quote:ranked?'Combat classé ! Les points de rang sont en jeu.':'Combat amical : aucun point de rang en jeu.'};
    startBattle(-1,L);
  }
  async function endPvp(won,L){
    var gain=won?(L.ranked?80:30):(L.ranked?20:10),xp=won?30:10,res=null,err='';
    if(L.ranked){try{res=await req('/rest/v1/rpc/report_pvp',{method:'POST',body:{p_defender:L.oppId,p_won:!!won}});await loadRank();}catch(e){err=e.message;}}
    setZeni(zeni+gain);var ups=addXP(xp);if(won){track('win');sfxVictory();}else sfxDefeat();
    var hero=alive(P)[0],box=$('battle_end');
    box.innerHTML='<div class="endbox '+(won?'win':'lose')+'"><div class="endrays"></div>'+
      '<div class="endtitle">'+(won?'VICTOIRE !':'DÉFAITE…')+'</div>'+
      '<div class="hero">'+(won&&hero!==undefined?artSVG(P.units[hero].id):bossPortrait(L))+'</div>'+
      '<p>'+(won?'Tu as battu l’équipe de '+esc(L.name)+' !':'L’équipe de '+esc(L.name)+' t’a battu.')+'</p>'+
      (L.ranked?(res?'<div class="xpgain" style="color:'+(res.delta>=0?'#4ade80':'#f87171')+'">'+(res.delta>=0?'+':'')+res.delta+' points de rang · total '+res.pts+'</div>':'<div class="hint">Résultat non enregistré : '+esc(err)+'</div>'):'<div class="hint">Combat amical</div>')+
      '<div class="zgain"><i class="coin"></i>+'+gain+' Zénis</div><div class="xpgain">+'+xp+' XP</div>'+
      ups.map(function(u){return '<div class="lvup">NIVEAU '+u.l+' !</div>';}).join('')+
      '<div class="endbtns"><button class="btn big" onclick="$(\'battle_end\').classList.add(\'hidden\');Online.open(\'arena\')">Arène</button>'+
      '<button class="btn ghost big" onclick="$(\'battle_end\').classList.add(\'hidden\');show(\'screen-menu\')">Menu</button></div></div>';
    box.classList.remove('hidden');if(won)confetti(box);checkAchToasts();renderBattle();
    opps=null;
  }

  /* ---------- Classement ---------- */
  async function loadBoard(){
    if(lbTab==='season')return req('/rest/v1/ranks?select=user_id,pts,season_pts,wins,losses,profiles(pseudo,level)&season=eq.'+season()+'&order=season_pts.desc&limit=50',{auth:false});
    return req('/rest/v1/ranks?select=user_id,pts,season_pts,wins,losses,profiles(pseudo,level)&order=pts.desc&limit=50',{auth:false});
  }

  /* ---------- Amis ---------- */
  async function loadFriends(){
    var rows=await req('/rest/v1/friends?select=user_id,friend_id,status');
    var ids={};(rows||[]).forEach(function(r){ids[r.user_id===uid()?r.friend_id:r.user_id]=1;});
    var list=Object.keys(ids),profs={};
    if(list.length){
      var ps=await req('/rest/v1/profiles?select=id,pseudo,level,defense,ranks(pts,wins,losses)&id=in.('+list.join(',')+')');
      (ps||[]).forEach(function(p){profs[p.id]=p;});
    }
    friendsData={rows:rows||[],profs:profs};
  }
  async function search(term){
    term=(term||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,16);
    if(term.length<2){searchRes=[];return;}
    var r=await req('/rest/v1/profiles?select=id,pseudo,level&pseudo=ilike.*'+term+'*&limit=10');
    searchRes=(r||[]).filter(function(p){return p.id!==uid();});
  }
  async function addFriend(id){await req('/rest/v1/friends',{method:'POST',body:{user_id:uid(),friend_id:id}});}
  async function acceptFriend(id){await req('/rest/v1/friends?user_id=eq.'+id+'&friend_id=eq.'+uid(),{method:'PATCH',body:{status:'accepted'}});}
  async function removeFriend(id){
    await req('/rest/v1/friends?user_id=eq.'+uid()+'&friend_id=eq.'+id,{method:'DELETE'});
    await req('/rest/v1/friends?user_id=eq.'+id+'&friend_id=eq.'+uid(),{method:'DELETE'});
  }
  async function showProfile(id){
    var r=await req('/rest/v1/profiles?select=id,pseudo,level,defense,showcase,ranks(pts,wins,losses)&id=eq.'+id);
    var p=r&&r[0];if(!p)return;
    var rk=Array.isArray(p.ranks)?p.ranks[0]:p.ranks,team=validTeam(p.defense),sc=p.showcase||{},cards=sc.cards||{};
    var owned=Object.keys(cards).filter(function(k){return CARDS[k];}).sort(function(a,b){return RIDX[CARDS[b].rar]-RIDX[CARDS[a].rar];});
    var byR=RKEYS.map(function(k){var n=owned.filter(function(id){return CARDS[id].rar===k;}).length;return n?'<span class="chip"><span class="rgem" style="--rc:'+RAR[k].col+'"></span>'+RAR[k].n+' : '+n+'</span>':'';}).join('');
    openModal('<h3 class="mtitle">'+esc(p.pseudo)+'</h3>'+
      '<div class="kv"><span class="chip">Niveau '+(p.level|0)+'</span>'+(rk?'<span class="chip">🏆 '+rk.pts+' pts</span><span class="chip">'+rk.wins+' V / '+rk.losses+' D</span>':'')+
      '<span class="chip">Histoire : '+(sc.story|0)+'</span><span class="chip">Tour : étage '+(sc.tower|0)+'</span></div>'+
      '<div class="section-title" style="margin-top:12px">Équipe</div><div class="rewards">'+team.map(function(t,i){return cardHTML(t,{noi:true,cls:'popin',i:i});}).join('')+'</div>'+
      '<div class="section-title" style="margin-top:12px">Collection : '+owned.length+' / '+ALLN+' cartes</div><div class="kv">'+byR+'</div>'+
      '<div class="rewards">'+owned.slice(0,10).map(function(t,i){return cardHTML(t,{noi:true,i:i});}).join('')+'</div>'+
      (team.length&&id!==uid()?'<div class="endbtns"><button class="btn big" onclick="closeModal();Online.fightFriend(\''+esc(p.id)+'\')">⚔ Combat amical</button></div>':''));
  }
  async function fightFriend(id){
    var r=await req('/rest/v1/profiles?select=pseudo,defense&id=eq.'+id);
    if(r&&r[0])fight({user_id:id,profiles:r[0]},false);
  }

  /* ---------- Interface ---------- */
  /* Lance une action réseau. L'écran n'est redessiné qu'après : le redessiner avant effacerait les champs du formulaire. */
  function act(fn){
    return async function(){
      if(busyNet)return;busyNet=true;msg='';
      var st=$('o_status');if(st)st.textContent='Connexion au serveur…';
      document.querySelectorAll('#online_box button').forEach(function(b){b.disabled=true;});
      try{await fn.apply(null,arguments);}catch(e){msg=e.message||String(e);}
      busyNet=false;refreshUI();
    };
  }
  function val(id){var e=$(id);return e?e.value.trim():'';}
  function refreshUI(){var sc=$('screen-online');if(sc&&!sc.classList.contains('hidden'))render();updateBadge();}
  function updateBadge(){var b=$('mb_online_sub');if(b)b.textContent=me?('Connecté : '+me.pseudo):'Compte, Arène, amis';}
  function tabsHTML(){
    var T=[['account','👤 Compte'],['arena','⚔ Arène'],['board','🏆 Classement'],['friends','🤝 Amis']];
    return '<div class="tabs">'+T.map(function(t){return '<button class="fchip'+(tab===t[0]?' on':'')+'" onclick="Online.open(\''+t[0]+'\')">'+t[1]+'</button>';}).join('')+'</div>';
  }
  function needLogin(){return '<div class="panel center"><p style="font-weight:800">Connecte-toi pour accéder à cette partie.</p><button class="btn" onclick="Online.open(\'account\')">Se connecter</button></div>';}
  function render(){
    var box=$('online_box');if(!box)return;
    if(!configured()){box.innerHTML='<div class="panel"><p style="font-weight:800">Le mode Online n’est pas encore configuré.</p><p class="hint">Il faut renseigner l’adresse et la clé publique du projet Supabase dans online.js (voir supabase/LISEZMOI.txt).</p></div>';return;}
    var h=tabsHTML()+(msg?'<div class="panel" style="border-color:#f87171;color:#fecaca;font-weight:800">'+esc(msg)+'</div>':'')+'<p class="hint" id="o_status">'+(busyNet?'Connexion au serveur…':'')+'</p>';
    if(tab==='account')h+=accountHTML();
    else if(!me)h+=needLogin();
    else if(tab==='arena')h+=arenaHTML();
    else if(tab==='board')h+='<div id="lb_box"><p class="hint">Chargement…</p></div>';
    else if(tab==='friends')h+=friendsHTML();
    box.innerHTML=h;
    if(tab==='board')renderBoard();
  }
  function accountHTML(){
    if(!sess)return '<div class="panel"><div class="section-title">Connexion</div>'+
      '<div class="ofrm"><input id="o_email" type="email" placeholder="Email" autocomplete="email"><input id="o_pass" type="password" placeholder="Mot de passe" autocomplete="current-password">'+
      '<div class="endbtns"><button class="btn" onclick="Online.doSignIn()">Se connecter</button><button class="linkbtn" onclick="Online.doReset()">Mot de passe oublié ?</button></div></div></div>'+
      '<div class="panel"><div class="section-title">Créer un compte</div>'+
      '<div class="ofrm"><input id="o_pseudo" placeholder="Pseudo (3 à 16 caractères)" maxlength="16" autocomplete="nickname"><input id="o_semail" type="email" placeholder="Email" autocomplete="email"><input id="o_spass" type="password" placeholder="Mot de passe (8 caractères min.)" autocomplete="new-password">'+
      '<div class="endbtns"><button class="btn green" onclick="Online.doSignUp()">Créer mon compte</button></div>'+
      '<p class="hint">Ta progression actuelle sera envoyée sur ton compte, et tu pourras la récupérer sur n’importe quel appareil.</p></div></div>';
    if(!me)return '<div class="panel"><div class="section-title">Choisis ton pseudo</div><div class="ofrm"><input id="o_pseudo2" placeholder="Pseudo (3 à 16 caractères)" maxlength="16"><div class="endbtns"><button class="btn" onclick="Online.doProfile()">Valider</button><button class="btn ghost" onclick="Online.doSignOut()">Se déconnecter</button></div></div></div>';
    var sy=lsGet(SYNC_KEY);
    return '<div class="panel"><div class="section-title">'+esc(me.pseudo)+'</div>'+
      '<div class="kv"><span class="chip">'+esc(sess.user&&sess.user.email)+'</span>'+(rank?'<span class="chip">🏆 '+rank.pts+' pts</span>':'')+'</div>'+
      '<p style="font-weight:800">☁ '+(dirty?'Modifications en attente d’envoi…':(sy?'Sauvegardé le '+new Date(sy).toLocaleString('fr-FR'):'Pas encore sauvegardé'))+'</p>'+
      '<div class="endbtns"><button class="btn" onclick="Online.doPush()">Sauvegarder maintenant</button><button class="btn blue" onclick="Online.doPull()">Récupérer la sauvegarde du cloud</button></div>'+
      '<div class="endbtns"><button class="btn ghost small" onclick="Online.showProfile(\''+uid()+'\')">Voir mon profil</button><button class="btn ghost small" onclick="Online.doChangePass()">Changer de mot de passe</button><button class="btn ghost small" onclick="Online.doSignOut()">Se déconnecter</button></div>'+
      '<p class="hint">Ta sauvegarde est envoyée automatiquement après chaque changement. Ton équipe et ton deck actuels servent d’équipe de défense dans l’Arène.</p></div>';
  }
  function miniTeam(def){return '<span class="oteam">'+validTeam(def).map(function(id){return '<span class="hav" title="'+esc(CARDS[id].n)+'">'+artSVG(id)+'</span>';}).join('')+'</span>';}
  function arenaHTML(){
    var h='<div class="panel"><div class="section-title">Ton rang</div><div class="kv">'+
      '<span class="chip">🏆 '+(rank?rank.pts:1000)+' points</span><span class="chip">'+(rank?rank.wins:0)+' V / '+(rank?rank.losses:0)+' D</span>'+
      '<span class="chip">Saison '+season()+' : '+(rank&&rank.season===season()?rank.season_pts:0)+' pts</span></div>'+
      '<p class="hint">Combats classés contre l’équipe de défense d’autres joueurs, jouée par l’ordinateur. Victoire : +80 Zénis, défaite : +20.</p></div>';
    h+='<div class="panel"><div class="deckhead"><div class="section-title" style="margin:0">Adversaires</div><button class="btn small" onclick="Online.doFind()">'+(opps?'Actualiser':'Chercher des adversaires')+'</button></div>';
    if(opps&&!opps.length)h+='<p class="hint">Aucun adversaire disponible pour l’instant. Invite des amis à créer un compte !</p>';
    (opps||[]).forEach(function(o,i){
      h+='<div class="orow"><div class="oinfo"><b>'+esc(o.profiles.pseudo)+'</b><small>Niveau '+(o.profiles.level|0)+' · 🏆 '+o.pts+' · '+o.wins+' V</small></div>'+miniTeam(o.profiles.defense)+
        '<button class="btn small" onclick="Online.doFight('+i+')">⚔ Combattre</button></div>';
    });
    return h+'</div>';
  }
  async function renderBoard(){
    var bx=$('lb_box');if(!bx)return;
    try{
      var rows=await loadBoard(),key=lbTab==='season'?'season_pts':'pts';
      bx.innerHTML='<div class="panel"><div class="tabs"><button class="fchip'+(lbTab==='all'?' on':'')+'" onclick="Online.setBoard(\'all\')">Général</button><button class="fchip'+(lbTab==='season'?' on':'')+'" onclick="Online.setBoard(\'season\')">Saison '+season()+'</button></div>'+
        (rows&&rows.length?'<table class="otable"><tr><th>#</th><th>Joueur</th><th>Points</th><th>V / D</th></tr>'+rows.map(function(r,i){return '<tr class="'+(r.user_id===uid()?'me':'')+'"><td>'+(i+1)+'</td><td><a href="#" onclick="event.preventDefault();Online.showProfile(\''+esc(r.user_id)+'\')">'+esc(r.profiles&&r.profiles.pseudo)+'</a></td><td>'+r[key]+'</td><td>'+r.wins+' / '+r.losses+'</td></tr>';}).join('')+'</table>':'<p class="hint">Personne n’est encore classé.</p>')+'</div>';
    }catch(e){bx.innerHTML='<div class="panel"><p class="hint">'+esc(e.message)+'</p></div>';}
  }
  function friendsHTML(){
    var h='<div class="panel"><div class="section-title">Ajouter un ami</div><div class="ofrm row"><input id="o_search" placeholder="Pseudo" maxlength="16" onkeydown="if(event.key===\'Enter\')Online.doSearch()"><button class="btn small" onclick="Online.doSearch()">Chercher</button></div>';
    (searchRes||[]).forEach(function(p){h+='<div class="orow"><div class="oinfo"><b>'+esc(p.pseudo)+'</b><small>Niveau '+(p.level|0)+'</small></div><button class="btn small" onclick="Online.doAdd(\''+esc(p.id)+'\')">Ajouter</button></div>';});
    if(searchRes&&!searchRes.length)h+='<p class="hint">Aucun joueur trouvé.</p>';
    h+='</div>';
    if(!friendsData){
      h+='<div class="panel"><p class="hint">Chargement…</p></div>';
      if(!friendsLoading){friendsLoading=true;setTimeout(act(async function(){try{await loadFriends();}catch(e){friendsData={rows:[],profs:{}};throw e;}}),0);}
      return h;
    }
    var inc=[],out=[],acc=[];
    friendsData.rows.forEach(function(r){var other=r.user_id===uid()?r.friend_id:r.user_id,p=friendsData.profs[other];if(!p)return;
      if(r.status==='accepted')acc.push(p);else if(r.friend_id===uid())inc.push(p);else out.push(p);});
    if(inc.length)h+='<div class="panel"><div class="section-title">Demandes reçues</div>'+inc.map(function(p){return '<div class="orow"><div class="oinfo"><b>'+esc(p.pseudo)+'</b></div><button class="btn small green" onclick="Online.doAccept(\''+esc(p.id)+'\')">Accepter</button><button class="btn small ghost" onclick="Online.doRemove(\''+esc(p.id)+'\')">Refuser</button></div>';}).join('')+'</div>';
    h+='<div class="panel"><div class="section-title">Mes amis ('+acc.length+')</div>'+(acc.length?'':'<p class="hint">Cherche le pseudo d’un ami ci-dessus pour l’ajouter.</p>')+
      acc.map(function(p){var rk=Array.isArray(p.ranks)?p.ranks[0]:p.ranks;return '<div class="orow"><div class="oinfo"><b>'+esc(p.pseudo)+'</b><small>Niveau '+(p.level|0)+(rk?' · 🏆 '+rk.pts:'')+'</small></div>'+miniTeam(p.defense)+
        '<button class="btn small" onclick="Online.showProfile(\''+esc(p.id)+'\')">Profil</button><button class="btn small blue" onclick="Online.fightFriend(\''+esc(p.id)+'\')">Défier</button><button class="btn small ghost" onclick="Online.doRemove(\''+esc(p.id)+'\')">✕</button></div>';}).join('')+'</div>';
    if(out.length)h+='<div class="panel"><div class="section-title">Demandes envoyées</div>'+out.map(function(p){return '<div class="orow"><div class="oinfo"><b>'+esc(p.pseudo)+'</b><small>En attente</small></div><button class="btn small ghost" onclick="Online.doRemove(\''+esc(p.id)+'\')">Annuler</button></div>';}).join('')+'</div>';
    return h;
  }

  /* ---------- Démarrage ---------- */
  async function init(){
    updateBadge();
    if(!configured())return;
    try{sess=JSON.parse(lsGet(SESS_KEY)||'null');}catch(e){sess=null;}
    var hp=readHash();
    if(hp&&hp.access_token){
      setSessFromToken({access_token:hp.access_token,refresh_token:hp.refresh_token,expires_in:+hp.expires_in||3600});
      try{var u=await req('/auth/v1/user');sess.user=u;saveSess(sess);}catch(e){}
      if(hp.type==='recovery'){open('account');askNewPassword();return;}
      if(hp.type==='signup'){toast('✅ Email confirmé','Bienvenue dans le mode Online !','gold');}
    }
    if(sess){try{await afterLogin(!!hp);}catch(e){msg=e.message;}}
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&dirty)pushSave(true).catch(function(){});});
  }
  function askNewPassword(){
    openModal('<h3 class="mtitle">Nouveau mot de passe</h3><div class="ofrm"><input id="o_np" type="password" placeholder="Nouveau mot de passe (8 caractères min.)" autocomplete="new-password"></div><div class="endbtns"><button class="btn big" onclick="Online.doSetPass()">Valider</button></div>');
  }
  function open(t){
    if(t)tab=t;msg='';
    if(tab==='friends'){friendsData=null;friendsLoading=false;}
    if($('screen-online').classList.contains('hidden'))show('screen-online');else render();
  }

  return {
    init:init,open:open,render:render,markDirty:markDirty,isPvp:function(L){return !!(L&&L.pvp);},endPvp:endPvp,showProfile:act(showProfile),fightFriend:act(fightFriend),
    keepCloud:keepCloud,keepLocal:act(keepLocal),setBoard:function(t){lbTab=t;render();},
    doSignIn:act(async function(){await signIn(val('o_email'),$('o_pass').value);}),
    doSignUp:act(async function(){var p=$('o_spass').value;if(p.length<8)throw new Error('Le mot de passe doit faire au moins 8 caractères.');var r=await signUp(val('o_semail'),p,val('o_pseudo'));if(r==='confirm')openModal('<h3 class="mtitle">Vérifie tes emails</h3><p style="font-weight:800">Un lien de confirmation vient d’être envoyé à '+esc(val('o_semail'))+'. Clique dessus pour activer ton compte : tu reviendras ici connecté.</p>');}),
    doReset:act(async function(){var e=val('o_email');if(!e)throw new Error('Écris ton email dans le champ ci-dessus.');await resetPassword(e);openModal('<h3 class="mtitle">Email envoyé</h3><p style="font-weight:800">Si un compte existe pour '+esc(e)+', tu vas recevoir un lien pour choisir un nouveau mot de passe.</p>');}),
    doSetPass:act(async function(){var p=$('o_np').value;if(p.length<8)throw new Error('Le mot de passe doit faire au moins 8 caractères.');await setPassword(p);closeModal();toast('🔒 Mot de passe changé','');await afterLogin(true);}),
    doChangePass:function(){askNewPassword();},
    doProfile:act(async function(){await createProfile(val('o_pseudo2'));await syncOnLogin(true);}),
    doSignOut:act(async function(){await signOut();toast('Déconnecté','Ta progression reste sur cet appareil');}),
    doPush:act(async function(){await pushSave();toast('☁ Sauvegardé','');}),
    doPull:act(async function(){var c=await fetchSave();if(!c)throw new Error('Aucune sauvegarde dans le cloud pour ce compte.');Online._pending=c;
      openModal('<h3 class="mtitle">Récupérer le cloud ?</h3><div class="abl"><b>☁ Cloud</b> ('+new Date(c.updated_at).toLocaleString('fr-FR')+')<br>'+esc(sumTxt(c.data&&c.data.sum))+'</div><p class="hint">La progression de cet appareil sera remplacée.</p><div class="endbtns"><button class="btn big" onclick="Online.keepCloud()">Récupérer</button><button class="btn ghost big" onclick="closeModal()">Annuler</button></div>');}),
    doFind:act(async function(){await loadRank();await findOpponents();}),
    doFight:function(i){if(opps&&opps[i])fight(opps[i],true);},
    doSearch:act(async function(){await search(val('o_search'));}),
    doAdd:act(async function(id){await addFriend(id);friendsData=null;friendsLoading=false;searchRes=null;toast('Demande envoyée','');}),
    doAccept:act(async function(id){await acceptFriend(id);friendsData=null;friendsLoading=false;}),
    doRemove:act(async function(id){await removeFriend(id);friendsData=null;friendsLoading=false;}),
    _pending:null
  };
})();

/* Toute écriture de sauvegarde locale programme un envoi vers le cloud */
(function(){var base=saveLS;saveLS=function(k,v){base(k,v);if(String(k).indexOf('dczo_')!==0)Online.markDirty();};})();
Online.init();
