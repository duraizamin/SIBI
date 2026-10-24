const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message){const el=$("toast");if(!el)return;el.textContent=message;el.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove("show"),4500)}
async function api(url,options={}){const method=(options.method||"GET").toUpperCase(),headers={...(options.headers||{})};if(method!=="GET"&&!headers["Content-Type"])headers["Content-Type"]="application/json";const finalUrl=method==="GET"?`${url}${url.includes("?")?"&":"?"}_=${Date.now()}`:url;let r;try{r=await fetch(finalUrl,{credentials:"same-origin",cache:"no-store",...options,headers})}catch(e){throw Error("Could not connect to the Sibi Sports Club server.")}const d=await r.json().catch(()=>({error:"Unexpected server response."}));if(!r.ok)throw Error(d.error||"Request failed");return d}
if($("year"))$("year").textContent=new Date().getFullYear();
const exploreTrigger=$("exploreSibiOpen"),exploreModal=$("exploreVideoModal"),exploreVideo=$("exploreVideo"),exploreClose=$("exploreVideoClose");
if(exploreTrigger&&exploreModal&&exploreVideo&&exploreClose){
 const closeExploreVideo=()=>{exploreModal.classList.remove("is-open");exploreModal.setAttribute("aria-hidden","true");document.body.classList.remove("video-modal-open");exploreVideo.pause();exploreVideo.currentTime=0;exploreTrigger.focus()};
 exploreTrigger.addEventListener("click",()=>{exploreModal.classList.add("is-open");exploreModal.setAttribute("aria-hidden","false");document.body.classList.add("video-modal-open");exploreVideo.play().catch(()=>{});exploreClose.focus()});
 exploreClose.addEventListener("click",closeExploreVideo);
 exploreModal.querySelector(".explore-video-backdrop")?.addEventListener("click",closeExploreVideo);
 document.addEventListener("keydown",event=>{if(event.key==="Escape"&&exploreModal.classList.contains("is-open"))closeExploreVideo()});
}
if($("mobileToggle"))$("mobileToggle").onclick=()=>$("navLinks").classList.toggle("open");document.querySelectorAll("#navLinks a").forEach(a=>a.onclick=()=>$("navLinks").classList.remove("open"));

async function loadTrainers(){try{const d=await api("/api/trainers"),list=d.trainers||[];$("trainerList").innerHTML=list.length?list.map((t,i)=>`<article class="card trainer-card" style="--trainer-delay:${i*90}ms"><div class="trainer-top"><div class="trainer-avatar">${t.photo_url?`<img src="${esc(t.photo_url)}" alt="">`:esc(String(t.name||"").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase())}</div><div><h3>${esc(t.name)}</h3><small>${esc(t.specialty)}</small></div></div><div class="trainer-meta">${Number(t.experience_years)}+ years experience</div><p>${esc(t.bio)}</p><p class="small">${esc(t.certifications||"Sibi Sports Club coaching team")}</p></article>`).join(""):`<article class="card"><p>Trainer profiles are being updated.</p></article>`;requestAnimationFrame(()=>document.querySelectorAll(".trainer-card").forEach((el,i)=>setTimeout(()=>el.classList.add("trainer-visible"),i*90)))}catch(e){$("trainerList").innerHTML=`<article class="card"><p>Could not load trainer profiles. Please try again.</p></article>`}}
if($("trainerList"))loadTrainers();

const reviewData=[
{name:"Vishwa",text:"Quality equipment best gym in snk 💖",age:"2 weeks ago"},
{name:"Vinith Martin",text:"Low fees. High quality trainers, air-conditioned gym, well-equipped machines, peaceful environment.",age:"3 weeks ago"},
{name:"Esakki Duke",text:"Nice gym and high quality equipment at an affordable price. The 5 to 10 pm timing was very helpful for an office worker.",age:"3 weeks ago"},
{name:"Sheik Noor",text:"Friendly owners, nice ambience, knowledgeable trainers, clean restroom. Overall, a nice experience.",age:"3 weeks ago"},
{name:"Kalaimahal Muthuramalingam",text:"Beautiful gym, lowest price. To achieve the goal physique and enhance the power… best gym in Sankarankovil.",age:"4 weeks ago"},
{name:"Priya Ramesh",text:"Nice environment… Very well coached for every individual.",age:"4 weeks ago"},
{name:"Kabil Kavi",text:"Premium cardio section. Fully air-conditioned gym with cool surroundings.",age:"4 weeks ago"}
];
let reviewPage=0;
function renderReviews(){
 const grid=$("reviewsScroll");if(!grid)return;
 const pageSize=3,totalPages=Math.ceil(reviewData.length/pageSize),start=reviewPage*pageSize;
 grid.innerHTML=reviewData.slice(start,start+pageSize).map((r,i)=>`<article class="review-card"><div class="review-card-top"><span class="stars" aria-label="5 out of 5 stars">★★★★★</span><span class="review-number">${esc(r.age)}</span></div><h3>${esc(r.name)}</h3><p>${esc(r.text)}</p><div class="review-card-footer"><span class="review-mark">${esc(r.name.trim()[0]?.toUpperCase()||"S")}</span><span>Customer review · Sibi Sports Club</span></div></article>`).join("");
 const status=$("reviewsPageStatus");if(status)status.textContent=`Page ${reviewPage+1} of ${totalPages} · ${reviewData.length} reviews`;
 const prev=$("reviewsPrev"),next=$("reviewsNext");if(prev)prev.disabled=reviewPage===0;if(next)next.disabled=reviewPage>=totalPages-1;
 const dots=$("reviewsPageDots");if(dots)dots.innerHTML=Array.from({length:totalPages},(_,i)=>`<button type="button" class="reviews-page-dot${i===reviewPage?' active':''}" data-review-page="${i}" aria-label="Go to review page ${i+1}" aria-current="${i===reviewPage?'page':'false'}"></button>`).join("");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",renderReviews);else renderReviews();
$("reviewsPrev")?.addEventListener("click",()=>{reviewPage=Math.max(0,reviewPage-1);renderReviews()});
$("reviewsNext")?.addEventListener("click",()=>{reviewPage=Math.min(Math.ceil(reviewData.length/3)-1,reviewPage+1);renderReviews()});
$("reviewsPageDots")?.addEventListener("click",e=>{const b=e.target.closest('[data-review-page]');if(!b)return;reviewPage=Number(b.dataset.reviewPage)||0;renderReviews()});

function initServiceMarquee(){const track=$("servicesScroll");if(!track||track.dataset.ready)return;track.dataset.ready="1";const originals=[...track.children];originals.forEach(n=>track.appendChild(n.cloneNode(true)));let half=0,paused=false,last=performance.now();const measure=()=>{half=track.scrollWidth/2;if(track.scrollLeft>=half)track.scrollLeft=0};window.addEventListener("resize",measure,{passive:true});track.addEventListener("pointerenter",()=>paused=true);track.addEventListener("pointerleave",()=>paused=false);track.addEventListener("touchstart",()=>paused=true,{passive:true});track.addEventListener("touchend",()=>setTimeout(()=>paused=false,800),{passive:true});requestAnimationFrame(measure);const tick=now=>{const dt=Math.min(40,now-last);last=now;if(!paused&&half>0){track.scrollLeft+=0.025*dt;if(track.scrollLeft>=half)track.scrollLeft-=half}requestAnimationFrame(tick)};requestAnimationFrame(tick)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initServiceMarquee);else initServiceMarquee();

function setupPackageLinks(){document.querySelectorAll(".package-open").forEach(el=>el.addEventListener("click",e=>{const packageName=el.dataset.package||"Membership enquiry";if(!el.getAttribute("href")?.startsWith("#")){e.preventDefault();location.hash="contact"}const message=$("cMessage");const topic=$("cTopic");if(message)message.value=`I am interested in ${packageName}. Please share the details and help me choose the right package.`;if(topic)topic.value=packageName.toLowerCase().includes("cardio")?"Cardio":packageName.toLowerCase().includes("personal")?"Personal training":"Membership enquiry";setTimeout(()=>$("cName")?.focus(),350)}))}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setupPackageLinks);else setupPackageLinks();

if($("contactForm"))$("contactForm").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,btn=form.querySelector("button[type=submit]"),status=$("contactStatus"),original=btn.textContent;btn.disabled=true;btn.textContent="Sending…";if(status)status.textContent="";try{const data=Object.fromEntries(new FormData(form).entries());await api("/api/enquiries",{method:"POST",body:JSON.stringify(data)});if(status)status.textContent="We will get back soon.";toast("Enquiry sent successfully.");form.reset()}catch(err){if(status)status.textContent=err.message;toast(err.message)}finally{btn.disabled=false;btn.textContent=original}};
