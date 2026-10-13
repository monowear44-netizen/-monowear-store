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
    root.style.setProperty("--bg", validColor(settings.design_background, "#f0efe9"));
    root.style.setProperty("--ink", validColor(settings.design_text, "#141414"));
    root.style.setProperty("--accent", validColor(settings.design_accent, "#c6ff4b"));
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
          <article class="product-card product-card-clickable" data-product-id="${id}" tabindex="0" role="button" aria-label="View details for ${escapeHTML(product.name || "MONOWEAR Piece")}">
            <div class="product-image" onclick="openProductDetail(${id})" role="button" tabindex="0" aria-label="View product details">
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
              <h3><button type="button" class="product-name-link" onclick="openProductDetail(${id})">${escapeHTML(product.name || "MONOWEAR Piece")}</button></h3>
              <span class="price">${money(product.price)}</span>
            </div>
            <div class="product-category">
              ${escapeHTML(product.category || "MONOWEAR")}
              ${stock > 0 ? ` · ${stock} available` : ""}
            </div>
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
     PRODUCT DETAIL + MORE FROM MONOWEAR
  ========================================================= */
  function ensureProductDetail() {
    let modal = $("productDetail");
    if (modal) return modal;
    modal = document.createElement("dialog");
    modal.id = "productDetail";
    modal.className = "product-detail-dialog";
    modal.setAttribute("aria-label", "Product details");
    modal.innerHTML = '<button type="button" class="product-detail-close" aria-label="Close product details">×</button><div id="productDetailContent"></div>';
    document.body.appendChild(modal);
    modal.querySelector(".product-detail-close").addEventListener("click", () => modal.close());
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.close();
    });
    modal.addEventListener("click", (event) => {
      const card = event.target.closest("[data-detail-product-id]");
      if (card) {
        event.preventDefault();
        event.stopPropagation();
        openProductDetail(Number(card.dataset.detailProductId));
      }
    });
    return modal;
  }

  function openProductDetail(productId) {
    const product = products.find((item) => Number(item.id) === Number(productId));
    if (!product) return;
    const modal = ensureProductDetail();
    // Keep this view focused on the one product the customer selected.
    const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ["One size"];
    const stock = Number(product.stock ?? 0);
    const moreProducts = products
      .filter((item) => Number(item.id) !== Number(product.id))
      .slice(0, 4);
    const moreProductsMarkup = moreProducts.length ? `
      <section class="product-detail-more" aria-label="More from MONOWEAR">
        <p class="eyebrow">KEEP EXPLORING</p>
        <h3>More from MONOWEAR</h3>
        <div class="product-detail-more-grid">
          ${moreProducts.map((item) => `
            <button type="button" class="product-detail-more-card" data-detail-product-id="${Number(item.id)}">
              <span class="product-detail-more-image">${productImage(item)}</span>
              <span class="product-detail-more-name">${escapeHTML(item.name || "MONOWEAR Piece")}</span>
              <span class="product-detail-more-category">${escapeHTML(item.category || "MONOWEAR")}</span>
              <span class="product-detail-more-price">${money(item.price)}</span>
            </button>
          `).join("")}
        </div>
      </section>` : "";
    $("productDetailContent").innerHTML = `
      <div class="product-detail-layout">
        <div class="product-detail-image">${productImage(product)}</div>
        <div class="product-detail-copy">
          <p class="eyebrow">MONOWEAR / PRODUCT DETAIL</p>
          <p class="product-detail-collection">COLLECTION · ${escapeHTML(product.category || "MONOWEAR")}</p>
          <h2>${escapeHTML(product.name || "MONOWEAR Piece")}</h2>
          <p class="product-detail-price">${money(product.price)}</p>
          <div class="product-detail-description">${escapeHTML(product.description || "A MONOWEAR piece. More details coming soon.")}</div>
          <p class="product-detail-stock">${stock > 0 ? "IN STOCK · " + stock + " AVAILABLE" : "SOLD OUT"}</p>
          <label class="product-detail-size-label" for="detail-size-${Number(product.id)}">SELECT SIZE</label>
          <select id="detail-size-${Number(product.id)}" class="size-select" ${stock <= 0 ? "disabled" : ""}>
            ${sizes.map((size) => `<option value="${escapeHTML(size)}">${escapeHTML(size)}</option>`).join("")}
          </select>
          <button type="button" class="add-button product-detail-add" ${stock <= 0 ? "disabled" : ""} onclick="addToCartFromDetail(${Number(product.id)})">${stock <= 0 ? "SOLD OUT" : "ADD TO BAG +"}</button>
        </div>
      </div>
      ${moreProductsMarkup}
`;
    const sizeSelect = $("detail-size-" + Number(product.id));
    if (sizeSelect) sizeSelect.value = sizes[0];
    if (!modal.open) modal.showModal();
  }

  window.openProductDetail = openProductDetail;
  window.addToCartFromDetail = function(productId) {
    const size = $("detail-size-" + Number(productId));
    const cardSelect = $("size-" + Number(productId));
    if (cardSelect && size) cardSelect.value = size.value;
    window.addToCart(productId);
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
      if (shippingQuoteMessage) shippingQuoteMessage.textContent = "Enter your city/LGA and state to fetch a live courier rate.";
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

async function refreshShippingQuote() {
  if (!checkoutForm) return;
  const cityField = checkoutForm.querySelector('[name="city"]');
  const stateField = checkoutForm.querySelector('[name="state"]');
  const city = String(cityField?.value || "").trim();
  const state = String(stateField?.value || "").trim();
  const shippingNode = $("checkoutShipping");
  const totalNode = $("checkoutTotal");
  const messageNode = $("shippingQuoteMessage");
  const subtotal = cart.reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );
  const requestId = ++shippingQuoteRequestId;

  if (!city || !state || !cart.length) {
    currentShippingQuoteAmount = null;
    if (shippingNode) shippingNode.textContent = "Enter destination";
    if (totalNode) totalNode.textContent = "—";
    if (messageNode) messageNode.textContent = "Enter your city/LGA and state to fetch a live courier rate.";
    return;
  }

  if (shippingNode) shippingNode.textContent = "Calculating…";
  if (totalNode) totalNode.textContent = "Calculating…";
  if (messageNode) messageNode.textContent = "Getting a live rate from our courier network…";

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
    if (!response.ok || !result.success || !result.quote) {
      throw new Error(result.error || "Live delivery rates are unavailable.");
    }
    const quote = result.quote;
    currentShippingQuoteAmount = Number(quote.amount);
    if (shippingNode) shippingNode.textContent = money(quote.amount);
    if (totalNode) totalNode.textContent = money(subtotal + Number(quote.amount || 0));
    if (messageNode) {
      const eta = quote.delivery_time ? " · " + quote.delivery_time : "";
      messageNode.textContent = "Lowest available live quote: " + quote.carrier + eta + ". Final rate is rechecked before payment.";
    }
  } catch (error) {
    if (requestId !== shippingQuoteRequestId) return;
    currentShippingQuoteAmount = null;
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

      items: cart.map((item) => ({
        product_id: Number(item.id),
        quantity: Number(item.quantity),
        size: String(item.size || "")
      }))
    };

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
