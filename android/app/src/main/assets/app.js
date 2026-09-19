const $ = (id) => document.getElementById(id);
const grid=$("mediaGrid")||$("video-grid")||$("grid"), statusEl=$("status");
const sentinel=$("sentinel")||$("scrollSentinel"), scrollSentinelEl=$("scrollSentinel"), sentinelEl=$("sentinel");
const searchInput=$("searchInput"), searchBtn=$("searchBtn"), clearBtn=$("clearBtn"), suggBox=$("suggestions-box");
const homeView=$("homeView"), watchView=$("watchView"), videoEl=$("videoEl");
const wTitle=$("wTitle"), wChannel=$("wChannel"), wMeta=$("wMeta"), wAvatar=$("wAvatar");
const likeBtn=$("likeBtn"), likeCount=$("likeCount"), dislikeBtn=$("dislikeBtn");
const dlOpenBtn=$("dlOpenBtn"), qualitySel=$("qualitySel"), shareBtn=$("shareBtn"), shareMsg=$("shareMsg");
const relatedEl=$("related");

let dlOverlay, dlSheet, dlClose, dlList, dlStatus, mp3Btn;
try { dlOverlay=$("dlOverlay"); dlSheet=$("dlSheet"); dlClose=$("dlClose"); dlList=$("dlList"); dlStatus=$("dlStatus"); mp3Btn=$("mp3Btn"); } catch(e){}

let currentData=null, currentUrl="", liked=false, disliked=false, likeN=0, lastQuery="";
let currentPage=1, isLoadingMore=false, hasMore=true, feedMode=true, activeFilter="youtube";
let suggestTimer=null, lastSuggestScript=null;

function fmtDur(s){ if(s===null||s===undefined||s==="") return ""; if(typeof s==="string"&&s.includes(":")) return s; s=parseInt(s); if(isNaN(s)) return ""; let m=Math.floor(s/60),sec=s%60,h=Math.floor(m/60); m=m%60; return h?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${m}:${String(sec).padStart(2,"0")}`; }
function fmtViews(n){ if(!n&&n!==0) return ""; n=parseInt(n); if(n>=1e6) return (n/1e6).toFixed(1)+"M views"; if(n>=1e3) return (n/1e3).toFixed(1)+"K views"; return n+" views"; }
function isUrl(s){ return /^https?:\/\//i.test(s.trim()) || /^(www\.|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com)/i.test(s.trim()); }

function getGrid(){ return $("mediaGrid")||$("video-grid")||$("grid")||grid; }
function setSentinelLoading(t){ if(sentinelEl) sentinelEl.innerHTML=t?'<span class="spinner"></span><span>Loading more…</span>':''; if(scrollSentinelEl&&scrollSentinelEl!==sentinelEl) scrollSentinelEl.textContent=t?'Loading…':''; const s=$("sentinel")||$("scrollSentinel"); if(s&&s!==sentinelEl&&s!==scrollSentinelEl) s.textContent=t?'Loading…':''; }
function setSentinelDone(){ const msg=hasMore?'Scroll for more':'No more videos'; if(sentinelEl) sentinelEl.innerHTML=hasMore?'<span style="opacity:.7">↓ '+msg+'</span>':'<span style="opacity:.6">No more videos</span>'; if(scrollSentinelEl&&scrollSentinelEl!==sentinelEl) scrollSentinelEl.textContent=msg; }

// ---- YouTube auto-suggestions via JSONP (no CORS) ----
function fetchYoutubeSuggestions(query){
  return new Promise((resolve)=>{
    query=(query||"").trim();
    if(!query){ resolve([]); return; }
    try{
      if(lastSuggestScript&&lastSuggestScript.parentNode) lastSuggestScript.parentNode.removeChild(lastSuggestScript);
    }catch(e){}
    const cb="handleYtSuggest";
    window[cb]=(data)=>{
      try{
        let out=[];
        if(Array.isArray(data)&&data.length>1&&Array.isArray(data[1])){
          out=data[1].map(it=>Array.isArray(it)?String(it[0]):String(it));
        }
        resolve(out);
      }catch(e){ resolve([]); }
    };
    const s=document.createElement("script");
    s.src="https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&jsonp="+cb+"&q="+encodeURIComponent(query);
    s.onerror=()=>resolve([]);
    lastSuggestScript=s;
    document.body.appendChild(s);
    setTimeout(()=>resolve([]), 4000);
  });
}
function escHtml(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function renderSuggestions(list, q){
  if(!suggBox) return;
  if(!list||!list.length){ suggBox.classList.remove("open"); suggBox.innerHTML=""; return; }
  const ql=(q||"").toLowerCase();
  suggBox.innerHTML="";
  list.slice(0,8).forEach(text=>{
    const div=document.createElement("div");
    div.className="sugg-item";
    let hl=escHtml(text);
    const idx=text.toLowerCase().indexOf(ql);
    if(idx>=0&&q){
      hl=escHtml(text.slice(0,idx))+"<b>"+escHtml(text.slice(idx,idx+q.length))+"</b>"+escHtml(text.slice(idx+q.length));
    }
    div.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg><span>'+hl+'</span>';
    div.onclick=()=>{ searchInput.value=text; hideSuggestions(); doSearch(); };
    suggBox.appendChild(div);
  });
  suggBox.classList.add("open");
}
function hideSuggestions(){ if(suggBox){ suggBox.classList.remove("open"); suggBox.innerHTML=""; } }

if(searchInput){
  searchInput.addEventListener("input",()=>{
    if(clearBtn) clearBtn.classList.toggle("hidden",!searchInput.value);
    const q=searchInput.value.trim();
    clearTimeout(suggestTimer);
    if(!q||isUrl(q)){ hideSuggestions(); return; }
    suggestTimer=setTimeout(async()=>{
      const list=await fetchYoutubeSuggestions(q);
      if(document.activeElement===searchInput) renderSuggestions(list,q);
    },220);
  });
  searchInput.addEventListener("keydown",e=>{ if(e.key==="Enter"){ hideSuggestions(); doSearch(); } });
  searchInput.addEventListener("focus",async()=>{
    const q=searchInput.value.trim();
    if(q&&!isUrl(q)){ const list=await fetchYoutubeSuggestions(q); renderSuggestions(list,q); }
  });
}
if(clearBtn) clearBtn.onclick=()=>{ searchInput.value=""; clearBtn.classList.add("hidden"); hideSuggestions(); searchInput.focus(); };
document.addEventListener("click",(e)=>{
  if(!suggBox) return;
  const box=$("suggestions-box");
  if(box&&!box.classList.contains("open")) return;
  if(e.target===searchInput||e.target===suggBox||(box&&box.contains(e.target))) return;
  const container=document.querySelector(".search-container");
  if(container&&container.contains(e.target)) return;
  hideSuggestions();
});
if(searchBtn) searchBtn.onclick=()=>{ hideSuggestions(); doSearch(); };
const logoBtn=$("logoBtn"); if(logoBtn) logoBtn.onclick=()=>{ try{videoEl.pause();}catch(e){} initFeed(); };
const backBtn=$("backBtn"); if(backBtn) backBtn.onclick=()=>{ try{videoEl.pause();}catch(e){} if(lastQuery&&!isUrl(lastQuery)){watchView.classList.add("hidden");homeView.classList.remove("hidden");} else {initFeed();} };

// ---- Filter chips ----
const FILTER_QUERIES={ youtube:"trending videos", reels:"trending reels", facebook:"trending facebook videos", x:"trending x videos", mp3:"latest music mp3", "4k":"4k uhd videos" };
function initChips(){
  document.querySelectorAll(".chip[data-filter]").forEach(ch=>{
    ch.onclick=async()=>{
      document.querySelectorAll(".chip[data-filter]").forEach(c=>c.classList.remove("active"));
      ch.classList.add("active");
      activeFilter=ch.getAttribute("data-filter")||"youtube";
      const q=ch.getAttribute("data-query")||FILTER_QUERIES[activeFilter]||activeFilter;
      if(searchInput) searchInput.value=q==="trending videos"?"":q;
      if(clearBtn&&searchInput) clearBtn.classList.toggle("hidden",!searchInput.value);
      hideSuggestions();
      feedMode=false; hasMore=false;
      lastQuery=q; if(statusEl) statusEl.textContent="Loading "+activeFilter+"…"; renderSkeleton();
      if(homeView) homeView.classList.remove("hidden"); if(watchView) watchView.classList.add("hidden");
      try{
        const r=await fetch("/api/search?q="+encodeURIComponent(q)+"&max_results=12");
        const j=await r.json(); if(j.detail) throw new Error(j.detail);
        if(statusEl) statusEl.textContent=`${j.results.length} results • ${activeFilter.toUpperCase()}`;
        renderCards(j.results);
      }catch(e){ if(statusEl) statusEl.textContent="Error: "+e.message; }
    };
  });
}

async function doSearch(){
  const q=searchInput.value.trim(); if(!q) return;
  hideSuggestions();
  feedMode=false;hasMore=false;
  lastQuery=q; if(statusEl) statusEl.textContent="Loading…"; renderSkeleton();
  if(watchView) watchView.classList.add("hidden"); if(homeView) homeView.classList.remove("hidden");
  try{
    if(isUrl(q)){
      const d=await(await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:q})})).json();
      if(d.detail) throw new Error(d.detail);
      if(statusEl) statusEl.textContent=d.title||"Loaded";
      renderCards([{title:d.title,url:d.webpage_url||q,thumbnail:d.thumbnail,duration:d.duration,uploader:d.uploader||d.channel}]);
      openWatch(q,d,[]);
    }else{
      const r=await fetch("/api/search?q="+encodeURIComponent(q)+"&max_results=12");
      const j=await r.json(); if(j.detail) throw new Error(j.detail);
      if(statusEl) statusEl.textContent=`${j.results.length} results for “${j.query}”`;
      renderCards(j.results);
    }
  }catch(e){ if(statusEl) statusEl.textContent="Error: "+e.message; }
}


function renderSkeleton(){ const g=getGrid(); if(!g) return; g.innerHTML=''; for(let i=0;i<8;i++){const d=document.createElement('div');d.className='card';d.innerHTML="<div class='skel' style='aspect-ratio:16/9'></div><div class='p'><div class='skel' style='height:12px;margin:8px'></div><div class='skel' style='height:10px;margin:0 8px 8px;width:60%'></div></div>";g.appendChild(d);}}
function renderCards(items){
  const g=getGrid(); if(!g) return;
  g.innerHTML="";
  items.forEach(it=>{
    const div=document.createElement("div"); div.className="card";
    div.innerHTML=`<div><img loading="lazy" src="${it.thumbnail||''}" onerror="this.src='https://i.ytimg.com/vi/placeholder/hqdefault.jpg'"/></div><div class="p"><div class="tt">${(it.title||"Untitled").slice(0,120)}</div><div class="ch">${it.uploader||it.channel||""} • ${fmtDur(it.duration)||""}</div><button class="playbtn">▶ Watch</button></div>`;
    const go=()=>loadAndPlay(it.url);
    div.querySelector("button").onclick=go; div.querySelector("img").onclick=go;
    g.appendChild(div);
  });
}

async function loadAndPlay(url){
  if(statusEl) statusEl.textContent="Extracting streams…";
  try{
    const r=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
    const d=await r.json(); if(d.detail) throw new Error(d.detail);
    let rel=[];
    try{
      const q=(lastQuery&&!isUrl(lastQuery))?lastQuery:(d.title||"").split(" ").slice(0,3).join(" ");
      if(q){ const rr=await fetch("/api/search?q="+encodeURIComponent(q)+"&max_results=8"); const jj=await rr.json(); rel=jj.results||[]; }
    }catch(e){}
    openWatch(url,d,rel.filter(x=>x.url!==url));
  }catch(e){ if(statusEl) statusEl.textContent="Extract failed: "+e.message; alert("Extract failed: "+e.message); }
}

function openWatch(url,d,rel){
  currentData=d; currentUrl=url;
  if(homeView) homeView.classList.add("hidden"); if(watchView) watchView.classList.remove("hidden");
  const playables=(d.playable_streams&&d.playable_streams.length?d.playable_streams:(d.progressive_streams||[]));
  const defUrl=d.default_play_url||(playables[0]&&playables[0].url)||"";
  if(videoEl){ videoEl.src=defUrl||""; videoEl.play().catch(()=>{}); }
  if(wTitle) wTitle.textContent=d.title||"Video";
  const ch=d.channel||d.uploader||"Unknown";
  if(wChannel) wChannel.textContent=ch; if(wAvatar) wAvatar.textContent=(ch[0]||"U").toUpperCase();
  const views=fmtViews(d.view_count); const dur=d.duration_string||fmtDur(d.duration);
  if(wMeta) wMeta.textContent=[views,dur,d.extractor].filter(Boolean).join(" • ");
  liked=false; disliked=false; likeN=parseInt(d.like_count)||0;
  if(likeCount) likeCount.textContent=likeN>0?likeN:"0";
  if(likeBtn) likeBtn.classList.remove("active"); if(dislikeBtn) dislikeBtn.classList.remove("active");
  if(qualitySel){
    qualitySel.innerHTML="";
    if(!playables.length){ const o=document.createElement("option"); o.textContent="No playable stream"; qualitySel.appendChild(o); }
    else{
      [...playables].sort((a,b)=>(b.height||0)-(a.height||0)).forEach(f=>{
        const o=document.createElement("option"); o.value=f.url; o.textContent=`${f.height}p • ${f.ext}`;
        if(f.url===defUrl) o.selected=true;
        qualitySel.appendChild(o);
      });
    }
    qualitySel.onchange=()=>{ if(videoEl){ videoEl.src=qualitySel.value; videoEl.play().catch(()=>{}); } };
  }
  if(relatedEl){
    relatedEl.innerHTML="";
    (rel||[]).forEach(it=>{
      const div=document.createElement("div"); div.className="rel";
      div.innerHTML=`<img src="${it.thumbnail||''}" loading="lazy"/><div style="flex:1;min-width:0"><div class="tt" style="min-height:0">${(it.title||"").slice(0,100)}</div><div class="ch">${it.uploader||it.channel||""}</div></div>`;
      div.onclick=()=>loadAndPlay(it.url);
      relatedEl.appendChild(div);
    });
  }
  window.scrollTo({top:0,behavior:"smooth"});
}

if(likeBtn) likeBtn.onclick=()=>{ liked=!liked; if(liked){disliked=false;if(dislikeBtn)dislikeBtn.classList.remove("active");likeBtn.classList.add("active");if(likeCount)likeCount.textContent=(likeN+1)||"1";} else {likeBtn.classList.remove("active");if(likeCount)likeCount.textContent=likeN||"0";} };
if(dislikeBtn) dislikeBtn.onclick=()=>{ disliked=!disliked; dislikeBtn.classList.toggle("active",disliked); if(disliked){liked=false;if(likeBtn)likeBtn.classList.remove("active");if(likeCount)likeCount.textContent=likeN||"0";} };
if(shareBtn) shareBtn.onclick=async()=>{ try{ await navigator.clipboard.writeText(currentUrl); if(shareMsg){shareMsg.classList.remove("hidden"); setTimeout(()=>shareMsg.classList.add("hidden"),2000);} }catch(e){ prompt("Copy link:",currentUrl);} };

// Download bottom-sheet: ONLY on click
if(dlOpenBtn) dlOpenBtn.onclick=()=>{ buildDlList(); if(dlOverlay) dlOverlay.classList.remove("hidden"); requestAnimationFrame(()=>{ if(dlSheet) dlSheet.classList.remove("sheet-hidden"); }); };
function closeDl(){ if(dlSheet) dlSheet.classList.add("sheet-hidden"); setTimeout(()=>{ if(dlOverlay) dlOverlay.classList.add("hidden"); },250); try{videoEl.play().catch(()=>{});}catch(e){} }
if(dlClose) dlClose.onclick=closeDl; if(dlOverlay) dlOverlay.onclick=(e)=>{ if(e.target===dlOverlay) closeDl(); };

function buildDlList(){
  const d=currentData; if(!d||!dlList) return;
  dlList.innerHTML=""; if(dlStatus) dlStatus.textContent="";
  [2160,1440,1080,720,480,360,144].forEach(h=>{
    const v=(d.video_streams||[]).find(f=>f.height===h)||(d.progressive_streams||[]).find(f=>f.height===h);
    const has=!!v;
    const row=document.createElement("div");
    row.className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm";
    row.innerHTML=`<span class="font-bold w-20">${h===2160?"4K 2160p":h+"p"}</span><span class="text-white/50 text-xs flex-1">${has?(v.ext+" • "+(v.filesize_human||"merged MP4"))+(h>720?" • DASH→MP4":" • playable"):"not available"}</span>`;
    const b=document.createElement("button");
    b.className="rounded-lg px-3 py-1 text-xs font-bold "+(has?"bg-rose-600":"bg-white/10 text-white/30");
    b.textContent=has?"⬇ MP4":"—"; b.disabled=!has;
    if(has) b.onclick=()=>startDownload(h,false);
    row.appendChild(b); dlList.appendChild(row);
  });
  if(mp3Btn) mp3Btn.onclick=()=>startDownload("mp3",true);
}
async function startDownload(q,audioOnly){
  if(dlStatus) dlStatus.textContent="Queuing download…";
  try{
    const r=await fetch("/api/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:currentUrl,quality:String(q),audio_only:audioOnly})});
    const j=await r.json(); if(j.detail) throw new Error(j.detail);
    pollStatus(j.task_id);
  }catch(e){ if(dlStatus) dlStatus.textContent="Download error: "+e.message; }
}
async function pollStatus(taskId){
  const iv=setInterval(async()=>{
    try{
      const r=await fetch("/api/downloads/status/"+taskId); const j=await r.json();
      if(j.status==="done"){clearInterval(iv); if(dlStatus) dlStatus.innerHTML=`✅ Done: ${j.filename} — <a class="underline text-emerald-300" href="/api/downloads/file/${encodeURIComponent(j.filename)}">Save file</a>`;}
      else if(j.status==="error"){clearInterval(iv); if(dlStatus) dlStatus.textContent="❌ Failed: "+(j.error||"unknown");}
      else if(dlStatus) dlStatus.textContent=`⏳ ${j.status} ${j.percent||0}% ${j.filename||""}`;
    }catch(e){clearInterval(iv); if(dlStatus) dlStatus.textContent="Status error: "+e.message;}
  },1500);
}

// ---- Auto-feed + automatic infinite scroll (10 per batch) ----
function skeleton6(){ const g=getGrid(); if(!g) return; g.innerHTML=''; for(let i=0;i<6;i++){const d=document.createElement('div');d.className='card';d.innerHTML="<div class='skel' style='aspect-ratio:16/9'></div><div class='p'><div class='skel' style='height:12px;margin:8px'></div></div>";g.appendChild(d);}}
function appendCards(items){
  const g=getGrid(); if(!g) return;
  items.forEach(it=>{
    const div=document.createElement('div');div.className='card';
    div.innerHTML=`<div><img loading="lazy" src="${it.thumbnail||''}" onerror="this.src='https://i.ytimg.com/vi/placeholder/hqdefault.jpg'"/></div><div class="p"><div class="tt">${(it.title||"Untitled").slice(0,120)}</div><div class="ch">${it.uploader||it.channel||""} • ${fmtDur(it.duration)||""}</div><button class="playbtn">▶ Watch</button></div>`;
    const go=()=>loadAndPlay(it.url);
    div.querySelector('button').onclick=go;div.querySelector('img').onclick=go;
    g.appendChild(div);
  });
}
async function loadFeedPage(){
  if(isLoadingMore||!hasMore) return; isLoadingMore=true;
  setSentinelLoading(true);
  try{
    const r=await fetch(`/api/feed?page=${currentPage}&limit=10`);
    const j=await r.json(); if(j.detail) throw new Error(j.detail);
    const items=j.results||[];
    if(currentPage===1){ const g=getGrid(); if(g) g.innerHTML=''; }
    appendCards(items);
    if(statusEl) statusEl.textContent=`Trending now • page ${currentPage}`;
    if(items.length<10) hasMore=false;
    currentPage++;
  }catch(e){ /* keep hasMore true for retry */ }
  isLoadingMore=false;
  setSentinelDone();
}
let observerSetup=false;
function setupInfiniteScroll(){
  const s1=$("sentinel"), s2=$("scrollSentinel");
  const targets=[s1,s2].filter(Boolean);
  if('IntersectionObserver' in window && targets.length){
    const ob=new IntersectionObserver(es=>{ es.forEach(en=>{ if(en.isIntersecting&&feedMode) loadFeedPage(); }); },{rootMargin:'500px'});
    targets.forEach(t=>{ try{ob.observe(t);}catch(e){} });
    observerSetup=true;
  }
  window.onscroll=()=>{
    if(!feedMode||isLoadingMore||!hasMore) return;
    if((window.innerHeight+window.scrollY)>=document.body.scrollHeight-600) loadFeedPage();
  };
}
function initFeed(){
  feedMode=true;hasMore=true;currentPage=1;isLoadingMore=false;
  if(homeView) homeView.classList.remove('hidden'); if(watchView) watchView.classList.add('hidden');
  skeleton6(); setSentinelLoading(true); loadFeedPage();
  if(!observerSetup) setupInfiniteScroll();
}
document.addEventListener('DOMContentLoaded',()=>{ initChips(); initFeed(); setupInfiniteScroll(); });
window.handleYtSuggest=window.handleYtSuggest||function(){};
