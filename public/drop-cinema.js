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
    '<div class="drop-cinema-caption">MONOWEAR / CAMPAIGN<span></span></div>'
  ].join("");
  layer.querySelector(".drop-cinema-wordmark").innerHTML = wordmarkLines
    .filter(Boolean).map((line) => line.replace(/[&<>"]/g, "")).join("<br>");
  layer.querySelector(".drop-cinema-caption span").textContent = campaignSubtitle;
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
  const previewMode = new URLSearchParams(window.location.search).get("cinemaPreview") === "1";
  const applyCampaignWindow = (settings = {}) => {
    const preorderDate = String(settings.drop_preorder_date || "2026-10-21");
    const launchDate = String(settings.drop_launch_date || "2026-11-10");
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