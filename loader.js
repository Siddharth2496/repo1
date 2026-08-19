(async()=>{
  try{
    const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Could not load '+src));document.head.appendChild(s);});
    const seedParts=["bundle/seed-01.js","bundle/seed-02.js","bundle/seed-03.js","bundle/seed-04.js","bundle/seed-05.js","bundle/seed-06.js","bundle/seed-07.js","bundle/seed-08.js","bundle/seed-09.js","bundle/seed-10.js"];
    for(const p of seedParts) await load(p);
    (0,eval)((window.__SEED_SRC||[]).join(''));
    await load('app.js');
  }catch(e){
    console.error(e);
    document.body.innerHTML='<main style="padding:24px;color:white;font-family:system-ui;background:#08111f;min-height:100vh"><h1>AI Prep could not start</h1><p>'+e.message+'</p><p>Please reload the page.</p></main>';
  }
})();
