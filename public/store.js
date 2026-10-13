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
  function applyDesignSettings() {
    const root = document.documentElement;
    const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
    const theme = String(settings.design_theme || "dark").toLowerCase();
    const palettes = {
      dark: { bg: "#111210", ink: "#f4f2ea", muted: "#a6a69d", line: "#34352f", accent: "#c6ff4b", panel: "#1b1c19", soft: "#242520" },
      white: { bg: "#ffffff", ink: "#171815", muted: "#77786f", line: "#deded8", accent: "#c6ff4b", panel: "#f7f7f3", soft: "#ededE7" },
      emerald: { bg: "#073f32", ink: "#f2f5ef", muted: "#b8d0c5", line: "#286b59", accent: "#57d6a0", panel: "#0c4d3d", soft: "#145a48" },
      gold: { bg: "#171510", ink: "#f6f0df", muted: "#c1b58f", line: "#51452a", accent: "#d5b15a", panel: "#211d14", soft: "#302817" }
    };
    const palette = palettes[theme] || palettes.dark;
    root.dataset.theme = palettes[theme] ? theme : "dark";
    root.style.setProperty("--bg", palette.bg);
    root.style.setProperty("--ink", palette.ink);
    root.style.setProperty("--muted", palette.muted);
    root.style.setProperty("--line", palette.line);
    root.style.setProperty("--accent", palette.accent);
    root.style.setProperty("--panel", palette.panel);
    root.style.setProperty("--surface-soft", palette.soft);
    const fonts = { Manrope: "'Manrope', Arial, sans-serif", Arial: "Arial, sans-serif", Georgia: "Georgia, serif", system: "system-ui, sans-serif" };
    document.body.style.fontFamily = fonts[settings.design_font] || fonts.Manrope;
    const radius = { square: "0px", soft: "8px", round: "999px" };
    root.style.setProperty("--control-radius", radius[settings.design_radius] || radius.square);
    const columns = { "2": "2", "3": "3", "4": "4" };
    root.style.setProperty("--product-columns", columns[String(settings.design_product_columns)] || "3");
    const ratios = { portrait: "4 / 5", square: "1 / 1", landscape: "5 / 4" };
    root.style.setProperty("--product-image-ratio", ratios[settings.design_product_ratio] || ratios.portrait);
    const heroHeights = { compact: "480px", standard: "650px", tall: "820px" };
    root.style.setProperty("--hero-min-height", heroHeights[settings.design_hero_height] || heroHeights.standard);
    const hero = document.querySelector(".hero");
    if (hero) {
      const alignment = ["left", "center", "right"].includes(settings.design_hero_alignment) ? settings.design_hero_alignment : "left";
      hero.style.justifyContent = alignment === "left" ? "flex-start" : alignment === "right" ? "flex-end" : "center";
      const copy = hero.querySelector(".hero-copy");
      if (copy) copy.style.textAlign = alignment;
    }
  }
  function applySettings() {
    applyDesignSettings();
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
      const title = (settings.hero_title || "HELP IS ON THE WAY").trim();
      const words = title.split(/\s+/).filter(Boolean);
      // Keep the gradient treatment for every headline, not only the default copy.
      // Split longer headlines into two balanced lines and gradient the second line.
      heroTitle.replaceChildren();
      if (words.length > 1) {
        const splitAt = Math.ceil(words.length / 2);
        heroTitle.append(document.createTextNode(words.slice(0, splitAt).join(" ")));
        heroTitle.append(document.createElement("br"));
        const gradientLine = document.createElement("span");
        gradientLine.textContent = words.slice(splitAt).join(" ");
        heroTitle.append(gradientLine);
      } else {
        const gradientLine = document.createElement("span");
        gradientLine.textContent = title;
        heroTitle.append(gradientLine);
      }
    }
    setText("heroSubtitle", settings.hero_subtitle || "");
    setText("storyTitle", settings.story_title || "Built for the ones who keep going.");
    setText("storyBody", settings.brand_story || "MONO is a state of mind: self-reliant, intentional, and unwilling to wait for permission. Every piece carries a reminder to keep showing up for your own future.");
    const heroButton = $("heroCta");
    if (heroButton) {
      heroButton.textContent =
        `${settings.hero_cta || "SHOP THE DROP"} ↗`;
    }
    setText(
      "footerTagline",
      settings.tagline || "LIVE THE NAME. WEAR THE MEANING."
    );
    setLink("xLink", settings.x || "https://x.com/monowear44");
    setLink("newsletterLink", settings.x || "https://x.com/monowear44");
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
  function renderProductCards(items) {
    return items.map((product) => {
      const id = Number(product.id);
      const stock = Number(product.stock ?? 0);
      const sizes = Array.isArray(product.sizes) ? product.sizes : [];
      const soldOut = stock <= 0;
      const sizeOptions = sizes.length
        ? sizes.map((size) => `<option value="${escapeHTML(size)}">${escapeHTML(size)}</option>`).join("")
        : '<option value="One size">One size</option>';
      return `
        <article class="product-card" data-product-id="${id}">
          <a class="product-image product-page-link" href="/product.html?slug=${encodeURIComponent(product.slug || "")}&id=${id}" aria-label="View product details">
            ${productImage(product)}
            ${product.featured ? '<span class="product-badge">FEATURED</span>' : ""}
            ${soldOut ? '<span class="sold-badge">SOLD OUT</span>' : ""}
          </a>
          <div class="product-meta">
            <h3><a class="product-name-link" href="/product.html?slug=${encodeURIComponent(product.slug || "")}&id=${id}">${escapeHTML(product.name || "MONOWEAR Piece")}</a></h3>
            <span class="price">${money(product.price)}</span>
          </div>
          <div class="product-category">
            ${escapeHTML(product.category || "MONOWEAR")}
            ${stock > 0 ? ` · ${stock} available` : ""}
          </div>
          <div class="product-actions">
            <select class="size-select" id="size-${id}" aria-label="Choose size for ${escapeHTML(product.name)}" ${soldOut ? "disabled" : ""}>
              ${sizeOptions}
            </select>
            <button class="add-button" type="button" ${soldOut ? "disabled" : ""} onclick="addToCart(${id})">
              ${soldOut ? "SOLD OUT" : "ADD TO BAG +"}
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  /* =========================================================
     PRODUCT DISPLAY + REAL PAGINATION
     Featured pieces stay first. Other products are paged below.
  ========================================================= */
  let productPage = 1;
  const PRODUCTS_PER_PAGE = 8;

  function renderPagination(totalPages) {
    const pagination = $("productPagination");
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.innerHTML = "";
      pagination.hidden = true;
      return;
    }
    pagination.hidden = false;
    const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
    pagination.innerHTML = `
      <button class="pagination-arrow" type="button" data-page="${Math.max(1, productPage - 1)}" aria-label="Previous page" ${productPage === 1 ? "disabled" : ""}>&lt;</button>
      <div class="pagination-numbers" aria-label="Product pages">
        ${pages.map((page) => `<button class="pagination-number ${page === productPage ? "is-active" : ""}" type="button" data-page="${page}" aria-label="Page ${page}" aria-current="${page === productPage ? "page" : "false"}">${page}</button>`).join("")}
      </div>
      <button class="pagination-arrow" type="button" data-page="${Math.min(totalPages, productPage + 1)}" aria-label="Next page" ${productPage === totalPages ? "disabled" : ""}>&gt;</button>
    `;
  }

  function renderProducts() {
    const featuredGrid = $("featuredProductGrid");
    const sections = $("productSections");
    if (!featuredGrid || !sections) {
      console.error("MONOWEAR: Product section containers are missing from storefront HTML.");
      return;
    }
    const searchInput = $("searchProducts");
    const categoryInput = $("categoryFilter");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const category = categoryInput ? categoryInput.value : "";
    const visibleProducts = products.filter((product) => {
      const matchesCategory = !category || String(product.category || "").trim() === category;
      const searchableText = [product.name, product.category, product.description].join(" ").toLowerCase();
      return matchesCategory && searchableText.includes(query);
    });

    const featured = visibleProducts.filter((product) => Boolean(Number(product.featured)));
    const otherProducts = visibleProducts.filter((product) => !Boolean(Number(product.featured)));
    const featuredSection = $("featuredProductsSection");
    if (featuredSection) featuredSection.hidden = featured.length === 0;
    featuredGrid.innerHTML = featured.length ? renderProductCards(featured) : "";

    if (!visibleProducts.length) {
      const empty = products.length
        ? '<p class="empty-state">No pieces match your search.</p>'
        : '<div class="empty-state"><p>THE COLLECTION IS BEING UPDATED.</p><p>Check back soon for the latest MONOWEAR pieces.</p></div>';
      sections.innerHTML = empty;
      renderPagination(0);
      return;
    }

    if (!otherProducts.length) {
      sections.innerHTML = "";
      renderPagination(0);
      return;
    }

    const totalPages = Math.ceil(otherProducts.length / PRODUCTS_PER_PAGE);
    productPage = Math.min(Math.max(1, productPage), totalPages);
    const start = (productPage - 1) * PRODUCTS_PER_PAGE;
    const pageProducts = otherProducts.slice(start, start + PRODUCTS_PER_PAGE);

    sections.innerHTML = `
      <section class="product-category-section" aria-labelledby="all-pieces-heading">
        <div class="product-subheading product-category-heading">
          <p class="eyebrow">THE FULL SELECTION</p>
          <h3 id="all-pieces-heading">More <i>pieces.</i></h3>
        </div>
        <div class="product-grid">${renderProductCards(pageProducts)}</div>
      </section>
    `;
    renderPagination(totalPages);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("#productPagination [data-page]");
    if (!button || button.disabled) return;
    const nextPage = Number(button.dataset.page);
    if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === productPage) return;
    productPage = nextPage;
    renderProducts();
    $("productSections")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  /* =========================================================
     PRODUCT DETAIL NAVIGATION
     Product details are standalone pages, never an overlay.
  ========================================================= */
  window.openProductDetail = function(productId) {
    const product = products.find((item) => Number(item.id) === Number(productId));
    if (!product) return;
    const query = new URLSearchParams();
    if (product.slug) query.set("slug", product.slug);
    query.set("id", String(product.id));
    window.location.href = "/product.html?" + query.toString();
  };
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
                <div class="cart-item-image">
                  ${item.image ? `<img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}" loading="lazy">` : '<span>MONO</span>'}
                </div>
                <div class="cart-item-details">
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
  document.addEventListener("click", (event) => {
    const card = event.target.closest(".product-card");
    if (!card || event.target.closest("button, select, input, a, .product-image")) return;
    openProductDetail(Number(card.dataset.productId));
  });
  document.addEventListener("keydown", (event) => {
    const card = event.target.closest(".product-card");
    if (!card || !["Enter", " "].includes(event.key) || event.target.closest("button, select, input, a")) return;
    event.preventDefault();
    openProductDetail(Number(card.dataset.productId));
  });

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
      const subtotal = cart.reduce(
        (total, item) => total + Number(item.price || 0) * Number(item.quantity || 1),
        0
      );
      const checkoutSubtotal = $("checkoutSubtotal");
      const checkoutTotal = $("checkoutTotal");
      const checkoutShipping = $("checkoutShipping");
      const shippingQuoteMessage = $("shippingQuoteMessage");
      if (checkoutSubtotal) checkoutSubtotal.textContent = money(subtotal);
      if (checkoutTotal) checkoutTotal.textContent = "—";
      if (checkoutShipping) checkoutShipping.textContent = "Enter destination";
      if (shippingQuoteMessage) shippingQuoteMessage.textContent = "Enter your city/LGA and state to calculate delivery.";
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
     // MONOWEAR CHECKOUT FORM
const checkoutForm = $("checkoutForm");
let shippingQuoteRequestId = 0;
let currentShippingQuoteAmount = null;
let currentShippingCourier = null;
let currentShippingRequestToken = "";

async function refreshShippingQuote() {
  if (!checkoutForm) return;
  const city = String(checkoutForm.querySelector('[name="city"]')?.value || "").trim();
  const state = String(checkoutForm.querySelector('[name="state"]')?.value || "").trim();
  const shippingNode = $("checkoutShipping");
  const totalNode = $("checkoutTotal");
  const messageNode = $("shippingQuoteMessage");
  const optionsNode = $("checkoutShippingOptions");
  const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const requestId = ++shippingQuoteRequestId;
  currentShippingQuoteAmount = null;
  currentShippingCourier = null;
  currentShippingRequestToken = "";
  if (optionsNode) optionsNode.innerHTML = '<option value="">Choose a courier after rates load</option>';
  if (!city || !state || !cart.length) {
    if (shippingNode) shippingNode.textContent = "Enter destination";
    if (totalNode) totalNode.textContent = "—";
    if (messageNode) messageNode.textContent = "Enter your delivery details to fetch live Travo courier rates.";
    return;
  }
  if (shippingNode) shippingNode.textContent = "Calculating…";
  if (totalNode) totalNode.textContent = "Calculating…";
  if (messageNode) messageNode.textContent = "Fetching live courier prices from Travo…";
  try {
    const response = await fetch("/api/shipping/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        customer_name: String(checkoutForm.querySelector('[name="customer_name"]')?.value || "").trim(),
        email: String(checkoutForm.querySelector('[name="email"]')?.value || "").trim(),
        phone: String(checkoutForm.querySelector('[name="phone"]')?.value || "").trim(),
        address: String(checkoutForm.querySelector('[name="address"]')?.value || "").trim(),
        city, state,
        items: cart.map((item) => ({ product_id: Number(item.id), quantity: Number(item.quantity), size: String(item.size || "") }))
      })
    });
    const result = await response.json();
    if (requestId !== shippingQuoteRequestId) return;
    if (!response.ok || !result.success || !result.quote) throw new Error(result.error || "Live Travo rates are unavailable.");
    const rates = Array.isArray(result.quote.rates) ? result.quote.rates : [];
    if (!rates.length) throw new Error("Travo returned no courier options for this destination.");
    if (optionsNode) {
      optionsNode.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select delivery service";
      optionsNode.appendChild(placeholder);
      rates.forEach((rate, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = String(rate.courier_name || "Courier") + " — " + money(rate.amount) + (rate.delivery_time ? " · " + rate.delivery_time : "");
        optionsNode.appendChild(option);
      });
      optionsNode.onchange = () => {
        const rate = rates[Number(optionsNode.value)];
        if (!rate || optionsNode.value === "") {
          currentShippingQuoteAmount = null;
          currentShippingCourier = null;
          currentShippingRequestToken = "";
          if (shippingNode) shippingNode.textContent = "Choose courier";
          if (totalNode) totalNode.textContent = "—";
          return;
        }
        currentShippingQuoteAmount = Number(rate.amount);
        currentShippingCourier = { courier_id: String(rate.courier_id), service_code: String(rate.service_code), courier_name: String(rate.courier_name) };
        currentShippingRequestToken = String(rate.request_token || "");
        if (shippingNode) shippingNode.textContent = money(rate.amount) + " · " + rate.courier_name;
        if (totalNode) totalNode.textContent = money(subtotal + Number(rate.amount || 0));
        if (messageNode) messageNode.textContent = "Live Travo rate selected. Delivery estimate: " + (rate.delivery_time || "provided by courier") + ". The rate is rechecked before payment.";
      };
      optionsNode.value = "";
    }
    if (shippingNode) shippingNode.textContent = "Choose courier";
    if (totalNode) totalNode.textContent = "—";
    if (messageNode) messageNode.textContent = rates.length + " live Travo courier option(s) found. Select your preferred delivery service.";
  } catch (error) {
    if (requestId !== shippingQuoteRequestId) return;
    currentShippingQuoteAmount = null;
    currentShippingCourier = null;
    currentShippingRequestToken = "";
    if (shippingNode) shippingNode.textContent = "Unavailable";
    if (totalNode) totalNode.textContent = "—";
    if (messageNode) messageNode.textContent = error.message || "Could not calculate delivery. Please try again.";
  }
}

if (checkoutForm) {
  const cityField = checkoutForm.querySelector('[name="city"]');
  const stateField = checkoutForm.querySelector('[name="state"]');
  ["customer_name", "email", "phone", "address", "city", "state"].forEach((fieldName) => {
    const field = checkoutForm.querySelector('[name="' + fieldName + '"]');
    if (field) field.addEventListener("change", refreshShippingQuote);
  });
  const checkoutDialogForQuote = $("checkoutDialog");
  if (checkoutDialogForQuote) {
    checkoutDialogForQuote.addEventListener("toggle", () => {
      if (checkoutDialogForQuote.open) {
        currentShippingQuoteAmount = null;
        refreshShippingQuote();
      }
    });
  }

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = $("checkoutMessage");
    const submitButton = checkoutForm.querySelector(
      'button[type="submit"]'
    );

    if (!cart.length) {
      if (message) message.textContent = "Your bag is empty.";
      return;
    }

    const formData = new FormData(checkoutForm);

    const payload = {
      customer_name: String(
        formData.get("customer_name") || ""
      ).trim(),

      email: String(
        formData.get("email") || ""
      ).trim(),

      phone: String(
        formData.get("phone") || ""
      ).trim(),

      address: String(
        formData.get("address") || ""
      ).trim(),
      city: String(formData.get("city") || "").trim(),
      state: String(formData.get("state") || "").trim(),
      shipping_quote_amount: currentShippingQuoteAmount,
      shipping_courier_id: currentShippingCourier ? currentShippingCourier.courier_id : "",
      shipping_service_code: currentShippingCourier ? currentShippingCourier.service_code : "",
      shipping_request_token: currentShippingRequestToken,


      items: cart.map((item) => ({
        product_id: Number(item.id),
        quantity: Number(item.quantity),
        size: String(item.size || "")
      }))
    };

    if (!currentShippingCourier || !Number.isFinite(currentShippingQuoteAmount)) {
      const quoteMessage = $("shippingQuoteMessage");
      if (quoteMessage) quoteMessage.textContent = "Choose a live Travo courier rate before continuing.";
      return;
    }

    let redirectingToPaystack = false;
    const paymentLoading = $("paymentLoading");
    const showPaymentLoading = () => {
      if (!paymentLoading) return;
      if (checkoutDialog && checkoutDialog.open) checkoutDialog.close();
      paymentLoading.hidden = false;
      paymentLoading.setAttribute("aria-hidden", "false");
      document.body.classList.add("payment-is-loading");
    };
    const hidePaymentLoading = () => {
      if (!paymentLoading) return;
      paymentLoading.hidden = true;
      paymentLoading.setAttribute("aria-hidden", "true");
      document.body.classList.remove("payment-is-loading");
    };

    try {
      if (message) {
        message.textContent = "Connecting to secure checkout...";
      }
      showPaymentLoading();

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "PLEASE WAIT...";
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not start payment."
        );
      }

      if (!result.authorization_url) {
        throw new Error(
          "Payment started, but no payment link was returned."
        );
      }

      redirectingToPaystack = true;
      const loadingMessage = paymentLoading ? paymentLoading.querySelector(".payment-loading-message") : null;
      if (loadingMessage) loadingMessage.textContent = "Opening Paystack secure payment…";
      window.location.assign(result.authorization_url);

    } catch (error) {
      hidePaymentLoading();
      if (checkoutDialog && !checkoutDialog.open) checkoutDialog.showModal();
      console.error("MONOWEAR checkout error:", error);

      if (message) {
        message.textContent =
          error.message || "Checkout failed. Please try again.";
      } else {
        alert(error.message || "Checkout failed.");
      }
      if (String(error.message || "").toLowerCase().includes("delivery price has changed")) {
        refreshShippingQuote();
      }

    } finally {
      if (!redirectingToPaystack) {
        hidePaymentLoading();
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "CONTINUE TO CHECKOUT ↗";
        }
      }
    }
  });
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
