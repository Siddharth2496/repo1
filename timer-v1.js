(() => {
  'use strict';

  const STORE_KEY = 'ai-prep-focus-timer-v1';
  const VERSION = 1;
  const state = {
    data: loadData(),
    period: 'W',
    offset: 0,
    selectedDate: todayISO(),
    tick: null,
    installed: false,
  };

  const $ = id => document.getElementById(id);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const pad = n => String(n).padStart(2,'0');
  const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => `FT-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;

  function todayISO(d=new Date()) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function dateFromISO(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); }
  function addDays(iso, n){ const d=dateFromISO(iso); d.setDate(d.getDate()+n); return todayISO(d); }
  function startOfDay(iso){ return dateFromISO(iso).getTime(); }
  function endOfDay(iso){ const d=dateFromISO(iso); d.setDate(d.getDate()+1); return d.getTime(); }
  function fmtClock(ts){ return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(ts)); }
  function fmtDate(iso, opts={weekday:'short',day:'numeric',month:'short'}){ return new Intl.DateTimeFormat(undefined,opts).format(dateFromISO(iso)); }
  function fmtDuration(ms, withSeconds=false){
    ms=Math.max(0,Number(ms)||0); const sec=Math.floor(ms/1000), h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    if(withSeconds) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    if(h) return `${h}h ${m?m+'m':''}`.trim();
    return `${m}m`;
  }
  function fmtCompactMinutes(ms){ const min=Math.round(ms/60000); if(min<60)return `${min}m`; const h=Math.floor(min/60),m=min%60; return m?`${h}h ${m}m`:`${h}h`; }

  function loadData(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
      if(raw && Array.isArray(raw.sessions)) return {version:VERSION,sessions:raw.sessions,active:raw.active||null};
    }catch(e){}
    return {version:VERSION,sessions:[],active:null};
  }
  function saveData(){ localStorage.setItem(STORE_KEY,JSON.stringify(state.data)); }

  function sessionEnd(s){ return Number(s.endTs||Date.now()); }
  function overlapMs(s, start, end){ return Math.max(0, Math.min(sessionEnd(s),end)-Math.max(Number(s.startTs),start)); }
  function allSessions(includeActive=true){
    const arr=[...state.data.sessions];
    if(includeActive && state.data.active) arr.push({...state.data.active,endTs:Date.now(),source:'timer-active',active:true});
    return arr;
  }
  function totalForRange(start,end){ return allSessions(true).reduce((sum,s)=>sum+overlapMs(s,start,end),0); }
  function totalForDate(iso){ return totalForRange(startOfDay(iso),endOfDay(iso)); }
  function sessionsForDate(iso){
    const a=startOfDay(iso), b=endOfDay(iso);
    return state.data.sessions.filter(s=>overlapMs(s,a,b)>0).sort((x,y)=>Number(x.startTs)-Number(y.startTs));
  }

  function waitForApp(){
    return new Promise(resolve=>{
      let n=0; const t=setInterval(()=>{
        n++;
        if(document.querySelector('.brand-mark') || document.getElementById('todayPlanBadge') || n>60){clearInterval(t);resolve();}
      },100);
    });
  }

  function ensureCSS(){
    if(document.querySelector('link[data-focus-timer-css]')) return;
    const l=document.createElement('link'); l.rel='stylesheet'; l.href='./timer-v1.css?v=20260820b'; l.dataset.focusTimerCss='1'; document.head.appendChild(l);
  }

  function injectUI(){
    if(state.installed) return; state.installed=true;
    ensureCSS();

    const nav=document.querySelector('.bottom-nav');
    const logBtn=nav?.querySelector('[data-nav="log"]');
    if(nav && logBtn && !nav.querySelector('[data-nav="timer"]')){
      const b=document.createElement('button'); b.type='button'; b.dataset.nav='timer'; b.innerHTML='<span class="timer-nav-icon">◷</span><small>Timer</small><i class="timer-live-dot" aria-hidden="true"></i>';
      logBtn.after(b);
      b.addEventListener('click',openTimerView);
    }

    const main=document.querySelector('.main-content');
    const progress=$('view-progress');
    if(main && progress && !$('view-timer')){
      const section=document.createElement('section'); section.className='view'; section.id='view-timer'; section.dataset.view='timer';
      section.innerHTML=timerMarkup();
      main.insertBefore(section,progress);
    }

    const home=$('view-home');
    if(home && !$('homeFocusPanel')){
      const panel=document.createElement('section'); panel.className='panel focus-home-panel'; panel.id='homeFocusPanel'; panel.innerHTML=homePanelMarkup();
      const consistency=[...home.querySelectorAll('.panel')].find(x=>x.textContent.includes('Consistency'));
      home.insertBefore(panel,consistency||null);
      panel.querySelector('[data-open-timer]')?.addEventListener('click',openTimerView);
    }

    bindTimerEvents();
    setManualDefaults();
    renderAll();
    startTicker();
  }

  function timerMarkup(){
    return `
      <section class="focus-hero-card">
        <div class="focus-kicker"><span class="focus-live-pip"></span><span id="focusStateLabel">Ready to focus</span></div>
        <div class="focus-clock" id="focusClock">00:00:00</div>
        <div class="focus-sub" id="focusSub">Start a session, put your phone down, and come back when you're done.</div>
        <label class="focus-label-field" id="focusLabelWrap"><span>What are you studying? <em>optional</em></span><input id="focusLabel" maxlength="80" placeholder="e.g. Transformers · Chapter 13"></label>
        <div class="focus-actions">
          <button class="focus-start-btn" id="focusStartBtn">Start studying</button>
          <button class="focus-stop-btn hidden" id="focusStopBtn">Stop & save</button>
          <button class="focus-discard-btn hidden" id="focusDiscardBtn">Discard session</button>
        </div>
      </section>

      <section class="focus-analytics-card">
        <div class="focus-section-head">
          <div><div class="section-kicker">Study time</div><h2>Your focus history</h2></div>
          <div class="focus-range-nav"><button id="focusPrev" aria-label="Previous period">‹</button><button id="focusNext" aria-label="Next period">›</button></div>
        </div>
        <div class="focus-period-tabs" id="focusPeriodTabs">
          ${['D','W','M','6M','Y'].map(x=>`<button data-period="${x}" class="${x==='W'?'active':''}">${x}</button>`).join('')}
        </div>
        <div class="focus-summary-row">
          <div><div class="focus-summary-label" id="focusSummaryLabel">AVERAGE / DAY</div><div class="focus-summary-value" id="focusSummaryValue">0m</div><div class="focus-summary-range" id="focusSummaryRange"></div></div>
          <button class="focus-today-btn" id="focusTodayBtn">Today</button>
        </div>
        <div class="focus-chart" id="focusChart"></div>
      </section>

      <section class="focus-sessions-card">
        <div class="focus-section-head">
          <div><div class="section-kicker">Sessions</div><h2 id="focusSessionDate">Today</h2></div>
          <div class="focus-day-total"><strong id="focusDayTotal">0m</strong><span id="focusSessionCount">0 sessions</span></div>
        </div>
        <div id="focusSessionList" class="focus-session-list"></div>
      </section>

      <section class="focus-manual-card">
        <div class="focus-section-head"><div><div class="section-kicker">Forgot the timer?</div><h2>Add a session manually</h2></div><span class="focus-manual-chip">Manual</span></div>
        <div class="focus-manual-grid">
          <label class="field"><span>Date</span><input type="date" id="manualFocusDate"></label>
          <label class="field"><span>Start</span><input type="time" id="manualFocusStart"></label>
          <label class="field"><span>End</span><input type="time" id="manualFocusEnd"></label>
        </div>
        <label class="field"><span>What did you study? <small>(optional)</small></span><input id="manualFocusLabel" maxlength="80" placeholder="e.g. RAG revision"></label>
        <div class="focus-manual-note">If the end time is earlier than the start time, AI Prep treats it as ending after midnight.</div>
        <button class="focus-add-manual" id="addManualFocusBtn">Add study session</button>
      </section>`;
  }

  function homePanelMarkup(){
    return `<div class="focus-section-head">
      <div><div class="section-kicker">Focused study</div><h2>Study time</h2></div>
      <button class="text-btn" data-open-timer>Open Timer</button>
    </div>
    <div class="focus-home-summary"><div><span>Today</span><strong id="homeFocusTotal">0m</strong></div><div><span>7-day average</span><strong id="homeFocusAverage">0m</strong></div></div>
    <div class="focus-home-bars" id="homeFocusBars"></div>`;
  }

  function openTimerView(){
    $$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-timer'));
    $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.nav==='timer'));
    if($('viewTitle')) $('viewTitle').textContent='Timer';
    window.scrollTo({top:0,behavior:'instant'});
    state.selectedDate=todayISO();
    renderAll();
  }

  function bindTimerEvents(){
    $('focusStartBtn')?.addEventListener('click',startTimer);
    $('focusStopBtn')?.addEventListener('click',stopTimer);
    $('focusDiscardBtn')?.addEventListener('click',discardTimer);
    $('addManualFocusBtn')?.addEventListener('click',addManualSession);
    $('focusPrev')?.addEventListener('click',()=>{state.offset--;renderAnalytics();});
    $('focusNext')?.addEventListener('click',()=>{if(state.offset<0)state.offset++;renderAnalytics();});
    $('focusTodayBtn')?.addEventListener('click',()=>{state.offset=0;state.selectedDate=todayISO();renderAnalytics();renderSessionList();});
    $$('#focusPeriodTabs [data-period]').forEach(b=>b.addEventListener('click',()=>{
      state.period=b.dataset.period;state.offset=0;
      $$('#focusPeriodTabs [data-period]').forEach(x=>x.classList.toggle('active',x===b));
      renderAnalytics();
    }));
    $$('.bottom-nav [data-nav="home"]').forEach(b=>b.addEventListener('click',()=>setTimeout(renderHomeTimerPanel,0)));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderAll();}});
  }

  function startTimer(){
    if(state.data.active) return;
    state.data.active={id:uid(),startTs:Date.now(),label:$('focusLabel')?.value.trim()||'',source:'timer'};
    saveData(); renderAll();
  }
  function stopTimer(){
    const a=state.data.active; if(!a)return;
    const endTs=Date.now();
    state.data.sessions.push({id:a.id,startTs:a.startTs,endTs,label:a.label||'',source:'timer',createdAt:Date.now()});
    state.data.active=null; saveData(); state.selectedDate=todayISO(new Date(a.startTs));
    if($('focusLabel'))$('focusLabel').value=''; renderAll();
  }
  function discardTimer(){
    if(!state.data.active)return;
    if(!confirm('Discard this running study session? It will not count toward your study time.'))return;
    state.data.active=null; saveData(); renderAll();
  }
  function deleteSession(id){
    const s=state.data.sessions.find(x=>x.id===id); if(!s)return;
    if(!confirm(`Delete this ${fmtCompactMinutes(Number(s.endTs)-Number(s.startTs))} study session?`))return;
    state.data.sessions=state.data.sessions.filter(x=>x.id!==id); saveData(); renderAll();
  }

  function setManualDefaults(){
    if(!$('manualFocusDate'))return;
    $('manualFocusDate').value=todayISO();
    const now=new Date(); const end=`${pad(now.getHours())}:${pad(Math.floor(now.getMinutes()/5)*5)}`;
    const prev=new Date(now.getTime()-60*60000); const start=`${pad(prev.getHours())}:${pad(Math.floor(prev.getMinutes()/5)*5)}`;
    $('manualFocusStart').value=start;$('manualFocusEnd').value=end;
  }
  function addManualSession(){
    const date=$('manualFocusDate').value, st=$('manualFocusStart').value, en=$('manualFocusEnd').value;
    if(!date||!st||!en){alert('Choose a date, start time and end time.');return;}
    const [y,m,d]=date.split('-').map(Number), [sh,sm]=st.split(':').map(Number), [eh,em]=en.split(':').map(Number);
    const start=new Date(y,m-1,d,sh,sm,0,0); let end=new Date(y,m-1,d,eh,em,0,0); if(end<=start)end.setDate(end.getDate()+1);
    const dur=end-start; if(dur<60000){alert('Session must be at least one minute.');return;} if(dur>18*3600000){if(!confirm('This session is longer than 18 hours. Add it anyway?'))return;}
    state.data.sessions.push({id:uid(),startTs:start.getTime(),endTs:end.getTime(),label:$('manualFocusLabel').value.trim(),source:'manual',createdAt:Date.now()});
    state.data.sessions.sort((a,b)=>Number(a.startTs)-Number(b.startTs)); saveData(); state.selectedDate=date; $('manualFocusLabel').value=''; renderAll();
  }

  function renderActive(){
    const a=state.data.active, running=!!a, elapsed=running?Date.now()-Number(a.startTs):0;
    if($('focusClock')) $('focusClock').textContent=running?fmtDuration(elapsed,true):'00:00:00';
    if($('focusStateLabel')) $('focusStateLabel').textContent=running?'Focus session running':'Ready to focus';
    if($('focusSub')) $('focusSub').textContent=running?`Started ${fmtClock(a.startTs)}${a.label?' · '+a.label:''}. Put your phone down — the timer will keep counting.`:'Start a session, put your phone down, and come back when you\'re done.';
    $('focusStartBtn')?.classList.toggle('hidden',running); $('focusStopBtn')?.classList.toggle('hidden',!running); $('focusDiscardBtn')?.classList.toggle('hidden',!running); $('focusLabelWrap')?.classList.toggle('hidden',running);
    document.querySelector('.focus-hero-card')?.classList.toggle('is-running',running);
    $$('.timer-live-dot').forEach(x=>x.classList.toggle('show',running));
    if(running) document.title=`${fmtDuration(elapsed,true)} · AI Prep`; else document.title='AI Prep';
  }

  function periodBuckets(){
    const now=new Date(), p=state.period, off=state.offset;
    if(p==='D'){
      const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()+off); const start=new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime();
      const buckets=[]; for(let i=0;i<12;i++){buckets.push({start:start+i*2*3600000,end:start+(i+1)*2*3600000,label:i%3===0?new Intl.DateTimeFormat(undefined,{hour:'numeric'}).format(new Date(start+i*2*3600000)):'',date:todayISO(day)});} return {buckets,label:fmtDate(todayISO(day),{weekday:'long',day:'numeric',month:'long'}),kind:'day'};
    }
    if(p==='W'){
      const d=new Date(now); d.setDate(d.getDate()+off*7-d.getDay()); d.setHours(0,0,0,0); const buckets=[];
      for(let i=0;i<7;i++){const s=new Date(d);s.setDate(d.getDate()+i);const e=new Date(s);e.setDate(s.getDate()+1);buckets.push({start:s.getTime(),end:e.getTime(),label:new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(s).slice(0,1),date:todayISO(s)});}
      const endD=new Date(d);endD.setDate(d.getDate()+6); return {buckets,label:`${fmtDate(todayISO(d),{month:'short',day:'numeric'})} – ${fmtDate(todayISO(endD),{month:'short',day:'numeric',year:'numeric'})}`,kind:'day'};
    }
    if(p==='M'){
      const d=new Date(now.getFullYear(),now.getMonth()+off,1); const endMonth=new Date(d.getFullYear(),d.getMonth()+1,1); const buckets=[]; let x=new Date(d),i=0;
      while(x<endMonth){const s=new Date(x),e=new Date(x);e.setDate(e.getDate()+1);buckets.push({start:s.getTime(),end:e.getTime(),label:(i===0||s.getDate()%5===0)?String(s.getDate()):'',date:todayISO(s)});x=e;i++;}
      return {buckets,label:new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(d),kind:'day'};
    }
    const count=p==='6M'?6:12; const anchor=new Date(now.getFullYear(),now.getMonth()+off*count-(count-1),1); const buckets=[];
    for(let i=0;i<count;i++){const s=new Date(anchor.getFullYear(),anchor.getMonth()+i,1),e=new Date(anchor.getFullYear(),anchor.getMonth()+i+1,1);buckets.push({start:s.getTime(),end:e.getTime(),label:new Intl.DateTimeFormat(undefined,{month:'short'}).format(s).slice(0,1),month:true});}
    const last=new Date(anchor.getFullYear(),anchor.getMonth()+count-1,1);return {buckets,label:`${new Intl.DateTimeFormat(undefined,{month:'short',year:'numeric'}).format(anchor)} – ${new Intl.DateTimeFormat(undefined,{month:'short',year:'numeric'}).format(last)}`,kind:'month'};
  }

  function renderAnalytics(){
    if(!$('focusChart'))return;
    const {buckets,label,kind}=periodBuckets(); const vals=buckets.map(b=>totalForRange(b.start,b.end)); const max=Math.max(1,...vals); const total=vals.reduce((a,b)=>a+b,0);
    let summary=total, summaryLabel='TOTAL';
    if(state.period==='W'||state.period==='M'){summary=total/buckets.length;summaryLabel='AVERAGE / DAY';}
    if(state.period==='6M'||state.period==='Y'){summary=total/buckets.length;summaryLabel='AVERAGE / MONTH';}
    $('focusSummaryLabel').textContent=summaryLabel; $('focusSummaryValue').textContent=fmtCompactMinutes(summary); $('focusSummaryRange').textContent=label;
    $('focusNext').disabled=state.offset>=0;
    $('focusChart').style.setProperty('--bar-count',buckets.length);
    $('focusChart').innerHTML=buckets.map((b,i)=>{
      const h=vals[i]?Math.max(5,Math.round(vals[i]/max*100)):1; const selected=b.date&&b.date===state.selectedDate; const future=b.start>Date.now();
      return `<button class="focus-bar-wrap ${selected?'selected':''} ${future?'future':''}" data-date="${b.date||''}" title="${b.date?fmtDate(b.date):b.label}: ${fmtCompactMinutes(vals[i])}"><span class="focus-bar" style="height:${h}%"></span><small>${esc(b.label)}</small></button>`;
    }).join('');
    $$('.focus-bar-wrap[data-date]',$('focusChart')).forEach(b=>{if(b.dataset.date)b.addEventListener('click',()=>{state.selectedDate=b.dataset.date;renderAnalytics();renderSessionList();});});
  }

  function renderSessionList(){
    if(!$('focusSessionList'))return; const date=state.selectedDate||todayISO(); const rows=sessionsForDate(date), total=totalForDate(date);
    $('focusSessionDate').textContent=date===todayISO()?'Today':fmtDate(date,{weekday:'long',day:'numeric',month:'long'}); $('focusDayTotal').textContent=fmtCompactMinutes(total); $('focusSessionCount').textContent=`${rows.length} session${rows.length===1?'':'s'}`;
    $('focusSessionList').innerHTML=rows.length?rows.map(s=>{
      const dur=Number(s.endTs)-Number(s.startTs), icon=s.source==='manual'?'✎':'◷', label=s.label||'Study session';
      return `<article class="focus-session-row"><div class="focus-session-icon ${s.source==='manual'?'manual':''}">${icon}</div><div class="focus-session-main"><strong>${esc(label)}</strong><span>${fmtClock(s.startTs)} – ${fmtClock(s.endTs)} · ${s.source==='manual'?'Manual':'Timer'}</span></div><div class="focus-session-duration">${fmtCompactMinutes(dur)}</div><button class="focus-session-delete" data-delete-focus="${esc(s.id)}" aria-label="Delete session">×</button></article>`;
    }).join(''):'<div class="focus-empty">No study sessions for this day yet.</div>';
    $$('[data-delete-focus]',$('focusSessionList')).forEach(b=>b.addEventListener('click',()=>deleteSession(b.dataset.deleteFocus)));
  }

  function renderHomeTimerPanel(){
    if(!$('homeFocusPanel'))return; const today=todayISO(), total=totalForDate(today); let week=0;
    const days=[]; for(let i=6;i>=0;i--){const d=addDays(today,-i),v=totalForDate(d);week+=v;days.push({d,v});}
    $('homeFocusTotal').textContent=fmtCompactMinutes(total); $('homeFocusAverage').textContent=fmtCompactMinutes(week/7); const max=Math.max(1,...days.map(x=>x.v));
    $('homeFocusBars').innerHTML=days.map(x=>`<button data-home-focus-date="${x.d}" class="${x.d===today?'today':''}" title="${fmtDate(x.d)} · ${fmtCompactMinutes(x.v)}"><span style="height:${x.v?Math.max(8,Math.round(x.v/max*100)):3}%"></span><small>${new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(dateFromISO(x.d)).slice(0,1)}</small></button>`).join('');
    $$('[data-home-focus-date]',$('homeFocusBars')).forEach(b=>b.addEventListener('click',()=>{state.selectedDate=b.dataset.homeFocusDate;state.period='W';state.offset=0;openTimerView();}));
  }

  function renderAll(){renderActive();renderAnalytics();renderSessionList();renderHomeTimerPanel();}
  function startTicker(){clearInterval(state.tick);state.tick=setInterval(()=>{renderActive();if(state.data.active){if($('homeFocusTotal'))$('homeFocusTotal').textContent=fmtCompactMinutes(totalForDate(todayISO())); if($('focusDayTotal')&&state.selectedDate===todayISO())$('focusDayTotal').textContent=fmtCompactMinutes(totalForDate(todayISO()));}},1000);}

  waitForApp().then(injectUI);
})();
