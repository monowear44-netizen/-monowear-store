"use strict";

const $ = (id) => document.getElementById(id);

let currentProducts = [];
let currentOrders = [];
let currentHistoricalRecords = [];
let currentSettings = {};

const imageSettings = [
  {
    key: "hero_background_image",
    file: "heroImageFile",
    preview: "heroImagePreview",
    placeholder: "heroImagePlaceholder",
    button: "uploadHeroImage",
    message: "heroImageMessage"
  },
  {
    key: "waitlist_background_image",
    file: "waitlistImageFile",
    preview: "waitlistImagePreview",
    placeholder: "waitlistImagePlaceholder",
    button: "uploadWaitlistImage",
    message: "waitlistImageMessage"
  },
  {
    key: "logo_image",
    file: "logoImageFile",
    preview: "logoImagePreview",
    placeholder: "logoImagePlaceholder",
    button: "uploadLogoImage",
    message: "logoImageMessage"
  }
];

// ============================================================
// HELPERS
// ============================================================

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    typeof options.body === "string"
  ) {
    headers["Content-Type"] ||= "application/json";
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Error(data.error || `Request failed (${response.status}).`);
  }

  return data;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function toast(message) {
  const element = $("toast");
  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 3500);
}

function showApp(email) {
  $("loginScreen").hidden = true;
  $("appScreen").hidden = false;
  $("loggedEmail").textContent = email || "";

  loadAll();
}

function showLogin() {
  $("loginScreen").hidden = false;
  $("appScreen").hidden = true;
}

function setPreview(previewId, url, placeholderId) {
  const preview = $(previewId);
  const placeholder = $(placeholderId);

  if (preview) {
    preview.hidden = !url;

    if (url) {
      preview.src = url;
    } else {
      preview.removeAttribute("src");
    }
  }

  if (placeholder) {
    placeholder.hidden = !!url;
  }
}

function showError(id, message) {
  const element = $(id);
  if (element) element.textContent = message || "";
}

// ============================================================
// AUTHENTICATION
// ============================================================

async function checkAuth() {
  try {
    const result = await api("/api/admin/me");

    if (result.authenticated) {
      showApp(result.admin?.email || result.email || "");
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  showError("loginError", "");

  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(
        Object.fromEntries(new FormData(event.currentTarget))
      )
    });

    showApp(result.admin?.email || result.email || "");
  } catch (error) {
    showError("loginError", error.message);
  }
});

$("logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch (error) {
    toast(error.message);
  }

  showLogin();
});

// ============================================================
// NAVIGATION
// ============================================================

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

function switchTab(tab) {
  window.monowearActiveTab = tab;
  const panelTab = (tab === "abandoned" || tab === "completed") ? "orders" : tab;
  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${panelTab}`;
  });

  const titles = {
    overview: "Overview",
    products: "Products",
    appearance: "Store editor",
    orders: "Orders",
    abandoned: "Abandoned carts",
    completed: "Completed & shipped",
    collections: "Collections",
    payments: "Payments",
    history: "LabelD History",
    audience: "Waitlist & Subscribers"
  };

  $("pageTitle").textContent = titles[tab] || "Studio";

  if (tab === "overview") loadSummary();
  if (tab === "orders" || tab === "abandoned") loadOrders();
  if (tab === "collections") loadCollections();
  if (tab === "payments") loadPayments();
  if (tab === "history") loadHistoricalRecords();
  if (tab === "appearance") loadEmailStatus();
  if (tab === "audience") loadAudience();
}

window.switchTab = switchTab;

// ============================================================
// LOAD STUDIO DATA
// ============================================================

async function loadAll() {
  await Promise.allSettled([
    loadProducts(),
    loadSettings(),
    loadSummary(),
    loadCollections()
  ]);
}

async function loadSummary() {
  try {
    const data = await api("/api/admin/dashboard");

    if ($("statProducts")) {
      $("statProducts").textContent = data.products ?? 0;
    }

    if ($("statOrders")) {
      $("statOrders").textContent = data.orders ?? 0;
    }

    if ($("statPending")) {
      $("statPending").textContent = data.lowStock ?? 0;
    }

    if ($("statRevenue")) {
      $("statRevenue").textContent = money(data.revenue);
    }

    if ($("statPaidOrders")) {
      $("statPaidOrders").textContent = data.paidOrders ?? 0;
    }

    if ($("statLowStock")) {
      $("statLowStock").textContent = data.lowStock ?? 0;
    }
    await loadTraffic();
    await refreshStudioNotifications(data);
  } catch (error) {
    toast("Dashboard: " + error.message);
  }
}

async function loadTraffic() {
  const period = $("trafficPeriod")?.value || "today";
  try {
    const data = await api("/api/admin/traffic?period=" + encodeURIComponent(period));
    if ($("statVisitors")) $("statVisitors").textContent = Number(data.visitors || 0).toLocaleString();
    if ($("statPageViews")) $("statPageViews").textContent = Number(data.pageViews || 0).toLocaleString();
    if ($("trafficUpdated")) $("trafficUpdated").textContent = "People who visited and total page views · " + data.label;
  } catch (error) {
    if ($("statVisitors")) $("statVisitors").textContent = "—";
    if ($("statPageViews")) $("statPageViews").textContent = "—";
    if ($("trafficUpdated")) $("trafficUpdated").textContent = "Traffic data unavailable.";
    console.warn("Traffic analytics:", error.message);
  }
}

$("trafficPeriod")?.addEventListener("change", loadTraffic);


// ============================================================
// COMPACT STUDIO NOTIFICATIONS
// Bell dot appears when there are new items to review.
// ============================================================
const STUDIO_NOTIFICATIONS_SEEN_KEY = "monowearStudioNotificationsSeenV1";
const STUDIO_NOTIFICATIONS_DISMISSED_KEY = "monowearStudioNotificationsDismissedV2";
let studioNotificationItems = [];
let studioNotificationSignature = "";
const STUDIO_NOTIFICATION_SOUND_KEY = "monowearStudioNotificationSoundV1";
let studioNotificationSoundContext = null;
let studioPreviousNotificationIds = null;

function studioNotificationSoundEnabled() {
  try { return localStorage.getItem(STUDIO_NOTIFICATION_SOUND_KEY) !== "off"; } catch { return true; }
}

let studioOrderSoundAudio = null;

async function playStudioNotificationSound(force = false) {
  if (!force && !studioNotificationSoundEnabled()) return;
  try {
    if (!studioOrderSoundAudio) {
      studioOrderSoundAudio = new Audio("https://www.myinstants.com/media/sounds/shopify-sales-41469.mp3");
      studioOrderSoundAudio.preload = "auto";
      studioOrderSoundAudio.volume = 0.9;
    }
    studioOrderSoundAudio.currentTime = 0;
    await studioOrderSoundAudio.play();
  } catch (error) {
    console.debug("Studio notification sound unavailable:", error.message);
    if (force) toast("The Shopify sound could not load. Check your connection and tap Test sound again.");
  }
}

function ensureStudioNotificationSoundControl() {
  const footer = $("studioNotificationPanel")?.querySelector(".studio-notification-footer");
  if (!footer) return;

  if (!$("studioNotificationSoundToggle")) {
    const button = document.createElement("button");
    button.id = "studioNotificationSoundToggle";
    button.type = "button";
    button.className = "quiet";
    button.style.marginRight = "8px";
    const update = () => {
      const enabled = studioNotificationSoundEnabled();
      button.textContent = enabled ? "Sound: ON ♪" : "Sound: OFF";
      button.setAttribute("aria-pressed", String(enabled));
      button.title = enabled ? "Turn Studio notification sounds off" : "Turn Studio notification sounds on";
    };
    button.addEventListener("click", () => {
      const enabled = !studioNotificationSoundEnabled();
      try { localStorage.setItem(STUDIO_NOTIFICATION_SOUND_KEY, enabled ? "on" : "off"); } catch {}
      update();
      if (enabled) playStudioNotificationSound(true);
    });
    footer.insertBefore(button, footer.firstChild);
    update();
  }

  if (!$("studioNotificationSoundTest")) {
    const test = document.createElement("button");
    test.id = "studioNotificationSoundTest";
    test.type = "button";
    test.className = "secondary";
    test.textContent = "Test sound";
    test.title = "Play a sample cash-register notification sound";
    test.addEventListener("click", () => playStudioNotificationSound(true));
    footer.appendChild(test);
  }
}

function getDismissedStudioNotifications() {
  try {
    const value = JSON.parse(localStorage.getItem(STUDIO_NOTIFICATIONS_DISMISSED_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function dismissStudioNotification(id) {
  try {
    const dismissed = getDismissedStudioNotifications();
    dismissed[String(id)] = Date.now();
    // Keep this small and bounded for long-lived Studio installs.
    const entries = Object.entries(dismissed).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 300);
    localStorage.setItem(STUDIO_NOTIFICATIONS_DISMISSED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

function notificationItem(id, title, detail, tab, kind = "attention") {
  return { id: String(id), title, detail, tab, kind };
}

function renderStudioNotifications() {
  const list = $("studioNotificationList");
  const dot = $("studioBellDot");
  if (!list) return;
  const signature = studioNotificationItems.map(item => item.id).sort().join("|");
  if (studioPreviousNotificationIds !== null) {
    const previous = new Set(studioPreviousNotificationIds);
    const hasNewNotification = studioNotificationItems.some(item => !previous.has(item.id));
    if (hasNewNotification) playStudioNotificationSound();
  }
  studioPreviousNotificationIds = studioNotificationItems.map(item => item.id);
  studioNotificationSignature = signature;
  ensureStudioNotificationSoundControl();
  let seen = "";
  try { seen = localStorage.getItem(STUDIO_NOTIFICATIONS_SEEN_KEY) || ""; } catch {}
  if (dot) dot.hidden = !signature || signature === seen;
  if (!studioNotificationItems.length) {
    list.innerHTML = '<div class="studio-notification-empty"><span class="notification-check">✓</span><strong>You’re all caught up.</strong><p class="muted">Read notifications clear from this panel. Admin email alerts remain unchanged.</p></div>';
    return;
  }
  list.innerHTML = studioNotificationItems.map(item => `
    <button type="button" class="studio-notification-item ${item.kind === "urgent" ? "is-urgent" : ""}" data-notification-id="${esc(item.id)}" data-notification-tab="${esc(item.tab)}" aria-label="${esc(item.title)}. Open and mark as read">
      <span class="notification-indicator" aria-hidden="true"></span>
      <span><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span>
      <span class="notification-arrow" aria-hidden="true">↗</span>
    </button>`).join("");
  list.querySelectorAll("[data-notification-id]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = String(button.dataset.notificationId || "");
      const tab = button.dataset.notificationTab || "overview";
      // Remove it from the Studio panel immediately. This never touches admin email delivery.
      dismissStudioNotification(id);
      studioNotificationItems = studioNotificationItems.filter(item => item.id !== id);
      try { localStorage.setItem(STUDIO_NOTIFICATIONS_SEEN_KEY, studioNotificationItems.map(item => item.id).sort().join("|")); } catch {}
      renderStudioNotifications();
      closeStudioNotifications();
      if (id.startsWith("history:")) {
        const notificationId = Number(id.slice("history:".length));
        if (Number.isInteger(notificationId) && notificationId > 0) {
          try { await api("/api/admin/notifications/" + notificationId + "/read", { method: "POST", body: "{}" }); }
          catch (error) { console.warn("Could not mark Studio notification as read:", error.message); }
        }
      }
      switchTab(tab);
    });
  });
}

async function refreshStudioNotifications(summary = null) {
  const items = [];
  try {
    const dashboard = summary || await api("/api/admin/dashboard");
    const products = currentProducts.length ? currentProducts : await api("/api/admin/products");
    const lowStock = (Array.isArray(products) ? products : []).filter(product => Number(product.stock || 0) <= 5 && product.published !== false);
    if (lowStock.length) {
      items.push(notificationItem("stock:" + lowStock.map(p => p.id + "-" + p.stock).sort().join(","), "Low stock needs attention", lowStock.length + " published product" + (lowStock.length === 1 ? " has" : "s have") + " 5 or fewer units.", "products", "urgent"));
    }
    if (Number(dashboard.pendingOrders || 0) > 0) {
      items.push(notificationItem("pending-orders:" + Number(dashboard.pendingOrders), "Orders need checking", Number(dashboard.pendingOrders) + " order" + (Number(dashboard.pendingOrders) === 1 ? " is" : "s are") + " pending review or payment.", "orders", "urgent"));
    }
  } catch (error) {
    console.warn("Dashboard notifications:", error.message);
  }

  try {
    const history = await api("/api/admin/notifications");
    (Array.isArray(history.notifications) ? history.notifications : []).forEach(notification => {
      // Already-read historical notifications should not return to the Studio bell.
      if (notification.read_at) return;
      let title = String(notification.title || "").trim();
      let body = String(notification.body || "").trim();
      if (title.toLowerCase() === "monowear notifications are on") {
        title = "Studio is connected";
        body = "";
      }
      if (title.toLowerCase() === "studio is connected") body = "";
      const url = String(notification.url || "/studio");
      const tab = url.includes("products") ? "products" : url.includes("orders") ? "orders" : url.includes("payments") ? "payments" : url.includes("audience") ? "audience" : "overview";
      items.push(notificationItem("history:" + notification.id, title || body || "Store update", body && body !== title ? body : "Open Studio to review this update.", tab, "urgent"));
    });
  } catch (error) {
    console.warn("Saved store notifications:", error.message);
  }

  try {
    const response = await api("/api/admin/monitoring");
    const attention = Array.isArray(response.attention) ? response.attention : [];
    attention.forEach(order => {
      const payment = String(order.payment_status || "").toLowerCase();
      const email = String(order.email_status || "").toLowerCase();
      if (payment === "pending" || payment === "failed") {
        items.push(notificationItem("payment:" + order.reference + ":" + payment, "Payment needs checking", "Order " + order.reference + " · " + payment.replace(/[_-]/g, " "), "payments", "urgent"));
      }
      if (email === "failed" || email === "sending" || email === "skipped") {
        items.push(notificationItem("email:" + order.reference + ":" + email, "Order email needs attention", "Order " + order.reference + " · email " + email, "orders", "urgent"));
      }
    });
    if (response.paystack_configured === false) {
      items.push(notificationItem("config:paystack", "Paystack is not configured", "Check payment settings before accepting orders.", "payments", "urgent"));
    }
    if (response.email_configured === false) {
      items.push(notificationItem("config:email", "Order email is not configured", "Check email settings in Studio.", "appearance", "urgent"));
    }
  } catch (error) {
    console.warn("Store monitoring notifications:", error.message);
  }

  const dismissed = getDismissedStudioNotifications();
  const deduped = new Map(items.map(item => [item.id, item]));
  studioNotificationItems = [...deduped.values()].filter(item => !dismissed[item.id]);
  renderStudioNotifications();
}

function closeStudioNotifications() {
  const panel = $("studioNotificationPanel");
  const button = $("studioBellButton");
  if (panel) panel.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function openStudioNotifications() {
  const panel = $("studioNotificationPanel");
  const button = $("studioBellButton");
  if (!panel || !button) return;
  panel.hidden = false;
  button.setAttribute("aria-expanded", "true");
  try { localStorage.setItem(STUDIO_NOTIFICATIONS_SEEN_KEY, studioNotificationSignature); } catch {}
  renderStudioNotifications();
}

$("studioBellButton")?.addEventListener("click", () => {
  const panel = $("studioNotificationPanel");
  if (panel && !panel.hidden) closeStudioNotifications();
  else openStudioNotifications();
});
$("studioCloseNotifications")?.addEventListener("click", closeStudioNotifications);
document.addEventListener("click", event => {
  const wrap = document.querySelector(".studio-notification-wrap");
  if (wrap && !wrap.contains(event.target)) closeStudioNotifications();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeStudioNotifications();
});

// ============================================================
// IMAGE UPLOAD
// ============================================================

async function uploadImage(file) {
  if (!file) throw Error("Please select an image.");

  if (file.size > 5 * 1024 * 1024) {
    throw Error(`"${file.name}" is larger than 5 MB. Choose a smaller image.`);
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw Error(`"${file.name}" is not a supported image. Choose JPG, PNG, WEBP or GIF.`);
  }

  const formData = new FormData();
  // The multi-image endpoint expects the field name "images".
  formData.append("images", file);

  const result = await api("/api/admin/upload", {
    method: "POST",
    body: formData
  });

  const url = result.urls?.[0] || result.files?.[0]?.url;
  if (!url) {
    throw Error(`The server did not return a URL for "${file.name}".`);
  }

  return url;
}

async function uploadImages(files) {
  if (!files.length) return [];

  const formData = new FormData();
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      throw Error(`"${file.name}" is larger than 5 MB. Choose a smaller image.`);
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      throw Error(`"${file.name}" is not a supported image. Choose JPG, PNG, WEBP or GIF.`);
    }
    formData.append("images", file);
  }

  const result = await api("/api/admin/upload", {
    method: "POST",
    body: formData
  });

  const urls = Array.isArray(result.urls)
    ? result.urls
    : (result.files || []).map((file) => file.url).filter(Boolean);

  if (urls.length !== files.length) {
    throw Error("Not all product images uploaded successfully. Please try again.");
  }

  return urls;
}

// ============================================================
// SHARED HELPERS (added)
// ============================================================

function checkedIds(selector) {
  return [...document.querySelectorAll(`${selector} input:checked`)]
    .map((input) => Number(input.value));
}

// Database times are stored in UTC; show them in Lagos time.
function fmtDate(value) {
  if (!value) return "—";

  const text = String(value);
  const date = new Date(
    /[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : text.replace(" ", "T") + "Z"
  );

  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function badge(text, kind = "") {
  return `<span class="badge ${kind}">${esc(text)}</span>`;
}

function paymentBadge(status) {
  const value = String(status || "pending").toLowerCase();
  const kinds = { paid: "good", pending: "warn", failed: "bad", refunded: "muted" };
  const labels = { pending: "AWAITING PAYMENT" };

  return badge(labels[value] || value.toUpperCase(), kinds[value] || "");
}

function emailBadge(status) {
  const value = String(status || "");
  const map = {
    sent: ["EMAIL SENT", "good"],
    failed: ["EMAIL FAILED", "bad"],
    sending: ["EMAIL SENDING", "warn"],
    legacy: ["EMAIL BEFORE UPDATE", "muted"],
    skipped: ["EMAIL SKIPPED", "muted"]
  };

  return map[value] ? badge(map[value][0], map[value][1]) : "";
}

// ============================================================
// PRODUCTS
// ============================================================

async function loadProducts() {
  try {
    currentProducts = await api("/api/admin/products");

    if ($("productCount")) {
      $("productCount").textContent = currentProducts.length;
    }

    renderProducts();
  } catch (error) {
    toast("Products: " + error.message);
  }
}

function renderProducts() {
  const container = $("productsList");
  if (!container) return;

  const query = ($("productSearch")?.value || "").trim().toLowerCase();

  const list = currentProducts.filter((product) => {
    if (!query) return true;

    return [product.name, product.category, product.slug]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  container.innerHTML = list.map((product) => {
    const stock = Number(product.stock || 0);

    const stockBadge =
      stock === 0
        ? badge("SOLD OUT", "bad")
        : stock <= 5
          ? badge("LOW STOCK", "warn")
          : "";

    const collections = (product.collections || [])
      .map((collection) => esc(collection.name))
      .join(", ");

    return `
    <article class="product-row">
      <div class="thumb">
        ${
          product.image
            ? `<img src="${esc(product.image)}" alt="">`
            : "MONO"
        }
      </div>

      <div>
        <h3>${esc(product.name)} ${stockBadge}</h3>
        <p>
          ${esc(product.category)}
          · Stock ${stock}
          · ${product.published ? "Published" : "Hidden"}
          · ${product.featured ? "Featured" : "Standard"}
          · ${collections || "No collection"}
        </p>
      </div>

      <strong class="price">${money(product.price)}</strong>

      <div class="row-actions">
        <button
          class="small-button"
          type="button"
          onclick="editProduct(${Number(product.id)})"
        >
          EDIT ↗
        </button>
      </div>
    </article>`;
  }).join("") || `
    <p class="muted">
      ${query ? "No products match your search." : "No products yet. Add your first product."}
    </p>
  `;
}

if ($("productSearch")) {
  $("productSearch").addEventListener("input", renderProducts);
}

// Collection checkboxes shown inside the product form
function renderProductCollectionPicker(
  selected = checkedIds("#productCollectionPicker")
) {
  const box = $("productCollectionPicker");
  if (!box) return;

  const choices = currentCollections.filter(
    (collection) => !collection.archived || selected.includes(Number(collection.id))
  );

  box.innerHTML = choices.map((collection) => `
    <label>
      <input
        type="checkbox"
        value="${Number(collection.id)}"
        ${selected.includes(Number(collection.id)) ? "checked" : ""}
      >
      ${esc(collection.name)}${collection.archived ? " (archived)" : ""}
    </label>
  `).join("") || `<p class="muted">No collections yet. Create one below.</p>`;
}

function readColorImageMap() {
  const field = $("productForm").elements.color_images;
  try {
    const value = JSON.parse(field?.value || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function renderColorImageAssignments(savedMap = readColorImageMap()) {
  const container = $("colorImageAssignments");
  const form = $("productForm");
  if (!container || !form) return;

  const colors = String(form.elements.colors.value || "")
    .split(",").map((value) => value.trim()).filter(Boolean)
    .filter((value, index, all) => all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);

  const map = {};
  for (const color of colors) {
    const oldKey = Object.keys(savedMap || {}).find((key) => key.toLowerCase() === color.toLowerCase());
    if (oldKey && savedMap[oldKey]) map[color] = savedMap[oldKey];
  }
  form.elements.color_images.value = JSON.stringify(map);

  container.innerHTML = colors.length ? colors.map((color, index) => {
    const url = map[color] || "";
    return `<label class="color-image-assignment">
      <strong>${esc(color)}</strong>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-color-image="${esc(color)}" aria-label="Upload photo for ${esc(color)}">
      <small class="muted">Choose the photo that shows this exact colour.</small>
      ${url ? `<img src="${esc(url)}" alt="${esc(color)} product preview" style="display:block;max-width:140px;max-height:160px;object-fit:contain;">` : '<small class="muted">No colour photo assigned yet.</small>'}
    </label>`;
  }).join("") : '<p class="muted">Add colour names above to assign a matching photo to each one.</p>';

  container.querySelectorAll("input[data-color-image]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024 || !["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) {
        showError("productError", "Each colour photo must be a JPG, PNG, WEBP or GIF image no larger than 5 MB.");
        input.value = "";
        return;
      }
      showError("productError", "");
      const preview = input.parentElement.querySelector("img");
      if (preview) preview.src = URL.createObjectURL(file);
      else {
        const note = input.parentElement.querySelector(".muted:last-child");
        if (note) note.textContent = "New photo selected for " + input.dataset.colorImage + ".";
      }
    });
  });
}

function syncDiscountFields() {
  const form = $("productForm");
  if (!form || !form.elements.discount_enabled) return;
  const enabled = form.elements.discount_enabled.checked;
  // Keep the original-price field editable so mobile browsers don't lose its
  // value while toggling the discount. The save handler decides whether to use it.
  form.elements.compare_price.disabled = false;
  form.elements.compare_price.required = enabled;
  form.elements.compare_price.setAttribute("aria-disabled", enabled ? "false" : "true");
  form.elements.compare_price.style.opacity = enabled ? "1" : ".65";
}
$("productForm")?.elements.discount_enabled?.addEventListener("change", syncDiscountFields);

function newProduct() {
  const form = $("productForm");

  form.reset();
  form.hidden = false;

  form.elements.id.value = "";
  form.elements.sizes.value = "S,M,L,XL";
  form.elements.colors.value = "";
  form.elements.images.value = "";
  form.elements.color_images.value = "{}";
  renderColorImageAssignments({});
  form.elements.stock.value = 0;
  form.elements.published.checked = true;
  form.elements.featured.checked = false;
  form.elements.discount_enabled.checked = false;
  syncDiscountFields();
  form.elements.sort_order.value = 0;

  renderProductCollectionPicker([]);

  $("productFormTitle").textContent = "Add a product";
  $("deleteProductButton").hidden = true;

  showError("productError", "");

  setPreview("imagePreview", "", "imagePreviewWrap");
  const fileInput = form.elements.imageFile;
  if (fileInput) fileInput.value = "";

  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

window.editProduct = (id) => {
  const product = currentProducts.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!product) return;

  const form = $("productForm");

  form.reset();
  form.hidden = false;

  for (const key of [
    "id",
    "name",
    "slug",
    "category",
    "price",
    "compare_price",
    "sizes",
    "colors",
    "stock",
    "image",
    "images",
    "color_images",
    "description",
    "sort_order"
  ]) {
    if (!form.elements[key]) continue;

    let value = product[key] ?? "";

    if (key === "id") value = product.id;

    if (key === "images") {
      value = Array.isArray(product.images) ? product.images.join("\n") : product.images || "";
    }

    if (key === "color_images") {
      value = JSON.stringify(product.color_images || {});
    }

    if (key === "sizes" || key === "colors") {
      value = Array.isArray(product[key])
        ? product[key].join(", ")
        : product[key] || "";
    }

    form.elements[key].value = value;
  }

  form.elements.featured.checked = !!product.featured;
  form.elements.published.checked = !!product.published;
  form.elements.discount_enabled.checked = Number(product.compare_price || 0) > Number(product.price || 0);
  syncDiscountFields();
  renderColorImageAssignments(product.color_images || {});

  renderProductCollectionPicker(
    (product.collections || []).map((collection) => Number(collection.id))
  );

  setPreview(
    "imagePreview",
    product.image || "",
    "imagePreviewWrap"
  );

  $("productFormTitle").textContent = "Edit product";
  $("deleteProductButton").hidden = false;

  showError("productError", "");

  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
};

$("newProductButton").addEventListener("click", newProduct);
$("productForm").elements.colors.addEventListener("input", () => renderColorImageAssignments(readColorImageMap()));

$("cancelProduct").addEventListener("click", () => {
  $("productForm").hidden = true;
});

$("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const id = form.elements.id.value;

  const body = {};

  for (const key of [
    "name",
    "slug",
    "category",
    "price",
    "compare_price",
    "sizes",
    "colors",
    "stock",
    "image",
    "description",
    "sort_order"
  ]) {
    body[key] = form.elements[key].value;
  }

  body.price = Number(body.price);
  body.stock = Number(body.stock);

  body.compare_price =
    body.compare_price === ""
      ? 0
      : Number(body.compare_price);

  const discountEnabled = !!form.elements.discount_enabled.checked;
  if (discountEnabled && !(body.compare_price > body.price)) {
    showError("productError", "For a discount, the original price must be higher than the selling price.");
    return;
  }
  if (!discountEnabled) body.compare_price = 0;

  body.sizes = body.sizes
    .split(",")
    .map((size) => size.trim())
    .filter(Boolean);

  body.colors = body.colors
    .split(",")
    .map((color) => color.trim())
    .filter(Boolean)
    .filter((color, index, all) => all.findIndex((item) => item.toLowerCase() === color.toLowerCase()) === index);

  body.featured = form.elements.featured.checked;
  body.published = form.elements.published.checked;
  body.collection_ids = checkedIds("#productCollectionPicker");

  showError("productError", "");

  const saveButton = form.querySelector('button[type="submit"]');
  if (saveButton) saveButton.disabled = true;
  if (saveButton) saveButton.textContent = "SAVING PRODUCT…";

  try {
    const selectedFiles = [...(form.elements.imageFile?.files || [])];
    const existingImages = String(form.elements.images?.value || "")
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);

    if (existingImages.length + selectedFiles.length > 10) {
      throw Error("A product can have up to 10 images in total. Remove some images before adding more.");
    }

    // Upload all selected files together using the server's multi-image route.
    const uploadedImages = await uploadImages(selectedFiles);

    let colorImages = readColorImageMap();
    for (const input of $("colorImageAssignments").querySelectorAll("input[data-color-image]")) {
      const file = input.files && input.files[0];
      if (!file) continue;
      const urls = await uploadImages([file]);
      colorImages[input.dataset.colorImage] = urls[0];
    }
    // Keep only mappings for colours that are currently offered for this product.
    const normalizedColorImages = {};
    for (const color of body.colors) {
      const key = Object.keys(colorImages).find((item) => item.toLowerCase() === color.toLowerCase());
      if (key && colorImages[key]) normalizedColorImages[color] = colorImages[key];
    }
    body.color_images = normalizedColorImages;

    // Newly uploaded product photos must take priority over the previously saved gallery.
    // Otherwise the old first image remains the product.image and the storefront never changes.
    body.images = [...uploadedImages, ...existingImages, ...Object.values(normalizedColorImages)]
      .filter((url, index, all) => all.indexOf(url) === index);
    body.image = uploadedImages[0] || body.images[0] || body.image || "";


    await api(
      id ? `/api/admin/products/${id}` : "/api/admin/products",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body)
      }
    );

    form.hidden = true;

    await Promise.all([
      loadProducts(),
      loadSummary(),
      loadCollections()
    ]);

    toast("Product saved successfully.");
  } catch (error) {
    showError("productError", error.message);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = id ? "SAVE CHANGES" : "SAVE PRODUCT";
    }
  }
});

$("deleteProductButton").addEventListener("click", async () => {
  const id = $("productForm").elements.id.value;

  if (!id || !confirm("Delete this product permanently?")) {
    return;
  }

  try {
    await api(`/api/admin/products/${id}`, {
      method: "DELETE"
    });

    $("productForm").hidden = true;

    await Promise.all([
      loadProducts(),
      loadSummary()
    ]);

    toast("Product deleted.");
  } catch (error) {
    showError("productError", error.message);
  }
});

// ============================================================
// STORE SETTINGS
// ============================================================

async function loadSettings() {
  try {
    const data = await api("/api/store");

    currentSettings = data.settings || {};
    if (!currentSettings.story_title) currentSettings.story_title = "Built for the ones who keep going.";
    if (!currentSettings.brand_story) currentSettings.brand_story = "MONO is a state of mind: self-reliant, intentional, and unwilling to wait for permission. Every piece carries a reminder to keep showing up for your own future.";

    const form = $("settingsForm");

    for (const [key, value] of Object.entries(currentSettings)) {
      if (form.elements[key]) {
        form.elements[key].value = value ?? "";
      }
    }

    for (const setting of imageSettings) {
      const url = currentSettings[setting.key] || "";

      setPreview(
        setting.preview,
        url,
        setting.placeholder
      );

      const input = $(setting.file);

      if (input) input.value = "";
    }

    if (window.refreshStudioImagePreviews) {
      window.refreshStudioImagePreviews();
    }
    if (window.refreshDesignPreview) window.refreshDesignPreview();
  } catch (error) {
    showError("settingsMessage", "Could not load settings: " + error.message);
  }
}

// Upload header and waitlist images through their actual HTML controls.
for (const setting of imageSettings) {
  const fileInput = $(setting.file);
  const uploadButton = $(setting.button);

  if (uploadButton && fileInput) {
    uploadButton.addEventListener("click", async () => {
      const file = fileInput.files && fileInput.files[0];

      if (!file) {
        showError(setting.message, "Select an image first.");
        return;
      }

      if (
        setting.key === "logo_image" &&
        !["image/png", "image/jpeg"].includes(file.type)
      ) {
        showError(setting.message, "For emails, please use a PNG or JPG logo.");
        return;
      }

      showError(setting.message, "Uploading image…");

      try {
        const url = await uploadImage(file);

        $("settingsForm").elements[setting.key].value = url;

        setPreview(
          setting.preview,
          url,
          setting.placeholder
        );

        showError(setting.message, "Image uploaded. Save store changes to publish it.");

      } catch (error) {
        showError(setting.message, error.message);
      }
    });
  }
}

$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const saveButton = form.querySelector('button[type="submit"]');

  showError("settingsMessage", "Saving store settings…");

  if (saveButton) saveButton.disabled = true;

  try {
    const body = Object.fromEntries(new FormData(form));

    for (const setting of imageSettings) {
      body[setting.key] =
        form.elements[setting.key].value || "";
    }

    const result = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(body)
    });

    currentSettings = result.settings || body;

    for (const [key, value] of Object.entries(currentSettings)) {
      if (form.elements[key]) {
        form.elements[key].value = value ?? "";
      }
    }

    showError(
      "settingsMessage",
      "Saved successfully. Your storefront settings have been updated."
    );

    toast("Store settings saved.");
    if (window.applyMonowearGlobalTheme) window.applyMonowearGlobalTheme(currentSettings);
    if (window.refreshDesignPreview) window.refreshDesignPreview();
    loadEmailStatus();
  } catch (error) {
    showError(
      "settingsMessage",
      "Could not save settings: " + error.message
    );
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
});


// ============================================================
// WAITLIST & NEWSLETTER SUBSCRIBERS
// ============================================================

let currentWaitlist = [];
let currentNewsletter = [];

function setCampaignMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", Boolean(isError));
}
function resetCampaignConfirmation() {
  if ($("emailCampaignConfirm")) $("emailCampaignConfirm").value = "";
  if ($("emailCampaignReviewed")) $("emailCampaignReviewed").checked = false;
}
$("generateCampaignDraft")?.addEventListener("click", async () => {
  const request = $("emailCampaignRequest")?.value.trim();
  if (!request) return setCampaignMessage("campaignDraftMessage","Describe the announcement first.",true);
  const button=$("generateCampaignDraft"); button.disabled=true; button.textContent="WRITING…";
  setCampaignMessage("campaignDraftMessage","MONOWEAR AI is writing your draft. No email will be sent.");
  try {
    const draft=await api("/api/admin/email-draft",{method:"POST",body:JSON.stringify({request,tone:$("emailCampaignTone")?.value||"cinematic, confident, concise"})});
    $("emailCampaignSubject").value=draft.subject||"";
    $("emailCampaignPreview").value=draft.preview||"";
    $("emailCampaignBody").value=draft.body||"";
    $("emailCampaignCtaLabel").value=draft.cta_label||"";
    $("emailCampaignCtaUrl").value=draft.cta_url||"";
    resetCampaignConfirmation();
    setCampaignMessage("campaignDraftMessage","Draft ready. Edit it freely, then review the audience before sending.");
    setCampaignMessage("campaignSendMessage","");
  } catch(error) { setCampaignMessage("campaignDraftMessage",error.message,true); }
  finally { button.disabled=false; button.textContent="WRITE EMAIL WITH AI ✦"; }
});
$("clearCampaignDraft")?.addEventListener("click",()=>{
  ["emailCampaignSubject","emailCampaignPreview","emailCampaignBody","emailCampaignCtaLabel","emailCampaignCtaUrl","emailCampaignConfirm"].forEach(id=>{if($(id))$(id).value="";});
  if($("emailCampaignReviewed"))$("emailCampaignReviewed").checked=false;
  setCampaignMessage("campaignDraftMessage","Draft cleared."); setCampaignMessage("campaignSendMessage","");
});
["emailCampaignSubject","emailCampaignPreview","emailCampaignBody","emailCampaignCtaLabel","emailCampaignCtaUrl"].forEach(id=>$(id)?.addEventListener("input",resetCampaignConfirmation));
$("sendCampaignEmail")?.addEventListener("click",async()=>{
  const subject=$("emailCampaignSubject")?.value.trim()||"", body=$("emailCampaignBody")?.value.trim()||"", confirmText=$("emailCampaignConfirm")?.value.trim()||"";
  if(!subject||!body)return setCampaignMessage("campaignSendMessage","Add an email subject and body first.",true);
  if(!$("emailCampaignReviewed")?.checked)return setCampaignMessage("campaignSendMessage","Tick the review box after checking the final email and audience.",true);
  if(confirmText!=="SEND")return setCampaignMessage("campaignSendMessage","Type SEND exactly to authorize delivery.",true);
  const audienceCount=currentNewsletter.filter(item=>!item.unsubscribed_at).length;
  if(!audienceCount)return setCampaignMessage("campaignSendMessage","No active general-list subscribers are loaded. Refresh the audience first.",true);
  if(audienceCount>100)return setCampaignMessage("campaignSendMessage","This campaign is over the current 100-recipient safety limit. Contact support before a larger send.",true);
  const confirmed=window.confirm("FINAL CONFIRMATION\n\nSend “"+subject+"” to "+audienceCount+" active general-list subscriber(s) through Resend?\n\nThis cannot be undone. Product-specific waitlists are excluded.");
  if(!confirmed)return;
  const button=$("sendCampaignEmail");button.disabled=true;button.textContent="SENDING…";
  setCampaignMessage("campaignSendMessage","Sending through Resend. Keep Studio open until the result appears.");
  try {
    const result=await api("/api/admin/email-campaign",{method:"POST",body:JSON.stringify({subject,preview:$("emailCampaignPreview")?.value||"",body,cta_label:$("emailCampaignCtaLabel")?.value||"",cta_url:$("emailCampaignCtaUrl")?.value||"",confirm_text:confirmText})});
    setCampaignMessage("campaignSendMessage","Campaign finished: "+result.sent+" sent, "+result.failed+" failed out of "+result.attempted+" attempted.",result.failed>0);
    if(result.failures?.length)setCampaignMessage("campaignDraftMessage","Some deliveries failed: "+result.failures.map(item=>item.email+" ("+item.error+")").join("; "),true);
    resetCampaignConfirmation(); await loadAudience();
  } catch(error) { setCampaignMessage("campaignSendMessage",error.message,true); }
  finally { button.disabled=false;button.textContent="SEND CAMPAIGN THROUGH RESEND ↗"; }
});

function audienceDate(value) {
  if (!value) return "—";
  const parsed = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function renderAudienceTable(targetId, rows, kind) {
  const target = $(targetId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = '<p class="muted">No sign-ups yet.</p>';
    return;
  }
  const headings = kind === "waitlist"
    ? ["Email address", "Product / drop", "Joined"]
    : ["Email address", "Subscribed"];
  const body = rows.map((row) => {
    const email = esc(row.email || "");
    const date = esc(audienceDate(row.created_at));
    return kind === "waitlist"
      ? '<div class="product-row audience-subscriber-row"><div class="audience-email"><strong>' + email + '</strong><p class="muted">' + esc(row.product_name || "General waitlist") + '</p></div><span class="audience-date">' + date + '</span></div>'
      : '<div class="product-row audience-subscriber-row"><strong class="audience-email">' + email + '</strong><span class="audience-date">' + date + '</span></div>';
  }).join("");
  target.innerHTML = '<p class="eyebrow">' + headings.map(esc).join(" · ") + '</p>' + body;
}

async function loadAudience() {
  const message = $("audienceMessage");
  if (message) message.textContent = "Loading subscribers…";
  try {
    const newsletter = await api("/api/admin/newsletter");
    currentNewsletter = Array.isArray(newsletter) ? newsletter : [];
    currentWaitlist = [];
    if ($("newsletterCount")) $("newsletterCount").textContent = currentNewsletter.length + (currentNewsletter.length === 1 ? " subscriber" : " subscribers");
    renderAudienceTable("newsletterList", currentNewsletter, "newsletter");
    if (message) message.textContent = "Updated. " + currentNewsletter.length + " general drop-list subscribers found.";
  } catch (error) {
    if (message) message.textContent = "Could not load subscribers: " + error.message;
    if ($("newsletterList")) $("newsletterList").innerHTML = '<p class="error">Could not load subscribers.</p>';
  }
}

function csvCell(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function exportAudienceCsv() {
  const rows = [
    ["Email", "Subscribed"],
    ...currentNewsletter.map((item) => [item.email, item.created_at])
  ];
  if (rows.length === 1) {
    toast("There are no subscribers to export yet.");
    return;
  }
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "monowear-subscribers.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

$("refreshAudience")?.addEventListener("click", loadAudience);
$("exportAudience")?.addEventListener("click", exportAudienceCsv);

// ============================================================
// ORDERS
// ============================================================

async function loadOrders() {
  try {
    const endpoint = window.monowearActiveTab === "abandoned"
      ? "/api/admin/abandoned-carts"
      : window.monowearActiveTab === "completed"
        ? "/api/admin/completed-orders"
        : "/api/admin/orders";
    currentOrders = await api(endpoint);

    if ($("orderCount")) {
      $("orderCount").textContent = currentOrders.length;
    }

    renderOrders();
  } catch (error) {
    toast("Orders: " + error.message);
  }
}

function renderOrders() {
  const container = $("ordersList");
  if (!container) return;

  const statuses = [
    "pending",
    "processing",
    "paid",
    "packed",
    "shipped",
    "delivered",
    "cancelled",
    "refunded"
  ];

  const query = ($("orderSearch")?.value || "").trim().toLowerCase();
  const pay = $("orderPayFilter")?.value || "all";
  const status = $("orderStatusFilter")?.value || "all";
  const recordType = $("orderRecordFilter")?.value || "all";

  const list = currentOrders.filter((order) => {
    if (recordType !== "all" && (order.record_type || "real_order") !== recordType) return false;
    if (pay !== "all" && String(order.payment_status).toLowerCase() !== pay) {
      return false;
    }

    if (status !== "all" && String(order.order_status).toLowerCase() !== status) {
      return false;
    }

    if (!query) return true;

    return [order.reference, order.customer_name, order.customer_email]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  container.innerHTML = list.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];

    const itemLines = items.map((item) => `
      <li>
        ${Number(item.quantity || 1)} × ${esc(item.name)}
        ${item.size ? ` · Size ${esc(item.size)}` : ""}
        ${item.color ? ` · ${esc(item.color)}` : ""}
      </li>
    `).join("");

    const isPaid = String(order.payment_status).toLowerCase() === "paid";

    return `
    <article class="order-card">
      <div>
        <h3>
          #${esc(order.reference || order.id)}
          · ${esc(order.customer_name)}
          · ${money(order.total)}
        </h3>

        <p>
          ${badge((order.record_type || "real_order") === "abandoned_cart" ? "ABANDONED CART" : (order.record_type || "") === "historical_order" ? "LABELD HISTORICAL ORDER" : "REAL ORDER", (order.record_type || "real_order") === "abandoned_cart" ? "warn" : "good")}
          ${paymentBadge(order.payment_status)}
          ${badge(String(order.order_status || "").toUpperCase())}
          ${emailBadge(order.email_status)}
          ${order.attention ? badge("NEEDS ATTENTION — STOCK SHORTFALL", "bad") : ""}
        </p>

        <ul class="order-items">${itemLines || "<li>No items recorded</li>"}</ul>

        <p>
          ${esc(order.customer_email)}
          · ${esc(order.customer_phone)}
        </p>

        <p>
          ${esc(order.shipping_address)}
          ${esc(order.shipping_city)}
          ${esc(order.shipping_state)}
        </p>
        <p class="muted">Dispatch from: ${esc(order.dispatch_location || "Ikorodu, Lagos")}</p>

        <p>
          Subtotal ${money(order.subtotal)}
          + delivery ${money(order.shipping_fee)}
        </p>

        <p>
          Ordered ${order.created_at ? esc(fmtDate(order.created_at)) : "Date not supplied"}
          ${order.paid_at ? ` · Paid ${esc(fmtDate(order.paid_at))}` : ""}
        </p>
      </div>

      <div>
        ${window.monowearActiveTab === "completed" ? (
          String(order.order_status || "").toLowerCase() === "shipped" ? `
            <p class="muted"><strong>SHIPPED</strong></p>
            <p class="muted">When the customer receives the package, mark it delivered. MONOWEAR will email them automatically.</p>
            <button class="small-button" type="button" onclick="updateOrder(${Number(order.id)}, 'delivered')">
              MARK DELIVERED + EMAIL CUSTOMER
            </button>
          ` : `
            <p class="muted"><strong>DELIVERED · LOCKED</strong></p>
            <p class="muted">This order is completed and cannot be edited.</p>
            ${order.delivery_email_status === "failed" ? `
              <button class="small-button resend-button" type="button" onclick="updateOrder(${Number(order.id)}, 'delivered')">
                RETRY DELIVERY EMAIL
              </button>
            ` : order.delivery_email_status === "sent" ? `
              <p class="muted">Delivery email sent ${order.delivery_email_sent_at ? `· ${esc(fmtDate(order.delivery_email_sent_at))}` : ""}</p>
            ` : ""}
          `
        ) : `
          <label class="eyebrow">ORDER STATUS</label>
          <select onchange="updateOrder(${Number(order.id)}, this.value)">
            ${statuses.map((value) => `
              <option value="${value}" ${String(order.order_status).toLowerCase() === value ? "selected" : ""}>
                ${value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            `).join("")}
          </select>
          ${!isPaid ? `
            <label class="eyebrow">RECORD TYPE</label>
            <select onchange="updateOrderRecordType(${Number(order.id)}, this.value)">
              <option value="abandoned_cart" ${(order.record_type || "real_order") === "abandoned_cart" ? "selected" : ""}>Abandoned cart</option>
              <option value="real_order" ${(order.record_type || "real_order") === "real_order" ? "selected" : ""}>Real order</option>
            </select>
          ` : ""}
          ${isPaid ? `
            <button class="small-button resend-button" type="button" onclick="resendConfirmation(${Number(order.id)})">
              RESEND CONFIRMATION EMAIL
            </button>
          ` : ""}
        `}
      </div>
    </article>`;
  }).join("") || `
    <p class="muted">${currentOrders.length ? "No orders match these filters." : "No orders yet."}</p>
  `;
}

for (const id of ["orderSearch", "orderRecordFilter", "orderPayFilter", "orderStatusFilter"]) {
  if ($(id)) $(id).addEventListener("input", renderOrders);
}

window.updateOrderRecordType = async (id, record_type) => {
  try {
    await api(`/api/admin/orders/${id}/record-type`, {
      method: "PUT", body: JSON.stringify({ record_type })
    });
    await loadOrders(); await loadSummary();
    toast(record_type === "abandoned_cart" ? "Moved to abandoned carts." : "Moved to real orders.");
  } catch (error) { toast(error.message); await loadOrders(); }
};

window.resendConfirmation = async (id) => {
  if (!confirm("Send the order confirmation email to this customer again?")) {
    return;
  }

  try {
    await api(`/api/admin/orders/${id}/resend-confirmation`, {
      method: "POST"
    });

    await loadOrders();
    toast("Confirmation email sent.");
  } catch (error) {
    toast(error.message);
  }
};

window.updateOrder = async (id, status) => {
  try {
    const result = await api(`/api/admin/orders/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });

    await loadOrders();
    await loadSummary();

    if (status === "delivered") {
      if (result.delivery_email_sent) {
        toast("Marked delivered. Customer delivery email sent.");
      } else if (result.delivery_email_error) {
        toast("Marked delivered, but email failed: " + result.delivery_email_error);
      } else {
        toast("Order status updated.");
      }
    } else {
      toast("Order status updated.");
    }
  } catch (error) {
    toast(error.message);
    await loadOrders();
  }
};

$("refreshOrders").addEventListener("click", loadOrders);

// ============================================================
// COLLECTIONS MANAGER (added)
// ============================================================

let currentCollections = [];

async function loadCollections() {
  try {
    currentCollections = await api("/api/admin/collections");

    if ($("collectionCount")) {
      $("collectionCount").textContent =
        currentCollections.filter((collection) => !collection.archived).length;
    }

    renderCollections();
    renderProductCollectionPicker();
  } catch (error) {
    toast("Collections: " + error.message);
  }
}

function collectionState(collection) {
  if (collection.archived) return badge("ARCHIVED", "muted");
  return collection.published ? badge("PUBLISHED", "good") : badge("DRAFT", "warn");
}

function renderCollections() {
  const container = $("collectionsList");
  if (!container) return;

  const filter = $("collectionFilter")?.value || "active";

  const list = currentCollections.filter((collection) => {
    if (filter === "archived") return collection.archived;
    if (filter === "active") return !collection.archived;
    return true;
  });

  container.innerHTML = list.map((collection) => {
    const releaseLabel = collection.release_date
      ? ` · Release ${esc(collection.release_date)}`
      : "";
    return `
    <article class="product-row">
      <div class="thumb">
        ${
          collection.cover_image
            ? `<img src="${esc(collection.cover_image)}" alt="">`
            : "MONO"
        }
      </div>

      <div>
        <h3>${esc(collection.name)} ${collectionState(collection)}</h3>
        <p>
          ${collection.products.length} product${collection.products.length === 1 ? "" : "s"}
          · /${esc(collection.slug)}${releaseLabel}
        </p>
      </div>

      <span></span>

      <div class="row-actions">
        <button class="small-button" type="button"
          onclick="editCollection(${Number(collection.id)})">EDIT ↗</button>
        <button class="small-button" type="button"
          onclick="setCollectionArchived(${Number(collection.id)}, ${collection.archived ? "false" : "true"})">
          ${collection.archived ? "RESTORE" : "ARCHIVE"}
        </button>
      </div>
    </article>`;
  }).join("") || `
    <p class="muted">
      ${filter === "archived" ? "No archived collections." : "No collections here yet."}
    </p>
  `;
}

if ($("collectionFilter")) {
  $("collectionFilter").addEventListener("input", renderCollections);
}

function renderCollectionProductPicker(selected = []) {
  const box = $("collectionProductPicker");
  if (!box) return;

  box.innerHTML = currentProducts.map((product) => `
    <label>
      <input
        type="checkbox"
        value="${Number(product.id)}"
        ${selected.includes(Number(product.id)) ? "checked" : ""}
      >
      ${esc(product.name)}${product.published ? "" : " (hidden)"}
    </label>
  `).join("") || `<p class="muted">Add products first.</p>`;
}

function setCollectionCover(url) {
  const form = $("collectionForm");
  const preview = $("collectionCoverPreview");

  form.elements.cover_image.value = url || "";

  if (preview) {
    preview.hidden = !url;

    if (url) {
      preview.src = url;
    } else {
      preview.removeAttribute("src");
    }
  }

  if ($("removeCollectionCover")) {
    $("removeCollectionCover").hidden = !url;
  }
}

function newCollection() {
  const form = $("collectionForm");

  form.reset();
  form.hidden = false;

  form.elements.id.value = "";
  form.elements.published.checked = true;
  form.elements.published.disabled = false;
  form.elements.sort_order.value = 0;
  form.elements.release_date.value = "";

  setCollectionCover("");
  renderCollectionProductPicker([]);

  $("collectionFormTitle").textContent = "New collection";
  $("archiveCollectionButton").hidden = true;
  $("deleteCollectionButton").hidden = true;

  showError("collectionError", "");

  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.editCollection = (id) => {
  const collection = currentCollections.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!collection) return;

  const form = $("collectionForm");

  form.reset();
  form.hidden = false;

  form.elements.id.value = collection.id;
  form.elements.name.value = collection.name || "";
  form.elements.slug.value = collection.slug || "";
  form.elements.description.value = collection.description || "";
  form.elements.sort_order.value = collection.sort_order || 0;
  form.elements.release_date.value = collection.release_date || "";
  form.elements.published.checked = !!collection.published;
  form.elements.published.disabled = !!collection.archived;

  setCollectionCover(collection.cover_image || "");
  renderCollectionProductPicker(
    collection.products.map((product) => Number(product.id))
  );

  $("collectionFormTitle").textContent = collection.archived
    ? "Edit archived collection"
    : "Edit collection";

  $("archiveCollectionButton").hidden = false;
  $("archiveCollectionButton").textContent = collection.archived
    ? "RESTORE (AS DRAFT)"
    : "ARCHIVE";
  $("archiveCollectionButton").dataset.archived = collection.archived ? "1" : "0";
  $("deleteCollectionButton").hidden = false;

  showError("collectionError", "");

  form.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.setCollectionArchived = async (id, archived) => {
  const word = archived ? "Archive" : "Restore";
  const detail = archived
    ? "It will be hidden from the storefront. Products are not deleted."
    : "It comes back as a draft; publish it when you're ready.";

  if (!confirm(`${word} this collection? ${detail}`)) return;

  try {
    await api(`/api/admin/collections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ archived, published: false })
    });

    $("collectionForm").hidden = true;

    await loadCollections();
    toast(archived ? "Collection archived." : "Collection restored as a draft.");
  } catch (error) {
    toast(error.message);
  }
};

if ($("newCollectionButton")) {
  $("newCollectionButton").addEventListener("click", newCollection);
}

if ($("cancelCollection")) {
  $("cancelCollection").addEventListener("click", () => {
    $("collectionForm").hidden = true;
  });
}

if ($("removeCollectionCover")) {
  $("removeCollectionCover").addEventListener("click", () => {
    $("collectionForm").elements.coverFile.value = "";
    setCollectionCover("");
  });
}

if ($("collectionCoverFile")) {
  $("collectionCoverFile").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const preview = $("collectionCoverPreview");
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });
}

if ($("archiveCollectionButton")) {
  $("archiveCollectionButton").addEventListener("click", () => {
    const id = $("collectionForm").elements.id.value;
    const isArchived = $("archiveCollectionButton").dataset.archived === "1";

    if (id) setCollectionArchived(Number(id), !isArchived);
  });
}

if ($("collectionForm")) {
  $("collectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const id = form.elements.id.value;
    const existing = currentCollections.find(
      (item) => Number(item.id) === Number(id)
    );

    showError("collectionError", "");

    try {
      let cover = form.elements.cover_image.value;
      const file = form.elements.coverFile.files[0];

      if (file) {
        cover = await uploadImage(file);
      }

      const body = {
        name: form.elements.name.value,
        slug: form.elements.slug.value,
        description: form.elements.description.value,
        cover_image: cover,
        sort_order: Number(form.elements.sort_order.value || 0),
        release_date: form.elements.release_date.value || "",
        published: form.elements.published.checked,
        archived: existing ? !!existing.archived : false
      };

      const saved = await api(
        id ? `/api/admin/collections/${id}` : "/api/admin/collections",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(body)
        }
      );

      await api(`/api/admin/collections/${saved.id}/products`, {
        method: "PUT",
        body: JSON.stringify({
          product_ids: checkedIds("#collectionProductPicker")
        })
      });

      form.hidden = true;

      await Promise.all([loadCollections(), loadProducts()]);
      toast("Collection saved.");
    } catch (error) {
      showError("collectionError", error.message);
    }
  });
}

if ($("deleteCollectionButton")) {
  $("deleteCollectionButton").addEventListener("click", async () => {
    const id = $("collectionForm").elements.id.value;

    if (
      !id ||
      !confirm("Delete this collection permanently? Your products are not deleted. (Archiving is reversible.)")
    ) {
      return;
    }

    try {
      await api(`/api/admin/collections/${id}`, { method: "DELETE" });

      $("collectionForm").hidden = true;

      await Promise.all([loadCollections(), loadProducts()]);
      toast("Collection deleted.");
    } catch (error) {
      showError("collectionError", error.message);
    }
  });
}

// Create a collection straight from the product form
if ($("addCollectionInline")) {
  $("addCollectionInline").addEventListener("click", async () => {
    const input = $("newCollectionName");
    const name = input.value.trim();

    if (!name) return;

    try {
      const selected = checkedIds("#productCollectionPicker");

      const created = await api("/api/admin/collections", {
        method: "POST",
        body: JSON.stringify({ name, published: true })
      });

      await loadCollections();
      renderProductCollectionPicker([...selected, Number(created.id)]);

      input.value = "";
      toast("Collection created and selected.");
    } catch (error) {
      showError("productError", error.message);
    }
  });
}


// ============================================================
// LABELD HISTORICAL RECORDS
// ============================================================
async function loadHistoricalRecords() {
  const list = $("historyList");
  if (!list) return;
  list.innerHTML = '<div class="panel"><p class="muted">Loading LabelD history…</p></div>';
  try {
    const data = await api("/api/admin/historical-records");
    currentHistoricalRecords = Array.isArray(data.records) ? data.records : [];
    const summary = data.summary || {};
    setText("historyCombinedSales", money(summary.combinedSales || 0));
    setText("historyWebsiteRevenue", money(summary.websitePaidRevenue || 0));
    setText("historyWebsiteOrders", (summary.websitePaidOrders || 0) + " verified paid order(s) on this website");
    setText("historyLabelDSales", money(summary.labeldSales || 0));
    setText("historyCombinedBreakdown", money(summary.labeldSales || 0) + " LabelD + " + money(summary.websitePaidRevenue || 0) + " website paid revenue");
    setText("historyExpenses", money(summary.expenses || 0));
    setText("historyExpenseBreakdown", "8 supplied expense entries");
    setText("historyShippingExpenses", money(summary.shippingExpenses || 0));
    setText("historyCustomers", String(summary.customerCount || 0));
    renderHistoricalRecords();
    setText("historyMessage", "Loaded " + currentHistoricalRecords.length + " historical records. Historical sales are combined for reporting only and are not added to Paystack's verified-payment records.");
  } catch (error) {
    list.innerHTML = '<div class="panel"><p class="muted">Could not load LabelD history: ' + esc(error.message) + '</p></div>';
    setText("historyMessage", "LabelD history could not be loaded.");
  }
}
function renderHistoricalRecords() {
  const list = $("historyList");
  if (!list) return;
  const type = $("historyType") ? $("historyType").value : "all";
  const query = ($("historySearch") ? $("historySearch").value : "").trim().toLowerCase();
  const filtered = currentHistoricalRecords.filter((record) => {
    if (type !== "all" && record.record_type !== type) return false;
    const haystack = [record.record_type, record.record_date, record.category, record.description, record.customer_name, record.customer_phone, record.reference, record.status, record.details].join(" ").toLowerCase();
    return !query || haystack.includes(query);
  });
  if (!filtered.length) {
    list.innerHTML = '<div class="panel"><p class="muted">No matching historical records.</p></div>';
    return;
  }
  list.innerHTML = filtered.map((record) => {
    const labels = {expense:"EXPENSE",transaction:"INCOMING",withdrawal:"WITHDRAWAL",customer:"CUSTOMER",summary:"REPORTED TOTAL",completed_order:"COMPLETED LABELD ORDER"};
    const amount = Number(record.amount || 0);
    const signed = record.direction === "out" ? "−" : record.direction === "in" ? "+" : "";
    const name = record.customer_name ? '<strong>' + esc(record.customer_name) + '</strong>' : "";
    const phone = record.customer_phone ? '<span class="muted">' + esc(record.customer_phone) + '</span>' : "";
    const date = record.record_date ? esc(record.record_date) : "Date not supplied";
    const details = record.record_type === "completed_order"
      ? '<p class="muted">Imported to Completed &amp; shipped as a historical paid order. Not a current Paystack transaction.</p>'
      : (record.details ? '<p class="muted">' + esc(record.details) + '</p>' : "");
    const amountLine = record.record_type === "customer" && !amount ? "" : '<strong>' + signed + money(amount) + '</strong>';
    return '<article class="order-card"><div><p class="eyebrow">' + esc(labels[record.record_type] || record.record_type) + ' · ' + date + '</p><h3>' + esc(record.description) + '</h3><p>' + name + ' ' + phone + '</p>' + details + (record.reference ? '<p class="muted">Reference: ' + esc(record.reference) + '</p>' : '') + '</div><div>' + amountLine + (record.status ? '<p>' + badge(String(record.status).toUpperCase(), record.status === "needs_review" ? "warn" : "") + '</p>' : '') + '</div></article>';
  }).join("");
}
$("refreshHistory")?.addEventListener("click", loadHistoricalRecords);
$("historySearch")?.addEventListener("input", renderHistoricalRecords);
$("historyType")?.addEventListener("change", renderHistoricalRecords);

// ============================================================
// PAYMENTS (added)
// ============================================================

function setText(id, value) {
  if ($(id)) $(id).textContent = value;
}

async function loadPayments() {
  const status = $("payFilter")?.value || "all";
  const q = ($("paySearch")?.value || "").trim();

  try {
    const data = await api(
      `/api/admin/payments?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`
    );

    const { all, month, today } = data.revenue;

    setText("revToday", money(today.gross));
    setText("revTodayOrders", `${today.orders} paid order${today.orders === 1 ? "" : "s"}`);
    setText("revMonth", money(month.gross));
    setText("revMonthOrders", `${month.orders} paid order${month.orders === 1 ? "" : "s"}`);
    setText("revAll", money(all.gross));
    setText("revAllOrders", `${all.orders} paid order${all.orders === 1 ? "" : "s"}`);
    setText("revNet", money(all.net));
    setText(
      "revFees",
      all.fees > 0
        ? `Paystack fees ${money(all.fees)}`
        : "Fees not reported yet"
    );

    setText(
      "revBreakdown",
      `All-time: products ${money(all.products)} + delivery ${money(all.delivery)}. ` +
      `Refunded: ${data.other.refunded.orders} (${money(data.other.refunded.gross)}) · ` +
      `Awaiting payment: ${data.other.pending.orders} (${money(data.other.pending.gross)}) · ` +
      `Failed: ${data.other.failed.orders}. ` +
      `Net only subtracts fees Paystack reported; older orders show no fee.`
    );

    $("paymentsList").innerHTML = data.history.map((payment) => `
      <article class="order-card">
        <div>
          <h3>#${esc(payment.reference)} · ${money(payment.total)}</h3>
          <p>
            ${paymentBadge(payment.payment_status)}
            ${payment.payment_channel ? badge(String(payment.payment_channel).toUpperCase()) : ""}
          </p>
          <p>${esc(payment.customer_name)} · ${esc(payment.customer_email)}</p>
          <p>
            ${payment.paid_at ? `Paid ${esc(fmtDate(payment.paid_at))}` : `Created ${esc(fmtDate(payment.created_at))}`}
            · Fee ${payment.paystack_fee > 0 ? money(payment.paystack_fee) : "—"}
            ${payment.paystack_fee > 0 ? ` · You keep ${money(payment.total - payment.paystack_fee)}` : ""}
          </p>
        </div>
      </article>
    `).join("") || `<p class="muted">No payments match.</p>`;
  } catch (error) {
    toast("Payments: " + error.message);
  }

  loadPayouts();
}

async function loadPayouts(refresh = false) {
  const box = $("payoutsBox");
  if (!box) return;

  try {
    const data = await api(`/api/admin/payouts${refresh ? "?refresh=1" : ""}`);

    if (!data.available) {
      box.innerHTML = `<p class="muted">${esc(data.error || "Payouts are not available.")}</p>`;
      return;
    }

    const balances = (data.balances || []).map((item) => `
      <div class="stat">
        <span>PAYSTACK BALANCE (${esc(item.currency)})</span>
        <strong>${item.balance === null ? "—" : money(item.balance)}</strong>
      </div>
    `).join("");

    const rows = (data.settlements || []).map((item) => `
      <tr>
        <td>${esc(fmtDate(item.date))}</td>
        <td>${badge(String(item.status || "").toUpperCase(), item.status === "success" ? "good" : "warn")}</td>
        <td>${item.gross === null ? "—" : money(item.gross)}</td>
        <td>${item.fees === null ? "—" : money(item.fees)}</td>
        <td><strong>${item.paid_out === null ? "—" : money(item.paid_out)}</strong></td>
      </tr>
    `).join("");

    const errors = Object.values(data.errors || {}).map(
      (message) => `<p class="muted">Could not load part of this: ${esc(message)}</p>`
    ).join("");

    box.innerHTML = `
      ${balances ? `<div class="stats-grid payout-stats">${balances}</div>` : ""}
      ${rows ? `
        <div class="table-wrap">
          <table class="payout-table">
            <thead>
              <tr><th>DATE</th><th>STATUS</th><th>SALES</th><th>FEES</th><th>PAID OUT</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : `<p class="muted">No payouts to show yet. Paystack sends settlements to your bank on its own schedule.</p>`}
      ${errors}
      <p class="muted">
        Payouts are read live from Paystack. They are separate from the revenue above
        because Paystack pays out on a schedule and after its fees.
      </p>
    `;
  } catch (error) {
    box.innerHTML = `<p class="muted">Could not load payouts: ${esc(error.message)}</p>`;
  }
}

if ($("refreshPayments")) {
  $("refreshPayments").addEventListener("click", () => {
    loadPayments();
    loadPayouts(true);
  });
}

for (const id of ["paySearch", "payFilter"]) {
  if ($(id)) $(id).addEventListener("input", loadPayments);
}

if ($("reconcilePayments")) {
  $("reconcilePayments").addEventListener("click", async () => {
    if (
      !confirm(
        "Check recent unpaid orders (last 30 days) with Paystack? " +
        "Any order Paystack confirms as paid will be marked paid."
      )
    ) {
      return;
    }

    const sendEmails = confirm(
      "For any order recovered this way, also send the customer their confirmation email?\n\n" +
      "OK = send emails. Cancel = mark paid without emailing."
    );

    showError("paymentsMessage", "Checking with Paystack…");

    try {
      const result = await api("/api/admin/payments/reconcile", {
        method: "POST",
        body: JSON.stringify({ send_emails: sendEmails })
      });

      const flagged = result.recovered.filter((item) => item.shortfalls && item.shortfalls.length).length;

      showError(
        "paymentsMessage",
        `Checked ${result.checked} order(s): ${result.recovered.length} recovered as paid, ` +
        `${result.not_paid} not paid.` +
        (flagged ? ` ${flagged} need attention (stock shortfall — see Orders).` : "") +
        (result.problems.length ? ` Problems: ${result.problems.join(" | ")}` : "")
      );

      await Promise.all([loadPayments(), loadOrders(), loadSummary(), loadProducts()]);
    } catch (error) {
      showError("paymentsMessage", error.message);
    }
  });
}

// ============================================================
// EMAIL & PAYMENT CHECK (added)
// ============================================================

async function loadEmailStatus() {
  const box = $("emailCheck");
  if (!box) return;

  try {
    const d = await api("/api/admin/email-status");

    const row = (ok, label, detail = "") => `
      <p class="check-row ${ok ? "ok" : "no"}">
        <strong>${ok ? "✓" : "✕"}</strong> ${esc(label)}
        ${detail ? `<span class="muted">${esc(detail)}</span>` : ""}
      </p>`;

    box.innerHTML = [
      row(d.resend_configured, "Email service connected", d.resend_configured ? "" : "RESEND_API_KEY is missing on the server."),
      row(true, "Emails are sent from", d.from),
      row(d.base_url_set, "Store address (BASE_URL) is set", d.base_url || "Needed for the logo and Paystack redirects."),
      row(d.logo_set, "Email logo is set", d.logo_set ? "" : "Upload one above and save."),
      row(d.paystack_configured, "Paystack is connected"),
      d.base_url_set
        ? `<p class="muted">Paystack webhook URL (paste in Paystack → Settings → API Keys &amp; Webhooks): <code>${esc(d.base_url)}/api/paystack/webhook</code></p>`
        : ""
    ].join("");
  } catch (error) {
    box.innerHTML = `<p class="muted">Could not check: ${esc(error.message)}</p>`;
  }
}

if ($("sendTestEmail")) {
  $("sendTestEmail").addEventListener("click", async () => {
    showError("toolsMessage", "Sending…");

    try {
      const result = await api("/api/admin/email/test", { method: "POST" });
      showError("toolsMessage", `Test email sent to ${result.to}. Check your inbox (and spam).`);
    } catch (error) {
      showError("toolsMessage", "Could not send: " + error.message);
    }
  });
}

// ============================================================
// START
// ============================================================

checkAuth();


// ============================================================
// STOREFRONT DESIGNER LIVE PREVIEW
// ============================================================
(function setupStoreDesignerPreview() {
  const form = document.getElementById("settingsForm");
  const preview = document.getElementById("designPreview");
  if (!form || !preview) return;

  function refreshDesignPreview() {
    const value = (name, fallback) => form.elements[name]?.value || fallback;
    const background = value("design_background", "#f0efe9");
    const ink = value("design_text", "#141414");
    const accent = value("design_accent", "#c6ff4b");
    const fonts = {
      Manrope: "'Manrope', Arial, sans-serif",
      Arial: "Arial, sans-serif",
      Georgia: "Georgia, serif",
      system: "system-ui, sans-serif"
    };
    const alignment = value("design_hero_alignment", "left");
    preview.style.setProperty("--preview-bg", background);
    preview.style.setProperty("--preview-ink", ink);
    preview.style.setProperty("--preview-accent", accent);
    // Apply the chosen colours immediately in Studio as well as inside the preview.
    if (window.applyMonowearGlobalTheme) {
      window.applyMonowearGlobalTheme({
        design_theme: value("design_theme", "dark"),
        design_background: background,
        design_text: ink,
        design_accent: accent
      });
    }
    preview.style.fontFamily = fonts[value("design_font", "Manrope")] || fonts.Manrope;
    preview.style.alignItems = alignment === "left" ? "flex-start" : alignment === "right" ? "flex-end" : "center";
    preview.style.textAlign = alignment;
    const radius = { square: "0px", soft: "8px", round: "999px" };
    preview.style.setProperty("--control-radius", radius[value("design_radius", "square")] || "0px");
  }

  window.refreshDesignPreview = refreshDesignPreview;
  form.addEventListener("input", refreshDesignPreview);
  form.addEventListener("change", refreshDesignPreview);
  refreshDesignPreview();

  const originalLoadSettings = window.loadSettings;
  // Studio settings load asynchronously; refresh after the form is populated.
  const observer = new MutationObserver(refreshDesignPreview);
  observer.observe(form, { subtree: true, childList: true });
  window.addEventListener("pageshow", refreshDesignPreview);
})();


// ============================================================

 // MONOWEAR_THEME_PRESETS: keep Studio controls and preview in sync with theme.
 (function setupThemePresets() {
   const form = document.getElementById("settingsForm");
   if (!form || !form.elements.design_theme) return;
   const presets = {
     dark:    { background: "#111210", text: "#f4f2ea", accent: "#c6ff4b" },
     white:   { background: "#ffffff", text: "#171815", accent: "#c6ff4b" },
     emerald: { background: "#073f32", text: "#f2f5ef", accent: "#57d6a0" },
     gold:    { background: "#171510", text: "#f6f0df", accent: "#d5b15a" },
     "blue-gold": { background: "#071426", text: "#F5F1E6", accent: "#D8B65C" },
     wine:    { background: "#2b0b16", text: "#f8edf0", accent: "#d87994" },
     gothic:  { background: "#0b0b0f", text: "#e9e5ef", accent: "#b7a2d8" },
     afterglow: { background: "#100e13", text: "#f5f0f5", accent: "#e9a5c7" },
     helpway: { background: "#211316", text: "#F6EEE8", accent: "#8E3B4A" },
     "helpway-gradient": { background: "#0B1425", text: "#EAF1FF", accent: "#4169E1" }
   };
   function applyPreset() {
     const preset = presets[form.elements.design_theme.value] || presets.dark;
     form.elements.design_background.value = preset.background;
     form.elements.design_text.value = preset.text;
     form.elements.design_accent.value = preset.accent;
     if (window.refreshDesignPreview) window.refreshDesignPreview();
   }
   window.applyMonowearThemePreset = applyPreset;

   // Save the selected theme and its matching palette immediately, independently
   // of the larger Store Settings form's Save button.
   let themeSaveTimer;
   form.elements.design_theme.addEventListener("change", () => {
     applyPreset();
     clearTimeout(themeSaveTimer);
     themeSaveTimer = setTimeout(async () => {
       const message = document.getElementById("settingsMessage");
       try {
         const result = await api("/api/admin/settings", {
           method: "PUT",
           body: JSON.stringify({
             design_theme: form.elements.design_theme.value,
             design_background: form.elements.design_background.value,
             design_text: form.elements.design_text.value,
             design_accent: form.elements.design_accent.value
           })
         });
         currentSettings = { ...currentSettings, ...(result.settings || {}) };
         if (window.applyMonowearGlobalTheme) window.applyMonowearGlobalTheme(currentSettings);
         if (message) message.textContent = "Theme saved and applied across MONOWEAR.";
       } catch (error) {
         if (message) message.textContent = "Theme could not be saved: " + error.message;
       }
     }, 120);
   });
   // Keep saved custom colours when Studio loads; only an explicit theme change applies a preset.
 })();

// STORE HEALTH & BACKUP CONTROLS
// ============================================================
(() => {
  const button = document.getElementById("refreshMonitoring");
  const output = document.getElementById("monitoringSummary");
  const backupLink = document.getElementById("downloadStoreBackup");
  if (!button || !output) return;

  const label = (value) => String(value ?? "").replace(/[_-]+/g, " ");
  async function refreshMonitoring() {
    button.disabled = true;
    button.textContent = "CHECKING…";
    output.innerHTML = '<p class="muted">Checking orders, payment and email status…</p>';
    try {
      const response = await api("/api/admin/monitoring");
      const s = response.summary || {};
      const metrics = [
        ["Total orders", s.total_orders],
        ["Paid orders", s.paid_orders],
        ["Payments pending", s.pending_payments],
        ["Failed emails", s.failed_emails],
        ["Paid orders needing email", s.paid_orders_missing_email]
      ];
      output.innerHTML = '<div class="monitoring-grid">' + metrics.map(([name, value]) =>
        '<div class="monitoring-metric"><span>' + esc(name) + '</span><strong>' + Number(value || 0) + '</strong></div>'
      ).join("") + '</div><p class="muted">Database: ' + esc(response.database) +
        ' · Paystack: ' + (response.paystack_configured ? 'configured' : 'not configured') +
        ' · Email: ' + (response.email_configured ? 'configured' : 'not configured') +
        '<br>Checked: ' + esc(new Date(response.checked_at).toLocaleString()) + '</p>' +
        ((response.attention || []).length ? '<h3>Orders needing attention</h3><div class="monitoring-attention">' +
          response.attention.map(order => '<p><strong>' + esc(order.reference) + '</strong> — payment: ' +
            esc(label(order.payment_status)) + '; email: ' + esc(label(order.email_status || 'not sent')) +
            '</p>').join("") + '</div>' : '<p class="monitoring-ok">No pending-payment or failed-email orders found in the recent check.</p>');
    } catch (error) {
      output.innerHTML = '<p class="error">' + esc(error.message || "Store health check failed.") + '</p>';
    } finally {
      button.disabled = false;
      button.textContent = "CHECK STORE HEALTH ↻";
    }
  }
  button.addEventListener("click", refreshMonitoring);
  backupLink?.addEventListener("click", () => {
    const message = document.getElementById("backupMessage");
    if (message) message.textContent = "Preparing a private backup of the database and uploaded media… Keep this page open until the download starts.";
  });
})();
