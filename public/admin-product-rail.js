/* Keeps the Wardrobe Rail box attached to the product being edited in MONOWEAR Studio.
   The rail fields above this box are saved by the existing product form and server route. */
(function () {
  "use strict";
  const host = document.getElementById("wr-admin-product");
  const form = document.getElementById("productForm");
  if (!host || !form) return;
  function sync() {
    const id = String((form.elements.id && form.elements.id.value) || "").trim();
    const status = (form.elements.rail_status && form.elements.rail_status.value) || "";
    const date = (form.elements.rail_drop_date && form.elements.rail_drop_date.value) || "";
    const type = (form.elements.rail_type && form.elements.rail_type.value) || "top";
    host.dataset.productId = id;
    host.textContent = id
      ? "Wardrobe rail settings for product #" + id + " · " + (status || "not on the rail") + (date ? " · drop date " + date : "") + " · " + type
      : "Wardrobe rail settings are saved with the product. Save this new product first to assign its product ID.";
  }
  window.syncWardrobeAdminProduct = sync;
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  sync();
})();