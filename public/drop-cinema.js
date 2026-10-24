/* MONOWEAR — virtual wardrobe rail */
(() => {
  "use strict";
  const featureSection = document.getElementById("featuredProductsSection");
  const featuredGrid = document.getElementById("featuredProductGrid");
  const subheading = featureSection && featureSection.querySelector(".product-subheading");
  if (!featureSection || !featuredGrid || !subheading || featureSection.dataset.wardrobeReady === "true") return;
  featureSection.dataset.wardrobeReady = "true";

  const layer = document.createElement("section");
  layer.className = "drop-cinema-layer wardrobe-experience";
  layer.setAttribute("aria-label", "MONOWEAR featured products rail");
  layer.innerHTML =
    '<header class="wardrobe-top">' +
      '<button class="wardrobe-back" type="button" aria-label="Back to all clothes" hidden>← BACK</button>' +
      '<a class="wardrobe-logo" href="/" aria-label="MONOWEAR home"><span class="wardrobe-logo-mark">M</span><span>MONOWEAR</span></a>' +
      '<span class="wardrobe-top-note">INDEPENDENT BY DESIGN</span>' +
      '<button class="wardrobe-bag-count" type="button">BAG (0)</button>' +
    '</header>' +
    '<div class="wardrobe-home-view">' +
      '<div class="wardrobe-intro"><span class="wardrobe-section-label">FEATURED / NEXT DROP</span><span>SELECT A PIECE TO EXPLORE ↗</span></div>' +
      '<div class="wardrobe-rail-wrap"><div class="wardrobe-rail-line" aria-hidden="true"></div><div class="wardrobe-track" tabindex="0" role="list" aria-label="Clothing rail. Swipe or scroll to browse."></div></div>' +
      '<div class="wardrobe-bottom-meta"><span>LIVE THE NAME. WEAR THE MEANING.</span><span class="wardrobe-count">00 PIECES</span></div>' +
    '</div>' +
    '<div class="wardrobe-focus-view" hidden>' +
      '<button class="wardrobe-focus-back" type="button" aria-label="Return to wardrobe">← ALL PIECES</button>' +
      '<div class="wardrobe-focus-stage"><div class="wardrobe-focus-main"><span class="wardrobe-focus-hook" aria-hidden="true"></span><img class="wardrobe-focus-image" alt="" /></div><div class="wardrobe-variant-rail" aria-label="Available colours"></div></div>' +
      '<div class="wardrobe-focus-info"><div class="wardrobe-focus-copy"><p class="wardrobe-focus-kicker">MONOWEAR / SELECTED PIECE</p><h2 class="wardrobe-focus-name"></h2><p class="wardrobe-focus-description"></p><div class="wardrobe-focus-price"></div><div class="wardrobe-rail-status"></div><div class="wardrobe-countdown" hidden></div></div><div class="wardrobe-focus-actions"><button type="button" class="wardrobe-add-to-bag">ADD TO BAG</button><a class="wardrobe-view-button" href="#">VIEW PRODUCT ↗</a></div></div>' +
      '<p class="wardrobe-transparency-note">BEST DISPLAYED WITH TRANSPARENT PNG PRODUCT IMAGES</p>' +
    '</div><div class="wardrobe-bottom-rule" aria-hidden="true"></div>';

  const homeView = layer.querySelector(".wardrobe-home-view");
  const focusView = layer.querySelector(".wardrobe-focus-view");
  const track = layer.querySelector(".wardrobe-track");
  const backButtons = [layer.querySelector(".wardrobe-back"), layer.querySelector(".wardrobe-focus-back")];
  const focusImage = layer.querySelector(".wardrobe-focus-image");
  const variantRail = layer.querySelector(".wardrobe-variant-rail");
  const bagCount = layer.querySelector(".wardrobe-bag-count");
  const syncBagCount = () => { const counter = document.getElementById("cartCount") || document.getElementById("cart-count"); if (counter && bagCount) bagCount.textContent = "BAG (" + (counter.textContent || "0").trim() + ")"; };
  if (bagCount) bagCount.addEventListener("click", () => { const cartButton = document.getElementById("cartToggle"); if (cartButton) cartButton.click(); });
  const cartCounter = document.getElementById("cartCount") || document.getElementById("cart-count");
  if (cartCounter && window.MutationObserver) new MutationObserver(syncBagCount).observe(cartCounter, { childList: true, characterData: true, subtree: true });
  syncBagCount();
  let products = [], selectedProduct = null, selectedVariant = 0, drag = null, dragged = false;

  const safeImageUrl = (value) => {
    let raw = String(value || "").trim();
    if (!raw) return "";
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1).trim();
    if (/^(data:image\/|blob:)/i.test(raw) || /^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("//")) return window.location.protocol + raw;
    if (/^(?:\.?\.?\/)?uploads\//i.test(raw)) return "/" + raw.replace(/^(?:\.\/|\.\.\/)+/, "").replace(/^\/+/, "");
    if (raw.startsWith("/")) return raw;
    return "";
  };
  const parse = (value) => {
    if (value == null || value === "") return [];
    if (Array.isArray(value) || (typeof value === "object")) return value;
    if (typeof value === "string") { try { return JSON.parse(value); } catch { return value.split(",").map(s => s.trim()).filter(Boolean); } }
    return [];
  };
  const getImage = (entry) => {
    if (typeof entry === "string") return safeImageUrl(entry);
    if (!entry || typeof entry !== "object") return "";
    return safeImageUrl(entry.url || entry.src || entry.path || entry.image_url || entry.imageUrl || entry.filename || entry.file || entry.image || entry.value || entry.location);
  };
  const makeVariants = (p) => {
    const result = [];
    if (Array.isArray(p.colors) && p.colors.some(entry => entry && typeof entry === "object" && (entry.src || entry.image || entry.url))) {
      p.colors.forEach(entry => { const image = getImage(entry); if (image) result.push({ name: String(entry.name || entry.color || "Original"), image }); });
      if (result.length) return result;
    }
    const add = (name, raw) => {
      (Array.isArray(raw) ? raw : [raw]).forEach(entry => {
        const image = getImage(entry);
        if (image && !result.some(v => v.image === image)) result.push({ name: String(name || (entry && (entry.color || entry.colour)) || "Original").trim(), image });
      });
    };
    const colorImages = parse(p.color_images);
    if (colorImages && typeof colorImages === "object" && !Array.isArray(colorImages)) {
      Object.entries(colorImages).forEach(([color, images]) => add(color, images));
    } else if (Array.isArray(colorImages)) {
      colorImages.forEach((entry, i) => add(entry.color || entry.colour || entry.name || ("Colour " + (i + 1)), entry));
    }
    const colors = parse(p.colors), images = parse(p.images);
    if (!result.length && Array.isArray(images)) images.forEach((image, i) => add(Array.isArray(colors) ? colors[i] : "", image));
    add("", p.image || p.image_url || p.imageUrl);
    const unique = result.filter((v, i, a) => a.findIndex(x => x.image === v.image) === i);
    if (Array.isArray(colors) && colors.length) unique.forEach((v, i) => { if (!v.name || v.name === "Original") v.name = String(colors[i] || "Original"); });
    return unique;
  };
  const money = value => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value || 0));
  const productUrl = p => "/product.html?slug=" + encodeURIComponent(p.slug || "") + "&id=" + encodeURIComponent(String(p.id || ""));
  const preload = src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(src); image.onerror = () => reject(new Error("Image unavailable")); image.src = src;
    if (image.complete && image.naturalWidth) resolve(src);
  });

  const createHanger = (product, variant, index, small) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wardrobe-piece" + (small ? " wardrobe-piece-small" : "");
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-label", "Explore " + product.name + (variant.name ? " in " + variant.name : ""));
    button.innerHTML = '<span class="wardrobe-hanger" aria-hidden="true"><i></i></span><span class="wardrobe-piece-image-wrap"><img loading="lazy" decoding="async" alt=""></span><span class="wardrobe-piece-name"></span><span class="wardrobe-piece-color"></span><span class="wardrobe-piece-status"></span>';
    const img = button.querySelector("img");
    img.src = variant.image; img.alt = product.name + (variant.name ? " — " + variant.name : "");
    button.querySelector(".wardrobe-piece-name").textContent = product.name || "MONOWEAR PIECE";
    button.querySelector(".wardrobe-piece-color").textContent = variant.name || "MONO ORIGINAL";
    const statusLabels = { featured: "FEATURED", "new-drop": "PRE-ORDER", "new-arrival": "NEW ARRIVAL" };
    button.querySelector(".wardrobe-piece-status").textContent = statusLabels[product.status] || "";
    button.style.setProperty("--piece-index", index);
    button.addEventListener("click", () => { if (dragged) return; if (small && selectedProduct) { const nextIndex = selectedProduct.variants.findIndex(v => v.image === variant.image); if (nextIndex >= 0) { selectedVariant = nextIndex; renderFocus(); } } else { openFocus(product, variant); } });
    return button;
  };
  const openFocus = (product, variant) => {
    selectedProduct = product;
    selectedVariant = Math.max(0, product.variants.findIndex(v => v.image === variant.image));
    homeView.hidden = true; focusView.hidden = false; layer.classList.add("is-focused");
    backButtons.forEach(b => b.hidden = false); layer.querySelector(".wardrobe-back").hidden = true;
    renderFocus();
  };
  const renderFocus = () => {
    if (!selectedProduct) return;
    const v = selectedProduct.variants[selectedVariant] || selectedProduct.variants[0];
    focusImage.classList.remove("is-swapping"); void focusImage.offsetWidth; focusImage.classList.add("is-swapping");
    focusImage.src = v.image; focusImage.alt = selectedProduct.name + (v.name ? " — " + v.name : "");
    layer.querySelector(".wardrobe-focus-name").textContent = selectedProduct.name || "MONOWEAR PIECE";
    layer.querySelector(".wardrobe-focus-description").textContent = selectedProduct.description || "";
    layer.querySelector(".wardrobe-focus-price").textContent = money(selectedProduct.price);
    const status = String(selectedProduct.status || "");
    const statusLabels = { featured: "FEATURED", "new-drop": "NEW DROP", "new-arrival": "NEW ARRIVAL" };
    layer.querySelector(".wardrobe-rail-status").textContent = statusLabels[status] || "";
    const countdown = layer.querySelector(".wardrobe-countdown");
    const refreshCountdown = () => {
      if (status !== "new-drop" || !selectedProduct.dropDate) { countdown.hidden = true; return; }
      const remaining = new Date(selectedProduct.dropDate + "T00:00:00+01:00").getTime() - Date.now();
      if (remaining <= 0) {
        countdown.hidden = true;
        selectedProduct.status = "new-arrival";
        layer.querySelector(".wardrobe-rail-status").textContent = "NEW ARRIVAL";
        layer.querySelector(".wardrobe-add-to-bag").textContent = "ADD TO BAG";
        return;
      }
      const seconds = Math.floor(remaining / 1000), pad = n => String(n).padStart(2, "0");
      countdown.textContent = "PRE-ORDER · " + Math.floor(seconds / 86400) + "D " + pad(Math.floor(seconds % 86400 / 3600)) + "H " + pad(Math.floor(seconds % 3600 / 60)) + "M " + pad(seconds % 60) + "S";
      countdown.hidden = false;
    };
    refreshCountdown();
    clearInterval(window.monowearWardrobeCountdown);
    window.monowearWardrobeCountdown = setInterval(refreshCountdown, 1000);
    layer.querySelector(".wardrobe-add-to-bag").textContent = status === "new-drop" ? "PRE-ORDER +" : "ADD TO BAG";
    layer.querySelector(".wardrobe-view-button").href = productUrl(selectedProduct);
    variantRail.replaceChildren();
    if (selectedProduct.variants.length > 1) selectedProduct.variants.forEach((item, index) => {
      if (index === selectedVariant) return;
      const button = createHanger(selectedProduct, item, index, true);
      button.classList.add("is-variant");
      button.setAttribute("aria-label", "Switch to " + (item.name || "other colour"));
      variantRail.appendChild(button);
    });
    variantRail.hidden = selectedProduct.variants.length < 2;
  };
  layer.querySelector(".wardrobe-add-to-bag").addEventListener("click", () => {
    if (!selectedProduct || !selectedProduct.id || typeof window.addToCart !== "function") { window.location.href = selectedProduct ? productUrl(selectedProduct) : "/"; return; }
    const variant = selectedProduct.variants[selectedVariant] || selectedProduct.variants[0];
    const productId = Number(selectedProduct.id);
    const colorSelect = document.getElementById("color-" + productId);
    if (colorSelect && variant && variant.name) colorSelect.value = variant.name;
    window.addToCart(productId);
  });
  const closeFocus = () => {
    clearInterval(window.monowearWardrobeCountdown);
    selectedProduct = null; focusView.hidden = true; homeView.hidden = false; layer.classList.remove("is-focused");
    backButtons.forEach(b => b.hidden = true);
  };
  backButtons.forEach(button => button.addEventListener("click", closeFocus));
  focusImage.addEventListener("animationend", () => focusImage.classList.remove("is-swapping"));
  focusView.addEventListener("click", event => { if (event.target === focusView) closeFocus(); });

  track.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = { x: event.clientX, scroll: track.scrollLeft }; dragged = false;
    track.classList.add("is-dragging"); track.setPointerCapture(event.pointerId);
  });
  track.addEventListener("pointermove", event => {
    if (!drag) return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) > 5) dragged = true;
    track.scrollLeft = drag.scroll - delta;
  });
  const endDrag = () => { drag = null; track.classList.remove("is-dragging"); window.setTimeout(() => { dragged = false; }, 100); };
  track.addEventListener("pointerup", endDrag); track.addEventListener("pointercancel", endDrag); track.addEventListener("lostpointercapture", endDrag);
  track.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { track.scrollLeft += event.deltaY; event.preventDefault(); }
  }, { passive: false });

  const sampleSvg = (fill, kind) => {
    const paths = {
      tee: '<path d="M58 24 82 10h56l24 14 38 26-23 39-20-12v140H43V77L23 89 0 50z"/>',
      hoodie: '<path d="M70 25 89 12h42l19 13 31 15 34 40-27 25-18-17v129H29V88L11 105-16 80 15 40z"/><path d="M89 15q21 43 42 0" fill="none" stroke="#111" stroke-width="4"/>',
      jersey: '<path d="M60 24 84 11h52l24 13 40 28-25 43-21-13v138H42V82L21 95-4 52z"/>',
      jacket: '<path d="M68 22 90 11h40l22 11 35 22 28 40-28 24-18-17v129H31V91L13 108-15 84 15 44z"/><path d="M110 25v205" stroke="#111" stroke-width="4"/>',
      cap: '<path d="M32 139q12-96 78-96t78 96l-10 23H43z"/><path d="M43 143q88-25 154 0l-12 22H52z" fill="#73766f"/>'
    };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 260"><g fill="' + fill + '">' + paths[kind] + '</g></svg>';
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  };
  const fallback = [
    { id:"sample-1", name:"MONO HEAVY TEE", price:18500, description:"Sample piece — add your product image in Studio.", variants:[{name:"Black",image:sampleSvg("#252725","tee")},{name:"White",image:sampleSvg("#f7f7f3","tee")}] },
    { id:"sample-2", name:"MONO ZIP HOODIE", price:32000, description:"Sample piece — add your product image in Studio.", variants:[{name:"Charcoal",image:sampleSvg("#343734","hoodie")}] },
    { id:"sample-3", name:"MONO JERSEY", price:24000, description:"Sample piece — add your product image in Studio.", variants:[{name:"Green",image:sampleSvg("#174c35","jersey")},{name:"Blue",image:sampleSvg("#274a8c","jersey")}] },
    { id:"sample-4", name:"MONO WORK JACKET", price:38000, description:"Sample piece — add your product image in Studio.", variants:[{name:"Olive",image:sampleSvg("#505742","jacket")}] },
    { id:"sample-5", name:"MONO TRACK TOP", price:29000, description:"Sample piece — add your product image in Studio.", variants:[{name:"Black",image:sampleSvg("#202321","hoodie")},{name:"Forest",image:sampleSvg("#164a36","hoodie")}] },
    { id:"sample-6", name:"MONO CAP", price:12000, description:"Sample piece — add your product image in Studio.", variants:[{name:"Forest",image:sampleSvg("#164a36","cap")}] }
  ];
  const renderRail = () => {
    track.replaceChildren();
    products.forEach((product, index) => track.appendChild(createHanger(product, product.variants[0], index, false)));
    layer.querySelector(".wardrobe-count").textContent = String(products.length).padStart(2, "0") + " PIECES";
  };

  layer.hidden = true;
  subheading.insertAdjacentElement("afterend", layer);

  const applySectionLabel = settings => {
    settings = settings || {};
    const allowed = ["Featured", "Next Drop", "New Arrivals", "Featured / Next Drop"];
    const savedLabel = String(settings.wardrobe_section_label || "Featured / Next Drop").trim();
    const label = allowed.includes(savedLabel) ? savedLabel : "Featured / Next Drop";
    const displayLabel = label === "Featured" ? "FEATURED" : label === "Next Drop" ? "NEXT DROP" : label === "New Arrivals" ? "NEW ARRIVALS" : "FEATURED / NEXT DROP";
    const introLabel = layer.querySelector(".wardrobe-section-label");
    if (introLabel) introLabel.textContent = displayLabel;
    const eyebrow = subheading.querySelector(".eyebrow");
    const title = subheading.querySelector("h3");
    if (eyebrow) eyebrow.textContent = "CURRENT SPOTLIGHT";
    if (title) title.innerHTML = label === "New Arrivals" ? "New <i>arrivals.</i>" : label === "Next Drop" ? "Next <i>drop.</i>" : label === "Featured" ? "Featured <i>pieces.</i>" : "Featured / <i>Next Drop.</i>";
    featureSection.classList.add("featured-wardrobe-active");
    layer.hidden = false;
    featuredGrid.hidden = true;
    featureSection.setAttribute("data-campaign-animation", "virtual-wardrobe");
  };

  fetch("/api/wardrobe-rail", { credentials: "same-origin", cache: "no-store" })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("Wardrobe rail unavailable")))
    .then(async data => {
      const RAIL = data.RAIL || { show: "all", background: "" };
      if (RAIL.background) {
        layer.style.backgroundImage = 'linear-gradient(color-mix(in srgb,var(--bg) 66%,transparent),color-mix(in srgb,var(--bg) 66%,transparent)),url("' + String(RAIL.background).replace(/["\\\\]/g, "") + '")';
        layer.style.backgroundSize = "cover";
        layer.style.backgroundPosition = "center";
      } else layer.style.backgroundImage = "none";
      const source = Array.isArray(data.products) ? data.products : [];
      const ready = await Promise.all(source.map(async p => {
        const product = Object.assign({}, p, { variants: makeVariants(p) });
        product.variants = (await Promise.all(product.variants.map(async v => { try { await preload(v.image); return v; } catch { return null; } }))).filter(Boolean);
        return product.variants.length ? product : null;
      }));
      products = ready.filter(Boolean);
      renderRail();
      applySectionLabel({ wardrobe_section_label: "Featured / Next Drop" });
      if (!products.length) {
        track.innerHTML = '<p class="wardrobe-empty">Nothing on the rail right now. Mark products in Studio to display them here.</p>';
        layer.querySelector(".wardrobe-count").textContent = "00 PIECES";
      }
    })
    .catch(error => {
      products = [];
      renderRail();
      applySectionLabel({});
      track.innerHTML = '<p class="wardrobe-empty">The featured rail is temporarily unavailable. Please refresh in a moment.</p>';
      console.warn("MONOWEAR wardrobe rail:", error.message);
    });
})();