/* wardrobe-rail.js : live product rail inside <section id="wardrobe" class="wr"></section> */
(function () {
  'use strict';
  var root = document.getElementById('wardrobe');
  if (!root) return;
  var API = '/api/wardrobe-rail';
  var LABEL = { featured: 'Featured', 'new-drop': 'New drop', 'new-arrival': 'New arrival' };
  var P = [], S = { show: 'all', background: '' }, cur = 0, ci = 0, timer = null;
  function $(s) { return root.querySelector(s); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeImage(src) { var v=String(src||'').trim(); return (/^https:\/\//i.test(v) || /^\/uploads\/[a-zA-Z0-9._/-]+$/.test(v) || /^data:image\//i.test(v)) ? v : ''; }
  function money(n) { return '\u20A6' + Number(n || 0).toLocaleString('en-NG'); }
  function hook(t) { return t === 'cap' ? '<svg viewBox="0 0 46 30" aria-hidden="true"><path d="M23 29V16c0-5 6-4 6-9a6 6 0 0 0-12 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : '<svg viewBox="0 0 46 30" aria-hidden="true"><path d="M23 12V8.5c0-5 6-4 6-8M23 12L2 28h42z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>'; }
  /* Status lifecycle: featured persists; drops become arrivals after dropDate and leave on the next month's first day. */
  function eff(p) {
    if (p.status === 'featured') return 'featured';
    if (p.status !== 'new-drop' && p.status !== 'new-arrival') return '';
    if (!p.dropDate) return p.status;
    var n = new Date(), d = new Date(p.dropDate + 'T00:00:00');
    var end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    if (n >= end) return '';
    return d > n ? 'new-drop' : 'new-arrival';
  }
  function countdown(p) {
    var ms = new Date(p.dropDate + 'T00:00:00') - new Date();
    if (ms <= 0) return null;
    var s = Math.floor(ms / 1000), z = function (n) { return String(n).padStart(2, '0'); };
    return Math.floor(s / 86400) + 'D ' + z(Math.floor(s % 86400 / 3600)) + 'H ' + z(Math.floor(s % 3600 / 60)) + 'M ' + z(s % 60) + 'S';
  }
  root.innerHTML = '<div class="wr-bg" hidden></div><div class="wr-rail" aria-label="Clothing rail"><div class="wr-track"></div></div><div class="wr-empty" hidden>Nothing on the rail right now</div><div class="wr-stage"><div class="wr-wire"></div><div class="wr-row"><div class="wr-main"></div><div class="wr-side"></div></div><div class="wr-meta"><div class="wr-nm"></div><div class="wr-cl"></div><div class="wr-st"></div><button class="wr-add" type="button"></button></div></div><button class="wr-back" type="button">← BACK</button><div class="wr-hint">SWIPE · TAP AN ITEM</div>';
  var rail = $('.wr-rail'), track = $('.wr-track');
  function applyBg() { var b = $('.wr-bg'); b.hidden = !S.background; b.style.backgroundImage = S.background ? 'url("' + S.background.replace(/"/g, '%22') + '")' : 'none'; }
  function drawRail() {
    track.innerHTML = ''; var n = 0;
    P.forEach(function (p, i) {
      var e = eff(p); if (!e || !p.colors || !p.colors.length) return;
      if (S.show !== 'all' && e !== S.show) return;
      n++; var b = document.createElement('button'); b.type = 'button'; b.className = 'wr-it ' + (p.type === 'jean' || p.type === 'cap' ? p.type : 'top');
      b.innerHTML = hook(p.type) + '<img alt="' + esc(p.name) + '" src="' + esc(p.colors[0].src) + '"><small>' + esc(p.name) + '</small><span class="wr-tag">' + LABEL[e] + '</span>';
      b.addEventListener('click', function () { openItem(i); }); track.appendChild(b);
    });
    $('.wr-empty').hidden = n > 0;
  }
  function render() {
    if (!P[cur]) return;
    var p = P[cur], c = p.colors[ci] || p.colors[0], e = eff(p);
    $('.wr-main').innerHTML = hook(p.type) + '<img src="' + esc(c.src) + '" alt="' + esc(p.name) + '">';
    $('.wr-nm').textContent = p.name;
    $('.wr-cl').textContent = c.name + ' · ' + money(p.price);
    $('.wr-st').innerHTML = e ? '<span class="wr-tag">' + LABEL[e] + '</span>' + (e === 'new-drop' ? '<div class="wr-cd"><small>DROP GOES LIVE IN</small><span class="wr-cdv">' + (countdown(p) || '00D 00H 00M 00S') + '</span></div>' : '') : '';
    $('.wr-add').textContent = e === 'new-drop' ? 'PRE-ORDER +' : 'ADD TO BAG';
    var side = $('.wr-side'); side.innerHTML = '';
    p.colors.forEach(function (k, j) {
      if (j === ci) return;
      var b = document.createElement('button'); b.type = 'button'; b.title = k.name;
      b.innerHTML = hook('x') + '<img src="' + esc(k.src) + '" alt="' + esc(k.name) + '">';
      b.addEventListener('click', function (event) { event.stopPropagation(); swap(j); }); side.appendChild(b);
    });
  }
  function openItem(i) { cur = i; ci = 0; render(); root.classList.add('wr-focus'); clearInterval(timer); timer = setInterval(function () { var v = $('.wr-cdv'); if (!v) return; var t = countdown(P[cur]); if (t) v.textContent = t; else { render(); drawRail(); } }, 1000); }
  function swap(j) { var im = $('.wr-main img'); if (!im) return; im.classList.add('out'); setTimeout(function () { ci = j; render(); var n = $('.wr-main img'); if (n) { n.classList.add('out'); requestAnimationFrame(function () { requestAnimationFrame(function () { n.classList.remove('out'); }); }); } }, 260); }
  function closeItem() { root.classList.remove('wr-focus'); clearInterval(timer); }
  $('.wr-back').addEventListener('click', closeItem);
  $('.wr-stage').addEventListener('click', function (e) { if (e.target === this || e.target.classList.contains('wr-row') || e.target.classList.contains('wr-wire')) closeItem(); });
  $('.wr-add').addEventListener('click', function () {
    if (!P[cur]) return;
    var p = P[cur], c = p.colors[ci] || p.colors[0], e = eff(p);
    document.dispatchEvent(new CustomEvent('wardrobe:add', { detail: { productId: p.id, name: p.name, price: p.price, color: c.name, image: c.src, preorder: e === 'new-drop' } }));
    var btn = this, old = e === 'new-drop' ? 'PRE-ORDER +' : 'ADD TO BAG'; btn.textContent = 'ADDED ✓';
    setTimeout(function () { if (btn.isConnected) btn.textContent = old; }, 1200);
  });
  rail.addEventListener('wheel', function (e) { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { rail.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  var dn = false, sx = 0, sl = 0, mv = false;
  rail.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; dn = true; mv = false; sx = e.clientX; sl = rail.scrollLeft; });
  addEventListener('pointermove', function (e) { if (!dn) return; var d = e.clientX - sx; if (Math.abs(d) > 4) mv = true; rail.scrollLeft = sl - d; });
  addEventListener('pointerup', function () { dn = false; });
  rail.addEventListener('click', function (e) { if (mv) { e.stopPropagation(); e.preventDefault(); mv = false; } }, true);
  fetch(API, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    P = Array.isArray(d.products) ? d.products.map(function (p) { p.colors = (Array.isArray(p.colors) ? p.colors : []).map(function (c) { return { name: String(c.name || 'Original'), src: safeImage(c.src || c.imageUrl || c.image) }; }).filter(function (c) { return c.src; }); return p; }).filter(function (p) { return p.colors.length; }) : [];
    S = d.RAIL || d.settings || S; applyBg(); drawRail();
  }).catch(function (error) { console.error('MONOWEAR wardrobe rail:', error); $('.wr-empty').hidden = false; });
})();