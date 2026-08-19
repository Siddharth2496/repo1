(() => {
  'use strict';

  const DB_NAME = 'ai-prep-local-v1';
  const DB_VERSION = 1;
  const DEFAULT_SETTINGS = { videoTarget: 120, topicTarget: 4, productiveRule: 'and' };
  const state = {
    db: null,
    topics: [], videos: [], sessions: [], settings: { ...DEFAULT_SETTINGS },
    view: 'home', logType: 'video', progressTab: 'chapters',
    videoPurpose: 'learning', bookPurpose: 'learning',
    selectedVideoIds: new Set(), manualVideoMinutes: {}, selectedTopicIds: new Set(),
    adminTapCount: 0, adminTapTimer: null, adminUnlocked: false,
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => {
    const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };
  const addDaysISO = (iso, delta) => {
    const [y,m,d] = iso.split('-').map(Number); const x = new Date(y,m-1,d); x.setDate(x.getDate()+delta);
    return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
  };
  const prettyDate = iso => {
    if (!iso) return '';
    const [y,m,d]=iso.split('-').map(Number); return new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short'}).format(new Date(y,m-1,d));
  };
  const prettyLongDate = iso => {
    const [y,m,d]=iso.split('-').map(Number); return new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d));
  };
  const fmtMin = min => {
    const n=Math.round(Number(min)||0); if(n<60) return `${n}m`; const h=Math.floor(n/60), m=n%60; return m?`${h}h ${m}m`:`${h}h`;
  };
  const uid = prefix => `${prefix}-${Date.now()}-${(crypto.randomUUID?crypto.randomUUID().slice(0,8):Math.random().toString(36).slice(2,10))}`;
  const tierSymbol = t => t==='primary'?'★':t==='alternate'?'◆':'▲';
  const tierLabel = t => `${tierSymbol(t)} ${t ? t[0].toUpperCase()+t.slice(1) : ''}`;
  const chapterName = ch => state.topics.find(t=>t.chapter===Number(ch))?.chapterName || `Chapter ${ch}`;
  const topicById = id => state.topics.find(t=>t.id===id);
  const videoById = id => state.videos.find(v=>v.id===id);

  // ---------------- IndexedDB ----------------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('topics')) db.createObjectStore('topics',{keyPath:'id'});
        if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos',{keyPath:'id'});
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions',{keyPath:'id'});
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings',{keyPath:'key'});
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
      };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  function tx(store, mode='readonly') { return state.db.transaction(store,mode).objectStore(store); }
  function idbGetAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  function idbGet(store,key){return new Promise((res,rej)=>{const r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  function idbPut(store,obj){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(obj);r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error);});}
  function idbDelete(store,key){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
  function idbClear(store){return new Promise((res,rej)=>{const r=tx(store,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
  async function idbBulkPut(store, items){
    if(!items.length) return;
    await new Promise((resolve,reject)=>{const tr=state.db.transaction(store,'readwrite');const os=tr.objectStore(store);items.forEach(x=>os.put(x));tr.oncomplete=resolve;tr.onerror=()=>reject(tr.error);});
  }

  async function seedIfNeeded(){
    const seed = window.AI_PREP_SEED;
    if(!seed) throw new Error('Seed data missing');
    const meta=await idbGet('meta','seedVersion');
    if(!meta){
      await idbBulkPut('topics',seed.topics);
      await idbBulkPut('videos',seed.videos);
      await idbPut('settings',{key:'app',...DEFAULT_SETTINGS});
      await idbPut('meta',{key:'seedVersion',value:seed.version});
    } else if((meta.value||0)<seed.version){
      const existingVideos = new Map((await idbGetAll('videos')).map(v=>[v.id,v]));
      const existingTopics = new Map((await idbGetAll('topics')).map(v=>[v.id,v]));
      const topicAdds=seed.topics.filter(t=>!existingTopics.has(t.id));
      const videoUpdates=seed.videos.filter(v=>!existingVideos.has(v.id) || !existingVideos.get(v.id).userModified);
      await idbBulkPut('topics',topicAdds); await idbBulkPut('videos',videoUpdates);
      await idbPut('meta',{key:'seedVersion',value:seed.version});
    }
  }
  async function refreshState(){
    [state.topics,state.videos,state.sessions]=await Promise.all([idbGetAll('topics'),idbGetAll('videos'),idbGetAll('sessions')]);
    const s=await idbGet('settings','app'); state.settings=s?{videoTarget:Number(s.videoTarget)||0,topicTarget:Number(s.topicTarget)||0,productiveRule:s.productiveRule||'and'}:{...DEFAULT_SETTINGS};
    state.topics.sort((a,b)=>a.chapter-b.chapter || Number(a.id.split('.')[1])-Number(b.id.split('.')[1]));
    state.videos.sort((a,b)=>{
      const ta={primary:0,alternate:1,deeper:2}[a.tier]??9, tb={primary:0,alternate:1,deeper:2}[b.tier]??9;
      return ta-tb || (a.chapters?.[0]||99)-(b.chapters?.[0]||99) || String(a.playlist).localeCompare(String(b.playlist)) || Number(a.order||999)-Number(b.order||999);
    });
  }

  // ---------------- Analytics ----------------
  function completedVideoSet(){return new Set(state.sessions.filter(s=>s.entityType==='video'&&s.completed).map(s=>s.entityId));}
  function seenVideoSet(){return new Set(state.sessions.filter(s=>s.entityType==='video').map(s=>s.entityId));}
  function firstLearnDates(){
    const map=new Map();
    state.sessions.filter(s=>s.entityType==='book'&&s.purpose==='learning').sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt).forEach(s=>{
      (s.topicIds||[]).forEach(id=>{if(!map.has(id))map.set(id,s.date);});
    });
    return map;
  }
  function learnedTopicSet(){return new Set(firstLearnDates().keys());}
  function dailyStatsMap(){
    const first=firstLearnDates(); const map=new Map();
    const ensure=date=>{if(!map.has(date))map.set(date,{date,videoMin:0,bookMin:0,manualMin:0,totalMin:0,newTopics:0,revisions:0,activity:0});return map.get(date);};
    state.sessions.forEach(s=>{
      const d=ensure(s.date); const m=Number(s.minutes)||0; d.totalMin+=m; d.activity++;
      if(s.entityType==='video')d.videoMin+=m; else if(s.entityType==='book')d.bookMin+=m; else d.manualMin+=m;
      if(s.purpose==='revision')d.revisions++;
    });
    first.forEach((date)=>{ensure(date).newTopics++;});
    return map;
  }
  function isProductive(stats){
    if(!stats) return false;
    const v=stats.videoMin>=state.settings.videoTarget, t=stats.newTopics>=state.settings.topicTarget;
    return state.settings.productiveRule==='or' ? (v||t) : (v&&t);
  }
  function streaks(){
    const map=dailyStatsMap(), today=todayISO();
    let end=today; if(!isProductive(map.get(today))) end=addDaysISO(today,-1);
    let cur=0, d=end; while(isProductive(map.get(d))){cur++;d=addDaysISO(d,-1);}
    const dates=[...map.keys()].sort(); if(!dates.length)return{current:0,best:0,productive:0};
    let best=0, run=0, prev=null, productive=0;
    dates.forEach(date=>{if(!isProductive(map.get(date)))return;productive++; if(prev&&addDaysISO(prev,1)===date)run++;else run=1;best=Math.max(best,run);prev=date;});
    return {current:cur,best,productive};
  }
  function videoStats(){
    const done=completedVideoSet(); const goal=state.videos.filter(v=>v.tier==='primary'&&v.countsTowardGoal);
    return {
      goalTotal:goal.length, goalDone:goal.filter(v=>done.has(v.id)).length,
      primaryDone:state.videos.filter(v=>v.tier==='primary'&&done.has(v.id)).length,
      alternateDone:state.videos.filter(v=>v.tier==='alternate'&&done.has(v.id)).length,
      deeperDone:state.videos.filter(v=>v.tier==='deeper'&&done.has(v.id)).length,
      primaryTotal:state.videos.filter(v=>v.tier==='primary').length,
      alternateTotal:state.videos.filter(v=>v.tier==='alternate').length,
      deeperTotal:state.videos.filter(v=>v.tier==='deeper').length,
    };
  }
  function bookStats(){const learned=learnedTopicSet();const core=state.topics.filter(t=>t.type==='core');return{coreTotal:core.length,coreDone:core.filter(t=>learned.has(t.id)).length};}
  function chapterStats(){
    const learned=learnedTopicSet(), done=completedVideoSet();
    const arr=[];
    for(let ch=1;ch<=29;ch++){
      const coreTopics=state.topics.filter(t=>t.chapter===ch&&t.type==='core'); const learnedCount=coreTopics.filter(t=>learned.has(t.id)).length;
      const pV=state.videos.filter(v=>v.tier==='primary'&&v.countsTowardGoal&&(v.chapters||[]).includes(ch)); const pDone=pV.filter(v=>done.has(v.id)).length;
      const aDone=state.videos.filter(v=>v.tier==='alternate'&&(v.chapters||[]).includes(ch)&&done.has(v.id)).length;
      const dDone=state.videos.filter(v=>v.tier==='deeper'&&(v.chapters||[]).includes(ch)&&done.has(v.id)).length;
      const bp=coreTopics.length?learnedCount/coreTopics.length:0, vp=pV.length?pDone/pV.length:null;
      const pct=vp===null?bp:(bp+vp)/2;
      const min=state.sessions.filter(s=>(s.chapter===ch)||((s.chapters||[]).includes(ch))).reduce((a,s)=>a+(Number(s.minutes)||0),0);
      arr.push({ch,name:chapterName(ch),coreTopics:coreTopics.length,learnedCount,pVideos:pV.length,pDone,aDone,dDone,pct,min});
    } return arr;
  }
  function totalPrepMinutes(){return state.sessions.reduce((a,s)=>a+(Number(s.minutes)||0),0);}
  function overallCore(){const b=bookStats(),v=videoStats();const bp=b.coreTotal?b.coreDone/b.coreTotal:0,vp=v.goalTotal?v.goalDone/v.goalTotal:0;return (bp+vp)/2;}

  // ---------------- Rendering ----------------
  function setView(view){
    state.view=view; $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));
    $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
    $('viewTitle').textContent={home:'Home',log:'Log Progress',progress:'Progress',history:'History'}[view]||'AI Prep';
    window.scrollTo({top:0,behavior:'instant'});
    if(view==='home')renderHome();if(view==='log')renderLog();if(view==='progress')renderProgress();if(view==='history')renderHistory();
  }
  function ringSet(id,value,target){const p=target?Math.min(1,value/target):0;$(id).style.setProperty('--p',`${Math.round(p*360)}deg`);}
  function renderHome(){
    $('dateLabel').textContent=prettyLongDate(todayISO());
    const sm=dailyStatsMap(), td=sm.get(todayISO())||{videoMin:0,newTopics:0,totalMin:0}; const st=streaks(), vs=videoStats(),bs=bookStats();
    $('streakCurrent').textContent=st.current;$('streakBest').textContent=st.best;$('productiveDaysText').textContent=`${st.productive} productive`;
    $('overallCore').textContent=`${Math.round(overallCore()*100)}%`;
    $('todayVideoMin').textContent=Math.round(td.videoMin);$('todayTopics').textContent=td.newTopics;
    $('videoTargetText').textContent=`${Math.round(td.videoMin)} / ${state.settings.videoTarget}`;$('topicTargetText').textContent=`${td.newTopics} / ${state.settings.topicTarget}`;
    ringSet('videoRing',td.videoMin,state.settings.videoTarget);ringSet('topicRing',td.newTopics,state.settings.topicTarget);
    const done=isProductive(td);$('goalCelebration').classList.toggle('hidden',!done);
    const vr=Math.max(0,state.settings.videoTarget-td.videoMin),tr=Math.max(0,state.settings.topicTarget-td.newTopics);
    $('goalStatus').textContent=done?'Both goals complete. Streak maintained ✓':state.settings.productiveRule==='or'?`Need ${vr?fmtMin(vr)+' video':'a topic goal'} to make today productive.`:`${vr?fmtMin(vr)+' video':''}${vr&&tr?' + ':''}${tr?tr+' new topic'+(tr===1?'':'s'):''} left for today.`;
    const pp=vs.goalTotal?Math.round(vs.goalDone/vs.goalTotal*100):0;$('primaryPct').textContent=`${pp}%`;$('primaryBar').style.width=`${pp}%`;$('primaryText').textContent=`${vs.goalDone} / ${vs.goalTotal} core videos`;
    $('alternateDone').textContent=vs.alternateDone;$('deeperDone').textContent=vs.deeperDone;$('totalHours').textContent=`${(totalPrepMinutes()/60).toFixed(totalPrepMinutes()>=600?0:1)}h`;
    renderHeatmap(sm);renderHoursChart(sm);renderChapterRows($('homeChapterProgress'),chapterStats(),true);
  }
  function renderHeatmap(map){
    const cells=[];for(let i=34;i>=0;i--){const date=addDaysISO(todayISO(),-i),s=map.get(date);let lvl='';if(s){if(isProductive(s))lvl='active4';else if(s.totalMin>=90)lvl='active3';else if(s.totalMin>=30)lvl='active2';else if(s.totalMin>0)lvl='active1';}cells.push(`<div class="heat-cell ${lvl}" title="${prettyDate(date)} · ${s?fmtMin(s.totalMin):'0m'}"></div>`);} $('heatmap').innerHTML=cells.join('');
  }
  function renderHoursChart(map){
    const pts=[];let cum=0;for(let i=34;i>=0;i--){const date=addDaysISO(todayISO(),-i);cum+=(map.get(date)?.totalMin||0)/60;pts.push(cum);}const w=640,h=160,padY=14,max=Math.max(1,...pts);const coords=pts.map((v,i)=>[i/(pts.length-1)*w,h-padY-(v/max)*(h-padY*2)]);const path=coords.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');const area=`M0,${h} ${path.replace(/^M/,'L')} L${w},${h} Z`;$('hoursChart').innerHTML=`<line class="gridline" x1="0" y1="${h*.33}" x2="${w}" y2="${h*.33}"/><line class="gridline" x1="0" y1="${h*.66}" x2="${w}" y2="${h*.66}"/><path class="area" d="${area}"/><path class="line" d="${path}"/><circle class="dot" cx="${coords.at(-1)[0]}" cy="${coords.at(-1)[1]}" r="5"/>`;
  }
  function renderChapterRows(root,rows,compact=false){root.classList.toggle('compact',compact);root.innerHTML=rows.map(r=>`<div class="chapter-row"><div class="chapter-row-top"><div><div class="chapter-num">Chapter ${r.ch}</div><div class="chapter-title">${esc(r.name)}</div></div><div class="chapter-pct">${Math.round(r.pct*100)}%</div></div><div class="progress-track"><div class="progress-fill" style="width:${Math.round(r.pct*100)}%"></div></div><div class="chapter-meta"><span>Book ${r.learnedCount}/${r.coreTopics}</span><span>★ ${r.pDone}/${r.pVideos}</span><span>◆ ${r.aDone}</span><span>▲ ${r.dDone}</span><span>${fmtMin(r.min)}</span></div></div>`).join('');}

  function populateChapterSelects(){
    const opts=Array.from({length:29},(_,i)=>`<option value="${i+1}">${i+1} — ${esc(chapterName(i+1))}</option>`).join('');
    ['videoChapterFilter'].forEach(id=>$(id).innerHTML='<option value="all">All chapters</option>'+opts);
    ['bookChapterSelect','topicProgressChapter','resChapter','playlistChapter'].forEach(id=>$(id).innerHTML=opts);
    $('manualChapter').innerHTML='<option value="">No chapter</option>'+opts;
  }
  function setLogType(type){state.logType=type;$$('#logTypeTabs button').forEach(b=>b.classList.toggle('active',b.dataset.logtype===type));$$('.log-mode').forEach(m=>m.classList.toggle('active',m.id===`log-${type}`));renderLog();}
  function setPurpose(group,purpose){state[group==='video'?'videoPurpose':'bookPurpose']=purpose;$$(`#${group}PurposeTabs button`).forEach(b=>b.classList.toggle('active',b.dataset.purpose===purpose));}
  function renderLog(){if(!$('logDate').value)$('logDate').value=todayISO();if(state.logType==='video')renderVideoList();if(state.logType==='book')renderBookTopics();updateVideoSelection();updateBookSelection();}
  function renderVideoList(){
    const q=$('videoSearch').value.trim().toLowerCase(),tier=$('videoTierFilter').value,ch=$('videoChapterFilter').value;const done=completedVideoSet(),seen=seenVideoSet();
    let rows=state.videos.filter(v=>(tier==='all'||v.tier===tier)&&(ch==='all'||(v.chapters||[]).includes(Number(ch)))&&(!q||`${v.title} ${v.playlist} ${v.creator||''}`.toLowerCase().includes(q)));
    rows=rows.slice(0,180);
    $('videoList').innerHTML=rows.length?rows.map(v=>{const checked=state.selectedVideoIds.has(v.id),d=v.durationMin?fmtMin(v.durationMin):'set min';return `<label class="select-item"><input type="checkbox" data-video-id="${esc(v.id)}" ${checked?'checked':''}/><div><div class="select-title">${done.has(v.id)?'<span class="done-mark">✓ </span>':''}${esc(v.title)}</div><div class="select-meta"><span class="tier-badge tier-${v.tier}">${tierLabel(v.tier)}</span>${esc(v.playlist)}${v.chapters?.length?' · Ch '+v.chapters.join(', '):''}${seen.has(v.id)?' · studied before':''}</div></div><div>${v.durationMin?`<span class="select-duration">${d}</span>`:`<input class="manual-time" type="number" min="1" inputmode="numeric" placeholder="min" data-video-min="${esc(v.id)}" value="${state.manualVideoMinutes[v.id]||''}"/>`}</div></label>`;}).join(''):'<div class="helper">No matching videos. You can add one below.</div>';
    $$('[data-video-id]',$('videoList')).forEach(cb=>cb.addEventListener('change',()=>{cb.checked?state.selectedVideoIds.add(cb.dataset.videoId):state.selectedVideoIds.delete(cb.dataset.videoId);suggestVideoPurpose();updateVideoSelection();}));
    $$('[data-video-min]',$('videoList')).forEach(inp=>{inp.addEventListener('click',e=>e.preventDefault());inp.addEventListener('input',()=>{state.manualVideoMinutes[inp.dataset.videoMin]=Number(inp.value||0);updateVideoSelection();});});
  }
  function suggestVideoPurpose(){if(!state.selectedVideoIds.size)return;const seen=seenVideoSet(),allSeen=[...state.selectedVideoIds].every(id=>seen.has(id));setPurpose('video',allSeen?'revision':'learning');$('videoPurposeHint').textContent=allSeen?'You have studied all selected videos before.':'At least one selected video is new to you.';}
  function updateVideoSelection(){let min=0;[...state.selectedVideoIds].forEach(id=>{const v=videoById(id);min+=Number(v?.durationMin||state.manualVideoMinutes[id]||0);});$('videoSelectionSummary').textContent=state.selectedVideoIds.size?`${state.selectedVideoIds.size} selected · ${fmtMin(min)}${[...state.selectedVideoIds].some(id=>!videoById(id)?.durationMin&&!state.manualVideoMinutes[id])?' · add missing minutes':''}`:'Select what you watched.';}
  function renderBookTopics(){
    const ch=Number($('bookChapterSelect').value||1),learned=learnedTopicSet();const rows=state.topics.filter(t=>t.chapter===ch&&t.type==='core');$('bookTopicList').innerHTML=rows.map(t=>`<label class="select-item"><input type="checkbox" data-topic-id="${esc(t.id)}" ${state.selectedTopicIds.has(t.id)?'checked':''}/><div><div class="select-title">${learned.has(t.id)?'<span class="done-mark">✓ </span>':''}${esc(t.id)} — ${esc(t.title)}</div><div class="select-meta">${learned.has(t.id)?'Studied before':'New topic'}</div></div><div></div></label>`).join('');$$('[data-topic-id]',$('bookTopicList')).forEach(cb=>cb.addEventListener('change',()=>{cb.checked?state.selectedTopicIds.add(cb.dataset.topicId):state.selectedTopicIds.delete(cb.dataset.topicId);suggestBookPurpose();updateBookSelection();}));
  }
  function suggestBookPurpose(){if(!state.selectedTopicIds.size)return;const learned=learnedTopicSet(),allLearned=[...state.selectedTopicIds].every(id=>learned.has(id));setPurpose('book',allLearned?'revision':'learning');$('bookPurposeHint').textContent=allLearned?'All selected topics were studied before.':'New topics detected, so Learning is suggested.';}
  function updateBookSelection(){const min=Number($('bookMinutes').value||0);$('bookSelectionSummary').textContent=state.selectedTopicIds.size?`${state.selectedTopicIds.size} topic${state.selectedTopicIds.size===1?'':'s'}${min?' · '+fmtMin(min):''} · ${state.bookPurpose==='learning'?'Learning':'Revision'}`:'Select the topics you covered.';}

  async function saveLog(){
    const date=$('logDate').value||todayISO();
    if(state.logType==='video'){
      if(!state.selectedVideoIds.size)return toast('Select at least one video.');
      const created=[];for(const id of state.selectedVideoIds){const v=videoById(id);const min=Number(v?.durationMin||state.manualVideoMinutes[id]||0);if(!min)return toast(`Enter minutes for ${v?.title||'the selected video'}.`);created.push({id:uid('S'),date,createdAt:Date.now(),entityType:'video',entityId:id,title:v.title,playlist:v.playlist,tier:v.tier,purpose:state.videoPurpose,minutes:min,completed:true,chapter:v.chapters?.[0]||null,chapters:v.chapters||[],topicIds:v.topicId?[v.topicId]:[]});}
      await idbBulkPut('sessions',created);state.selectedVideoIds.clear();state.manualVideoMinutes={};
    } else if(state.logType==='book'){
      if(!state.selectedTopicIds.size)return toast('Select at least one book topic.');const min=Number($('bookMinutes').value||0);if(!min)return toast('Enter the total study time.');const ids=[...state.selectedTopicIds],ch=Number($('bookChapterSelect').value);await idbPut('sessions',{id:uid('S'),date,createdAt:Date.now(),entityType:'book',entityId:null,title:`${ids.length} book topic${ids.length===1?'':'s'}`,playlist:'AI Interview Book',tier:null,purpose:state.bookPurpose,minutes:min,completed:true,chapter:ch,chapters:[ch],topicIds:ids,topicMinutes:min/ids.length});state.selectedTopicIds.clear();$('bookMinutes').value='';
    } else {
      const min=Number($('manualMinutes').value||0);if(!min)return toast('Enter the minutes.');const ch=$('manualChapter').value?Number($('manualChapter').value):null;await idbPut('sessions',{id:uid('S'),date,createdAt:Date.now(),entityType:'manual',entityId:null,title:$('manualKind').value,playlist:'Other prep',tier:null,purpose:$('manualPurpose').value,minutes:min,completed:true,chapter:ch,chapters:ch?[ch]:[],topicIds:[],note:$('manualNote').value.trim()});$('manualMinutes').value='';$('manualNote').value='';
    }
    await refreshState();toast('Progress saved ✓');setView('home');
  }

  function setProgressTab(tab){state.progressTab=tab;$$('#progressTabs button').forEach(b=>b.classList.toggle('active',b.dataset.progresstab===tab));$$('.progress-mode').forEach(m=>m.classList.toggle('active',m.id===`progress-${tab}`));renderProgress();}
  function renderProgress(){renderChapterRows($('chapterProgressList'),chapterStats());renderTierProgress();renderVideoProgress();renderTopicProgress();}
  function renderTierProgress(){const v=videoStats();$('tierProgressCards').innerHTML=[['primary','★ Primary',v.primaryDone,v.primaryTotal],['alternate','◆ Alternate',v.alternateDone,v.alternateTotal],['deeper','▲ Deeper',v.deeperDone,v.deeperTotal]].map(([t,l,d,n])=>`<div class="tier-stat"><span class="tier-badge tier-${t}">${l}</span><strong>${d}/${n}</strong><div class="progress-track"><div class="progress-fill" style="width:${n?Math.round(d/n*100):0}%"></div></div><small>${n?Math.round(d/n*100):0}% complete</small></div>`).join('');const pls=[...new Set(state.videos.map(v=>v.playlist))].sort();$('progressPlaylistFilter').innerHTML='<option value="all">All playlists</option>'+pls.map(x=>`<option>${esc(x)}</option>`).join('');}
  function renderVideoProgress(){const f=$('progressPlaylistFilter').value,done=completedVideoSet();const rows=state.videos.filter(v=>f==='all'||v.playlist===f);$('videoProgressList').innerHTML=rows.slice(0,250).map(v=>`<div class="progress-video-row"><div class="row-between"><div><div class="select-title">${esc(v.title)}</div><div class="select-meta"><span class="tier-badge tier-${v.tier}">${tierLabel(v.tier)}</span>${esc(v.playlist)}${v.countsTowardGoal?' · main goal':''}</div></div><div class="${done.has(v.id)?'done-mark':'subtle'}">${done.has(v.id)?'✓ Done':'—'}</div></div></div>`).join('');}
  function renderTopicProgress(){const ch=Number($('topicProgressChapter').value||1),learned=learnedTopicSet();$('topicProgressList').innerHTML=state.topics.filter(t=>t.chapter===ch&&t.type==='core').map(t=>{const sess=state.sessions.filter(s=>s.entityType==='book'&&(s.topicIds||[]).includes(t.id));const rev=sess.filter(s=>s.purpose==='revision').length;const min=sess.reduce((a,s)=>a+(Number(s.topicMinutes)||Number(s.minutes)/(s.topicIds?.length||1)||0),0);const last=sess.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt)[0];return `<div class="topic-progress-row"><div class="row-between"><div><div class="select-title">${learned.has(t.id)?'<span class="done-mark">✓ </span>':''}${esc(t.id)} — ${esc(t.title)}</div><div class="select-meta">${rev} revision${rev===1?'':'s'} · ${fmtMin(min)}${last?' · last '+prettyDate(last.date):''}</div></div><div>${learned.has(t.id)?'<span class="done-mark">Learned</span>':'<span class="subtle">New</span>'}</div></div></div>`;}).join('');}

  function renderHistory(){const filter=$('historyFilter').value;let rows=[...state.sessions].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);if(filter==='learning'||filter==='revision')rows=rows.filter(s=>s.purpose===filter);else if(filter==='video'||filter==='book')rows=rows.filter(s=>s.entityType===filter);const groups=new Map();rows.forEach(s=>{if(!groups.has(s.date))groups.set(s.date,[]);groups.get(s.date).push(s);});$('historyList').innerHTML=groups.size?[...groups].map(([date,items])=>`<div class="history-day"><div class="history-date">${esc(prettyLongDate(date))} · ${fmtMin(items.reduce((a,s)=>a+(Number(s.minutes)||0),0))}</div>${items.map(s=>historyCard(s)).join('')}</div>`).join(''):'<div class="panel"><div class="helper">No history yet. Your first saved study block will appear here.</div></div>';$$('[data-delete-session]',$('historyList')).forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Delete this log entry?'))return;await idbDelete('sessions',b.dataset.deleteSession);await refreshState();renderHistory();toast('Entry deleted');}));}
  function historyCard(s){let title=s.title;if(s.entityType==='book'){const ids=s.topicIds||[];title=ids.length<=2?ids.map(id=>`${id} ${topicById(id)?.title||''}`).join(' + '):`${ids.length} book topics · Chapter ${s.chapter}`;}const sub=[s.entityType==='video'?tierLabel(s.tier):s.entityType==='book'?'Book':'Other',s.purpose==='learning'?'Learning':'Revision',s.playlist,s.note].filter(Boolean).join(' · ');return `<div class="history-card"><div class="history-main"><div><div class="history-title">${esc(title)}</div><div class="history-sub">${esc(sub)}</div></div><div class="history-min">${fmtMin(s.minutes)}</div></div><div class="history-actions"><button class="tiny-btn" data-delete-session="${esc(s.id)}">Delete</button></div></div>`;}

  function openModal(id){$(id).classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeModal(id){$(id).classList.add('hidden');document.body.style.overflow='';}
  function renderSettings(){$('settingVideoTarget').value=state.settings.videoTarget;$('settingTopicTarget').value=state.settings.topicTarget;$('settingRule').value=state.settings.productiveRule;if(state.adminUnlocked)$('resourceManagerBtn').classList.remove('hidden');}
  async function saveSettings(){state.settings={videoTarget:Number($('settingVideoTarget').value)||0,topicTarget:Number($('settingTopicTarget').value)||0,productiveRule:$('settingRule').value};await idbPut('settings',{key:'app',...state.settings});closeModal('settingsModal');renderHome();toast('Settings saved');}
  async function exportBackup(){
    const backup={app:'AI Prep',formatVersion:1,exportedAt:new Date().toISOString(),topics:state.topics,videos:state.videos,sessions:state.sessions,settings:state.settings};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const name=`AI-Prep-Backup-${todayISO()}.json`;
    try{const file=new File([blob],name,{type:'application/json'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'AI Prep Backup'});return;}}catch(e){}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('Backup exported');
  }
  async function importBackup(file){
    try{const data=JSON.parse(await file.text());if(!Array.isArray(data.topics)||!Array.isArray(data.videos)||!Array.isArray(data.sessions))throw new Error('Not an AI Prep backup');if(!confirm('Replace the current local data with this backup?'))return;
      await Promise.all(['topics','videos','sessions'].map(idbClear));await idbBulkPut('topics',data.topics);await idbBulkPut('videos',data.videos);await idbBulkPut('sessions',data.sessions);await idbPut('settings',{key:'app',...(data.settings||DEFAULT_SETTINGS)});await refreshState();closeModal('settingsModal');setView('home');toast('Backup restored');
    }catch(e){toast(`Could not restore: ${e.message}`);}
  }
  async function resetProgress(){if(!confirm('Delete all study history and streak progress? Your curriculum and added resources will stay.'))return;await idbClear('sessions');await refreshState();closeModal('settingsModal');setView('home');toast('Progress reset');}

  // ---------------- Hidden resource manager ----------------
  function unlockAdminTap(){state.adminTapCount++;clearTimeout(state.adminTapTimer);state.adminTapTimer=setTimeout(()=>state.adminTapCount=0,2500);if(state.adminTapCount>=5){state.adminUnlocked=true;state.adminTapCount=0;$('resourceManagerBtn').classList.remove('hidden');toast('Advanced Resource Manager unlocked');}}
  function openResourceManager(){populateChapterSelects();fillResourceTopics();renderCustomResources();syncGoalToggles();openModal('resourceModal');}
  function fillResourceTopics(){const ch=Number($('resChapter').value||1);$('resTopic').innerHTML='<option value="">No specific topic</option>'+state.topics.filter(t=>t.chapter===ch&&t.type==='core').map(t=>`<option value="${t.id}">${t.id} — ${esc(t.title)}</option>`).join('');}
  function syncGoalToggles(){const p=$('resTier').value==='primary';$('goalToggleRow').classList.toggle('hidden',!p);if(!p)$('resCountsGoal').checked=false;const pp=$('playlistTier').value==='primary';$('playlistGoalToggleRow').classList.toggle('hidden',!pp);if(!pp)$('playlistCountsGoal').checked=false;}
  async function addSingleResource(){
    const title=$('resTitle').value.trim(),playlist=$('resPlaylist').value.trim()||'Custom resource',tier=$('resTier').value,duration=Number($('resDuration').value||0),ch=Number($('resChapter').value),topicId=$('resTopic').value||null,url=$('resUrl').value.trim();if(!title)return toast('Enter a video title.');
    const v={id:uid('CUS'),chapterLabel:String(ch),chapters:[ch],tier,playlist,order:null,title,durationMin:duration||null,durationLabel:duration?fmtMin(duration):'',requirement:tier==='primary'&&$('resCountsGoal').checked?'core':'optional',sourceUrl:url,notes:'Added by you',builtin:false,userModified:true,countsTowardGoal:tier==='primary'&&$('resCountsGoal').checked,topicId,creator:''};
    await idbPut('videos',v);await refreshState();['resTitle','resPlaylist','resDuration','resUrl'].forEach(id=>$(id).value='');renderCustomResources();renderLog();toast('Video added');
  }
  function parseDuration(v){const x=String(v||'').trim();if(!x)return null;if(/^\d+(\.\d+)?$/.test(x))return Number(x);const p=x.split(':').map(Number);if(p.some(Number.isNaN))return null;if(p.length===2)return p[0]+p[1]/60;if(p.length===3)return p[0]*60+p[1]+p[2]/60;return null;}
  async function addPlaylist(){
    const name=$('playlistName').value.trim(),tier=$('playlistTier').value,ch=Number($('playlistChapter').value),url=$('playlistUrl').value.trim(),bulk=$('playlistBulk').value.trim();if(!name)return toast('Enter a playlist name.');if(!bulk)return toast('Paste at least one video line.');
    const lines=bulk.split(/\n+/).map(x=>x.trim()).filter(Boolean);const videos=[];for(let i=0;i<lines.length;i++){const [titleRaw,durRaw,urlRaw]=lines[i].split('|').map(x=>x?.trim());if(!titleRaw)continue;const dur=parseDuration(durRaw);videos.push({id:uid('CUS'),chapterLabel:String(ch),chapters:[ch],tier,playlist:name,order:i+1,title:titleRaw,durationMin:dur,durationLabel:dur?fmtMin(dur):'',requirement:tier==='primary'&&$('playlistCountsGoal').checked?'core':'optional',sourceUrl:urlRaw||url,notes:'Playlist added by you',builtin:false,userModified:true,countsTowardGoal:tier==='primary'&&$('playlistCountsGoal').checked,topicId:null,creator:''});}
    if(!videos.length)return toast('No valid video lines found.');await idbBulkPut('videos',videos);await refreshState();$('playlistName').value='';$('playlistUrl').value='';$('playlistBulk').value='';renderCustomResources();toast(`${videos.length} playlist videos added`);
  }
  function renderCustomResources(){const rows=state.videos.filter(v=>!v.builtin).sort((a,b)=>String(a.playlist).localeCompare(String(b.playlist)));$('customResourceList').innerHTML=rows.length?rows.map(v=>`<div class="custom-resource"><div class="select-title">${esc(v.title)}</div><div class="select-meta"><span class="tier-badge tier-${v.tier}">${tierLabel(v.tier)}</span>${esc(v.playlist)} · Ch ${esc(v.chapterLabel)} · ${v.durationMin?fmtMin(v.durationMin):'manual time'}${v.countsTowardGoal?' · main goal':''}</div><div class="custom-resource-actions"><button data-delete-custom="${esc(v.id)}">Delete</button></div></div>`).join(''):'<div class="helper">Nothing custom yet.</div>';$$('[data-delete-custom]',$('customResourceList')).forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Delete this custom resource? Existing history will keep its snapshot title.'))return;await idbDelete('videos',b.dataset.deleteCustom);await refreshState();renderCustomResources();toast('Resource deleted');}));}

  // ---------------- Events ----------------
  function bindEvents(){
    $$('.bottom-nav button,[data-nav]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.nav)));
    $('goLogBtn').addEventListener('click',()=>setView('log'));
    $('settingsBtn').addEventListener('click',()=>{renderSettings();openModal('settingsModal');});
    $$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
    $$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));
    $$('#logTypeTabs button').forEach(b=>b.addEventListener('click',()=>setLogType(b.dataset.logtype)));
    $$('#videoPurposeTabs button').forEach(b=>b.addEventListener('click',()=>setPurpose('video',b.dataset.purpose)));
    $$('#bookPurposeTabs button').forEach(b=>b.addEventListener('click',()=>{setPurpose('book',b.dataset.purpose);updateBookSelection();}));
    ['videoSearch','videoTierFilter','videoChapterFilter'].forEach(id=>$(id).addEventListener(id==='videoSearch'?'input':'change',renderVideoList));
    $('bookChapterSelect').addEventListener('change',()=>{state.selectedTopicIds.clear();renderBookTopics();});$('bookMinutes').addEventListener('input',updateBookSelection);$('saveLogBtn').addEventListener('click',saveLog);
    $$('#progressTabs button').forEach(b=>b.addEventListener('click',()=>setProgressTab(b.dataset.progresstab)));$('progressPlaylistFilter').addEventListener('change',renderVideoProgress);$('topicProgressChapter').addEventListener('change',renderTopicProgress);$('historyFilter').addEventListener('change',renderHistory);
    $('saveSettingsBtn').addEventListener('click',saveSettings);$('exportBackupBtn').addEventListener('click',exportBackup);$('importBackupInput').addEventListener('change',e=>{if(e.target.files[0])importBackup(e.target.files[0]);e.target.value='';});$('resetProgressBtn').addEventListener('click',resetProgress);
    $('versionTap').addEventListener('click',unlockAdminTap);$('resourceManagerBtn').addEventListener('click',()=>{closeModal('settingsModal');openResourceManager();});$('notListedBtn').addEventListener('click',()=>{state.adminUnlocked=true;openResourceManager();});
    $$('#resourceModeTabs button').forEach(b=>b.addEventListener('click',()=>{$$('#resourceModeTabs button').forEach(x=>x.classList.toggle('active',x===b));$$('.resource-mode').forEach(x=>x.classList.toggle('active',x.id===`resource-${b.dataset.resmode}`));}));
    $('resChapter').addEventListener('change',fillResourceTopics);$('resTier').addEventListener('change',syncGoalToggles);$('playlistTier').addEventListener('change',syncGoalToggles);$('addSingleResourceBtn').addEventListener('click',addSingleResource);$('addPlaylistBtn').addEventListener('click',addPlaylist);
  }
  function toast(msg){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),2400);}

  async function init(){
    try{state.db=await openDB();await seedIfNeeded();await refreshState();populateChapterSelects();$('logDate').value=todayISO();bindEvents();setLogType('video');renderHome();
      if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
    }catch(e){console.error(e);document.body.innerHTML=`<main style="padding:24px;color:white;font-family:system-ui"><h1>AI Prep could not start</h1><p>${esc(e.message)}</p><p>Try reloading the app.</p></main>`;}
  }
  init();
})();
