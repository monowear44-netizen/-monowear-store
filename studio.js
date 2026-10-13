"use strict";

const $ = (id) => document.getElementById(id);

let currentProducts = [];
let currentOrders = [];
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
  const panelTab = tab === "abandoned" ? "orders" : tab;
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
    collections: "Collections",
    payments: "Payments"
  };

  $("pageTitle").textContent = titles[tab] || "Studio";

  if (tab === "overview") loadSummary();
  if (tab === "orders" || tab === "abandoned") loadOrders();
  if (tab === "collections") loadCollections();
  if (tab === "payments") loadPayments();
  if (tab === "appearance") loadEmailStatus();
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
      $("statPending").textContent = data.pendingOrders ?? 0;
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
  } catch (error) {
    toast("Dashboard: " + error.message);
  }
}

// ============================================================
// IMAGE UPLOAD
// ============================================================

async function uploadImage(file) {
  if (!file) throw Error("Please select an image.");

  if (file.size > 5 * 1024 * 1024) {
    throw Error("Image must be 5 MB or smaller.");
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw Error("Choose a JPG, PNG, WEBP or GIF image.");
  }

  const formData = new FormData();
  formData.append("image", file);

  const result = await api("/api/admin/uploads", {
    method: "POST",
    body: formData
  });

  if (!result.url) {
    throw Error("The server did not return an image URL.");
  }

  return result.url;
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

function newProduct() {
  const form = $("productForm");

  form.reset();
  form.hidden = false;

  form.elements.id.value = "";
  form.elements.sizes.value = "S,M,L,XL";
  form.elements.stock.value = 0;
  form.elements.published.checked = true;
  form.elements.sort_order.value = 0;

  renderProductCollectionPicker([]);

  $("productFormTitle").textContent = "Add a product";
  $("deleteProductButton").hidden = true;

  showError("productError", "");

  setPreview("imagePreview", "", "imagePreviewWrap");

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
    "stock",
    "image",
    "description",
    "sort_order"
  ]) {
    if (!form.elements[key]) continue;

    let value = product[key] ?? "";

    if (key === "id") value = product.id;

    if (key === "sizes") {
      value = Array.isArray(product.sizes)
        ? product.sizes.join(",")
        : product.sizes || "";
    }

    form.elements[key].value = value;
  }

  form.elements.featured.checked = !!product.featured;
  form.elements.published.checked = !!product.published;

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

  body.sizes = body.sizes
    .split(",")
    .map((size) => size.trim())
    .filter(Boolean);

  body.featured = form.elements.featured.checked;
  body.published = form.elements.published.checked;
  body.collection_ids = checkedIds("#productCollectionPicker");

  showError("productError", "");

  try {
    const file = form.elements.imageFile.files[0];

    if (file) {
      body.image = await uploadImage(file);
    }

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
// ORDERS
// ============================================================

async function loadOrders() {
  try {
    currentOrders = await api(window.monowearActiveTab === "abandoned" ? "/api/admin/abandoned-carts" : "/api/admin/orders");

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
          ${badge((order.record_type || "real_order") === "abandoned_cart" ? "ABANDONED CART" : "REAL ORDER", (order.record_type || "real_order") === "abandoned_cart" ? "warn" : "good")}
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

        <p>
          Subtotal ${money(order.subtotal)}
          + delivery ${money(order.shipping_fee)}
        </p>

        <p>
          Ordered ${esc(fmtDate(order.created_at))}
          ${order.paid_at ? ` · Paid ${esc(fmtDate(order.paid_at))}` : ""}
        </p>
      </div>

      <div>
        <label class="eyebrow">ORDER STATUS</label>

        <select
          onchange="updateOrder(${Number(order.id)}, this.value)"
        >
          ${statuses.map((value) => `
            <option
              value="${value}"
              ${String(order.order_status).toLowerCase() === value ? "selected" : ""}
            >
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
          <button
            class="small-button resend-button"
            type="button"
            onclick="resendConfirmation(${Number(order.id)})"
          >
            RESEND CONFIRMATION EMAIL
          </button>
        ` : ""}
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
    await api(`/api/admin/orders/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });

    await loadOrders();
    await loadSummary();

    toast("Order status updated.");
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

  container.innerHTML = list.map((collection) => `
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
          · /${esc(collection.slug)}
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
    </article>
  `).join("") || `
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
