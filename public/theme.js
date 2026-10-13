/* MONOWEAR global theme: apply the published Studio theme to every interface. */
(() => {
  "use strict";
  const palettes = {
    dark: { bg:"#111210", ink:"#f4f2ea", muted:"#a6a69d", line:"#34352f", accent:"#c6ff4b", panel:"#1b1c19", soft:"#242520", sidebar:"#151613" },
    white: { bg:"#ffffff", ink:"#171815", muted:"#77786f", line:"#deded8", accent:"#c6ff4b", panel:"#f7f7f3", soft:"#ededE7", sidebar:"#f0efe9" },
    emerald: { bg:"#073f32", ink:"#f2f5ef", muted:"#b8d0c5", line:"#286b59", accent:"#57d6a0", panel:"#0c4d3d", soft:"#145a48", sidebar:"#052f26" },
    gold: { bg:"#171510", ink:"#f6f0df", muted:"#c1b58f", line:"#51452a", accent:"#d5b15a", panel:"#211d14", soft:"#302817", sidebar:"#100f0b" }
  };
  function apply(settings) {
    const theme = String(settings.design_theme || "dark").toLowerCase();
    const p = palettes[theme] || palettes.dark;
    const root = document.documentElement;
    root.dataset.theme = palettes[theme] ? theme : "dark";
    const vars = {
      "--bg":p.bg, "--ink":p.ink, "--text":p.ink, "--muted":p.muted,
      "--line":p.line, "--accent":p.accent, "--lime":p.accent,
      "--panel":p.panel, "--panel2":p.soft, "--surface-soft":p.soft,
      "--preview-bg":p.bg, "--preview-ink":p.ink, "--preview-accent":p.accent,
      "--theme-sidebar":p.sidebar
    };
    Object.entries(vars).forEach(([name,value]) => root.style.setProperty(name,value));
    root.style.colorScheme = theme === "white" ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",p.bg);
  }
  async function load() {
    try {
      const response = await fetch("/api/settings", { cache:"no-store" });
      if (!response.ok) throw new Error("Theme settings unavailable");
      const data = await response.json();
      apply(data.settings || data);
    } catch (error) {
      // Leave each page's existing appearance intact if settings cannot load.
      console.warn("MONOWEAR theme:", error.message);
    }
  }
  window.applyMonowearGlobalTheme = apply;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",load,{once:true});
  else load();
})();