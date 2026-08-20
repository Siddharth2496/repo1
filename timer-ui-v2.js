(function(){
  'use strict';
  var STORE_KEY='ai-prep-focus-timer-v1';
  var cssLoaded=false;

  function $(id){return document.getElementById(id);}
  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function pad(n){return String(n).padStart(2,'0');}

  function loadCSS(){
    if(cssLoaded||q('link[data-timer-ui-v2]'))return;
    cssLoaded=true;
    var l=document.createElement('link');
    l.rel='stylesheet'; l.href='./timer-ui-v2.css?v=3'; l.setAttribute('data-timer-ui-v2','1');
    document.head.appendChild(l);
  }

  function openHistory(){
    var modal=$('settingsModal'); if(modal)modal.classList.add('hidden');
    document.body.style.overflow='';
    qa('.view').forEach(function(v){v.classList.toggle('active',v.id==='view-history');});
    qa('.bottom-nav button').forEach(function(b){b.classList.remove('active');});
    if($('viewTitle'))$('viewTitle').textContent='History';
    window.scrollTo(0,0);
  }

  function arrangeNav(){
    var nav=q('.bottom-nav'); if(!nav)return false;
    var history=q('[data-nav="history"]',nav); if(history)history.remove();
    var timer=q('[data-nav="timer"]',nav), progress=q('[data-nav="progress"]',nav);
    if(timer&&progress){
      if(progress.nextElementSibling!==timer)nav.insertBefore(timer,progress.nextSibling);
      nav.classList.add('nav-four');
      return true;
    }
    return false;
  }

  function addHistoryToSettings(){
    var stack=q('#settingsModal .settings-stack'); if(!stack||$('settingsHistorySection'))return;
    var heads=qa('h3',stack), backup=null;
    for(var i=0;i<heads.length;i++){if((heads[i].textContent||'').trim()==='Backup'){backup=heads[i];break;}}
    if(!backup)return;
    var wrap=document.createElement('section');
    wrap.id='settingsHistorySection'; wrap.className='settings-history-section';
    wrap.innerHTML='<div class="settings-history-copy"><div class="section-kicker">Activity</div><h3>History</h3><p>Review everything you have logged — videos, book topics, revision and other study.</p></div><button type="button" class="settings-history-btn" id="settingsHistoryBtn"><span>View activity history</span><span class="settings-history-arrow">›</span></button><div class="divider settings-history-divider"></div>';
    stack.insertBefore(wrap,backup);
    $('settingsHistoryBtn').addEventListener('click',openHistory);
  }

  function wrapClock(){
    var clock=$('focusClock'); if(!clock||$('focusTimerRing'))return;
    var ring=document.createElement('div'); ring.id='focusTimerRing'; ring.className='focus-timer-ring'; ring.style.setProperty('--ring-progress','0deg');
    var inner=document.createElement('div'); inner.className='focus-timer-ring-inner';
    var pretty=document.createElement('div'); pretty.id='focusClockPretty'; pretty.className='focus-clock-pretty'; pretty.textContent='00:00';
    var cap=document.createElement('div'); cap.id='focusRingCaption'; cap.className='focus-ring-caption'; cap.textContent='1-hour focus ring';
    clock.parentNode.insertBefore(ring,clock);
    ring.appendChild(inner);
    inner.appendChild(clock);
    inner.appendChild(pretty);
    inner.appendChild(cap);
  }

  function formatTimer(elapsed,active){
    if(!active)return '00:00';
    var totalSeconds=Math.floor(Math.max(0,elapsed)/1000);
    if(elapsed<3600000){
      var minutes=Math.floor(totalSeconds/60);
      var seconds=totalSeconds%60;
      return pad(minutes)+':'+pad(seconds);
    }
    var hours=Math.floor(totalSeconds/3600);
    var mins=Math.floor((totalSeconds%3600)/60);
    return pad(hours)+':'+pad(mins)+' 🔥';
  }

  function updateRing(){
    var ring=$('focusTimerRing'); if(!ring)return;
    var active=null;
    try{var raw=JSON.parse(localStorage.getItem(STORE_KEY)||'null');active=raw&&raw.active?raw.active:null;}catch(e){}
    var elapsed=active?Math.max(0,Date.now()-Number(active.startTs||Date.now())):0;
    var pct=Math.min(1,elapsed/3600000);
    ring.style.setProperty('--ring-progress',(pct*360)+'deg');
    ring.classList.toggle('ring-running',!!active);
    ring.classList.toggle('ring-complete',!!active&&pct>=1);
    var hero=q('.focus-hero-card'); if(hero)hero.classList.toggle('is-running',!!active);

    var pretty=$('focusClockPretty');
    if(pretty)pretty.textContent=formatTimer(elapsed,!!active);

    var cap=$('focusRingCaption');
    if(cap){
      if(!active)cap.textContent='1-hour focus ring';
      else if(pct>=1)cap.textContent='1-hour ring complete · keep going';
      else {var mins=Math.max(1,60-Math.floor(elapsed/60000));cap.textContent=mins+' min to complete your focus ring';}
    }
  }

  function install(){
    loadCSS();
    arrangeNav();
    addHistoryToSettings();
    wrapClock();
    updateRing();
    return !!$('focusTimerRing')&&!!q('.bottom-nav.nav-four');
  }

  var tries=0;
  var boot=setInterval(function(){tries++;if(install()||tries>80)clearInterval(boot);},250);
  setInterval(function(){arrangeNav();addHistoryToSettings();updateRing();},250);
})();