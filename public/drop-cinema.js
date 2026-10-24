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
    '<section class="drop-cinema-rack" aria-label="Scroll through MONOWEAR drop products"><div class="drop-cinema-rack-heading"><span>THE DROP / PIECES</span><span class="drop-cinema-rack-hint">SWIPE TO EXPLORE ↔</span></div><div class="drop-cinema-rail" aria-hidden="true"></div><div class="drop-cinema-track" tabindex="0" aria-label="Scrollable clothing rack"></div></section>'
  ].join("");
  layer.querySelector(".drop-cinema-wordmark").innerHTML = wordmarkLines
    .filter(Boolean).map((line) => line.replace(/[&<>"]/g, "")).join("<br>");

  const rack = layer.querySelector(".drop-cinema-rack");
  const track = layer.querySelector(".drop-cinema-track");
  const safeImageUrl = (value) => {
    let raw = String(value || "").trim();
    if (!raw) return "";
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1).trim();
    if (/^(data:image\/|blob:)/i.test(raw) || /^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("//")) return window.location.protocol + raw;
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
      if (Array.isArray(value)) return value.forEach((item) => add(item, color));
      if (typeof value === "object") {
        const label = String(value.color || value.colour || value.name || color || "").trim();
        const candidate = value.url || value.src || value.path || value.image_url || value.imageUrl || value.filename || value.file || value.image || value.value || value.location;
        if (candidate && candidate !== value) return add(candidate, label);
        return Object.entries(value).forEach(([key, item]) => add(item, label || (typeof item === "string" ? key : color)));
      }
      const image = safeImageUrl(value);
      if (image) entries.push({ image, color: String(color || "").trim() });
    };
    let colors = product && product.colors;
    if (typeof colors === "string") {
      try { colors = JSON.parse(colors); } catch { colors = colors.split(",").map((item) => item.trim()).filter(Boolean); }
    }
    if (!Array.isArray(colors)) colors = [];
    parseImageData(product && product.color_images).forEach((entry) => add(entry));
    parseImageData(product && product.images).forEach((entry, index) => add(entry, colors[index] || ""));
    add(product && (product.image || product.image_url || product.imageUrl), "");
    const seen = new Set();
    return entries.filter((entry) => {
      if (seen.has(entry.image)) return false;
      seen.add(entry.image);
      return true;
    });
  };
  const preloadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Product image failed to load"));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) resolve(image);
  });
  let dragStartX = 0;
  let dragScrollLeft = 0;
  let dragging = false;
  track.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true;
    dragStartX = event.clientX;
    dragScrollLeft = track.scrollLeft;
    track.classList.add("is-dragging");
    if (event.pointerType === "mouse") track.setPointerCapture(event.pointerId);
  });
  track.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    track.scrollLeft = dragScrollLeft - (event.clientX - dragStartX);
  });
  const stopDragging = () => { dragging = false; track.classList.remove("is-dragging"); };
  track.addEventListener("pointerup", stopDragging);
  track.addEventListener("pointercancel", stopDragging);
  track.addEventListener("lostpointercapture", stopDragging);

  fetch("/api/store", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Store unavailable")))
    .then(async (data) => {
      const all = Array.isArray(data.products) ? data.products.filter((p) => p && p.published !== false) : [];
      const featured = all.filter((p) => Boolean(Number(p.featured)));
      const products = [...featured, ...all.filter((product) => !featured.includes(product))];
      const items = products.flatMap((product) => imageEntriesForProduct(product).map(({ image, color }) => ({
        image,
        color,
        name: String(product.name || "MONOWEAR piece"),
        href: "/product.html?slug=" + encodeURIComponent(product.slug || "") + "&id=" + encodeURIComponent(String(product.id || ""))
      })));
      const loaded = await Promise.all(items.map(async (item) => {
        try { await preloadImage(item.image); return item; } catch { return null; }
      }));
      const readyItems = loaded.filter(Boolean);
      if (!readyItems.length) {
        rack.classList.add("is-empty");
        return;
      }
      const fragment = document.createDocumentFragment();
      readyItems.forEach((item, index) => {
        const link = document.createElement("a");
        link.className = "drop-cinema-hanger";
        link.href = item.href;
        link.setAttribute("aria-label", "Shop " + item.name + (item.color ? " in " + item.color : ""));
        const hanger = document.createElement("span");
        hanger.className = "drop-cinema-hanger-hook";
        hanger.setAttribute("aria-hidden", "true");
        const imageWrap = document.createElement("span");
        imageWrap.className = "drop-cinema-hanger-image";
        const image = document.createElement("img");
        image.src = item.image;
        image.alt = item.name + (item.color ? " — " + item.color : "");
        image.loading = "eager";
        image.decoding = "async";
        imageWrap.appendChild(image);
        const label = document.createElement("span");
        label.className = "drop-cinema-hanger-label";
        label.textContent = item.name;
        const color = document.createElement("span");
        color.className = "drop-cinema-hanger-color";
        color.textContent = item.color || "MONOWEAR";
        const count = document.createElement("span");
        count.className = "drop-cinema-hanger-count";
        count.textContent = String(index + 1).padStart(2, "0");
        link.append(hanger, imageWrap, label, color, count);
        fragment.appendChild(link);
      });
      track.replaceChildren(fragment);
      rack.hidden = false;
    })
    .catch(() => { rack.hidden = true; });
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