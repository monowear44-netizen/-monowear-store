/* cart-connect.js — connect the wardrobe rail to MONOWEAR's real storefront cart. */
document.addEventListener('wardrobe:add', function (event) {
  var item = event.detail || {};
  if (!item.productId || typeof window.addToCart !== 'function') {
    console.error('MONOWEAR: wardrobe rail could not connect to the cart.', item);
    return;
  }
  window.addToCart(item.productId, {
    color: item.color || '',
    image: item.image || '',
    preorder: Boolean(item.preorder)
  });
  /* store.js owns the persisted cart and refreshes #cartCount, #drawerCount and totals. */
});
