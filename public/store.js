"use strict";
/* =========================================================
   MONOWEAR® STOREFRONT
   Product collection, filters, cart, and store settings
   LIVE THE NAME. WEAR THE MEANING.
========================================================= */
(() => {
  const $ = (id) => document.getElementById(id);
  const money = (amount) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0
    }).format(Number(amount) || 0);
  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  let products = [];
  let settings = {};
  let cart = [];
  try {
    const savedCart = JSON.parse(
      localStorage.getItem("monowear-cart") || "[]"
    );
    cart = Array.isArray(savedCart) ? savedCart : [];
  } catch {
    cart = [];
  }
  /* =========================================================
     SAFE ELEMENT HELPERS
  ========================================================= */
  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value ?? "";
  }
  function setHTML(id, value) {
    const element = $(id);
    if (element) element.innerHTML = value;
  }
  function setHidden(id, hidden) {
    const element = $(id);
    if (element) element.hidden = hidden;
  }
  function setLink(id, value) {
    const element = $(id);
    if (!element) return;
    if (value) {
      element.href = value;
      element.hidden = false;
    } else {
      element.hidden = true;
    }
  }
  /* =========================================================
     BACKGROUND IMAGES
  ========================================================= */
  function setBackground(element, image, overlay) {
    if (!element || !image) return;
    const safeImage = String(image).replace(/["\\]/g, "");
    element.style.backgroundImage =
      `${overlay}, url("${safeImage}")`;
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
    element.style.backgroundRepeat = "no-repeat";
  }
  function applyStoreBackgrounds(storeSettings) {
    setBackground(
      document.querySelector(".site-header"),
      storeSettings.header_background_image,
      "linear-gradient(90deg, rgba(0,0,0,.78), rgba(0,0,0,.35))"
    );
    setBackground(
      document.querySelector(".hero"),
      storeSettings.hero_background_image,
      "linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.22))"
    );
    const waitlist = document.querySelector(
      "#waitlist, .waitlist-section, .drop-waitlist, [data-section='waitlist'], .waitlist"
    );
    setBackground(
      waitlist,
      storeSettings.waitlist_background_image,
      "linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.38))"
    );
  }
  /* =========================================================
     STORE SETTINGS
  ========================================================= */
  function applySettings() {
    const brand = $("brandName");
    if (brand) {
      // Update the text safely without assuming a child exists.
      brand.textContent = settings.brand_name || "MONOWEAR®";
    }
    document.title =
      `${settings.brand_name || "MONOWEAR®"} — Live the Name`;
    setText("announcement", settings.announcement || "");
    const heroTitle = $("heroTitle");
    if (heroTitle) {
      const title = settings.hero_title || "HELP IS ON THE WAY";
      heroTitle.textContent = title;
      // Highlight the final phrase for the default campaign headline.
      if (title.toUpperCase() === "HELP IS ON THE WAY") {
        heroTitle.innerHTML = 'HELP IS <br><span>ON THE WAY.</span>';
      }
    }
    setText("heroSubtitle", settings.hero_subtitle || "");
    const heroButton = $("heroCta");
    if (heroButton) {
      heroButton.textContent =
        `${settings.hero_cta || "SHOP THE DROP"} ↗`;
    }
    setText(
      "footerTagline",
      settings.tagline || "LIVE THE NAME. WEAR THE MEANING."
    );
    setLink("instagramLink", settings.instagram || "");
    setLink("newsletterLink", settings.instagram || "");
    if (settings.contact_email) {
      setLink("emailLink", `mailto:${settings.contact_email}`);
    } else {
      setHidden("emailLink", true);
    }
    applyStoreBackgrounds(settings);
  }
  /* =========================================================
     CATEGORY FILTER
  ========================================================= */
  function renderCategoryFilter() {
    const filter = $("categoryFilter");
    if (!filter) return;
    const selected = filter.value;
    const categories = [
      ...new Set(
        products
          .map((product) => String(product.category || "").trim())
          .filter(Boolean)
      )
    ];
    filter.innerHTML =
      '<option value="">All pieces</option>' +
      categories
        .map(
          (category) =>
            `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
        )
        .join("");
    if (categories.includes(selected)) {
      filter.value = selected;
    }
  }
  /* =========================================================
     PRODUCT IMAGE
  ========================================================= */
  function productImage(product) {
    if (!product.image) {
      return `
        <div class="image-placeholder">
          MONO<br>
          <span>— ${escapeHTML(product.category || "COLLECTION").toUpperCase()} —</span>
        </div>
      `;
    }
    return `
      <img
        src="${escapeHTML(product.image)}"
        alt="${escapeHTML(product.name || "MONOWEAR product")}"
        loading="lazy"
        onerror="this.style.display='none'; this.nextElementSibling.hidden=false;"
      >
      <div class="image-placeholder" hidden>
        MONO<br>
        <span>IMAGE UNAVAILABLE</span>
      </div>
    `;
  }
  /* =========================================================
     PRODUCT DISPLAY
  ========================================================= */
  function renderProducts() {
    const grid = $("productGrid");
    if (!grid) {
      console.error(
        "MONOWEAR: Could not find #productGrid in the storefront HTML."
      );
      return;
    }
    const searchInput = $("searchProducts");
    const categoryInput = $("categoryFilter");
    const query = searchInput
      ? searchInput.value.trim().toLowerCase()
      : "";
    const category = categoryInput ? categoryInput.value : "";
    const visibleProducts = products.filter((product) => {
      const matchesCategory =
        !category ||
        String(product.category || "").trim() === category;
      const searchableText = [
        product.name,
        product.category,
        product.description
      ]
        .join(" ")
        .toLowerCase();
      return matchesCategory && searchableText.includes(query);
    });
    if (!visibleProducts.length) {
      grid.innerHTML = products.length
        ? '<p class="empty-state">No pieces match your search.</p>'
        : `
          <div class="empty-state">
            <p>THE COLLECTION IS BEING UPDATED.</p>
            <p>Check back soon for the latest MONOWEAR pieces.</p>
          </div>
        `;
      return;
    }
    grid.innerHTML = visibleProducts
      .map((product) => {
        const id = Number(product.id);
        const stock = Number(product.stock ?? 0);
        const sizes = Array.isArray(product.sizes)
          ? product.sizes
          : [];
        const soldOut = stock <= 0;
        const sizeOptions = sizes.length
          ? sizes
              .map(
                (size) =>
                  `<option value="${escapeHTML(size)}">${escapeHTML(size)}</option>`
              )
              .join("")
          : '<option value="One size">One size</option>';
        return `
          <article class="product-card" data-product-id="${id}">
            <div class="product-image">
              ${productImage(product)}
              ${
                product.featured
                  ? '<span class="product-badge">FEATURED</span>'
                  : ""
              }
              ${
                soldOut
                  ? '<span class="sold-badge">SOLD OUT</span>'
                  : ""
              }
            </div>
            <div class="product-meta">
              <h3>${escapeHTML(product.name || "MONOWEAR Piece")}</h3>
              <span class="price">${money(product.price)}</span>
            </div>
            <div class="product-category">
              ${escapeHTML(product.category || "MONOWEAR")}
              ${stock > 0 ? ` · ${stock} available` : ""}
            </div>
            ${
              product.description
                ? `<p class="product-description">${escapeHTML(product.description)}</p>`
                : ""
            }
            <div class="product-actions">
              <select
                class="size-select"
                id="size-${id}"
                aria-label="Choose size for ${escapeHTML(product.name)}"
                ${soldOut ? "disabled" : ""}
              >
                ${sizeOptions}
              </select>
              <button
                class="add-button"
                type="button"
                ${soldOut ? "disabled" : ""}
                onclick="addToCart(${id})"
              >
                ${soldOut ? "SOLD OUT" : "ADD TO BAG +"}
              </button>
            </div>
          </article>
        `;
      })
      .join("");
  }
  /* =========================================================
     CART STORAGE
  ========================================================= */
  function saveCart() {
    try {
      localStorage.setItem("monowear-cart", JSON.stringify(cart));
    } catch (error) {
      console.error("MONOWEAR: Could not save cart.", error);
    }
    renderCart();
  }
  function renderCart() {
    const count = cart.reduce(
      (total, item) => total + Math.max(0, Number(item.quantity) || 0),
      0
    );
    setText("cartCount", String(count));
    setText("cart-count", String(count));
    const cartTotal = cart.reduce(
      (total, item) =>
        total +
        (Number(item.price) || 0) *
          Math.max(0, Number(item.quantity) || 0),
      0
    );
    setText("cartTotal", money(cartTotal));
    setText("cart-total", money(cartTotal));
    const cartItems = $("cartItems");
    if (cartItems) {
      if (!cart.length) {
        cartItems.innerHTML =
          '<p class="empty-state">Your bag is empty.</p>';
      } else {
        cartItems.innerHTML = cart
          .map(
            (item, index) => `
              <div class="cart-item">
                <div>
                  <strong>${escapeHTML(item.name)}</strong>
                  <p>${escapeHTML(item.size || "One size")}</p>
                  <p>${money(item.price)} × ${Number(item.quantity) || 1}</p>
                </div>
                <button
                  type="button"
                  aria-label="Remove ${escapeHTML(item.name)}"
                  onclick="removeFromCart(${index})"
                >
                  REMOVE
                </button>
              </div>
            `
          )
          .join("");
      }
    }
    const cartPanel = $("cartPanel");
    if (cartPanel) {
      cartPanel.setAttribute("aria-live", "polite");
    }
  }
  /* =========================================================
     ADD TO CART
  ========================================================= */
  window.addToCart = function (productId) {
    const product = products.find(
      (item) => Number(item.id) === Number(productId)
    );
    if (!product) {
      console.error("MONOWEAR: Product not found.", productId);
      return;
    }
    if (Number(product.stock) <= 0) {
      alert("This piece is currently sold out.");
      return;
    }
    const sizeSelect = $(`size-${productId}`);
    const selectedSize = sizeSelect
      ? sizeSelect.value
      : "One size";
    const existingItem = cart.find(
      (item) =>
        Number(item.id) === Number(productId) &&
        item.size === selectedSize
    );
    if (existingItem) {
      if (Number(existingItem.quantity) >= Number(product.stock)) {
        alert("You've reached the available stock for this piece.");
        return;
      }
      existingItem.quantity =
        (Number(existingItem.quantity) || 0) + 1;
    } else {
      cart.push({
        id: Number(product.id),
        name: product.name || "MONOWEAR Piece",
        price: Number(product.price) || 0,
        image: product.image || "",
        size: selectedSize,
        quantity: 1
      });
    }
    saveCart();
    const button = document.querySelector(
      `.product-card[data-product-id="${Number(productId)}"] .add-button`
    );
    if (button) {
      const originalText = button.textContent;
      button.textContent = "ADDED TO BAG ✓";
      setTimeout(() => {
        if (button.isConnected && Number(product.stock) > 0) {
          button.textContent = originalText;
        }
      }, 1200);
    }
  };
  /* =========================================================
     REMOVE FROM CART
  ========================================================= */
  window.removeFromCart = function (index) {
    if (index < 0 || index >= cart.length) return;
    cart.splice(index, 1);
    saveCart();
  };
  /* =========================================================
     CART OPEN / CLOSE
  ========================================================= */
  function setupCartControls() {
  const cartButton = $("cartToggle");
  const closeButton = $("closeCart");
  const cartDrawer = $("cartDrawer");
  const cartOverlay = $("cartOverlay");
  const checkoutButton = $("checkoutButton");
  const checkoutDialog = $("checkoutDialog");
  const closeCheckout = $("closeCheckout");
  function openCart() {
    if (cartDrawer) cartDrawer.classList.add("open");
    if (cartOverlay) cartOverlay.classList.add("open");
    document.body.classList.add("cart-open");
  }
  function closeCart() {
    if (cartDrawer) cartDrawer.classList.remove("open");
    if (cartOverlay) cartOverlay.classList.remove("open");
    document.body.classList.remove("cart-open");
  }
  if (cartButton) {
    cartButton.addEventListener("click", openCart);
  }
  if (closeButton) {
    closeButton.addEventListener("click", closeCart);
  }
  if (cartOverlay) {
    cartOverlay.addEventListener("click", closeCart);
  }
  if (checkoutButton) {
    checkoutButton.addEventListener("click", () => {
      if (!cart.length) {
        alert("Your bag is empty. Add a piece before checkout.");
        return;
      }
      closeCart();
      const checkoutTotal = $("checkoutTotal");
      if (checkoutTotal) {
        checkoutTotal.textContent = money(
          cart.reduce(
            (total, item) =>
              total +
              Number(item.price || 0) *
                Number(item.quantity || 1),
            0
          )
        );
      }
      if (checkoutDialog && !checkoutDialog.open) {
        checkoutDialog.showModal();
      }
    });
  }
  if (closeCheckout && checkoutDialog) {
    closeCheckout.addEventListener("click", () => {
      checkoutDialog.close();
    });
  }
  if (checkoutDialog) {
    checkoutDialog.addEventListener("click", (event) => {
      if (event.target === checkoutDialog) {
        checkoutDialog.close();
      }
    });
  }
  renderCart();
}
/* =========================================================
     STOREFRONT EVENTS
  ========================================================= */
  function setupEvents() {
    const search = $("searchProducts");
    const category = $("categoryFilter");
    if (search) {
      search.addEventListener("input", renderProducts);
    }
    if (category) {
      category.addEventListener("change", renderProducts);
    }
    const heroButton = $("heroCta");
    if (heroButton) {
      heroButton.addEventListener("click", (event) => {
        const collection = $("collection") || $("shop");
        if (collection) {
          event.preventDefault();
          collection.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    }
    setText("year", String(new Date().getFullYear()));
    setupCartControls();
  }
  /* =========================================================
     LOAD STORE FROM API
  ========================================================= */
  async function loadStore() {
    const grid = $("productGrid");
    if (grid) {
      grid.innerHTML =
        '<p class="muted">Loading the MONOWEAR collection...</p>';
    }
    try {
      const response = await fetch("/api/store", {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`Store API returned ${response.status}`);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.products)) {
        throw new Error("The store API returned an unexpected response.");
      }
      settings =
        data.settings && typeof data.settings === "object"
          ? data.settings
          : {};
      // Only published products should be displayed.
      products = data.products.filter(
        (product) => product && product.published !== false
      );
      applySettings();
      renderCategoryFilter();
      renderProducts();
      console.info(
        `MONOWEAR: Loaded ${products.length} published product(s).`
      );
    } catch (error) {
      console.error("MONOWEAR storefront loading error:", error);
      if (grid) {
        grid.innerHTML = `
          <div class="empty-state">
            <p>THE COLLECTION IS TEMPORARILY UNAVAILABLE.</p>
            <p>Please refresh the page in a moment.</p>
          </div>
        `;
      }
    }
    renderCart();
  }
  /* =========================================================
     START STOREFRONT
  ========================================================= */
  function init() {
    setupEvents();
    loadStore();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
