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
  function fitReason(base, candidate, vibe, occasion) {
    const baseText = [base.name, base.category, base.description].join(" ").toLowerCase();
    const otherText = [candidate.name, candidate.category, candidate.description].join(" ").toLowerCase();
    const top = /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(otherText);
    const bottom = /trouser|pant|jean|denim|shorts|skirt/.test(otherText);
    const accessory = /cap|hat|bag|beanie|belt|sock/.test(otherText);
    if (top && /trouser|pant|jean|denim|shorts|skirt/.test(baseText)) return "A strong top to balance the silhouette.";
    if (bottom && /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(baseText)) return "Build the fit with a complementary bottom.";
    if (accessory) return vibe === "bold" ? "A finishing detail that makes the whole look feel intentional." : "An easy finishing touch for a complete look.";
    if (vibe === "layered") return "Adds depth and dimension to your layers.";
    if (vibe === "bold" || occasion === "going-out") return "Adds another statement to your MONOWEAR fit.";
    return "An easy piece to rotate into your everyday wardrobe.";
  }
  function fitChatProductCard(p, vibe, occasion) {
    const q = new URLSearchParams();
    if (p.slug) q.set("slug", p.slug);
    q.set("id", String(p.id));
    return '<a class="mono-fit-product" href="/product.html?' + q.toString() + '">' +
      '<div class="mono-fit-product-image">' + imageMarkup(p) + '</div>' +
      '<div class="mono-fit-product-details"><strong>' + esc(p.name || "MONOWEAR piece") + '</strong><span>' + money(p.price) + '</span><small>' + esc(fitReason(product, p, vibe, occasion)) + '</small></div>' +
      '</a>';
  }
  function renderFitMatcher() {
    const mount = $("fitMatcher");
    if (!mount || !product) return;
    mount.innerHTML =
      '<button class="mono-fit-launcher" id="monoFitLauncher" type="button" aria-expanded="false" aria-controls="monoFitPanel">' +
        '<span class="mono-fit-launcher-mark">M</span><span class="mono-fit-launcher-copy"><strong>MONO FIT MATCHER</strong><small>Need help styling this piece?</small></span><span class="mono-fit-launcher-arrow">↗</span>' +
      '</button>' +
      '<section class="mono-fit-panel" id="monoFitPanel" role="dialog" aria-modal="false" aria-label="MONOWEAR style concierge" hidden>' +
        '<header class="mono-fit-panel-head"><div class="mono-fit-avatar">M</div><div><strong>MONO FIT MATCHER</strong><small>STYLE CONCIERGE · ONLINE</small></div><button id="monoFitClose" class="mono-fit-close" type="button" aria-label="Close style chat">×</button></header>' +
        '<div class="mono-fit-context"><span>STYLING</span><strong>' + esc(product.name || "Your selected piece") + '</strong><small>' + money(product.price) + '</small></div>' +
        '<div class="mono-fit-messages" id="monoFitMessages" aria-live="polite"></div>' +
        '<div class="mono-fit-options" id="monoFitOptions"></div>' +
        '<form class="mono-fit-input-row" id="monoFitForm"><input id="monoFitInput" type="text" maxlength="180" placeholder="Tell MONO what you have in mind…" aria-label="Ask the style concierge"><button type="submit" aria-label="Send message">↑</button></form>' +
        '<p class="mono-fit-disclaimer">Personalised using available MONOWEAR pieces. No AI service or paid API required.</p>' +
      '</section>';
    const launcher = $("monoFitLauncher"), panel = $("monoFitPanel");
    const messages = $("monoFitMessages"), options = $("monoFitOptions");
    let occasion = "", vibe = "", stage = "occasion";
    const addMessage = (text, who) => {
      const bubble = document.createElement("div");
      bubble.className = "mono-fit-message " + (who === "user" ? "is-user" : "is-assistant");
      bubble.textContent = text;
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    };
    const setOptions = (items) => {
      options.innerHTML = "";
      items.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mono-fit-option";
        button.textContent = item.label;
        button.addEventListener("click", () => item.action());
        options.appendChild(button);
      });
    };
    const showOccasion = () => {
      stage = "occasion";
      addMessage("Let's build a fit around this piece. Where are you wearing it?", "assistant");
      setOptions([
        {label:"Everyday", action:()=>chooseOccasion("everyday","Everyday")},
        {label:"Going out", action:()=>chooseOccasion("going-out","Going out")},
        {label:"Make a statement", action:()=>chooseOccasion("statement","Make a statement")}
      ]);
    };
    const chooseOccasion = (value, label) => {
      occasion = value;
      addMessage(label, "user");
      stage = "vibe";
      addMessage("Got you. What direction should the fit take?", "assistant");
      setOptions([
        {label:"Clean & minimal", action:()=>chooseVibe("minimal","Clean & minimal")},
        {label:"Layered streetwear", action:()=>chooseVibe("layered","Layered streetwear")},
        {label:"Bold & expressive", action:()=>chooseVibe("bold","Bold & expressive")},
        {label:"Surprise me", action:()=>chooseVibe("surprise","Surprise me")}
      ]);
    };
    const recommend = (freeText) => {
      const baseText = [product.name, product.category, product.description].join(" ").toLowerCase();
      const candidates = products.filter(p => Number(p.id) !== Number(product.id) && Number(p.stock) > 0);
      const words = text => new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3));
      const baseWords = words(baseText);
      const ranked = candidates.map(p => {
        const text = [p.name,p.category,p.description].join(" ").toLowerCase();
        let score = 0;
        const pWords = words(text);
        baseWords.forEach(w => { if(pWords.has(w)) score += 2; });
        const baseTop = /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(baseText);
        const baseBottom = /trouser|pant|jean|denim|shorts|skirt/.test(baseText);
        const pTop = /tee|t-shirt|shirt|longsleeve|long sleeve|hoodie|sweatshirt|raglan|top/.test(text);
        const pBottom = /trouser|pant|jean|denim|shorts|skirt/.test(text);
        const accessory = /cap|hat|bag|beanie|belt|sock/.test(text);
        if ((baseTop && pBottom) || (baseBottom && pTop)) score += 9;
        if (accessory) score += vibe === "minimal" ? 2 : 4;
        if (vibe === "layered" && /hoodie|shirt|jacket|longsleeve|long sleeve|overshirt/.test(text)) score += 5;
        if (vibe === "bold" && /graphic|print|distress|archive|statement|pink|red|blue/.test(text)) score += 4;
        if (vibe === "minimal" && /black|white|cream|neutral|basic|mono/.test(text)) score += 4;
        if (occasion === "going-out" && /denim|jean|graphic|statement|archive/.test(text)) score += 3;
        if (occasion === "everyday" && /tee|cap|shorts|hoodie|sweatshirt/.test(text)) score += 2;
        if (String(p.category||"").toLowerCase() === String(product.category||"").toLowerCase()) score += 1;
        if (freeText) {
          const queryWords = words(freeText);
          queryWords.forEach(w => { if(pWords.has(w)) score += 5; });
          if (/cheap|budget|affordable|less|lower price/.test(freeText.toLowerCase()) && Number(p.price) < Number(product.price)) score += 4;
        }
        return {product:p,score};
      }).sort((a,b)=>b.score-a.score || Number(a.product.price)-Number(b.product.price)).slice(0,3);
      addMessage(ranked.length ? "Here are a few pieces I'd pair with your selection. Tap any piece to explore it." : "I couldn't find another in-stock piece to pair with this one just yet. Check back as the collection grows.", "assistant");
      if (ranked.length) {
        const cards = document.createElement("div");
        cards.className = "mono-fit-results";
        cards.innerHTML = ranked.map(item => fitChatProductCard(item.product, vibe, occasion)).join("");
        messages.appendChild(cards);
        messages.scrollTop = messages.scrollHeight;
      }
      stage = "done";
      setOptions([
        {label:"Try another vibe", action:restart},
        {label:"Keep browsing", action:closeChat}
      ]);
    };
    const chooseVibe = (value, label) => {
      vibe = value;
      addMessage(label, "user");
      addMessage(value === "surprise" ? "I'll mix complementary shapes and finishing pieces." : "I'll look for pieces that fit that direction.", "assistant");
      recommend("");
    };
    const restart = () => {
      messages.innerHTML = "";
      options.innerHTML = "";
      occasion = ""; vibe = ""; stage = "occasion";
      showOccasion();
    };
    const openChat = () => {
      panel.hidden = false;
      launcher.setAttribute("aria-expanded","true");
      launcher.classList.add("is-active");
      if (!messages.children.length) {
        addMessage("Hey. I'm MONO — your style concierge.", "assistant");
        addMessage("You're looking at " + (product.name || "a MONOWEAR piece") + ". Let's find pieces that work with it.", "assistant");
        showOccasion();
      }
      $("monoFitInput").focus();
    };
    const closeChat = () => {
      panel.hidden = true;
      launcher.setAttribute("aria-expanded","false");
      launcher.classList.remove("is-active");
      launcher.focus();
    };
    launcher.addEventListener("click", () => panel.hidden ? openChat() : closeChat());
    $("monoFitClose").addEventListener("click", closeChat);
    $("monoFitForm").addEventListener("submit", event => {
      event.preventDefault();
      const input = $("monoFitInput");
      const message = input.value.trim();
      if (!message) return;
      input.value = "";
      addMessage(message, "user");
      const lower = message.toLowerCase();
      if (/reset|start over|restart|another vibe/.test(lower)) return restart();
      if (stage === "occasion") {
        const detected = /night|date|party|club|going out|dinner|event/.test(lower) ? ["going-out","Going out"] :
          /statement|stand out|bold|loud/.test(lower) ? ["statement","Make a statement"] : ["everyday","Everyday"];
        occasion = detected[0];
        addMessage("I'll keep that in mind. What style direction do you prefer?", "assistant");
        stage = "vibe";
        setOptions([
          {label:"Clean & minimal", action:()=>chooseVibe("minimal","Clean & minimal")},
          {label:"Layered streetwear", action:()=>chooseVibe("layered","Layered streetwear")},
          {label:"Bold & expressive", action:()=>chooseVibe("bold","Bold & expressive")},
          {label:"Surprise me", action:()=>chooseVibe("surprise","Surprise me")}
        ]);
      } else if (stage === "vibe") {
        vibe = /layer|oversized|streetwear/.test(lower) ? "layered" : /bold|loud|statement|colour|color/.test(lower) ? "bold" : /surprise|anything/.test(lower) ? "surprise" : "minimal";
        addMessage("I'll use that direction and your note to choose some pairings.", "assistant");
        recommend(message);
      } else {
        addMessage("I can make another set of suggestions. Tell me a vibe or choose an option below.", "assistant");
        setOptions([
          {label:"Try another vibe", action:restart},
          {label:"More minimal", action:()=>{vibe="minimal";recommend("");}},
          {label:"More statement", action:()=>{vibe="bold";recommend("");}},
          {label:"Keep browsing", action:closeChat}
        ]);
      }
    });
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