(() => {
"use strict";
const LAYOUTS={
 drop_first:{name:"Drop first",defaultTheme:"mono",sections:["nav","ticker","hero_center","countdown","categories","rail","shop_the_look","trust_row","newsletter","footer"]},
 editorial_lookbook:{name:"Editorial lookbook",defaultTheme:"mono",sections:["nav","hero_split","ticker","rail","lookbook","story","newsletter","footer"]},
 shop_first:{name:"Shop first",defaultTheme:"mono",sections:["nav","ticker","categories","rail","all_pieces_grid","worn_by_you","trust_row","footer"]},
 night_drop:{name:"Night drop",defaultTheme:"night",sections:["nav","hero_full","countdown","rail","drop_archive","shop_the_look","newsletter","footer"]},
 story_led:{name:"Story led",defaultTheme:"earth",sections:["nav","hero_center","story","rail","shop_the_look","worn_by_you","trust_row","footer"]}
};
const THEMES={
 mono:{"--color-bg":"#FFFFFF","--color-text":"#111111","--color-muted":"#8A8A8A","--color-accent":"#111111","--color-on-accent":"#FFFFFF","--color-tile-a":"#EDEDED","--color-on-tile-a":"#111111","--color-tile-b":"#D4D4D4","--color-on-tile-b":"#111111"},
 night:{"--color-bg":"#0D0D0F","--color-text":"#F5F5F5","--color-muted":"#8B8B93","--color-accent":"#C6FF3D","--color-on-accent":"#0D0D0F","--color-tile-a":"#1E1E22","--color-on-tile-a":"#F5F5F5","--color-tile-b":"#2E2E35","--color-on-tile-b":"#F5F5F5"},
 earth:{"--color-bg":"#F5EFE6","--color-text":"#3B2F26","--color-muted":"#8A7866","--color-accent":"#A0643A","--color-on-accent":"#FFFFFF","--color-tile-a":"#D9C7AE","--color-on-tile-a":"#3B2F26","--color-tile-b":"#6B7A5A","--color-on-tile-b":"#F5EFE6"},
 pastel:{"--color-bg":"#FFF8FA","--color-text":"#382C36","--color-muted":"#8E7D89","--color-accent":"#D66B91","--color-on-accent":"#FFFFFF","--color-tile-a":"#F4DDE7","--color-on-tile-a":"#382C36","--color-tile-b":"#DDE8F5","--color-on-tile-b":"#382C36"},
 ocean:{"--color-bg":"#F4F7FB","--color-text":"#14263D","--color-muted":"#718198","--color-accent":"#1D4F91","--color-on-accent":"#FFFFFF","--color-tile-a":"#DCE7F2","--color-on-tile-a":"#14263D","--color-tile-b":"#AFC5DB","--color-on-tile-b":"#14263D"},
 forest:{"--color-bg":"#F3F2EA","--color-text":"#1E3027","--color-muted":"#78857A","--color-accent":"#245A40","--color-on-accent":"#FFFFFF","--color-tile-a":"#DCE4D8","--color-on-tile-a":"#1E3027","--color-tile-b":"#B5C7B4","--color-on-tile-b":"#1E3027"},
 sunset:{"--color-bg":"#FFF7F0","--color-text":"#352522","--color-muted":"#96796D","--color-accent":"#D95435","--color-on-accent":"#FFFFFF","--color-tile-a":"#F7D9C7","--color-on-tile-a":"#352522","--color-tile-b":"#E8B7A8","--color-on-tile-b":"#352522"}
};
const allSections=["nav","ticker","hero_center","hero_split","hero_full","countdown","categories","rail","shop_the_look","trust_row","newsletter","footer","lookbook","story","drop_archive","worn_by_you","all_pieces_grid"];
const qs=new URLSearchParams(location.search);
const validLayout=id=>LAYOUTS[id]?id:"drop_first";
function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function section(id,title,desc){const e=make("section","layout-section layout-"+id);e.dataset.layoutSection=id;e.innerHTML='<div class="layout-section-inner"><p class="layout-kicker">MONOWEAR / '+title.toUpperCase()+'</p><h2>'+title+'</h2><p>'+desc+'</p></div>';return e}
function buildNew(id){
 if(id==="countdown"){const e=section(id,"HIOTW DROP LIVE IN","");e.innerHTML='<div class="layout-countdown-copy"><strong data-countdown-label>HIOTW DROP LIVE IN</strong><span id="layoutCountdown">Loading countdown…</span></div><a class="layout-button" href="#newsletter">Early access ↗</a>';return e}
 if(id==="categories"){const e=section(id,"Shop by category","Find your next everyday piece.");const g=make("div","layout-category-grid");["Caps","Tees","Hoodies","Bottoms"].forEach((x,i)=>{const a=make("a","layout-category-tile",x);a.href="#shop";a.dataset.tile=i%2?"b":"a";g.append(a)});e.querySelector(".layout-section-inner").append(g);return e}
 if(id==="shop_the_look"){const e=section(id,"Shop the look","Outfits built around the pieces you wear most.");const g=make("div","layout-look-grid");["Everyday uniform","After hours","The essentials"].forEach((x,i)=>{const c=make("article","layout-look-card");c.dataset.tile=i%2?"b":"a";c.innerHTML='<div class="layout-placeholder-photo" role="img" aria-label="'+x+' outfit placeholder"></div><h3>'+x+'</h3><p>Build the look with MONOWEAR pieces.</p><button type="button" class="layout-button layout-add-look">Explore pieces ↗</button>';c.querySelector("button").addEventListener("click",()=>location.hash="#shop");g.append(c)});e.querySelector(".layout-section-inner").append(g);return e}
 if(id==="trust_row"){const e=section(id,"Made to move with you","");const g=make("div","layout-trust-grid");[["Delivery","5–10 days","/policies.html"],["Secure payment","Paystack checkout","/policies.html"],["Returns","Read our policy","/policies.html"],["Track order","Follow your order","/track.html"]].forEach((x,i)=>{const a=make("a","layout-trust-item");a.href=x[2];a.dataset.tile=i%2?"b":"a";a.innerHTML="<strong>"+x[0]+"</strong><span>"+x[1]+"</span>";g.append(a)});e.querySelector(".layout-section-inner").append(g);return e}
 if(id==="lookbook"){const e=section(id,"The lookbook","MONOWEAR in motion.");const g=make("div","layout-lookbook-grid");["Movement","In between","Independent","Everyday","The details","Keep going"].forEach((x,i)=>{const c=make("div","layout-lookbook-tile",x);c.dataset.tile=i%2?"b":"a";g.append(c)});e.querySelector(".layout-section-inner").append(g);return e}
 if(id==="drop_archive"){const e=section(id,"Drop archive","Past chapters and what comes next.");const g=make("div","layout-archive-grid");["HELP IS ON THE WAY","MONO ORIGINALS","MONO ARCHIVES","NEXT CHAPTER"].forEach((x,i)=>{const c=make("article","layout-archive-card");c.dataset.tile=i%2?"b":"a";c.innerHTML="<h3>"+x+"</h3><p>"+(i===3?"Live soon":"Archive")+"</p>";g.append(c)});e.querySelector(".layout-section-inner").append(g);return e}
 if(id==="worn_by_you"){const e=section(id,"Worn by you","Tag @monowear44 to be featured.");const g=make("div","layout-worn-grid");for(let i=0;i<6;i++){const c=make("div","layout-worn-tile");c.dataset.tile=i%2?"b":"a";c.innerHTML='<span>@monowear44</span>';g.append(c)}e.querySelector(".layout-section-inner").append(g);return e}
 if(id==="hero_split"||id==="hero_full"){const e=section(id,"HELP IS ON THE WAY","A distressed collection about pressure, persistence and finding a way through.");e.innerHTML='<div class="layout-hero-copy"><p class="layout-kicker">INDEPENDENCE IS A PRACTICE</p><h1>HELP IS ON THE WAY.</h1><p>A distressed collection about pressure, persistence and finding a way through.</p><a class="layout-button" href="#shop">SHOP THE DROP ↗</a></div><div class="layout-hero-image" role="img" aria-label="MONOWEAR campaign imagery"></div>';return e}
 return section(id,id.replaceAll("_"," "),"MONOWEAR — LIVE THE NAME. WEAR THE MEANING.");
}
function existingMap(){
 const header=document.querySelector(".site-header"),ticker=document.querySelector(".ticker"),hero=document.querySelector("#heroSection"),shop=document.querySelector("#shop"),rail=document.querySelector("#wardrobe"),story=document.querySelector("#story"),newsletter=document.querySelector("#newsletter"),footer=document.querySelector("footer"),announcement=document.querySelector("#announcement");
 return {nav:header,ticker,hero_center:hero,categories:shop,all_pieces_grid:shop,rail,story,newsletter,footer};
}
function applyTheme(id){const theme=THEMES[id]||THEMES.mono;Object.entries(theme).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));document.documentElement.dataset.siteTheme=THEMES[id]?id:"mono";document.body.dataset.siteTheme=THEMES[id]?id:"mono";}
function load(){
 const settings=window.__monowearLayoutSettings||{};
 const preview=qs.get("layoutPreview");
 const active=validLayout(preview||settings["site.activeLayout"]);
 const themeId=THEMES[qs.get("themePreview")]?qs.get("themePreview"):(THEMES[settings["site.activeTheme"]]?settings["site.activeTheme"]:(LAYOUTS[active]?.defaultTheme||"mono"));
 applyTheme(themeId);
 const main=document.querySelector("main");if(!main)return;
 const map=existingMap();const announcement=document.querySelector("#announcement");
 const slots={};
 const layout=LAYOUTS[active];
 layout.sections.forEach(id=>{
  if(id==="nav"){slots[id]=map.nav;return}
  if(id==="ticker"){slots[id]=map.ticker;return}
  if(id==="rail"){slots[id]=map.rail;return}
  if(id==="newsletter"){slots[id]=map.newsletter;return}
  if(id==="footer"){slots[id]=map.footer;return}
  if(id==="story"){slots[id]=map.story;return}
  if(id==="hero_center"){slots[id]=map.hero_center;return}
  if(id==="categories"){slots[id]=buildNew("categories");return}\n  if(id==="all_pieces_grid"){slots[id]=map.categories;return}
  if(id==="hero_split"||id==="hero_full"){if(!slots[id])slots[id]=buildNew(id);return}
  if(id==="countdown"||id==="shop_the_look"||id==="trust_row"||id==="lookbook"||id==="drop_archive"||id==="worn_by_you")slots[id]=buildNew(id);
 });
 const ordered=[];
 // Detach existing movable homepage sections first so a selected layout cannot leave duplicate sections behind.
 [map.nav,map.ticker,map.hero_center,map.categories,map.rail,map.story,map.newsletter,map.footer].filter(Boolean).forEach(node=>node.remove());
 if(announcement)announcement.remove();
 if(announcement)ordered.push(announcement);
 layout.sections.forEach(id=>{let node=slots[id];if(!node)return;if(id==="all_pieces_grid")node.dataset.layoutMode="all-pieces";if(id==="categories")node.dataset.layoutMode="categories";ordered.push(node)});
 const hidden=(()=>{try{return JSON.parse(settings["site.sectionVisibility"]||"{}")}catch{return {}}})();
 ordered.forEach(node=>{const id=node.dataset.layoutSection||Object.keys(slots).find(k=>slots[k]===node);if(id==="rail"||node.id==="wardrobe")node.hidden=false;else if(id&&hidden[id]===false)node.hidden=true;else node.hidden=false});
 ordered.forEach(node=>{if(node===map.footer)document.body.append(node);else if(node===map.nav||node===announcement)document.body.insertBefore(node,main);else main.append(node)});
 if(preview){const banner=make("div","layout-preview-banner","PREVIEW MODE — "+layout.name+" · Not published");const exit=make("a","","Exit preview");exit.href="/";banner.append(exit);document.body.prepend(banner);document.body.classList.add("layout-preview-mode")}
 const target=String(settings.drop_launch_date||"2026-11-10");const date=new Date(target+"T00:00:00+01:00");
 function tick(){const el=document.querySelector("#layoutCountdown");if(!el)return;const diff=date.getTime()-Date.now();if(!Number.isFinite(diff)||diff<=0){el.textContent="Live now";return}const d=Math.floor(diff/86400000),h=Math.floor(diff%86400000/3600000),m=Math.floor(diff%3600000/60000),s=Math.floor(diff%60000/1000);el.textContent=[d,h,m,s].map(n=>String(n).padStart(2,"0")).join(":")}
 tick();setInterval(tick,1000);
}
fetch("/api/settings",{cache:"no-store"}).then(r=>r.json()).then(s=>{window.__monowearLayoutSettings=s;load()}).catch(()=>{window.__monowearLayoutSettings={"site.activeLayout":"drop_first","site.activeTheme":"mono"};load()});
window.MONOWEAR_LAYOUTS=LAYOUTS;window.MONOWEAR_THEMES=THEMES;
})();