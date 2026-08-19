(async()=>{
  try{
    const themeMeta=document.querySelector('meta[name="theme-color"]');
    if(themeMeta) themeMeta.setAttribute('content','#f7f2eb');
    const statusMeta=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if(statusMeta) statusMeta.setAttribute('content','default');

    const loadCSS=href=>new Promise((resolve,reject)=>{
      const l=document.createElement('link');
      l.rel='stylesheet';l.href=href;l.dataset.aiPrepPolish='1';
      l.onload=resolve;l.onerror=()=>reject(new Error('Could not load '+href));
      document.head.appendChild(l);
    });
    await loadCSS('./polish-v3.css?v=20260820a');

    const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Could not load '+src));document.head.appendChild(s);});
    const parts=["v2/app-part-01.js?v=4", "v2/app-part-02.js?v=4", "v2/app-part-03.js?v=4", "v2/app-part-04.js?v=4", "v2/app-part-05.js?v=4", "v2/app-part-06.js?v=4", "v2/app-part-07.js?v=4", "v2/app-part-08.js?v=4", "v2/app-part-09.js?v=4", "v2/app-part-10.js?v=4"];
    window.__APPV2=[];
    for(const p of parts) await load(p);
    (0,eval)(window.__APPV2.join(''));
    await load('./timer-v1.js?v=20260820b');
  }catch(e){console.error(e);document.body.innerHTML='<main style="padding:24px;color:#172033;font-family:system-ui;background:#f7f2eb;min-height:100vh"><h1>AI Prep could not start</h1><p>'+e.message+'</p><p>Please reload the page.</p></main>';}
})();