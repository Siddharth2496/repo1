(function(){
  'use strict';
  if(window.__AI_PREP_TIMER_V2__) return;
  window.__AI_PREP_TIMER_V2__ = true;

  var STORE_KEY = 'ai-prep-focus-timer-v1';
  var state = { period:'W', offset:0, selectedDate:todayISO(), tick:null, data:loadData() };

  function $(id){ return document.getElementById(id); }
  function q(sel,root){ return (root||document).querySelector(sel); }
  function qa(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function uid(){ return 'FT-'+Date.now()+'-'+Math.random().toString(36).slice(2,9); }
  function todayISO(d){ d=d||new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function dateFromISO(iso){ var a=iso.split('-').map(Number); return new Date(a[0],a[1]-1,a[2]); }
  function addDays(iso,n){ var d=dateFromISO(iso); d.setDate(d.getDate()+n); return todayISO(d); }
  function startOfDay(iso){ return dateFromISO(iso).getTime(); }
  function endOfDay(iso){ var d=dateFromISO(iso); d.setDate(d.getDate()+1); return d.getTime(); }
  function fmtClock(ts){ return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(ts)); }
  function fmtDate(iso,opts){ return new Intl.DateTimeFormat(undefined,opts||{weekday:'short',day:'numeric',month:'short'}).format(dateFromISO(iso)); }
  function fmtDuration(ms,seconds){ ms=Math.max(0,Number(ms)||0); var sec=Math.floor(ms/1000),h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; if(seconds)return pad(h)+':'+pad(m)+':'+pad(s); if(h)return h+'h'+(m?' '+m+'m':''); return m+'m'; }
  function fmtCompact(ms){ var min=Math.round((Number(ms)||0)/60000); if(min<60)return min+'m'; var h=Math.floor(min/60),m=min%60; return m?h+'h '+m+'m':h+'h'; }

  function loadData(){
    try{ var raw=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(raw&&Array.isArray(raw.sessions)) return {sessions:raw.sessions,active:raw.active||null}; }catch(e){}
    return {sessions:[],active:null};
  }
  function saveData(){ try{ localStorage.setItem(STORE_KEY,JSON.stringify(state.data)); }catch(e){} }
  function sessionEnd(s){ return Number(s.endTs||Date.now()); }
  function overlapMs(s,start,end){ return Math.max(0,Math.min(sessionEnd(s),end)-Math.max(Number(s.startTs),start)); }
  function allSessions(){ var a=state.data.sessions.slice(); if(state.data.active)a.push({startTs:state.data.active.startTs,endTs:Date.now(),label:state.data.active.label,source:'timer-active'}); return a; }
  function totalForRange(start,end){ return allSessions().reduce(function(sum,s){ return sum+overlapMs(s,start,end); },0); }
  function totalForDate(iso){ return totalForRange(startOfDay(iso),endOfDay(iso)); }
  function sessionsForDate(iso){ var a=startOfDay(iso),b=endOfDay(iso); return state.data.sessions.filter(function(s){return overlapMs(s,a,b)>0;}).sort(function(x,y){return Number(x.startTs)-Number(y.startTs);}); }

  function ensureCSS(){ if(q('link[data-focus-timer-css]'))return; var l=document.createElement('link'); l.rel='stylesheet'; l.href='./timer-v1.css?v=20260820c'; l.setAttribute('data-focus-timer-css','1'); document.head.appendChild(l); }

  function timerMarkup(){
    return ''+
    '<section class="focus-hero-card">'+
      '<div class="focus-kicker"><span class="focus-live-pip"></span><span id="focusStateLabel">Ready to focus</span></div>'+
      '<div class="focus-clock" id="focusClock">00:00:00</div>'+
      '<div class="focus-sub" id="focusSub">Start a session, put your phone down, and come back when you are done.</div>'+
      '<label class="focus-label-field" id="focusLabelWrap"><span>What are you studying? <em>optional</em></span><input id="focusLabel" maxlength="80" placeholder="e.g. Transformers · Chapter 13"></label>'+
      '<div class="focus-actions"><button class="focus-start-btn" id="focusStartBtn">Start studying</button><button class="focus-stop-btn hidden" id="focusStopBtn">Stop & save</button><button class="focus-discard-btn hidden" id="focusDiscardBtn">Discard session</button></div>'+
    '</section>'+
    '<section class="focus-analytics-card">'+
      '<div class="focus-section-head"><div><div class="section-kicker">Study time</div><h2>Your focus history</h2></div><div class="focus-range-nav"><button id="focusPrev">‹</button><button id="focusNext">›</button></div></div>'+
      '<div class="focus-period-tabs" id="focusPeriodTabs"><button data-period="D">D</button><button data-period="W" class="active">W</button><button data-period="M">M</button><button data-period="6M">6M</button><button data-period="Y">Y</button></div>'+
      '<div class="focus-summary-row"><div><div class="focus-summary-label" id="focusSummaryLabel">AVERAGE / DAY</div><div class="focus-summary-value" id="focusSummaryValue">0m</div><div class="focus-summary-range" id="focusSummaryRange"></div></div><button class="focus-today-btn" id="focusTodayBtn">Today</button></div>'+
      '<div class="focus-chart" id="focusChart"></div>'+
    '</section>'+
    '<section class="focus-sessions-card">'+
      '<div class="focus-section-head"><div><div class="section-kicker">Sessions</div><h2 id="focusSessionDate">Today</h2></div><div class="focus-day-total"><strong id="focusDayTotal">0m</strong><span id="focusSessionCount">0 sessions</span></div></div>'+
      '<div id="focusSessionList" class="focus-session-list"></div>'+
    '</section>'+
    '<section class="focus-manual-card">'+
      '<div class="focus-section-head"><div><div class="section-kicker">Forgot the timer?</div><h2>Add a session manually</h2></div><span class="focus-manual-chip">Manual</span></div>'+
      '<div class="focus-manual-grid"><label class="field"><span>Date</span><input type="date" id="manualFocusDate"></label><label class="field"><span>Start</span><input type="time" id="manualFocusStart"></label><label class="field"><span>End</span><input type="time" id="manualFocusEnd"></label></div>'+
      '<label class="field"><span>What did you study? <small>(optional)</small></span><input id="manualFocusLabel" maxlength="80" placeholder="e.g. RAG revision"></label>'+
      '<div class="focus-manual-note">If the end time is earlier than the start time, AI Prep treats it as ending after midnight.</div>'+
      '<button class="focus-add-manual" id="addManualFocusBtn">Add study session</button>'+
    '</section>';
  }

  function homeMarkup(){ return '<div class="focus-section-head"><div><div class="section-kicker">Focused study</div><h2>Study time</h2></div><button class="text-btn" id="openTimerFromHome">Open Timer</button></div><div class="focus-home-summary"><div><span>Today</span><strong id="homeFocusTotal">0m</strong></div><div><span>7-day average</span><strong id="homeFocusAverage">0m</strong></div></div><div class="focus-home-bars" id="homeFocusBars"></div>'; }

  function ensureInstalled(){
    ensureCSS();
    var nav=q('.bottom-nav'), logBtn=nav&&q('[data-nav="log"]',nav), main=q('.main-content'), progress=$('view-progress'), home=$('view-home');
    if(!nav||!logBtn||!main||!progress||!home) return false;

    if(!q('[data-nav="timer"]',nav)){
      var b=document.createElement('button'); b.type='button'; b.setAttribute('data-nav','timer'); b.innerHTML='<span class="timer-nav-icon">◷</span><small>Timer</small><i class="timer-live-dot"></i>';
      if(logBtn.nextSibling) nav.insertBefore(b,logBtn.nextSibling); else nav.appendChild(b);
      b.addEventListener('click',openTimerView);
    }

    if(!$('view-timer')){
      var section=document.createElement('section'); section.className='view'; section.id='view-timer'; section.setAttribute('data-view','timer'); section.innerHTML=timerMarkup(); main.insertBefore(section,progress);
      bindTimerEvents(); setManualDefaults();
    }

    if(!$('homeFocusPanel')){
      var panel=document.createElement('section'); panel.className='panel focus-home-panel'; panel.id='homeFocusPanel'; panel.innerHTML=homeMarkup();
      var panels=qa('.panel',home), target=null; for(var i=0;i<panels.length;i++){ if((panels[i].textContent||'').indexOf('Consistency')>=0){target=panels[i];break;} }
      if(target)home.insertBefore(panel,target); else home.appendChild(panel);
      var oh=$('openTimerFromHome'); if(oh)oh.addEventListener('click',openTimerView);
    }
    renderAll();
    return true;
  }

  function openTimerView(){
    qa('.view').forEach(function(v){ v.classList.toggle('active',v.id==='view-timer'); });
    qa('.bottom-nav button').forEach(function(b){ b.classList.toggle('active',b.getAttribute('data-nav')==='timer'); });
    if($('viewTitle'))$('viewTitle').textContent='Timer';
    window.scrollTo(0,0); state.selectedDate=todayISO(); renderAll();
  }

  function bindTimerEvents(){
    var e;
    e=$('focusStartBtn'); if(e)e.addEventListener('click',startTimer);
    e=$('focusStopBtn'); if(e)e.addEventListener('click',stopTimer);
    e=$('focusDiscardBtn'); if(e)e.addEventListener('click',discardTimer);
    e=$('addManualFocusBtn'); if(e)e.addEventListener('click',addManualSession);
    e=$('focusPrev'); if(e)e.addEventListener('click',function(){state.offset--;renderAnalytics();});
    e=$('focusNext'); if(e)e.addEventListener('click',function(){if(state.offset<0)state.offset++;renderAnalytics();});
    e=$('focusTodayBtn'); if(e)e.addEventListener('click',function(){state.offset=0;state.selectedDate=todayISO();renderAnalytics();renderSessionList();});
    qa('#focusPeriodTabs [data-period]').forEach(function(b){ b.addEventListener('click',function(){ state.period=b.getAttribute('data-period'); state.offset=0; qa('#focusPeriodTabs [data-period]').forEach(function(x){x.classList.toggle('active',x===b);}); renderAnalytics(); }); });
  }

  function startTimer(){ if(state.data.active)return; state.data.active={id:uid(),startTs:Date.now(),label:($('focusLabel')&&$('focusLabel').value||'').trim(),source:'timer'}; saveData(); renderAll(); }
  function stopTimer(){ var a=state.data.active;if(!a)return;state.data.sessions.push({id:a.id,startTs:a.startTs,endTs:Date.now(),label:a.label||'',source:'timer',createdAt:Date.now()});state.data.active=null;saveData();if($('focusLabel'))$('focusLabel').value='';renderAll(); }
  function discardTimer(){ if(!state.data.active)return;if(confirm('Discard this running study session? It will not count toward your study time.')){state.data.active=null;saveData();renderAll();} }
  function deleteSession(id){ if(!confirm('Delete this study session?'))return;state.data.sessions=state.data.sessions.filter(function(s){return s.id!==id;});saveData();renderAll(); }

  function setManualDefaults(){ var d=$('manualFocusDate'); if(!d)return;d.value=todayISO();var now=new Date(),prev=new Date(now.getTime()-3600000);$('manualFocusStart').value=pad(prev.getHours())+':'+pad(Math.floor(prev.getMinutes()/5)*5);$('manualFocusEnd').value=pad(now.getHours())+':'+pad(Math.floor(now.getMinutes()/5)*5); }
  function addManualSession(){
    var date=$('manualFocusDate').value,st=$('manualFocusStart').value,en=$('manualFocusEnd').value;if(!date||!st||!en){alert('Choose a date, start time and end time.');return;}
    var d=date.split('-').map(Number),a=st.split(':').map(Number),b=en.split(':').map(Number),start=new Date(d[0],d[1]-1,d[2],a[0],a[1]),end=new Date(d[0],d[1]-1,d[2],b[0],b[1]);if(end<=start)end.setDate(end.getDate()+1);if(end-start<60000){alert('Session must be at least one minute.');return;}
    state.data.sessions.push({id:uid(),startTs:start.getTime(),endTs:end.getTime(),label:($('manualFocusLabel').value||'').trim(),source:'manual',createdAt:Date.now()});state.data.sessions.sort(function(x,y){return x.startTs-y.startTs;});saveData();state.selectedDate=date;$('manualFocusLabel').value='';renderAll();
  }

  function renderActive(){
    if(!$('focusClock'))return;var a=state.data.active,running=!!a,elapsed=running?Date.now()-a.startTs:0;$('focusClock').textContent=running?fmtDuration(elapsed,true):'00:00:00';$('focusStateLabel').textContent=running?'Focus session running':'Ready to focus';$('focusSub').textContent=running?'Started '+fmtClock(a.startTs)+(a.label?' · '+a.label:'')+'. Put your phone down — the timer will keep counting.':'Start a session, put your phone down, and come back when you are done.';
    $('focusStartBtn').classList.toggle('hidden',running);$('focusStopBtn').classList.toggle('hidden',!running);$('focusDiscardBtn').classList.toggle('hidden',!running);$('focusLabelWrap').classList.toggle('hidden',running);qa('.timer-live-dot').forEach(function(x){x.classList.toggle('show',running);});
  }

  function periodBuckets(){
    var now=new Date(),p=state.period,off=state.offset,buckets=[],i,s,e,d;
    if(p==='D'){d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+off);s=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();for(i=0;i<12;i++)buckets.push({start:s+i*7200000,end:s+(i+1)*7200000,label:i%3===0?new Intl.DateTimeFormat(undefined,{hour:'numeric'}).format(new Date(s+i*7200000)):'',date:todayISO(d)});return {buckets:buckets,label:fmtDate(todayISO(d),{weekday:'long',day:'numeric',month:'long'})};}
    if(p==='W'){d=new Date(now);d.setDate(d.getDate()+off*7-d.getDay());d.setHours(0,0,0,0);for(i=0;i<7;i++){s=new Date(d);s.setDate(d.getDate()+i);e=new Date(s);e.setDate(s.getDate()+1);buckets.push({start:s.getTime(),end:e.getTime(),label:new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(s).slice(0,1),date:todayISO(s)});}var ld=new Date(d);ld.setDate(d.getDate()+6);return {buckets:buckets,label:fmtDate(todayISO(d),{month:'short',day:'numeric'})+' – '+fmtDate(todayISO(ld),{month:'short',day:'numeric',year:'numeric'})};}
    if(p==='M'){d=new Date(now.getFullYear(),now.getMonth()+off,1);var endM=new Date(d.getFullYear(),d.getMonth()+1,1);s=new Date(d);i=0;while(s<endM){e=new Date(s);e.setDate(e.getDate()+1);buckets.push({start:s.getTime(),end:e.getTime(),label:(i===0||s.getDate()%5===0)?String(s.getDate()):'',date:todayISO(s)});s=e;i++;}return {buckets:buckets,label:new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(d)};}
    var count=p==='6M'?6:12,anchor=new Date(now.getFullYear(),now.getMonth()+off*count-(count-1),1);for(i=0;i<count;i++){s=new Date(anchor.getFullYear(),anchor.getMonth()+i,1);e=new Date(anchor.getFullYear(),anchor.getMonth()+i+1,1);buckets.push({start:s.getTime(),end:e.getTime(),label:new Intl.DateTimeFormat(undefined,{month:'short'}).format(s).slice(0,1)});}return {buckets:buckets,label:new Intl.DateTimeFormat(undefined,{month:'short',year:'numeric'}).format(anchor)+' – '+new Intl.DateTimeFormat(undefined,{month:'short',year:'numeric'}).format(new Date(anchor.getFullYear(),anchor.getMonth()+count-1,1))};
  }

  function renderAnalytics(){
    if(!$('focusChart'))return;var o=periodBuckets(),vals=o.buckets.map(function(b){return totalForRange(b.start,b.end);}),max=Math.max.apply(null,[1].concat(vals)),total=vals.reduce(function(a,b){return a+b;},0),summary=total,label='TOTAL';if(state.period==='W'||state.period==='M'){summary=total/o.buckets.length;label='AVERAGE / DAY';}if(state.period==='6M'||state.period==='Y'){summary=total/o.buckets.length;label='AVERAGE / MONTH';}$('focusSummaryLabel').textContent=label;$('focusSummaryValue').textContent=fmtCompact(summary);$('focusSummaryRange').textContent=o.label;$('focusNext').disabled=state.offset>=0;
    $('focusChart').innerHTML=o.buckets.map(function(b,i){var h=vals[i]?Math.max(5,Math.round(vals[i]/max*100)):1,sel=b.date&&b.date===state.selectedDate;return '<button class="focus-bar-wrap '+(sel?'selected':'')+'" data-date="'+(b.date||'')+'"><span class="focus-bar" style="height:'+h+'%"></span><small>'+esc(b.label)+'</small></button>';}).join('');qa('.focus-bar-wrap[data-date]',$('focusChart')).forEach(function(b){if(b.getAttribute('data-date'))b.addEventListener('click',function(){state.selectedDate=b.getAttribute('data-date');renderAnalytics();renderSessionList();});});
  }

  function renderSessionList(){
    if(!$('focusSessionList'))return;var date=state.selectedDate||todayISO(),rows=sessionsForDate(date);$('focusSessionDate').textContent=date===todayISO()?'Today':fmtDate(date,{weekday:'long',day:'numeric',month:'long'});$('focusDayTotal').textContent=fmtCompact(totalForDate(date));$('focusSessionCount').textContent=rows.length+' session'+(rows.length===1?'':'s');$('focusSessionList').innerHTML=rows.length?rows.map(function(s){return '<article class="focus-session-row"><div class="focus-session-icon '+(s.source==='manual'?'manual':'')+'">'+(s.source==='manual'?'✎':'◷')+'</div><div class="focus-session-main"><strong>'+esc(s.label||'Study session')+'</strong><span>'+fmtClock(s.startTs)+' – '+fmtClock(s.endTs)+' · '+(s.source==='manual'?'Manual':'Timer')+'</span></div><div class="focus-session-duration">'+fmtCompact(s.endTs-s.startTs)+'</div><button class="focus-session-delete" data-delete-focus="'+esc(s.id)+'">×</button></article>';}).join(''):'<div class="focus-empty">No study sessions for this day yet.</div>';qa('[data-delete-focus]',$('focusSessionList')).forEach(function(b){b.addEventListener('click',function(){deleteSession(b.getAttribute('data-delete-focus'));});});
  }

  function renderHome(){ if(!$('homeFocusPanel'))return;var today=todayISO(),total=totalForDate(today),week=0,days=[];for(var i=6;i>=0;i--){var d=addDays(today,-i),v=totalForDate(d);week+=v;days.push({d:d,v:v});}$('homeFocusTotal').textContent=fmtCompact(total);$('homeFocusAverage').textContent=fmtCompact(week/7);var max=Math.max.apply(null,[1].concat(days.map(function(x){return x.v;})));$('homeFocusBars').innerHTML=days.map(function(x){return '<button data-home-focus-date="'+x.d+'"><span style="height:'+(x.v?Math.max(8,Math.round(x.v/max*100)):3)+'%"></span><small>'+new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(dateFromISO(x.d)).slice(0,1)+'</small></button>';}).join('');qa('[data-home-focus-date]',$('homeFocusBars')).forEach(function(b){b.addEventListener('click',function(){state.selectedDate=b.getAttribute('data-home-focus-date');openTimerView();});}); }
  function renderAll(){ renderActive();renderAnalytics();renderSessionList();renderHome(); }

  function startTicker(){ if(state.tick)clearInterval(state.tick);state.tick=setInterval(function(){ ensureInstalled(); if(state.data.active)renderAll(); },1000); }

  function boot(){
    ensureCSS();
    var attempts=0;
    var timer=setInterval(function(){ attempts++; if(ensureInstalled() || attempts>160){ if(attempts>160)clearInterval(timer); } },250);
    var obs=new MutationObserver(function(){ ensureInstalled(); });
    obs.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(function(){ try{obs.disconnect();}catch(e){} },60000);
    document.addEventListener('visibilitychange',function(){ if(!document.hidden){ensureInstalled();renderAll();} });
    startTicker();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();