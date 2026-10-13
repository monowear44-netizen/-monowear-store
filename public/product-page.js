"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const money = (amount) => new Intl.NumberFormat("en-NG", {style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(amount)||0);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function imageSources(p) {
    let saved = p && p.images;
    if (typeof saved === "string") {
      try { saved = JSON.parse(saved); } catch { saved = []; }
    }
    if (!Array.isArray(saved)) saved = [];
    const values = [p && p.image, ...saved].map((item) => {
      if (item && typeof item === "object") item = item.url || item.src || item.path || "";
      item = String(item || "").trim();
      if (!item) return "";
      if (/^(data:|blob:|https?:\/\/)/i.test(item)) return item;
      if (item.startsWith("//")) return location.protocol + item;
      return "/" + item.replace(/^\/+/, "");
    }).filter(Boolean);
    return [...new Set(values)];
  }
  const imageMarkup = (p) => {
    const sources = imageSources(p);
    if (!sources.length) return '<div class="image-placeholder">MONO<br><span>— '+esc(p.category||"MONOWEAR").toUpperCase()+' —</span></div>';
    return '<img src="'+esc(sources[0])+'" data-sources="'+esc(JSON.stringify(sources))+'" data-index="0" alt="'+esc(p.name)+'" loading="eager" onerror="const s=JSON.parse(this.dataset.sources||\'[]\');const i=Number(this.dataset.index||0)+1;if(i<s.length){this.dataset.index=i;this.src=s[i]}else{this.style.display=\'none\';this.nextElementSibling.hidden=false}"><div class="image-placeholder" hidden>MONO<br><span>IMAGE UNAVAILABLE</span></div>';
  };
  const query = new URLSearchParams(location.search);
  const slug = query.get("slug"), id = query.get("id");
  let product = null, products = [];
  function relatedCard(p) {
    const q = new URLSearchParams(); if (p.slug) q.set("slug",p.slug); q.set("id",String(p.id));
    return '<a class="standalone-related-card" href="/product.html?'+q.toString()+'"><div class="standalone-related-image">'+imageMarkup(p)+'</div><div class="standalone-related-meta"><span>'+esc(p.name)+'</span><strong>'+money(p.price)+'</strong></div><small>'+esc(p.category||"MONOWEAR")+'</small></a>';
  }
  function updateBagCount() {
    try { const bag=JSON.parse(localStorage.getItem("monowear-cart")||"[]"); $("productCartCount").textContent=String(bag.reduce((n,item)=>n+Math.max(0,Number(item.quantity)||0),0)); }
    catch { $("productCartCount").textContent="0"; }
  }
  function addToBag() {
    if (!product || Number(product.stock)<=0) return;
    const size=$("standaloneProductSize") ? $("standaloneProductSize").value : "One size";
    const color=$("standaloneProductColor") ? $("standaloneProductColor").value : "";
    let cart=[]; try { const saved=JSON.parse(localStorage.getItem("monowear-cart")||"[]"); cart=Array.isArray(saved)?saved:[]; } catch {}
    const existing=cart.find(item=>Number(item.id)===Number(product.id)&&item.size===size&&String(item.color||"")===color);
    if(existing) { if(Number(existing.quantity)>=Number(product.stock)){alert("You've reached the available stock for this piece.");return;} existing.quantity=(Number(existing.quantity)||0)+1; }
    else cart.push({id:Number(product.id),name:product.name||"MONOWEAR Piece",price:Number(product.price)||0,image:imageSources(product)[0]||"",size,color,quantity:1});
    localStorage.setItem("monowear-cart",JSON.stringify(cart)); updateBagCount();
    $("standaloneAddToBag").textContent="ADDED TO BAG ✓";
    $("productAddedNote").textContent="Added to your bag. Your selection is saved.";
    setTimeout(()=>{const b=$("standaloneAddToBag");if(b)b.textContent="ADD TO BAG +";},1800);
  }
  async function init() {
    $("productPageYear").textContent=String(new Date().getFullYear()); updateBagCount();
    try {
      const endpoint=slug ? "/api/product/"+encodeURIComponent(slug) : "/api/products/"+encodeURIComponent(id||"");
      const response=await fetch(endpoint,{headers:{Accept:"application/json"},cache:"no-store"});
      if(!response.ok) throw new Error("This product could not be found or is no longer available.");
      product=await response.json();
      const listResponse=await fetch("/api/products?limit=100",{headers:{Accept:"application/json"},cache:"no-store"});
      products=listResponse.ok ? await listResponse.json() : [];
      document.title=product.name+" — MONOWEAR"; $("productBreadcrumbName").textContent=product.name||"PRODUCT"; $("productPageStatus").hidden=true;
      const sizes=Array.isArray(product.sizes)&&product.sizes.length ? product.sizes : ["One size"], colors=Array.isArray(product.colors)?product.colors:[], stock=Number(product.stock)||0;
      const colorField=colors.length ? '<label class="standalone-size-label" for="standaloneProductColor">SELECT COLOUR</label><select id="standaloneProductColor" class="standalone-size-select" '+(stock<=0?"disabled":"")+'>'+colors.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("")+'</select>' : '';
      $("productPageContent").hidden=false;
      $("productPageContent").innerHTML='<div class="standalone-product-layout"><div class="standalone-product-visual">'+imageMarkup(product)+'</div><div class="standalone-product-info"><p class="eyebrow">MONOWEAR / PRODUCT DETAIL</p><p class="standalone-product-category">'+esc(product.category||"MONOWEAR")+'</p><h1>'+esc(product.name||"MONOWEAR Piece")+'</h1><p class="standalone-product-price">'+money(product.price)+'</p><div class="standalone-product-description">'+esc(product.description||"A MONOWEAR piece. More details coming soon.")+'</div><p class="standalone-stock">'+(stock>0?"IN STOCK · "+stock+" AVAILABLE":"SOLD OUT")+'</p><label class="standalone-size-label" for="standaloneProductSize">SELECT SIZE</label><select id="standaloneProductSize" class="standalone-size-select" '+(stock<=0?"disabled":"")+'>'+sizes.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("")+'</select>'+colorField+'<button type="button" id="standaloneAddToBag" class="add-button standalone-add-button" '+(stock<=0?"disabled":"")+'>'+(stock<=0?"SOLD OUT":"ADD TO BAG +")+'</button><p id="productAddedNote" class="product-added-note" role="status" aria-live="polite"></p><a class="standalone-back-link" href="/#shop">← BACK TO ALL PIECES</a></div></div>';
      $("standaloneAddToBag").addEventListener("click",addToBag);
      const related=products.filter(p=>Number(p.id)!==Number(product.id));
      const sameCategory=product.category ? related.filter(p=>String(p.category||"").toLowerCase()===String(product.category).toLowerCase()) : [];
      $("productRelatedGrid").innerHTML=(sameCategory.length?sameCategory:related).slice(0,4).map(relatedCard).join("");
      if(!related.length) $("productRelatedGrid").innerHTML='<p class="muted">More pieces are coming soon.</p>';
    } catch(error) { $("productPageStatus").textContent=error.message||"Could not load this product."; $("productPageStatus").classList.add("is-error"); $("productPageContent").hidden=true; }
  }
  init();
})();