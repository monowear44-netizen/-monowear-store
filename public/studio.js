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
  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tab}`;
  });

  const titles = {
    overview: "Overview",
    products: "Products",
    appearance: "Store editor",
    orders: "Orders"
  };

  $("pageTitle").textContent = titles[tab] || "Studio";

  if (tab === "overview") loadSummary();
  if (tab === "orders") loadOrders();
}

window.switchTab = switchTab;

// ============================================================
// LOAD STUDIO DATA
// ============================================================

async function loadAll() {
  await Promise.allSettled([
    loadProducts(),
    loadSettings(),
    loadSummary()
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

  container.innerHTML = currentProducts.map((product) => `
    <article class="product-row">
      <div class="thumb">
        ${
          product.image
            ? `<img src="${esc(product.image)}" alt="">`
            : "MONO"
        }
      </div>

      <div>
        <h3>${esc(product.name)}</h3>
        <p>
          ${esc(product.category)}
          · Stock ${Number(product.stock || 0)}
          · ${product.published ? "Published" : "Hidden"}
          · ${product.featured ? "Featured" : "Standard"}
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
    </article>
  `).join("") || `
    <p class="muted">
      No products yet. Add your first product.
    </p>
  `;
}

function newProduct() {
  const form = $("productForm");

  form.reset();
  form.hidden = false;

  form.elements.id.value = "";
  form.elements.sizes.value = "S,M,L,XL";
  form.elements.stock.value = 0;
  form.elements.published.checked = true;

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
    "description"
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
    "description"
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
      loadSummary()
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
    currentOrders = await api("/api/admin/orders");

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

  container.innerHTML = currentOrders.map((order) => `
    <article class="order-card">
      <div>
        <h3>
          #${esc(order.reference || order.id)}
          · ${esc(order.customer_name)}
          · ${money(order.total)}
        </h3>

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
          Payment: ${esc(order.payment_status)}
          · Order: ${esc(order.order_status)}
        </p>

        <p>
          Subtotal ${money(order.subtotal)}
          + delivery ${money(order.shipping_fee)}
        </p>

        <p>${esc(order.created_at)}</p>
      </div>

      <div>
        <label class="eyebrow">ORDER STATUS</label>

        <select
          onchange="updateOrder(${Number(order.id)}, this.value)"
        >
          ${statuses.map((status) => `
            <option
              value="${status}"
              ${String(order.order_status).toLowerCase() === status ? "selected" : ""}
            >
              ${status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          `).join("")}
        </select>
      </div>
    </article>
  `).join("") || `
    <p class="muted">No orders yet.</p>
  `;
}

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
// START
// ============================================================

checkAuth();
