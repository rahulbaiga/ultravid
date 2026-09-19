const $ = (id) => document.getElementById(id);
const grid=$("mediaGrid")||$("grid"), statusEl=$("status"), sentinel=$("scrollSentinel"), searchInput=$("searchInput"), searchBtn=$("searchBtn"), clearBtn=$("clearBtn");
const homeView=$("homeView"), watchView=$("watchView"), videoEl=$("videoEl");
const wTitle=$("wTitle"), wChannel=$("wChannel"), wMeta=$("wMeta"), wAvatar=$("wAvatar");
const likeBtn=$("likeBtn"), likeCount=$("likeCount"), dislikeBtn=$("dislikeBtn");
const dlOpenBtn=$("dlOpenBtn"), qualitySel=$("qualitySel"), shareBtn=$("shareBtn"), shareMsg=$("shareMsg");
const relatedEl=$("related");
const dlOverlay=$("dlOverlay"), dlSheet=$("dlSheet"), dlClose=$("dlClose"), dlList=$("dlList"), dlStatus=$("dlStatus"), mp3Btn=$("mp3Btn");

let currentData=null, currentUrl="", liked=false, disliked=false, likeN=0, lastQuery="";
let currentPage=1, isLoadingMore=false, hasMore=true, feedMode=true;

function fmtDur(s){ if(s===null||s===undefined||s==="") return ""; if(typeof s==="string"&&s.includes(":")) return s; s=parseInt(s); if(isNaN(s)) return ""; let m=Math.floor(s/60),sec=s%60,h=Math.floor(m/60); m=m%60; return h?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${m}:${String(sec).padStart(2,"0")}`; }
function fmtViews(n){ if(!n&&n!==0) return ""; n=parseInt(n); if(n>=1e6) return (n/1e6).toFixed(1)+"M views"; if(n>=1e3) return (n/1e3).toFixed(1)+"K views"; return n+" views"; }
function isUrl(s){ return /^https?:\/\//i.test(s.trim()) || /^(www\.|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com)/i.test(s.trim()); }

$("logoBtn").onclick=()=>{ videoEl.pause(); initFeed(); };
$("backBtn").onclick=()=>{ videoEl.pause(); if(lastQuery&&!isUrl(lastQuery)){watchView.classList.add("hidden");homeView.classList.remove("hidden");} else {initFeed();} };
searchInput.addEventListener("input",()=>clearBtn.classList.toggle("hidden",!searchInput.value));
clearBtn.onclick=()=>{searchInput.value="";clearBtn.classList.add("hidden");};
searchInput.addEventListener("keydown",e=>{if(e.key==="Enter")doSearch();});
searchBtn.onclick=doSearch;

async function doSearch(){
  const q=searchInput.value.trim(); if(!q) return;
  feedMode=false;hasMore=false;
  lastQuery=q; statusEl.textContent="Loading…"; renderSkeleton();
  watchView.classList.add("hidden"); homeView.classList.remove("hidden");
  try{
    if(isUrl(q)){
      const d=await(await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:q})})).json();
      if(d.detail) throw new Error(d.detail);
      statusEl.textContent=d.title||"Loaded";
      renderCards([{title:d.title,url:d.webpage_url||q,thumbnail:d.thumbnail,duration:d.duration,uploader:d.uploader||d.channel}]);
      openWatch(q,d,[]);
    }else{
      const r=await fetch("/api/search?q="+encodeURIComponent(q)+"&max_results=12");
      const j=await r.json(); if(j.detail) throw new Error(j.detail);
      statusEl.textContent=`${j.results.length} results for “${j.query}”`;
      renderCards(j.results);
    }
  }catch(e){statusEl.textContent="Error: "+e.message;}
}


function renderSkeleton(){grid.innerHTML='';for(let i=0;i<8;i++){const d=document.createElement('div');d.className='card';d.innerHTML="<div class='skel' style='aspect-ratio:16/9'></div><div class='p'><div class='skel' style='height:12px;margin:8px'></div><div class='skel' style='height:10px;margin:0 8px 8px;width:60%'></div></div>";grid.appendChild(d);}}
function renderCards(items){
  grid.innerHTML="";
  items.forEach(it=>{
    const div=document.createElement("div"); div.className="card";
    div.innerHTML=`<div><img loading="lazy" src="${it.thumbnail||''}" onerror="this.src='https://i.ytimg.com/vi/placeholder/hqdefault.jpg'"/></div><div class="p"><div class="tt">${(it.title||"Untitled").slice(0,120)}</div><div class="ch">${it.uploader||it.channel||""} • ${fmtDur(it.duration)||""}</div><button class="playbtn">▶ Watch</button></div>`;
    const go=()=>loadAndPlay(it.url);
    div.querySelector("button").onclick=go; div.querySelector("img").onclick=go;
    grid.appendChild(div);
  });
}

async function loadAndPlay(url){
  statusEl.textContent="Extracting streams…";
  try{
    const r=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
    const d=await r.json(); if(d.detail) throw new Error(d.detail);
    // fetch related using last query or title
    let rel=[];
    try{
      const q=(lastQuery&&!isUrl(lastQuery))?lastQuery:(d.title||"").split(" ").slice(0,3).join(" ");
      if(q){ const rr=await fetch("/api/search?q="+encodeURIComponent(q)+"&max_results=8"); const jj=await rr.json(); rel=jj.results||[]; }
    }catch(e){}
    openWatch(url,d,rel.filter(x=>x.url!==url));
  }catch(e){statusEl.textContent="Extract failed: "+e.message; alert("Extract failed: "+e.message);}
}

function openWatch(url,d,rel){
  currentData=d; currentUrl=url;
  homeView.classList.add("hidden"); watchView.classList.remove("hidden");
  // Player -> default progressive with sound
  const playables=(d.playable_streams&&d.playable_streams.length?d.playable_streams:(d.progressive_streams||[]));
  const defUrl=d.default_play_url||(playables[0]&&playables[0].url)||"";
  videoEl.src=defUrl||"";
  videoEl.play().catch(()=>{});
  // Title / channel
  wTitle.textContent=d.title||"Video";
  const ch=d.channel||d.uploader||"Unknown";
  wChannel.textContent=ch; wAvatar.textContent=(ch[0]||"U").toUpperCase();
  const views=fmtViews(d.view_count); const dur=d.duration_string||fmtDur(d.duration);
  wMeta.textContent=[views,dur,d.extractor].filter(Boolean).join(" • ");
  // Like/dislike reset
  liked=false; disliked=false; likeN=parseInt(d.like_count)||0;
  likeCount.textContent=likeN>0?likeN:"0";
  likeBtn.classList.remove("active"); dislikeBtn.classList.remove("active");
  // Quality dropdown: playable only
  qualitySel.innerHTML="";
  if(!playables.length){ const o=document.createElement("option"); o.textContent="No playable stream"; qualitySel.appendChild(o); }
  else{
    [...playables].sort((a,b)=>(b.height||0)-(a.height||0)).forEach(f=>{
      const o=document.createElement("option"); o.value=f.url; o.textContent=`${f.height}p • ${f.ext}`;
      if(f.url===defUrl) o.selected=true;
      qualitySel.appendChild(o);
    });
  }
  qualitySel.onchange=()=>{ videoEl.src=qualitySel.value; videoEl.play().catch(()=>{}); };
  // Related
  relatedEl.innerHTML="";
  (rel||[]).forEach(it=>{
    const div=document.createElement("div"); div.className="rel";
    div.innerHTML=`<img src="${it.thumbnail||''}" loading="lazy"/><div style="flex:1;min-width:0"><div class="tt" style="min-height:0">${(it.title||"").slice(0,100)}</div><div class="ch">${it.uploader||it.channel||""}</div></div>`;
    div.onclick=()=>loadAndPlay(it.url);
    relatedEl.appendChild(div);
  });
  window.scrollTo({top:0,behavior:"smooth"});
}

likeBtn.onclick=()=>{ liked=!liked; if(liked){disliked=false;dislikeBtn.classList.remove("active");likeBtn.classList.add("active");likeCount.textContent=(likeN+1)||"1";} else {likeBtn.classList.remove("active");likeCount.textContent=likeN||"0";} };
dislikeBtn.onclick=()=>{ disliked=!disliked; dislikeBtn.classList.toggle("active",disliked); if(disliked){liked=false;likeBtn.classList.remove("active");likeCount.textContent=likeN||"0";} };
shareBtn.onclick=async()=>{ try{ await navigator.clipboard.writeText(currentUrl); shareMsg.classList.remove("hidden"); setTimeout(()=>shareMsg.classList.add("hidden"),2000);}catch(e){ prompt("Copy link:",currentUrl);} };

// Download bottom-sheet: ONLY on click
dlOpenBtn.onclick=()=>{ buildDlList(); dlOverlay.classList.remove("hidden"); requestAnimationFrame(()=>dlSheet.classList.remove("sheet-hidden")); };
function closeDl(){ dlSheet.classList.add("sheet-hidden"); setTimeout(()=>dlOverlay.classList.add("hidden"),250); videoEl.play().catch(()=>{}); }
dlClose.onclick=closeDl; dlOverlay.onclick=(e)=>{ if(e.target===dlOverlay) closeDl(); };

function buildDlList(){
  const d=currentData; if(!d) return;
  dlList.innerHTML=""; dlStatus.textContent="";
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
  mp3Btn.onclick=()=>startDownload("mp3",true);
}
async function startDownload(q,audioOnly){
  dlStatus.textContent="Queuing download…";
  try{
    const r=await fetch("/api/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:currentUrl,quality:String(q),audio_only:audioOnly})});
    const j=await r.json(); if(j.detail) throw new Error(j.detail);
    pollStatus(j.task_id);
  }catch(e){dlStatus.textContent="Download error: "+e.message;}
}
async function pollStatus(taskId){
  const iv=setInterval(async()=>{
    try{
      const r=await fetch("/api/downloads/status/"+taskId); const j=await r.json();
      if(j.status==="done"){clearInterval(iv); dlStatus.innerHTML=`✅ Done: ${j.filename} — <a class="underline text-emerald-300" href="/api/downloads/file/${encodeURIComponent(j.filename)}">Save file</a>`;}
      else if(j.status==="error"){clearInterval(iv); dlStatus.textContent="❌ Failed: "+(j.error||"unknown");}
      else dlStatus.textContent=`⏳ ${j.status} ${j.percent||0}% ${j.filename||""}`;
    }catch(e){clearInterval(iv); dlStatus.textContent="Status error: "+e.message;}
  },1500);
}

// ---- Auto-feed + infinite scroll (10 per batch) ----
function skeleton6(){grid.innerHTML='';for(let i=0;i<6;i++){const d=document.createElement('div');d.className='card';d.innerHTML="<div class='skel' style='aspect-ratio:16/9'></div><div class='p'><div class='skel' style='height:12px;margin:8px'></div></div>";grid.appendChild(d);}}
function appendCards(items){
  items.forEach(it=>{
    const div=document.createElement('div');div.className='card';
    div.innerHTML=`<div><img loading="lazy" src="${it.thumbnail||''}" onerror="this.src='https://i.ytimg.com/vi/placeholder/hqdefault.jpg'"/></div><div class="p"><div class="tt">${(it.title||"Untitled").slice(0,120)}</div><div class="ch">${it.uploader||it.channel||""} • ${fmtDur(it.duration)||""}</div><button class="playbtn">▶ Watch</button></div>`;
    const go=()=>loadAndPlay(it.url);
    div.querySelector('button').onclick=go;div.querySelector('img').onclick=go;
    grid.appendChild(div);
  });
}
async function loadFeedPage(){
  if(isLoadingMore||!hasMore)return;isLoadingMore=true;
  if(sentinel)sentinel.textContent='Loading…';
  try{
    const r=await fetch(`/api/feed?page=${currentPage}&limit=10`);
    const j=await r.json();if(j.detail)throw new Error(j.detail);
    const items=j.results||[];
    if(currentPage===1)grid.innerHTML='';
    appendCards(items);
    statusEl.textContent=`Trending now • page ${currentPage}`;
    if(items.length<10)hasMore=false;
    currentPage++;
  }catch(e){if(sentinel)sentinel.textContent='Scroll for more';}
  isLoadingMore=false;
  if(sentinel)sentinel.textContent=hasMore?'Scroll for more':'No more videos';
}
function initFeed(){
  feedMode=true;hasMore=true;currentPage=1;isLoadingMore=false;
  homeView.classList.remove('hidden');watchView.classList.add('hidden');
  skeleton6();loadFeedPage();
  if('IntersectionObserver' in window&&sentinel){
    const ob=new IntersectionObserver(es=>{es.forEach(en=>{if(en.isIntersecting&&feedMode)loadFeedPage();});},{rootMargin:'400px'});
    ob.observe(sentinel);
  }else{
    window.onscroll=()=>{if(!feedMode||isLoadingMore||!hasMore)return;if((window.innerHeight+window.scrollY)>=document.body.scrollHeight-600)loadFeedPage();};
  }
}
document.addEventListener('DOMContentLoaded',initFeed);
