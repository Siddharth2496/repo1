(function(){
  'use strict';
  if(window.__AI_PREP_USER_LIBRARY__) return;
  window.__AI_PREP_USER_LIBRARY__=true;

  var DB_NAME='ai-prep-local-v1';
  var MIGRATION_KEY='userManagedVideoLibraryV1';

  function $(id){return document.getElementById(id);}
  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}

  function openDB(){
    return new Promise(function(resolve,reject){
      var r=indexedDB.open(DB_NAME);
      r.onsuccess=function(){resolve(r.result);};
      r.onerror=function(){reject(r.error);};
    });
  }
  function getOne(db,store,key){
    return new Promise(function(resolve,reject){
      var r=db.transaction(store,'readonly').objectStore(store).get(key);
      r.onsuccess=function(){resolve(r.result);}; r.onerror=function(){reject(r.error);};
    });
  }
  function getAll(db,store){
    return new Promise(function(resolve,reject){
      var r=db.transaction(store,'readonly').objectStore(store).getAll();
      r.onsuccess=function(){resolve(r.result||[]);}; r.onerror=function(){reject(r.error);};
    });
  }
  function putOne(db,store,obj){
    return new Promise(function(resolve,reject){
      var r=db.transaction(store,'readwrite').objectStore(store).put(obj);
      r.onsuccess=function(){resolve(obj);}; r.onerror=function(){reject(r.error);};
    });
  }

  async function migrateToUserManagedLibrary(){
    try{
      var db=await openDB();
      if(!db.objectStoreNames.contains('videos')||!db.objectStoreNames.contains('meta')){db.close();return false;}
      var marker=await getOne(db,'meta',MIGRATION_KEY);
      if(marker&&marker.value===true){db.close();return false;}
      var videos=await getAll(db,'videos');
      var remove=videos.filter(function(v){return v.builtin!==false;});
      await new Promise(function(resolve,reject){
        var tx=db.transaction(['videos','meta'],'readwrite');
        var vs=tx.objectStore('videos'), ms=tx.objectStore('meta');
        remove.forEach(function(v){vs.delete(v.id);});
        ms.put({key:MIGRATION_KEY,value:true,migratedAt:new Date().toISOString(),removedBuiltinVideos:remove.length});
        tx.oncomplete=resolve; tx.onerror=function(){reject(tx.error);};
      });
      db.close();
      if(remove.length){
        sessionStorage.setItem('ai-prep-library-migrated','1');
        setTimeout(function(){location.reload();},120);
        return true;
      }
    }catch(e){console.warn('AI Prep video-library migration:',e);}
    return false;
  }

  function sourceOptions(){
    return '<option value="YouTube">YouTube</option><option value="Udemy">Udemy</option><option value="Coursera">Coursera</option><option value="Other">Other</option>';
  }

  function addStyle(){
    if($('userLibraryStyle'))return;
    var s=document.createElement('style');s.id='userLibraryStyle';
    s.textContent='.resource-source-field{margin-top:2px}.resource-source-pill{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:#eef6f4;color:#4d827b;font-size:10px;font-weight:800;margin-left:5px}.user-library-note{margin:0 0 14px;padding:11px 12px;border:1px solid #eadfd5;background:linear-gradient(145deg,#fffaf6,#f4faf8);border-radius:14px;color:#7d766f;font-size:12px;line-height:1.45}.user-library-note strong{color:#172033}';
    document.head.appendChild(s);
  }

  function inferSource(url){
    url=String(url||'').toLowerCase();
    if(url.indexOf('youtube.com')>=0||url.indexOf('youtu.be')>=0)return 'YouTube';
    if(url.indexOf('udemy.com')>=0)return 'Udemy';
    if(url.indexOf('coursera.org')>=0)return 'Coursera';
    return null;
  }

  function ensureSourceFields(){
    var single=$('resource-single');
    if(single&&!$('resSource')){
      var title=q('#resPlaylist',single);
      if(title&&title.closest('label')){
        var old=title.closest('label').querySelector('span'); if(old)old.textContent='Course / playlist name (optional)';
        var lab=document.createElement('label');lab.className='field resource-source-field';lab.innerHTML='<span>Source</span><select id="resSource">'+sourceOptions()+'</select>';
        title.closest('label').after(lab);
      }
      var url=$('resUrl'); if(url)url.addEventListener('input',function(){var x=inferSource(url.value);if(x&&$('resSource'))$('resSource').value=x;});
      if(!q('.user-library-note',single)){
        var note=document.createElement('div');note.className='user-library-note';note.innerHTML='<strong>Your video library starts empty.</strong> Add only the videos you actually watch, then log them normally.';
        single.prepend(note);
      }
    }
    var playlist=$('resource-playlist');
    if(playlist&&!$('playlistSource')){
      var pName=$('playlistName');
      if(pName&&pName.closest('label')){
        var lab2=document.createElement('label');lab2.className='field resource-source-field';lab2.innerHTML='<span>Source</span><select id="playlistSource">'+sourceOptions()+'</select>';
        pName.closest('label').after(lab2);
      }
      var pUrl=$('playlistUrl'); if(pUrl)pUrl.addEventListener('input',function(){var x=inferSource(pUrl.value);if(x&&$('playlistSource'))$('playlistSource').value=x;});
    }
  }

  function idTime(id){var m=String(id||'').match(/CUS-(\d+)/);return m?Number(m[1]):0;}

  async function annotateNewestSingle(snapshot){
    if(!snapshot.title)return;
    try{
      var db=await openDB(), all=await getAll(db,'videos');
      var rows=all.filter(function(v){return v.builtin===false&&v.title===snapshot.title&&(v.playlist||'Custom resource')===snapshot.playlist;}).sort(function(a,b){return idTime(b.id)-idTime(a.id);});
      if(rows.length){var v=rows[0];v.sourcePlatform=snapshot.source;v.creator=snapshot.source;await putOne(db,'videos',v);}
      db.close(); decorateCustomResources();
    }catch(e){console.warn('Could not save video source',e);}
  }

  async function annotatePlaylist(snapshot){
    if(!snapshot.name)return;
    try{
      var db=await openDB(), all=await getAll(db,'videos');
      var rows=all.filter(function(v){return v.builtin===false&&v.playlist===snapshot.name&&(!v.sourcePlatform||v.sourcePlatform==='');});
      for(var i=0;i<rows.length;i++){rows[i].sourcePlatform=snapshot.source;rows[i].creator=snapshot.source;await putOne(db,'videos',rows[i]);}
      db.close(); decorateCustomResources();
    }catch(e){console.warn('Could not save playlist source',e);}
  }

  function hookAddButtons(){
    var b=$('addSingleResourceBtn');
    if(b&&!b.dataset.sourceHook){
      b.dataset.sourceHook='1';
      b.addEventListener('click',function(){
        var snap={title:($('resTitle')&&$('resTitle').value||'').trim(),playlist:(($('resPlaylist')&&$('resPlaylist').value||'').trim()||'Custom resource'),source:($('resSource')&&$('resSource').value)||'Other'};
        setTimeout(function(){annotateNewestSingle(snap);},500);
      },true);
    }
    var pb=$('addPlaylistBtn');
    if(pb&&!pb.dataset.sourceHook){
      pb.dataset.sourceHook='1';
      pb.addEventListener('click',function(){
        var snap={name:($('playlistName')&&$('playlistName').value||'').trim(),source:($('playlistSource')&&$('playlistSource').value)||'Other'};
        setTimeout(function(){annotatePlaylist(snap);},650);
      },true);
    }
  }

  async function decorateCustomResources(){
    var root=$('customResourceList'); if(!root)return;
    try{
      var db=await openDB(), all=await getAll(db,'videos');db.close();
      var custom=all.filter(function(v){return v.builtin===false;});
      qa('.custom-resource',root).forEach(function(card){
        var title=q('.select-title',card),meta=q('.select-meta',card);if(!title||!meta)return;
        var name=(title.textContent||'').trim();var v=custom.find(function(x){return x.title===name;});if(!v||!v.sourcePlatform)return;
        if(!q('.resource-source-pill',meta)){var p=document.createElement('span');p.className='resource-source-pill';p.textContent=v.sourcePlatform;meta.appendChild(p);}
      });
    }catch(e){}
  }

  async function boot(){
    addStyle();
    var migrated=await migrateToUserManagedLibrary();
    if(migrated)return;
    var tries=0,t=setInterval(function(){
      tries++;ensureSourceFields();hookAddButtons();decorateCustomResources();
      if(($('resSource')&&$('addSingleResourceBtn'))||tries>80)clearInterval(t);
    },250);
    setInterval(function(){if($('resourceModal')&&!$('resourceModal').classList.contains('hidden')){ensureSourceFields();hookAddButtons();decorateCustomResources();}},1200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
