// AI Prep recovery service worker.
// Existing installs may still be controlled by an older cache-first worker.
// This version clears every old cache, takes control once, then unregisters itself.
const RECOVERY_VERSION='ai-prep-recovery-20260820-03';

self.addEventListener('install',event=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.map(key=>caches.delete(key)));
    }catch(e){}
    try{await self.clients.claim();}catch(e){}
    try{
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      clients.forEach(client=>client.postMessage({type:'AI_PREP_CACHE_RECOVERED',version:RECOVERY_VERSION}));
    }catch(e){}
    try{await self.registration.unregister();}catch(e){}
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(fetch(event.request,{cache:'no-store'}));
});
