"use strict";

// ============================================================
// MONOWEAR STUDIO — ADMIN JAVASCRIPT
// ============================================================

const $ = (id) => document.getElementById(id);

let currentProducts = [];
let currentOrders = [];
let currentSettings = {};

// ============================================================
// API HELPERS
// ============================================================

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    typeof options.body === "string"
  ) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || `Request failed (${response.status}).`
    );
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

function parseArray(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const result = JSON.parse(value);
      return Array.isArray(result) ? result : [];
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function showToast(message) {
  const element = $("toast");

  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

function showError(id, message) {
  const element = $(id);

  if (element) {
    element.textContent = message || "";
  }
}

// ============================================================
// AUTHENTICATION
// ============================================================

function showApp(email) {
  $("loginScreen").hidden = true;
  $("appScreen").hidden = false;

  $("loggedEmail").textContent = email || "";

  loadProducts();
  loadSettings();
  loadSummary();
}

function showLogin() {
  $("loginScreen").hidden = false;
  $("appScreen").hidden = true;
  $("loggedEmail").textContent = "";
}

async function checkAuth() {
  try {
    const result = await api("/api/admin/me");

    if (result.authenticated) {
      showApp(result.admin?.email || "");
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

  const form = event.currentTarget;

  const credentials = {
    email: form.elements.email.value.trim(),
    password: form.elements.password.value
  };

  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    });

    showApp(result.admin?.email || credentials.email);

    showToast("Welcome to MONOWEAR Studio.");
  } catch (error) {
    showError("loginError", error.message);
  }
});

$("logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", {
      method: "POST"
    });

    showLogin();

    showToast("You have logged out.");
  } catch (error) {
    showToast(error.message);
  }
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
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
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
  if (tab === "products") loadProducts();
  if (tab === "appearance") loadSettings();
  if (tab === "orders") loadOrders();
}

window.switchTab = switchTab;

// ============================================================
// DASHBOARD SUMMARY
// ============================================================

async function loadSummary() {
  try {
    // This is the route defined in your server.js.
    const data = await api("/api/admin/dashboard");

    $("statProducts").textContent =
      data.products ?? 0;

    $("statOrders").textContent =
      data.orders ?? 0;

    $("statPending").textContent =
      data.pendingOrders ?? 0;

    $("statRevenue").textContent =
      money(data.revenue ?? 0);

    $("productCount").textContent =
      data.products ?? currentProducts.length;

    $("orderCount").textContent =
      data.orders ?? currentOrders.length;
  } catch (error) {
    console.error("Dashboard error:", error);
  }
}

// ============================================================
// PRODUCT LIST
// ============================================================

async function loadProducts() {
  try {
    const products = await api("/api/admin/products");

    currentProducts = Array.isArray(products)
      ? products
      : [];

    $("productCount").textContent =
      currentProducts.length;

    $("productsList").innerHTML = currentProducts.map((product) => {
      const image =
        product.image ||
        parseArray(product.images)[0] ||
        "";

      const sizes = parseArray(product.sizes);

      return `
        <article class="product-row">

          <div class="thumb">
            ${
              image
                ? `<img src="${esc(image)}"
                        alt="${esc(product.name)}"
                        loading="lazy"
                        onerror="this.style.display='none'">`
                : "MONO"
            }
          </div>

          <div class="product-row-info">
            <h3>${esc(product.name)}</h3>

            <p>
              ${esc(product.category || "Uncategorised")}
              · Stock ${Number(product.stock || 0)}
              · ${Number(product.published) ? "Published" : "Hidden"}
              · ${Number(product.featured) ? "Featured" : "Standard"}
            </p>

            ${
              sizes.length
                ? `<p>Sizes: ${sizes.map(esc).join(", ")}</p>`
                : ""
            }
          </div>

          <strong class="price">
            ${money(product.price)}
          </strong>

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
      `;
    }).join("") || `
      <div class="panel">
        <p class="muted">
          No products yet. Add your first MONOWEAR product.
        </p>
      </div>
    `;
  } catch (error) {
    console.error("Products error:", error);
    showToast(error.message);
  }
}

// ============================================================
// PRODUCT FORM
// ============================================================

function resetImagePreview() {
  const input = $("productImageFile");
  const preview = $("imagePreview");
  const wrap = $("imagePreviewWrap");

  if (input) input.value = "";

  if (preview) {
    if (preview.dataset.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);
      delete preview.dataset.objectUrl;
    }

    preview.removeAttribute("src");
  }

  if (wrap) wrap.hidden = true;
}

function newProduct() {
  const form = $("productForm");

  form.reset();

  resetImagePreview();

  form.hidden = false;

  form.elements.id.value = "";
  form.elements.sizes.value = "S,M,L,XL";
  form.elements.stock.value = "0";
  form.elements.compare_price.value = "";
  form.elements.image.value = "";
  form.elements.published.checked = true;
  form.elements.featured.checked = false;

  $("productFormTitle").textContent = "Add a product";
  $("deleteProductButton").hidden = true;

  showError("productError", "");

  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

window.editProduct = function (id) {
  const product = currentProducts.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!product) {
    showToast("Product not found.");
    return;
  }

  const form = $("productForm");

  form.reset();
  resetImagePreview();

  form.hidden = false;

  const sizes = parseArray(product.sizes);

  const fields = [
    "id",
    "name",
    "slug",
    "category",
    "price",
    "compare_price",
    "stock",
    "image",
    "description"
  ];

  fields.forEach((key) => {
    if (form.elements[key]) {
      form.elements[key].value =
        product[key] ?? "";
    }
  });

  form.elements.sizes.value = sizes.join(",");

  form.elements.featured.checked =
    Boolean(Number(product.featured));

  form.elements.published.checked =
    Boolean(Number(product.published));

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
  resetImagePreview();
});

// ============================================================
// IMAGE PREVIEW
// ============================================================

$("productImageFile").addEventListener("change", (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];

  showError("productError", "");

  const preview = $("imagePreview");
  const wrap = $("imagePreviewWrap");

  if (preview.dataset.objectUrl) {
    URL.revokeObjectURL(preview.dataset.objectUrl);
    delete preview.dataset.objectUrl;
  }

  preview.removeAttribute("src");
  wrap.hidden = true;

  if (!file) return;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowedTypes.includes(file.type)) {
    input.value = "";

    showError(
      "productError",
      "Choose a JPG, PNG, WEBP or GIF image."
    );

    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    input.value = "";

    showError(
      "productError",
      "Image must be 5 MB or smaller."
    );

    return;
  }

  const objectUrl = URL.createObjectURL(file);

  preview.dataset.objectUrl = objectUrl;
  preview.src = objectUrl;

  wrap.hidden = false;
});

$("removeImageButton").addEventListener("click", () => {
  resetImagePreview();
  showError("productError", "");
});

// ============================================================
// PRODUCT IMAGE UPLOAD
// ============================================================

async function uploadProductImage(file) {
  if (!file) return "";

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      "Choose a JPG, PNG, WEBP or GIF image."
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error(
      "Image must be 5 MB or smaller."
    );
  }

  const formData = new FormData();

  // IMPORTANT:
  // server.js uses upload.array("images", 10).
  formData.append("images", file);

  // IMPORTANT:
  // This is the exact endpoint in your server.js.
  const result = await api("/api/admin/upload", {
    method: "POST",
    body: formData
  });

  const imageUrl =
    result.urls?.[0] ||
    result.files?.[0]?.url ||
    "";

  if (!result.success || !imageUrl) {
    throw new Error(
      "Image upload did not return an image URL."
    );
  }

  return imageUrl;
}

// ============================================================
// SAVE PRODUCT
// ============================================================

$("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;

  const productId = form.elements.id.value.trim();

  const saveButton = form.querySelector(
    'button[type="submit"]'
  );

  saveButton.disabled = true;
  saveButton.textContent = "SAVING PRODUCT...";

  showError("productError", "");

  try {
    const product = {
      name: form.elements.name.value.trim(),
      slug: form.elements.slug.value.trim(),
      category: form.elements.category.value.trim(),
      price: Number(form.elements.price.value),
      compare_price:
        form.elements.compare_price.value === ""
          ? 0
          : Number(form.elements.compare_price.value),
      stock: Number(form.elements.stock.value),
      image: form.elements.image.value.trim(),
      description: form.elements.description.value.trim(),
      sizes: form.elements.sizes.value
        .split(",")
        .map((size) => size.trim())
        .filter(Boolean),
      featured: form.elements.featured.checked,
      published: form.elements.published.checked
    };

    if (!product.name) {
      throw new Error("Enter a product name.");
    }

    if (
      !Number.isFinite(product.price) ||
      product.price < 0
    ) {
      throw new Error("Enter a valid product price.");
    }

    if (
      !Number.isInteger(product.stock) ||
      product.stock < 0
    ) {
      throw new Error("Enter a valid stock quantity.");
    }

    // Upload the image first, if a new file was selected.
    const file = form.elements.imageFile.files?.[0];

    if (file) {
      showToast("Uploading product image...");

      product.image = await uploadProductImage(file);
    }

    const url = productId
      ? `/api/admin/products/${encodeURIComponent(productId)}`
      : "/api/admin/products";

    const method = productId ? "PUT" : "POST";

    await api(url, {
      method,
      body: JSON.stringify(product)
    });

    form.hidden = true;

    resetImagePreview();

    await loadProducts();

    await loadSummary();

    showToast(
      productId
        ? "Product updated successfully."
        : "Product added successfully."
    );
  } catch (error) {
    console.error("Save product error:", error);

    showError("productError", error.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "SAVE PRODUCT ↗";
  }
});

// ============================================================
// DELETE PRODUCT
// ============================================================

$("deleteProductButton").addEventListener("click", async () => {
  const id = $("productForm").elements.id.value;

  if (!id) return;

  const confirmed = confirm(
    "Delete this product permanently? This cannot be undone."
  );

  if (!confirmed) return;

  try {
    await api(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    $("productForm").hidden = true;

    resetImagePreview();

    await loadProducts();

    await loadSummary();

    showToast("Product deleted.");
  } catch (error) {
    showError("productError", error.message);
  }
});

// ============================================================
// STORE SETTINGS
// ============================================================

async function loadSettings() {
  try {
    // Matches the settings endpoint in your server.js.
    const data = await api("/api/admin/settings");

    currentSettings = data;

    const form = $("settingsForm");

    // Map the existing editor fields to your server settings.
    const mapping = {
      brand_name: "store_name",
      tagline: "tagline",
      announcement: "announcement",
      instagram: "instagram",
      contact_email: "contact_email",
      shipping_fee: "shipping_fee",
      free_shipping_threshold: "free_shipping_threshold"
    };

    Object.entries(mapping).forEach(([field, setting]) => {
      if (form.elements[field]) {
        form.elements[field].value =
          data[setting] ?? "";
      }
    });

    // These fields are not currently supported by your
    // server.js settings allowlist.
    // Leave them editable, but don't imply they are saved.
  } catch (error) {
    console.error("Settings load error:", error);
    showToast(error.message);
  }
}

$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;

  const body = {
    store_name: form.elements.brand_name.value.trim(),
    tagline: form.elements.tagline.value.trim(),
    announcement: form.elements.announcement.value.trim(),
    instagram: form.elements.instagram.value.trim(),
    contact_email: form.elements.contact_email.value.trim(),
    shipping_fee: Number(form.elements.shipping_fee.value || 0),
    free_shipping_threshold: Number(
      form.elements.free_shipping_threshold.value || 0
    )
  };

  try {
    await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(body)
    });

    $("settingsMessage").textContent =
      "Store settings saved successfully.";

    await loadSettings();

    showToast("Store settings updated.");
  } catch (error) {
    $("settingsMessage").textContent = error.message;
  }
});

// ============================================================
// ORDER MANAGEMENT
// ============================================================

async function loadOrders() {
  try {
    const orders = await api("/api/admin/orders");

    currentOrders = Array.isArray(orders)
      ? orders
      : [];

    $("orderCount").textContent = currentOrders.length;

    $("ordersList").innerHTML = currentOrders.map((order) => {
      const items = parseArray(order.items);
      const events = parseArray(order.events);

      const statuses = [
        "pending",
        "processing",
        "packed",
        "shipped",
        "delivered",
        "cancelled"
      ];

      const currentStatus = String(
        order.order_status || "pending"
      ).toLowerCase();

      return `
        <article class="order-card">

          <div>

            <h3>
              #${esc(order.reference || order.id)}
              · ${esc(order.customer_name)}
              · ${money(order.total)}
            </h3>

            <p>
              ${esc(order.customer_email)}
              · ${esc(order.customer_phone || "No phone provided")}
            </p>

            <p>
              ${esc(order.shipping_address)}
              ${esc(order.shipping_city || "")}
              ${esc(order.shipping_state || "")}
            </p>

            <p>
              ${items.map((item) =>
                `${esc(item.name)} × ${Number(item.quantity || 0)}`
              ).join("<br>")}
            </p>

            <p>
              Payment: ${esc(order.payment_status)}
              · Created ${esc(order.created_at)}
            </p>

            <p>
              Subtotal ${money(order.subtotal)}
              + delivery ${money(order.shipping_fee)}
            </p>

          </div>

          <div>

            <label class="eyebrow">
              FULFILMENT STATUS
            </label>

            <select
              onchange="updateOrder(${Number(order.id)}, this.value)"
            >

              ${statuses.map((status) => `
                <option
                  value="${status}"
                  ${currentStatus === status ? "selected" : ""}
                >
                  ${status.toUpperCase()}
                </option>
              `).join("")}

            </select>

          </div>

        </article>
      `;
    }).join("") || `
      <p class="muted">No orders yet.</p>
    `;
  } catch (error) {
    console.error("Orders error:", error);
    showToast(error.message);
  }
}

window.updateOrder = async (id, status) => {
  try {
    // Exact endpoint and method from your server.js.
    await api(`/api/admin/orders/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });

    await loadOrders();

    await loadSummary();

    showToast("Order status updated.");
  } catch (error) {
    showToast(error.message);
    await loadOrders();
  }
};

$("refreshOrders").addEventListener("click", loadOrders);

// ============================================================
// START STUDIO
// ============================================================

checkAuth();
