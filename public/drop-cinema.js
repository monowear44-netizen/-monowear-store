/* MONOWEAR — date-gated cinematic campaign header */
(() => {
  "use strict";
  const hero = document.getElementById("heroSection");
  if (!hero || hero.dataset.cinemaReady === "true") return;
  hero.dataset.cinemaReady = "true";

  const layer = document.createElement("div");
  layer.className = "drop-cinema-layer";
  layer.setAttribute("aria-hidden", "true");
  const titleNode = document.getElementById("heroTitle");
  const subtitleNode = document.getElementById("heroSubtitle");
  const campaignTitle = (titleNode?.innerText || "HELP IS ON THE WAY.")
    .replace(/\\s+/g, " ").trim();
  const campaignWords = campaignTitle.split(" ").filter(Boolean);
  const wordmarkLines = campaignWords.length > 3
    ? [campaignWords.slice(0, 2).join(" "), campaignWords.slice(2, 4).join(" "), campaignWords.slice(4).join(" ")]
    : [campaignWords.slice(0, 1).join(" "), campaignWords.slice(1, 3).join(" "), campaignWords.slice(3).join(" ")];
  const campaignSubtitle = (subtitleNode?.innerText || "PRESSURE. PERSISTENCE. A WAY THROUGH.")
    .replace(/\\s+/g, " ").trim();
  layer.innerHTML = [
    '<div class="drop-cinema-light"></div>',
    '<div class="drop-cinema-scan"></div>',
    '<div class="drop-cinema-frame"></div>',
    '<div class="drop-cinema-wordmark"></div>',
    '<div class="drop-cinema-embers"></div>',
    '<div class="drop-cinema-countdown" aria-live="off"><span class="drop-cinema-countdown-label" data-cinema-drop-label>DROP GOES LIVE IN</span><strong class="drop-cinema-countdown-value" data-cinema-drop-countdown>—D —H —M —S</strong><small>Official drop <time data-cinema-drop-date datetime="2026-11-10">2026-11-10</time></small></div>',
    '<a class="drop-cinema-products" href="#shop" aria-label="Explore the current drop products"><div class="drop-cinema-product-image"><img alt="" src="" /></div><span class="drop-cinema-product-name"></span><span class="drop-cinema-product-index"></span></a>'
  ].join("");
  layer.querySelector(".drop-cinema-wordmark").innerHTML = wordmarkLines
    .filter(Boolean).map((line) => line.replace(/[&<>"]/g, "")).join("<br>");
  // Replace the old campaign caption with a compact product-image slideshow.
  const productShowcase = layer.querySelector(".drop-cinema-products");
  const productImage = layer.querySelector(".drop-cinema-product-image img");
  const productName = layer.querySelector(".drop-cinema-product-name");
  const productIndex = layer.querySelector(".drop-cinema-product-index");
  productImage.addEventListener("error", () => {
    // Skip only the failed file; keep the rest of the campaign images rotating.
    productShowcase.classList.add("image-unavailable");
    if (slideItems.length > 1) {
      window.setTimeout(() => {
        slideIndex = (slideIndex + 1) % slideItems.length;
        renderProductSlide();
      }, 250);
    }
  });
  productImage.addEventListener("load", () => productShowcase.classList.remove("image-unavailable"));
  const safeImageUrl = (value) => {
    let raw = String(value || "").trim();
    if (!raw) return "";
    // Database entries can contain JSON-quoted paths from older imports.
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1).trim();
    }
    if (/^(data:image\/|blob:)/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("//")) return window.location.protocol + raw;
    // Support absolute upload paths, nested paths, query strings, and older relative URLs.
    if (/^(?:\.?\.?\/)?uploads\//i.test(raw)) {
      raw = raw.replace(/^(?:\.\/|\.\.\/)+/g, "");
      return "/" + raw.replace(/^\/+/, "");
    }
    if (raw.startsWith("/")) return raw;
    return "";
  };
  const parseImageData = (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "string") return [parsed];
        return Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" ? Object.entries(parsed).map(([color, image]) => ({ color, image })) : [trimmed]);
      } catch { return [trimmed]; }
    }
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.entries(value).map(([color, image]) => ({ color, image }));
    return [];
  };
  const imageEntriesForProduct = (product) => {
    const entries = [];
    const add = (value, color = "") => {
      if (value == null) return;
      if (Array.isArray(value)) {
        value.forEach((item) => add(item, color));
        return;
      }
      if (typeof value === "object") {
        const label = String(value.color || value.colour || value.name || color || "").trim();
        // Imported/admin image objects have used several field names over time.
        const candidate = value.url || value.src || value.path || value.image_url || value.imageUrl ||
          value.filename || value.file || value.image || value.value || value.location;
        if (candidate && candidate !== value) {
          add(candidate, label);
          return;
        }
        // Handle maps such as { Green: "/uploads/green.jpg" } and nested image objects.
        Object.entries(value).forEach(([key, item]) => {
          const nextColor = label || (typeof item === "string" ? key : color);
          add(item, nextColor);
        });
        return;
      }
      const image = safeImageUrl(value);
      if (image) entries.push({ image, color: String(color || "").trim() });
    };

    let colors = product && product.colors;
    if (typeof colors === "string") {
      try { colors = JSON.parse(colors); } catch { colors = colors.split(",").map((item) => item.trim()).filter(Boolean); }
    }
    if (!Array.isArray(colors)) colors = [];

    // Read explicit colour-to-image mappings first so duplicate primary images
    // keep their colour label instead of becoming an unlabeled slide.
    const colorMap = product && product.color_images;
    parseImageData(colorMap).forEach((entry) => add(entry));
    parseImageData(product && product.images).forEach((entry, index) => add(entry, colors[index] || ""));
    add(product && (product.image || product.image_url || product.imageUrl), "");

    const seen = new Set();
    return entries.filter((entry) => {
      if (seen.has(entry.image)) return false;
      seen.add(entry.image);
      return true;
    });
  };
  let slideItems = [];
  let slideIndex = 0;
  let slideRenderToken = 0;
  let slideTimer = null;
  const imagePreloads = new Map();
  const preloadImage = (url) => {
    if (imagePreloads.has(url)) return imagePreloads.get(url);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Campaign image failed to load"));
      image.src = url;
      if (image.complete && image.naturalWidth > 0) resolve(image);
    });
    imagePreloads.set(url, promise);
    return promise;
  };
  const renderProductSlide = async () => {
    if (slideTimer) window.clearTimeout(slideTimer);
    if (!slideItems.length) {
      productShowcase.hidden = true;
      return;
    }
    const index = slideIndex % slideItems.length;
    const slide = slideItems[index];
    const token = ++slideRenderToken;
    try {
      // Load first, then update image + text together. A slow image can no
      // longer be cancelled by the next timer tick or paired with the wrong name.
      const loadedImage = await preloadImage(slide.image);
      if (token !== slideRenderToken) return;
      productShowcase.classList.remove("is-changing");
      productImage.src = loadedImage.src;
      productImage.alt = slide.name;
      productName.textContent = slide.name;
      productIndex.textContent = String(index + 1).padStart(2, "0") + " / " + String(slideItems.length).padStart(2, "0");
      productShowcase.href = slide.href;
      productShowcase.hidden = false;
      productShowcase.classList.remove("image-unavailable");
      void productShowcase.offsetWidth;
      productShowcase.classList.add("is-changing");
      // Start the 3.5-second display window only after this image is visible.
      // Warm the next image during that window to avoid a blank/slow transition.
      const nextIndex = (index + 1) % slideItems.length;
      if (slideItems.length > 1) preloadImage(slideItems[nextIndex].image).catch(() => {});
      slideTimer = window.setTimeout(() => {
        slideIndex = nextIndex;
        renderProductSlide();
      }, 3500);
    } catch {
      if (token !== slideRenderToken) return;
      if (slideItems.length > 1) {
        slideIndex = (index + 1) % slideItems.length;
        renderProductSlide();
      } else {
        productShowcase.hidden = true;
      }
    }
  };
  fetch("/api/store", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Store unavailable")))
    .then((data) => {
      const all = Array.isArray(data.products) ? data.products.filter((p) => p && p.published !== false) : [];
      const featured = all.filter((p) => Boolean(Number(p.featured)));
      const products = [...featured, ...all.filter((product) => !featured.includes(product))];
      slideItems = products.flatMap((product) => imageEntriesForProduct(product).map(({ image, color }) => ({
        image,
        name: String(product.name || "MONOWEAR piece") + (color ? " · " + color : ""),
        href: "/product.html?slug=" + encodeURIComponent(product.slug || "") + "&id=" + encodeURIComponent(String(product.id || ""))
      })));
      // Warm every slide immediately. The current image stays visible until
      // the next image is fully loaded, avoiding broken/blank transitions.
      slideItems.forEach((item) => preloadImage(item.image).catch(() => {}));
      renderProductSlide();
    })
    .catch(() => { productShowcase.hidden = true; });
  const grain = hero.querySelector(".hero-grain");
  if (grain) grain.insertAdjacentElement("afterend", layer);
  else hero.prepend(layer);

  const emberField = layer.querySelector(".drop-cinema-embers");
  let seed = 17;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 26; i += 1) {
    const ember = document.createElement("i");
    ember.className = "drop-cinema-ember";
    ember.style.setProperty("--x", (random() * 100).toFixed(2) + "%");
    ember.style.setProperty("--size", (1.5 + random() * 2.2).toFixed(1) + "px");
    ember.style.setProperty("--duration", (8 + random() * 12).toFixed(1) + "s");
    ember.style.setProperty("--delay", (-random() * 18).toFixed(1) + "s");
    ember.style.setProperty("--drift", ((random() - .5) * 130).toFixed(0) + "px");
    emberField.appendChild(ember);
  }

  const dateAtMidnightWAT = (dateString) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))) return null;
    const date = new Date(dateString + "T00:00:00+01:00");
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const cinemaCountdownLabel = layer.querySelector("[data-cinema-drop-label]");
  const cinemaCountdownValue = layer.querySelector("[data-cinema-drop-countdown]");
  const cinemaCountdownDate = layer.querySelector("[data-cinema-drop-date]");
  let campaignLaunchDate = "2026-11-10";
  const updateCinemaCountdown = () => {
    const target = dateAtMidnightWAT(campaignLaunchDate);
    if (cinemaCountdownDate) {
      cinemaCountdownDate.textContent = campaignLaunchDate;
      cinemaCountdownDate.dateTime = campaignLaunchDate;
    }
    if (!target || Date.now() >= target.getTime()) {
      if (cinemaCountdownLabel) cinemaCountdownLabel.textContent = "THE DROP IS LIVE";
      if (cinemaCountdownValue) cinemaCountdownValue.textContent = "AVAILABLE NOW";
      return;
    }
    const seconds = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = String(Math.floor((seconds % 86400) / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    if (cinemaCountdownLabel) cinemaCountdownLabel.textContent = "DROP GOES LIVE IN";
    if (cinemaCountdownValue) cinemaCountdownValue.textContent = days + "D " + hours + "H " + minutes + "M " + secs + "S";
  };
  updateCinemaCountdown();
  window.setInterval(updateCinemaCountdown, 1000);
  const previewMode = new URLSearchParams(window.location.search).get("cinemaPreview") === "1";
  const applyCampaignWindow = (settings = {}) => {
    const preorderDate = String(settings.drop_preorder_date || "2026-10-21");
    const launchDate = String(settings.drop_launch_date || "2026-11-10");
    campaignLaunchDate = launchDate;
    updateCinemaCountdown();
    const startsAt = dateAtMidnightWAT(preorderDate);
    const launchAt = dateAtMidnightWAT(launchDate);
    // Keep the campaign cinema running through the entire month containing drop day.
    // It clears automatically at midnight WAT on the first day of the following month.
    let endsAt = null;
    if (launchAt) {
      const nextMonth = new Date(launchAt.getTime());
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const year = nextMonth.getUTCFullYear();
      const month = String(nextMonth.getUTCMonth() + 1).padStart(2, "0");
      endsAt = dateAtMidnightWAT(`${year}-${month}-01`);
    }
    const now = Date.now();
    const isCampaignWindow = previewMode || (startsAt && launchAt && endsAt &&
      launchAt >= startsAt && endsAt > startsAt &&
      now >= startsAt.getTime() && now < endsAt.getTime());
    hero.classList.toggle("drop-cinema-active", Boolean(isCampaignWindow));
    if (isCampaignWindow) {
      hero.setAttribute("data-campaign-animation", "current-drop");
    } else {
      hero.removeAttribute("data-campaign-animation");
    }
  };

  // Use the same published Studio dates as the storefront countdown.
  applyCampaignWindow();
  fetch("/api/store", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Store settings unavailable")))
    .then((data) => applyCampaignWindow(data && data.settings ? data.settings : {}))
    .catch(() => { /* Safe defaults keep the campaign animation independent. */ });
})();