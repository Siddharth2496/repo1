const CACHE_RESET_VERSION='ai-prep-network-v5';

self.addEventListener('install',event=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.map(key=>caches.delete(key)));
    }catch(e){}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith((async()=>{
    try{
      return await fetch(event.request,{cache:'no-store'});
    }catch(err){
      return fetch(event.request);
    }
  })());
});
