(() => {
  const storageKey = 'monowear-studio-appearance';
  const modes = [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];
  function setup() {
    const actions = document.querySelector('.studio-app-actions');
    if (!actions || document.getElementById('studioThemeMode')) return;
    const wrap = document.createElement('div');
    wrap.className = 'studio-theme-switch';
    wrap.innerHTML = '<label for="studioThemeMode">APPEARANCE</label><select id="studioThemeMode" aria-label="Studio appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>';
    const select = wrap.querySelector('select');
    let preference = 'system';
    try { preference = localStorage.getItem(storageKey) || 'system'; } catch (e) {}
    const systemTheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function apply(nextPreference) {
      if (!modes.some(mode => mode.value === nextPreference)) nextPreference = 'system';
      preference = nextPreference;
      const resolved = preference === 'system' ? (systemTheme && systemTheme.matches ? 'dark' : 'light') : preference;
      document.body.dataset.studioMode = resolved;
      document.body.dataset.studioAppearance = preference;
      select.value = preference;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = resolved === 'dark' ? '#10110f' : '#f5f6f4';
      try { localStorage.setItem(storageKey, preference); } catch (e) {}
    }
    select.addEventListener('change', () => apply(select.value));
    if (systemTheme) {
      const onSystemChange = () => { if (preference === 'system') apply('system'); };
      if (systemTheme.addEventListener) systemTheme.addEventListener('change', onSystemChange);
      else if (systemTheme.addListener) systemTheme.addListener(onSystemChange);
    }
    actions.insertBefore(wrap, actions.firstChild);
    apply(preference);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();