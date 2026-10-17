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
  function imageForColor(p, color) {
    let map = p && p.color_images;
    if (typeof map === "string") {
      try { map = JSON.parse(map); } catch { map = {}; }
    }
    if (!map || typeof map !== "object" || Array.isArray(map)) map = {};
    const wanted = String(color || "").trim().toLocaleLowerCase();
    const key = Object.keys(map).find((item) => String(item).trim().toLocaleLowerCase() === wanted);
    let value = key ? map[key] : "";
    if (value && typeof value === "object") value = value.url || value.src || value.path || "";
    value = String(value || "").trim();
    if (!value) return "";
    if (/^(data:|blob:|https?:\/\/)/i.test(value)) return value;
    if (value.startsWith("//")) return location.protocol + value;
    return "/" + value.replace(/^\/+/, "");
  }
  function showProductColorImage(color) {
    const src = imageForColor(product, color);
    if (!src) return;
    const visual = document.querySelector(".standalone-product-visual");
    const main = visual && visual.querySelector("img[data-sources]");
    const placeholder = visual && visual.querySelector(".image-placeholder");
    if (!main) return;

    main.style.display = "";
    if (placeholder) placeholder.hidden = true;
    main.setAttribute("aria-busy", "true");
    const previousSrc = main.currentSrc || main.src;
    const finish = () => {
      main.style.display = "";
      main.removeAttribute("aria-busy");
      if (placeholder) placeholder.hidden = true;
    };
    const fail = () => {
      main.removeAttribute("aria-busy");
      if (previousSrc && previousSrc !== src) main.src = previousSrc;
      if (main.complete && main.naturalWidth > 0) {
        main.style.display = "";
        if (placeholder) placeholder.hidden = true;
      } else {
        main.style.display = "none";
        if (placeholder) placeholder.hidden = false;
      }
    };
    main.onload = finish;
    main.onerror = fail;
    main.src = src;
    const sources = imageSources(product);
    main.dataset.index = String(Math.max(0, sources.indexOf(src)));
    document.querySelectorAll(".product-image-thumbnail").forEach((button) => {
      const thumb = button.querySelector("img");
      button.classList.toggle("is-active", !!thumb && thumb.getAttribute("src") === src);
    });
    if (main.complete && main.naturalWidth > 0) finish();
  }
  function relatedCard(p) {
    const q = new URLSearchParams(); if (p.slug) q.set("slug",p.slug); q.set("id",String(p.id));
    return '<a class="standalone-related-card" href="/product.html?'+q.toString()+'"><div class="standalone-related-image">'+imageMarkup(p)+'</div><div class="standalone-related-meta"><span>'+esc(p.name)+'</span><strong>'+money(p.price)+'</strong></div><small>'+esc(p.category||"MONOWEAR")+'</small></a>';
  }
  function fitReason(base, candidate) {
    const baseText = [base.name, base.category, base.description].join(" ").toLowerCase();
    const otherText = [candidate.name, candidate.category, candidate.description].join(" ").toLowerCase();
    const baseIsTop = /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(baseText);
    const baseIsBottom = /trouser|pant|jean|denim|shorts|skirt/.test(baseText);
    const otherIsTop = /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(otherText);
    const otherIsBottom = /trouser|pant|jean|denim|shorts|skirt/.test(otherText);
    const otherIsAccessory = /cap|hat|bag|beanie|belt|sock/.test(otherText);
    if (baseIsTop && otherIsBottom) return "Pair it with a bottom for a balanced everyday fit.";
    if (baseIsBottom && otherIsTop) return "A strong top layer to build the fit around.";
    if (otherIsAccessory) return "Finish the look with a considered accessory.";
    if (baseText.includes("hoodie") && /tee|shirt|longsleeve/.test(otherText)) return "Layer it over this piece for an easy streetwear combination.";
    const sameCategory = String(base.category || "").toLowerCase() === String(candidate.category || "").toLowerCase();
    if (sameCategory) return "A complementary piece from the same MONOWEAR lane.";
    return "A contrasting piece to build a more complete MONOWEAR look.";
  }
  function renderFitMatcher() {
    const mount = $("fitMatcher");
    if (!mount || !product) return;
    const candidates = products.filter(p => Number(p.id) !== Number(product.id) && Number(p.stock) > 0);
    const baseText = [product.name, product.category, product.description].join(" ").toLowerCase();
    const ranked = candidates.map(p => {
      const text = [p.name, p.category, p.description].join(" ").toLowerCase();
      let score = 0;
      const baseWords = baseText.split(/[^a-z0-9]+/).filter(w => w.length > 3);
      const otherWords = new Set(text.split(/[^a-z0-9]+/).filter(w => w.length > 3));
      score += baseWords.filter(w => otherWords.has(w)).length * 2;
      const baseTop = /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(baseText);
      const baseBottom = /trouser|pant|jean|denim|shorts|skirt/.test(baseText);
      const otherTop = /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(text);
      const otherBottom = /trouser|pant|jean|denim|shorts|skirt/.test(text);
      const accessory = /cap|hat|bag|beanie|belt|sock/.test(text);
      if ((baseTop && otherBottom) || (baseBottom && otherTop)) score += 7;
      if (accessory) score += 3;
      if (String(p.category || "").toLowerCase() !== String(product.category || "").toLowerCase()) score += 1;
      if (String(p.category || "").toLowerCase() === String(product.category || "").toLowerCase()) score += 2;
      return { product:p, score };
    }).sort((a,b)=>b.score-a.score).slice(0,3);
    if (!ranked.length) {
      mount.innerHTML = '<p class="fit-matcher-empty">More pieces are coming soon. Check back to complete your fit.</p>';
      return;
    }
    mount.innerHTML = '<div class="fit-matcher-heading"><div><p class="eyebrow">MONO FIT MATCHER</p><h2>Complete <i>the fit.</i></h2><p>Pieces selected to work with your choice.</p></div><span class="fit-matcher-mark">STYLE / MATCH</span></div><div class="fit-matcher-grid">' +
      ranked.map(({product:p}) => '<a class="fit-matcher-card" href="/product.html?'+(p.slug?'slug='+encodeURIComponent(p.slug)+'&':'')+'id='+encodeURIComponent(p.id)+'"><div class="fit-matcher-image">'+imageMarkup(p)+'</div><div class="fit-matcher-copy"><span>'+esc(p.name)+'</span><strong>'+money(p.price)+'</strong><small>'+esc(fitReason(product,p))+'</small></div></a>').join("") +
      '</div>';
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
    else cart.push({id:Number(product.id),name:product.name||"MONOWEAR Piece",price:Number(product.price)||0,image:imageForColor(product,color)||imageSources(product)[0]||"",size,color,quantity:1});
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
      const gallerySources=imageSources(product);
      const galleryMarkup=gallerySources.length>1 ? '<div class="product-image-thumbnails" aria-label="More product images">'+gallerySources.map((src,index)=>'<button type="button" class="product-image-thumbnail'+(index===0?' is-active':'')+'" data-image-index="'+index+'" aria-label="View product image '+(index+1)+'"><img src="'+esc(src)+'" alt="'+esc((product.name||"Product")+" view "+(index+1))+'"></button>').join("")+'</div>' : '';
      $("productPageContent").hidden=false;
      $("productPageContent").innerHTML='<div class="standalone-product-layout"><div class="standalone-product-visual">'+imageMarkup(product)+galleryMarkup+'</div><div class="standalone-product-info"><p class="eyebrow">MONOWEAR / PRODUCT DETAIL</p><p class="standalone-product-category">'+esc(product.category||"MONOWEAR")+'</p><h1>'+esc(product.name||"MONOWEAR Piece")+'</h1><p class="standalone-product-price">'+money(product.price)+'</p><div class="standalone-product-description">'+esc(product.description||"A MONOWEAR piece. More details coming soon.")+'</div><p class="standalone-stock">'+(stock>0?"IN STOCK · "+stock+" AVAILABLE":"SOLD OUT")+'</p><label class="standalone-size-label" for="standaloneProductSize">SELECT SIZE</label><select id="standaloneProductSize" class="standalone-size-select" '+(stock<=0?"disabled":"")+'>'+sizes.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("")+'</select>'+colorField+'<button type="button" id="standaloneAddToBag" class="add-button standalone-add-button" '+(stock<=0?"disabled":"")+'>'+(stock<=0?"SOLD OUT":"ADD TO BAG +")+'</button><p id="productAddedNote" class="product-added-note" role="status" aria-live="polite"></p><a class="standalone-back-link" href="/#shop">← BACK TO ALL PIECES</a></div></div>';
      $("standaloneAddToBag").addEventListener("click",addToBag);
      if ($("standaloneProductColor")) $("standaloneProductColor").addEventListener("change", (event) => showProductColorImage(event.target.value));
      document.querySelectorAll(".product-image-thumbnail").forEach((button) => {
        button.addEventListener("click", () => {
          const index=Number(button.dataset.imageIndex);
          const visual=document.querySelector(".standalone-product-visual");
          const mainImage=visual && visual.querySelector("img[data-sources]");
          if(!mainImage || !gallerySources[index]) return;
          mainImage.dataset.index=String(index);
          mainImage.src=gallerySources[index];
          mainImage.style.display="";
          const placeholder=mainImage.nextElementSibling;
          if(placeholder && placeholder.classList.contains("image-placeholder")) placeholder.hidden=true;
          document.querySelectorAll(".product-image-thumbnail").forEach((item)=>item.classList.toggle("is-active",item===button));
        });
      });
      const related=products.filter(p=>Number(p.id)!==Number(product.id));
      const sameCategory=product.category ? related.filter(p=>String(p.category||"").toLowerCase()===String(product.category).toLowerCase()) : [];
      $("productRelatedGrid").innerHTML=(sameCategory.length?sameCategory:related).slice(0,4).map(relatedCard).join("");
      renderFitMatcher();
      if(!related.length) $("productRelatedGrid").innerHTML='<p class="muted">More pieces are coming soon.</p>';
    } catch(error) { $("productPageStatus").textContent=error.message||"Could not load this product."; $("productPageStatus").classList.add("is-error"); $("productPageContent").hidden=true; }
  }
  init();
})();