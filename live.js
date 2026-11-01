/* =====================================================================
   DRAGON CARD Z — PvP EN DIRECT
   Supabase Realtime (Broadcast + Presence) via WebSocket, sans bibliothèque.
   Principe : les deux joueurs font tourner le même combat avec la même graine de hasard ;
   chaque action est envoyée à l'adversaire, qui la rejoue à l'identique.
   ===================================================================== */

/* ---------- Client Realtime minimal (protocole Phoenix) ---------- */
var RT=(function(){
  var ws=null,ref=0,open=false,hb=null,chans={},retry=null;
  function url(){return SUPA_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SUPA_KEY)+'&vsn=1.0.0';}
  function raw(o){o.ref=String(++ref);if(open&&ws&&ws.readyState===1)ws.send(JSON.stringify(o));return o.ref;}
  function connect(){
    if(ws&&(ws.readyState===0||ws.readyState===1))return;
    ws=new WebSocket(url());
    ws.onopen=function(){
      open=true;clearInterval(hb);
      hb=setInterval(function(){raw({topic:'phoenix',event:'heartbeat',payload:{}});},25000);
      Object.keys(chans).forEach(function(k){joinRaw(chans[k]);});
    };
    ws.onmessage=function(e){
      var m;try{m=JSON.parse(e.data);}catch(x){return;}
      var c=chans[m.topic];if(!c)return;
      if(m.event==='broadcast'&&m.payload)c.on(m.payload.event,m.payload.payload||{});
      else if(m.event==='presence_state'){c.pres={};addP(c,m.payload);if(c.onPres)c.onPres();}
      else if(m.event==='presence_diff'){remP(c,m.payload&&m.payload.leaves);addP(c,m.payload&&m.payload.joins);if(c.onPres)c.onPres();}
      else if(m.event==='phx_reply'&&m.ref===c.joinRef){
        c.joined=!!(m.payload&&m.payload.status==='ok');
        if(c.joined){if(c.state)track(c);if(c.onJoin)c.onJoin();}
      }
      else if(m.event==='phx_error'||m.event==='phx_close')c.joined=false;
    };
    ws.onclose=function(){
      open=false;clearInterval(hb);
      Object.keys(chans).forEach(function(k){chans[k].joined=false;});
      if(Object.keys(chans).length){clearTimeout(retry);retry=setTimeout(connect,2000);}
    };
  }
  function addP(c,o){Object.keys(o||{}).forEach(function(k){var ms=o[k].metas||[];if(ms.length)c.pres[k]=ms[ms.length-1];});}
  function remP(c,o){Object.keys(o||{}).forEach(function(k){delete c.pres[k];});}
  function joinRaw(c){c.joinRef=raw({topic:c.topic,event:'phx_join',payload:{config:{broadcast:{self:false,ack:false},presence:{key:c.key||''},private:false}}});}
  function track(c){raw({topic:c.topic,event:'presence',payload:{type:'presence',event:'track',payload:c.state}});}
  function channel(name,opt){
    var c={topic:'realtime:'+name,key:opt.key,on:opt.on||function(){},onPres:opt.onPres,onJoin:opt.onJoin,pres:{},joined:false,state:null};
    chans[c.topic]=c;connect();if(open)joinRaw(c);
    c.send=function(ev,p){if(!c.joined)return false;raw({topic:c.topic,event:'broadcast',payload:{type:'broadcast',event:ev,payload:p}});return true;};
    c.track=function(st){c.state=st;if(c.joined)track(c);};
    c.leave=function(){
      raw({topic:c.topic,event:'phx_leave',payload:{}});delete chans[c.topic];
      if(!Object.keys(chans).length){clearTimeout(retry);try{ws.close();}catch(e){}ws=null;}
    };
    return c;
  }
  return {channel:channel};
})();

/* ---------- Salon, défis et combat en direct ---------- */
var Live=(function(){
  var TURN_S=90,LOST_MS=45000;
  var lobby=null,me=null,inQueue=false,qTime=0,pendingOut=null,incoming=null,match=null,room=null;
  var chain=Promise.resolve(),mine=false,turnLeft=0,turnTimer=null,qTimer=null,helloTimer=null,pingTimer=null,watchTimer=null;

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function rid(){var a='';for(var i=0;i<12;i++)a+='abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*32)];return a;}
  function inBattle(){return P&&!gameOver&&!$('screen-battle').classList.contains('hidden');}

  /* Équipe et deck envoyés à l'adversaire : nettoyés de la même façon des deux côtés */
  function clean(d){
    var seen={},team=[],deck=[],aw={};
    ((d&&d.team)||[]).forEach(function(id){if(typeof id==='string'&&CARDS[id]&&CARDS[id].t==='p'&&!CARDS[id].en&&!seen[id]&&team.length<TEAM_SIZE){seen[id]=1;team.push(id);}});
    ((d&&d.deck)||[]).forEach(function(id){if(typeof id==='string'&&CARDS[id]&&CARDS[id].t!=='p'&&deck.length<DECK_MAX)deck.push(id);});
    team.forEach(function(id){var n=parseInt(d.aw&&d.aw[id],10);aw[id]=n>=0?Math.min(5,n):0;});
    return {team:team,deck:deck,aw:aw,pseudo:String((d&&d.pseudo)||'?').slice(0,16),lvl:Math.max(1,parseInt(d&&d.lvl,10)||1)};
  }
  function myData(){
    var aw={};myTeam.forEach(function(id){aw[id]=awakeOf(id);});
    return clean({team:myTeam,deck:myDeck,aw:aw,pseudo:me.pseudo,lvl:me.lvl});
  }
  function readyErr(){
    if(!me)return 'Connecte-toi d’abord.';
    var e=validTeam()||validDeck();
    return e?e+' Corrige ton équipe dans l’écran Deck.':null;
  }

  /* ---------- Salon ---------- */
  function state(){return {uid:me.uid,pseudo:me.pseudo,lvl:me.lvl,q:inQueue,qt:qTime,busy:!!match};}
  function start(ident){
    me=ident||(window.Online&&Online.who());if(!me)return;
    if(lobby){lobby.track(state());return;}
    lobby=RT.channel('dcz-lobby',{key:me.uid,on:onLobby,onPres:function(){rerender();tryMatch();}});
    lobby.track(state());
    if(window.Online&&Online.loadFriendsQuiet)Online.loadFriendsQuiet();
  }
  function stop(){
    if(match)return;
    leaveQueue(true);if(lobby){lobby.leave();lobby=null;}me=null;
  }
  function players(){
    if(!lobby)return [];
    return Object.keys(lobby.pres).map(function(k){return lobby.pres[k];}).filter(function(p){return p&&p.uid&&p.uid!==me.uid;});
  }
  function lsend(ev,p){if(lobby)lobby.send(ev,p);}

  function onLobby(ev,p){
    if(!me||p.to!==me.uid)return;
    if(ev==='inv'){
      var busyNow=match||inBattle()||(pendingOut&&!p.auto)||incoming;
      if(p.auto){if(inQueue&&!pendingOut&&!match)accept(p);else lsend('dec',{to:p.from,from:me.uid,room:p.room,why:'busy'});return;}
      if(busyNow||readyErr()){lsend('dec',{to:p.from,from:me.uid,room:p.room,why:'busy'});return;}
      showInvite(p);
    }
    else if(ev==='acc'){
      if(pendingOut&&p.room===pendingOut.room&&p.from===pendingOut.to){var po=pendingOut;pendingOut=null;openRoom(po.room,po.seed,true,{uid:po.to,pseudo:po.pseudo});}
      else lsend('abort',{to:p.from,from:me.uid,room:p.room});
    }
    else if(ev==='dec'){
      if(pendingOut&&p.room===pendingOut.room){
        var wasAuto=pendingOut.auto,who=pendingOut.pseudo;pendingOut=null;
        if(!wasAuto){closeModal();toast(p.why==='busy'?who+' est occupé':who+' a refusé le défi','');}
        tryMatch();
      }
    }
    else if(ev==='cancel'){if(incoming&&incoming.room===p.room){incoming=null;closeModal();toast('Défi annulé','');}}
    else if(ev==='abort'){if(match&&match.id===p.room&&!match.started)closeMatch('L’adversaire a trouvé un autre combat.',true);}
  }

  /* Défi direct */
  function challenge(uid,auto){
    var err=readyErr();if(err){toast('Impossible de lancer un défi',err);return;}
    if(match||pendingOut)return;
    var pl=players().filter(function(p){return p.uid===uid;})[0];
    if(!pl){toast('Joueur hors ligne','');return;}
    pendingOut={to:uid,pseudo:pl.pseudo,room:rid(),seed:Math.floor(Math.random()*4294967295),auto:!!auto,t:Date.now()};
    lsend('inv',{to:uid,from:me.uid,pseudo:me.pseudo,lvl:me.lvl,room:pendingOut.room,seed:pendingOut.seed,auto:!!auto});
    var po=pendingOut;
    if(!auto){
      openModal('<h3 class="mtitle">Défi envoyé</h3><p style="font-weight:800">En attente de la réponse de '+esc(pl.pseudo)+'…</p><div class="endbtns"><button class="btn ghost" onclick="Live.cancelChallenge()">Annuler</button></div>');
      setTimeout(function(){if(pendingOut===po){cancelChallenge();toast('Pas de réponse',pl.pseudo+' n’a pas répondu.');}},30000);
    } else setTimeout(function(){if(pendingOut===po){pendingOut=null;tryMatch();}},6000);
  }
  function cancelChallenge(){if(pendingOut){lsend('cancel',{to:pendingOut.to,from:me.uid,room:pendingOut.room});pendingOut=null;}closeModal();}
  function showInvite(p){
    incoming=p;sfxClick&&sfxClick();
    openModal('<h3 class="mtitle">⚔ Défi en direct !</h3><p style="font-weight:800">'+esc(p.pseudo)+' (niveau '+(p.lvl|0)+') te défie en combat en direct.</p>'+
      '<p class="hint">Ton équipe et ton deck actuels seront utilisés. 90 secondes par tour.</p>'+
      '<div class="endbtns"><button class="btn big" onclick="Live.acceptInvite()">Accepter</button><button class="btn ghost big" onclick="Live.declineInvite()">Refuser</button></div>');
    setTimeout(function(){if(incoming===p)declineInvite();},30000);
  }
  function acceptInvite(){var p=incoming;incoming=null;closeModal();if(p)accept(p);}
  function declineInvite(){var p=incoming;incoming=null;closeModal();if(p)lsend('dec',{to:p.from,from:me.uid,room:p.room,why:'no'});}
  function accept(p){
    lsend('acc',{to:p.from,from:me.uid,room:p.room});
    openRoom(p.room,p.seed,false,{uid:p.from,pseudo:p.pseudo});
  }

  /* Partie rapide : les joueurs en file sont triés par ancienneté et appariés deux par deux */
  function joinQueue(){
    var err=readyErr();if(err){toast('Impossible de chercher un combat',err);return;}
    if(!lobby)start();if(!lobby)return;
    inQueue=true;qTime=Date.now();lobby.track(state());rerender();
    clearInterval(qTimer);qTimer=setInterval(tryMatch,3000);tryMatch();
  }
  function leaveQueue(silent){inQueue=false;clearInterval(qTimer);if(lobby&&me)lobby.track(state());if(!silent)rerender();}
  function tryMatch(){
    if(!inQueue||pendingOut||match||!lobby)return;
    var q=players().filter(function(p){return p.q&&!p.busy;}).concat([state()]);
    q.sort(function(a,b){return (a.qt-b.qt)||(a.uid<b.uid?-1:1);});
    var i=-1;q.forEach(function(p,k){if(p.uid===me.uid)i=k;});
    if(i>=0&&i%2===0&&q[i+1])challenge(q[i+1].uid,true);
  }

  /* ---------- Salle de combat ---------- */
  function openRoom(id,seed,host,op){
    leaveQueue(true);pendingOut=null;closeModal();
    match={id:id,seed:seed>>>0,host:host,op:op,myD:myData(),opD:null,ack:false,started:false,out:[],seqOut:0,seqIn:0,buf:{},last:Date.now(),ended:false};
    if(lobby)lobby.track(state());
    room=RT.channel('dcz-room-'+id,{on:onRoom,onJoin:function(){hello();if(match)room.send('need',{from:match.seqIn+1});}});
    clearInterval(helloTimer);helloTimer=setInterval(hello,1000);
    openModal('<h3 class="mtitle">Connexion…</h3><p style="font-weight:800">Préparation du combat contre '+esc(op.pseudo)+'.</p>');
    var m=match;setTimeout(function(){if(match===m&&!m.started)closeMatch('Impossible de rejoindre l’adversaire.',true);},20000);
  }
  function hello(){if(match&&room)room.send('hello',{d:match.myD,got:!!match.opD});}
  function closeMatch(why,toMenu){
    clearInterval(helloTimer);clearInterval(pingTimer);clearInterval(watchTimer);stopTimer();
    if(room){var r=room;room=null;setTimeout(function(){r.leave();},1500);}
    match=null;mine=false;chain=Promise.resolve();
    if(lobby&&me)lobby.track(state());
    if(why){closeModal();toast('Combat en direct',why);}
    if(toMenu&&$('screen-online').classList.contains('hidden'))rerender();
  }
  function onRoom(ev,p){
    if(!match)return;match.last=Date.now();
    if(ev==='hello'){
      if(!match.opD&&p.d)match.opD=clean(p.d);
      if(p.got)match.ack=true;
      if(match.started){if(!p.got)hello();return;}
      if(match.opD&&match.ack)begin0();else hello();
      return;
    }
    if(ev==='need'){match.out.forEach(function(x){if(x.n>=p.from)room.send('m',x);});return;}
    if(ev==='ping'){if(p.last>match.seqIn)room.send('need',{from:match.seqIn+1});return;}
    if(ev==='m'){
      if(!(p.n>match.seqIn))return;
      match.buf[p.n]=p;
      if(p.n>match.seqIn+1){room.send('need',{from:match.seqIn+1});return;}
      while(match&&match.buf[match.seqIn+1]){var x=match.buf[++match.seqIn];delete match.buf[match.seqIn];handle(x);}
    }
  }
  /* Message numéroté : renvoyé si l'adversaire signale un trou */
  function send(ev,p){
    if(!match||!room)return;
    var x={n:++match.seqOut,ev:ev,p:p};match.out.push(x);room.send('m',x);
  }
  function enqueue(fn){chain=chain.then(fn).catch(function(e){console.error(e);});}
  function handle(x){
    if(x.ev==='mv')enqueue(function(){return remoteMove(x.p.m);});
    else if(x.ev==='end')enqueue(function(){return remoteEnd(x.p.h);});
    else if(x.ev==='ff')enqueue(function(){if(P&&!gameOver&&curL&&curL.live){logMsg(curL.name+' abandonne le combat.');curL.ffWin=true;endGame(true);}});
  }

  function begin0(){
    if(match.started)return;match.started=true;clearInterval(helloTimer);hello();closeModal();
    var od=match.opD,m=match;
    var L={live:true,pvp:true,host:m.host,seed:m.seed,id:'live',name:od.pseudo,boss:od.team[0],team:od.team.join(','),deck:'',aw:od.aw,
      me:m.myD,op:od,quote:'Combat en direct !'};
    pingTimer=setInterval(function(){if(room&&match)room.send('ping',{last:match.seqOut});},8000);
    watchTimer=setInterval(function(){
      if(!match||!P||gameOver||!curL||!curL.live)return;
      if(Date.now()-match.last>LOST_MS){logMsg(curL.name+' s’est déconnecté.');curL.ffWin=true;endGame(true);}
    },5000);
    if(!od.team.length||!m.myD.team.length){closeMatch('Équipe invalide.',true);return;}
    startBattle(-1,L);
  }
  /* Appelé à la fin de startBattle : l'hôte joue en premier */
  function begin(){
    if(match.host)beginPlayerTurn(true);
    else enqueue(function(){return remoteTurn(true);});
  }
  async function remoteTurn(first){
    mine=false;busy=true;renderBattle();
    await banner(first?'COMBAT !':'TOUR DE '+E.name.toUpperCase(),first?'':'red');
    if(gameOver)return;
    await startTurn(E);renderBattle();
  }
  function okIdx(v,max){return typeof v==='number'&&v>=-1&&v<max&&Math.floor(v)===v;}
  async function remoteMove(m){
    if(!P||gameOver||!m)return;
    if(!okIdx(m.t,TEAM_SIZE)||(m.i!=null&&!okIdx(m.i,TEAM_SIZE))||(m.hi!=null&&!okIdx(m.hi,E.hand.length)))return;
    await execMove(E,m);renderBattle();checkEnd();
  }
  async function remoteEnd(h){
    if(!P||gameOver)return;
    if(h&&h!==hash()){console.warn('Désynchronisation',h,hash());logMsg('⚠ Petit décalage détecté avec l’adversaire.');}
    await beginPlayerTurn(false);
  }
  /* Empreinte de l'état du combat, pour repérer un décalage entre les deux écrans */
  function hash(){
    var a=FIRST,b=FIRST===P?E:P,s=[a,b].map(function(x){
      return x.units.map(function(u){return u?[u.id,u.hp,u.atk,u.def,u.gauge].join(':'):'-';}).join('|')+'#'+x.ki+'#'+x.hand.join(',')+'#'+x.deck.length;
    }).join('/'),h=5381;
    for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;
    return String(h>>>0);
  }

  /* ---------- Tour du joueur ---------- */
  function myTurn(){mine=true;turnLeft=TURN_S;stopTimer();tick();turnTimer=setInterval(tick,1000);}
  function stopTimer(){clearInterval(turnTimer);turnTimer=null;}
  function tick(){
    var el=$('ltimer');
    if(el){el.textContent='⏱ '+turnLeft+' s';el.classList.toggle('low',turnLeft<=15);}
    if(turnLeft<=0){if(!busy&&!gameOver){clearSel();endTurn();}return;}
    turnLeft--;
  }
  function endMyTurn(){
    stopTimer();mine=false;
    send('end',{h:hash()});
    enqueue(function(){return remoteTurn(false);});
    renderBattle();
  }
  function forfeit(){
    if(!match||!curL||!curL.live||gameOver)return;
    send('ff',{});endGame(false);$('battle_end').classList.add('hidden');
  }

  /* ---------- Fin du combat ---------- */
  function end(won,L){
    stopTimer();
    // Pas de récompense pour un combat expédié au 1er tour (évite les abandons arrangés)
    var op=match&&match.op,real=P&&FIRST&&FIRST.turn>=2;
    var gain=real?(won?60:15):0,xp=real?(won?30:10):0;
    if(gain)setZeni(zeni+gain);var ups=xp?addXP(xp):[];
    if(won){if(real)track('win');sfxVictory();}else sfxDefeat();
    var hero=alive(P)[0],box=$('battle_end');
    box.innerHTML='<div class="endbox '+(won?'win':'lose')+'"><div class="endrays"></div>'+
      '<div class="endtitle">'+(won?'VICTOIRE !':'DÉFAITE…')+'</div>'+
      '<div class="hero">'+(won&&hero!==undefined?artSVG(P.units[hero].id):bossPortrait(L))+'</div>'+
      '<p>'+(L.ffWin?esc(L.name)+' a quitté le combat.':(won?'Tu as battu '+esc(L.name)+' en direct !':esc(L.name)+' t’a battu en direct.'))+'</p>'+
      (gain?'<div class="zgain"><i class="coin"></i>+'+gain+' Zénis</div><div class="xpgain">+'+xp+' XP</div>':'<div class="hint">Combat trop court : pas de récompense.</div>')+
      ups.map(function(u){return '<div class="lvup">NIVEAU '+u.l+' !</div>';}).join('')+
      '<div class="endbtns">'+(op?'<button class="btn big" onclick="$(\'battle_end\').classList.add(\'hidden\');Online.open(\'live\');Live.challenge(\''+esc(op.uid)+'\')">Revanche</button>':'')+
      '<button class="btn blue big" onclick="$(\'battle_end\').classList.add(\'hidden\');Online.open(\'live\')">Combats en direct</button>'+
      '<button class="btn ghost big" onclick="$(\'battle_end\').classList.add(\'hidden\');show(\'screen-menu\')">Menu</button></div></div>';
    box.classList.remove('hidden');if(won)confetti(box);checkAchToasts();renderBattle();
    closeMatch();
  }

  /* ---------- Onglet « Direct » ---------- */
  function html(){
    if(!me)return '<div class="panel"><p class="hint">Connexion au salon…</p></div>';
    var pl=players(),fr=window.Online&&Online.friendIds?Online.friendIds():{},nq=pl.filter(function(p){return p.q;}).length;
    pl.sort(function(a,b){return (fr[b.uid]?1:0)-(fr[a.uid]?1:0)||String(a.pseudo).localeCompare(String(b.pseudo));});
    var h='<div class="panel"><div class="section-title">⚡ Partie rapide</div>'+
      (inQueue?'<p style="font-weight:800">🔎 Recherche d’un adversaire… '+(nq?'('+nq+' autre'+(nq>1?'s':'')+' en recherche)':'')+'</p><div class="endbtns" style="justify-content:flex-start"><button class="btn ghost" onclick="Live.leaveQueue()">Annuler</button></div>':
        '<p class="hint">Affronte le premier joueur disponible avec ton équipe et ton deck actuels.</p><div class="endbtns" style="justify-content:flex-start"><button class="btn big" onclick="Live.joinQueue()">Trouver un adversaire</button></div>')+'</div>';
    h+='<div class="panel"><div class="section-title">🟢 Joueurs en ligne ('+pl.length+')</div>';
    if(!pl.length)h+='<p class="hint">Personne d’autre n’est connecté pour le moment. Invite un ami à ouvrir le jeu !</p>';
    pl.forEach(function(p){
      var st=p.busy?'En combat':(p.q?'Cherche un combat':'Disponible');
      h+='<div class="orow"><div class="oinfo"><b>'+(fr[p.uid]?'🤝 ':'')+esc(p.pseudo)+'</b><small>Niveau '+(p.lvl|0)+' · '+st+'</small></div>'+
        '<button class="btn small" '+(p.busy||match||pendingOut?'disabled ':'')+'onclick="Live.challenge(\''+esc(p.uid)+'\')">⚔ Défier</button></div>';
    });
    h+='</div><p class="hint">Combats amicaux en direct : 90 secondes par tour. Victoire +60 Zénis, défaite +15. Quitter un combat compte comme un abandon.</p>';
    return h;
  }
  function rerender(){var b=$('live_box');if(b)b.innerHTML=html();}

  // Rejoint le salon dès que le compte est chargé
  setInterval(function(){if(!lobby&&window.Online&&Online.who())start();},4000);

  return {start:start,stop:stop,html:html,challenge:challenge,cancelChallenge:cancelChallenge,acceptInvite:acceptInvite,declineInvite:declineInvite,
    joinQueue:joinQueue,leaveQueue:function(){leaveQueue();},send:send,begin:begin,myTurn:myTurn,endMyTurn:endMyTurn,forfeit:forfeit,end:end,
    mine:function(){return mine;},_hash:hash};
})();
