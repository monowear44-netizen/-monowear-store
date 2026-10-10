/* =========================================
   MONOWEAR STOREFRONT
   Product display, cart, and checkout
========================================= */

(() => {
  "use strict";

  const API = {
    store: "/api/store",
    checkout: "/api/checkout"
  };

  const CART_KEY = "monowear-cart-v1";

  const $ = (selector) => document.querySelector(selector);

  const productGrid = $("#productGrid");
  const searchInput = $("#searchProducts");
  const categoryFilter = $("#categoryFilter");

  const cartDrawer = $("#cartDrawer");
  const cartOverlay = $("#cartOverlay");
  const cartItems = $("#cartItems");
  const cartCount = $("#cartCount");
  const drawerCount = $("#drawerCount");
  const cartTotal = $("#cartTotal");

  const checkoutDialog = $("#checkoutDialog");
  const checkoutForm = $("#checkoutForm");
  const checkoutButton = $("#checkoutButton");
  const checkoutTotal = $("#checkoutTotal");
  const checkoutMessage = $("#checkoutMessage");

  let products = [];
  let settings = {};

  let cart = loadCart();

  /* ---------- Helpers ---------- */

  function money(amount) {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0
    }).format(Number(amount) || 0);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || "Something went wrong. Please try again."
      );
    }

    return data;
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
  }

  function cartQuantity() {
    return cart.reduce((total, item) => total + item.qty, 0);
  }

  function subtotal() {
    return cart.reduce(
      (total, item) => total + item.price * item.qty,
      0
    );
  }

  function productImage(product) {
    if (!product.image) return "";

    if (
      product.image.startsWith("/uploads/") ||
      product.image.startsWith("https://")
    ) {
      return product.image;
    }

    return "";
  }

  /* ---------- Store settings ---------- */

  function applySettings() {
    const brandName = $("#brandName");
    const footerTagline = $("#footerTagline");
    const announcement = $("#announcement");
    const heroTitle = $("#heroTitle");
    const heroSubtitle = $("#heroSubtitle");
    const heroCta = $("#heroCta");
    const instagramLink = $("#instagramLink");
    const emailLink = $("#emailLink");
    const newsletterLink = $("#newsletterLink");
    const year = $("#year");

    if (brandName && settings.brand_name) {
      brandName.innerHTML =
        `${escapeHTML(settings.brand_name)}<span>®</span>`;
    }

    if (footerTagline && settings.tagline) {
      footerTagline.textContent = settings.tagline;
    }

    if (announcement && settings.announcement) {
      announcement.textContent = settings.announcement;
    }

    if (heroTitle && settings.hero_title) {
      const words = escapeHTML(settings.hero_title)
        .split(/\s+/);

      heroTitle.innerHTML = words.length > 2
        ? `${words.slice(0, 2).join(" ")}<br><span>${words.slice(2).join(" ")}</span>`
        : `${words.join(" ")}<br><span></span>`;
    }

    if (heroSubtitle && settings.hero_subtitle) {
      heroSubtitle.textContent = settings.hero_subtitle;
    }

    if (heroCta && settings.hero_cta) {
      heroCta.firstChild
        ? heroCta.childNodes[0].textContent = settings.hero_cta + " ↗"
        : heroCta.textContent = settings.hero_cta + " ↗";
    }

    if (instagramLink && settings.instagram) {
      let instagram = settings.instagram.trim();

      if (instagram && !/^https?:\/\//i.test(instagram)) {
        instagram = "https://instagram.com/" +
          instagram.replace(/^@/, "");
      }

      instagramLink.href = instagram;
    }

    if (emailLink && settings.contact_email) {
      emailLink.href = "mailto:" + settings.contact_email;
    }

    if (newsletterLink && settings.instagram) {
      let instagram = settings.instagram.trim();

      if (!/^https?:\/\//i.test(instagram)) {
        instagram = "https://instagram.com/" +
          instagram.replace(/^@/, "");
      }

      newsletterLink.href = instagram;
      newsletterLink.target = "_blank";
      newsletterLink.rel = "noopener noreferrer";
    }

    if (year) {
      year.textContent = new Date().getFullYear();
    }

    if (settings.brand_name) {
      document.title = settings.brand_name + " — Live the Name";
    }
  }

  /* ---------- Product display ---------- */

  function renderProducts() {
    if (!productGrid) return;

    const search = (searchInput?.value || "")
      .trim()
      .toLowerCase();

    const category = categoryFilter?.value || "";

    const filtered = products.filter((product) => {
      const searchable = [
        product.name,
        product.category,
        product.description
      ].join(" ").toLowerCase();

      return searchable.includes(search) &&
        (!category || product.category === category);
    });

    if (!filtered.length) {
      productGrid.innerHTML = `
        <div class="empty-state">
          <p>No pieces found.</p>
          <p class="muted">Try another search or check back for new releases.</p>
        </div>
      `;
      return;
    }

    productGrid.innerHTML = filtered.map((product) => {
      const image = productImage(product);
      const sizes = Array.isArray(product.sizes)
        ? product.sizes
        : String(product.sizes || "S,M,L,XL")
            .split(",")
            .map((size) => size.trim())
            .filter(Boolean);

      const stock = Number(product.stock) || 0;
      const soldOut = stock <= 0;

      const sizeOptions = sizes.map((size) => `
        <option value="${escapeHTML(size)}">
          ${escapeHTML(size)}
        </option>
      `).join("");

      return `
        <article class="product-card" data-product-id="${Number(product.id)}">

          <div class="product-image">

            ${image
              ? `<img
                   src="${escapeHTML(image)}"
                   alt="${escapeHTML(product.name)}"
                   loading="lazy"
                   onerror="this.style.display='none';this.nextElementSibling.style.display='grid';"
                 >
                 <div class="image-placeholder" style="display:none">
                   ${escapeHTML(product.name)}
                 </div>`
              : `<div class="image-placeholder">
                   ${escapeHTML(product.name)}
                 </div>`
            }

            ${product.featured
              ? `<span class="product-badge">FEATURED</span>`
              : ""
            }

            ${soldOut
              ? `<span class="sold-badge">SOLD OUT</span>`
              : ""
            }

          </div>

          <div class="product-meta">
            <h3>${escapeHTML(product.name)}</h3>
            <span class="price">${money(product.price)}</span>
          </div>

          <span class="product-category">
            ${escapeHTML(product.category || "Apparel")}
          </span>

          ${product.description
            ? `<p class="product-description">
                 ${escapeHTML(product.description)}
               </p>`
            : ""
          }

          <div class="product-actions">

            <select
              class="size-select"
              aria-label="Choose size for ${escapeHTML(product.name)}"
              ${soldOut ? "disabled" : ""}
            >
              ${sizes.length > 1
                ? `<option value="">Choose size</option>`
                : ""
              }
              ${sizeOptions}
            </select>

            <button
              type="button"
              class="add-button"
              data-add="${Number(product.id)}"
              ${soldOut ? "disabled" : ""}
            >
              ${soldOut ? "SOLD OUT" : "ADD TO BAG +"}
            </button>

          </div>
        </article>
      `;
    }).join("");
  }

  function renderCategories() {
    if (!categoryFilter) return;

    const selected = categoryFilter.value;

    const categories = [
      ...new Set(
        products
          .map((product) => product.category)
          .filter(Boolean)
      )
    ].sort();

    categoryFilter.innerHTML = `
      <option value="">All pieces</option>
      ${categories.map((category) => `
        <option value="${escapeHTML(category)}">
          ${escapeHTML(category)}
        </option>
      `).join("")}
    `;

    if (categories.includes(selected)) {
      categoryFilter.value = selected;
    }
  }

  async function loadStore() {
    if (productGrid) {
      productGrid.innerHTML = `
        <p class="muted">Loading the MONOWEAR collection...</p>
      `;
    }

    try {
      const data = await request(API.store);

      products = Array.isArray(data.products)
        ? data.products
        : [];

      settings = data.settings || {};

      applySettings();
      renderCategories();
      renderProducts();
      renderCart();

    } catch (error) {
      console.error("MONOWEAR store error:", error);

      if (productGrid) {
        productGrid.innerHTML = `
          <div class="empty-state">
            <p>We couldn't load the collection.</p>
            <p class="muted">
              Please refresh the page and try again.
            </p>
            <button class="add-button" id="retryStore">
              TRY AGAIN
            </button>
          </div>
        `;
      }
    }
  }

  /* ---------- Shopping bag ---------- */

  function addToCart(productId, size) {
    const product = products.find(
      (item) => Number(item.id) === Number(productId)
    );

    if (!product) {
      alert("This product is no longer available.");
      return;
    }

    if (Number(product.stock) <= 0) {
      alert("This product is sold out.");
      return;
    }

    if (!size) {
      alert("Please choose a size first.");
      return;
    }

    const availableSizes = Array.isArray(product.sizes)
      ? product.sizes
      : String(product.sizes || "")
          .split(",")
          .map((item) => item.trim());

    if (!availableSizes.includes(size)) {
      alert("Please choose a valid size.");
      return;
    }

    const existing = cart.find(
      (item) =>
        Number(item.id) === Number(product.id) &&
        item.size === size
    );

    if (existing) {
      if (existing.qty >= Number(product.stock)) {
        alert("You have reached the available stock for this item.");
        return;
      }

      existing.qty += 1;

    } else {
      cart.push({
        id: Number(product.id),
        name: product.name,
        price: Number(product.price),
        image: productImage(product),
        size,
        qty: 1
      });
    }

    saveCart();
    openCart();
  }

  function changeQuantity(index, amount) {
    const item = cart[index];

    if (!item) return;

    const product = products.find(
      (product) => Number(product.id) === Number(item.id)
    );

    if (amount > 0 && product && item.qty >= Number(product.stock)) {
      alert("No more stock is available for this item.");
      return;
    }

    item.qty += amount;

    if (item.qty <= 0) {
      cart.splice(index, 1);
    }

    saveCart();
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
  }

  function renderCart() {
    const count = cartQuantity();
    const total = subtotal();

    if (cartCount) cartCount.textContent = count;
    if (drawerCount) drawerCount.textContent = `(${count})`;
    if (cartTotal) cartTotal.textContent = money(total);
    if (checkoutTotal) checkoutTotal.textContent = money(total);

    if (checkoutButton) {
      checkoutButton.disabled = cart.length === 0;
    }

    if (!cartItems) return;

    if (!cart.length) {
      cartItems.innerHTML = `
        <p class="muted">Your bag is empty.</p>
      `;
      return;
    }

    cartItems.innerHTML = cart.map((item, index) => `
      <div class="cart-line">

        <h3>${escapeHTML(item.name)}</h3>

        <p>
          Size: ${escapeHTML(item.size)}
          &nbsp;·&nbsp;
          ${money(item.price)}
        </p>

        <div class="qty-actions">

          <button
            type="button"
            data-quantity="${index}"
            data-change="-1"
            aria-label="Decrease quantity"
          >−</button>

          <span>${item.qty}</span>

          <button
            type="button"
            data-quantity="${index}"
            data-change="1"
            aria-label="Increase quantity"
          >+</button>

          <button
            type="button"
            data-remove="${index}"
          >REMOVE</button>

        </div>

      </div>
    `).join("");
  }

  function openCart() {
    cartDrawer?.classList.add("open");
    cartOverlay?.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    cartDrawer?.classList.remove("open");
    cartOverlay?.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---------- Checkout ---------- */

  async function checkout(event) {
    event.preventDefault();

    if (!cart.length) {
      if (checkoutMessage) {
        checkoutMessage.textContent = "Your bag is empty.";
      }
      return;
    }

    const submitButton = checkoutForm?.querySelector(
      'button[type="submit"]'
    );

    const originalText = submitButton?.textContent;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "PROCESSING...";
    }

    if (checkoutMessage) {
      checkoutMessage.textContent = "";
    }

    try {
      const formData = new FormData(checkoutForm);

      const payload = {
        customer_name: formData.get("customer_name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),

        items: cart.map((item) => ({
          id: Number(item.id),
          qty: Number(item.qty),
          size: item.size
        }))
      };

      const result = await request(API.checkout, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (result.payment_required && result.authorization_url) {
        window.location.href = result.authorization_url;
        return;
      }

      cart = [];
      saveCart();
      checkoutForm.reset();
      closeCart();

      if (checkoutDialog?.open) {
        checkoutDialog.close();
      }

      alert(
        `Thank you for shopping with MONOWEAR!\n\n` +
        `Order reference: ${result.reference || "Created"}\n\n` +
        `${result.message || "Your order has been received."}`
      );

    } catch (error) {
      if (checkoutMessage) {
        checkoutMessage.textContent = error.message;
      } else {
        alert(error.message);
      }

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText || "CONTINUE TO CHECKOUT";
      }
    }
  }

  /* ---------- Event listeners ---------- */

  productGrid?.addEventListener("click", (event) => {
    const retry = event.target.closest("#retryStore");

    if (retry) {
      loadStore();
      return;
    }

    const button = event.target.closest("[data-add]");

    if (!button) return;

    const card = button.closest(".product-card");
    const sizeSelect = card?.querySelector(".size-select");

    addToCart(
      Number(button.dataset.add),
      sizeSelect?.value || ""
    );
  });

  searchInput?.addEventListener("input", renderProducts);

  categoryFilter?.addEventListener("change", renderProducts);

  $("#cartToggle")?.addEventListener("click", openCart);

  $("#closeCart")?.addEventListener("click", closeCart);

  cartOverlay?.addEventListener("click", closeCart);

  cartItems?.addEventListener("click", (event) => {
    const quantityButton = event.target.closest("[data-quantity]");
    const removeButton = event.target.closest("[data-remove]");

    if (quantityButton) {
      changeQuantity(
        Number(quantityButton.dataset.quantity),
        Number(quantityButton.dataset.change)
      );
    }

    if (removeButton) {
      removeFromCart(Number(removeButton.dataset.remove));
    }
  });

  checkoutButton?.addEventListener("click", () => {
    if (!cart.length) return;

    closeCart();

    if (checkoutDialog?.showModal) {
      checkoutDialog.showModal();
    } else {
      alert("Please use a browser that supports checkout dialogs.");
    }
  });

  $("#closeCheckout")?.addEventListener("click", () => {
    checkoutDialog?.close();
  });
// MONOWEAR newsletter signup
const newsletterForm = $("#newsletterForm");

newsletterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const emailInput = $("#newsletterEmail");
  const message = $("#newsletterMessage");
  const submitButton = newsletterForm.querySelector(
    'button[type="submit"]'
  );

  const email = emailInput?.value.trim();

  if (!email) {
    if (message) {
      message.textContent = "Please enter your email address.";
    }
    return;
  }

  const originalText = submitButton?.textContent;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "JOINING...";
  }

  if (message) {
    message.textContent = "";
  }

  try {
    const result = await request("/api/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ email })
    });

    if (message) {
      message.textContent = result.message;
    }

    newsletterForm.reset();
  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText || "JOIN THE LIST ↗";
    }
  }
});
// MONOWEAR general waitlist
const waitlistForm = $("#waitlistForm");

waitlistForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const emailInput = $("#waitlistEmail");
  const message = $("#waitlistMessage");
  const submitButton = waitlistForm.querySelector(
    'button[type="submit"]'
  );

  const email = emailInput?.value.trim();

  if (!email) {
    if (message) {
      message.textContent = "Please enter your email address.";
    }
    return;
  }

  const originalText = submitButton?.textContent;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "JOINING...";
  }

  if (message) {
    message.textContent = "";
  }

  try {
    const result = await request("/api/waitlist/join", {
      method: "POST",
      body: JSON.stringify({
        email,
        list_type: "drop"
      })
    });

    if (message) {
      message.textContent =
        result.message || "You're on the MONOWEAR waitlist.";
    }

    waitlistForm.reset();
  } catch (error) {
    if (message) {
      message.textContent =
        error.message || "Unable to join. Please try again.";
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        originalText || "JOIN WAITLIST ↗";
    }
  }
});
  checkoutForm?.addEventListener("submit", checkout);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCart();
    }
  });

  /* ---------- Start ---------- */

  renderCart();
  loadStore();

})();
