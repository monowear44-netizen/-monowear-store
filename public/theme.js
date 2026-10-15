/* MONOWEAR global theme: apply the published Studio theme to every interface. */
(() => {
  "use strict";
  const palettes = {
    dark: { bg:"#111210", ink:"#f4f2ea", muted:"#a6a69d", line:"#34352f", accent:"#c6ff4b", panel:"#1b1c19", soft:"#242520", sidebar:"#151613" },
    white: { bg:"#ffffff", ink:"#171815", muted:"#77786f", line:"#deded8", accent:"#c6ff4b", panel:"#f7f7f3", soft:"#ededE7", sidebar:"#f0efe9" },
    emerald: { bg:"#073f32", ink:"#f2f5ef", muted:"#b8d0c5", line:"#286b59", accent:"#57d6a0", panel:"#0c4d3d", soft:"#145a48", sidebar:"#052f26" },
    gold: { bg:"#171510", ink:"#f6f0df", muted:"#c1b58f", line:"#51452a", accent:"#d5b15a", panel:"#211d14", soft:"#302817", sidebar:"#100f0b" },
    wine: { bg:"#2b0b16", ink:"#f8edf0", muted:"#c6a6b0", line:"#603044", accent:"#d87994", panel:"#3a101f", soft:"#481629", sidebar:"#210710" },
    gothic: { bg:"#0b0b0f", ink:"#e9e5ef", muted:"#aaa2b8", line:"#37313f", accent:"#b7a2d8", panel:"#15131a", soft:"#211d28", sidebar:"#08070b" },
    helpway: { bg:"#211316", ink:"#F6EEE8", muted:"#C8B5B0", line:"#56343A", accent:"#8E3B4A", panel:"#2B191D", soft:"#392126", sidebar:"#180D10" },
    "helpway-gradient": { bg:"#0B1425", ink:"#EAF1FF", muted:"#A9B9D4", line:"#2D4164", accent:"#4169E1", panel:"#111E34", soft:"#192A47", sidebar:"#080F1D" }
  };
  function apply(settings) {
    const theme = String(settings.design_theme || "dark").toLowerCase();
    const p = palettes[theme] || palettes.dark;
    const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
    const bg = validColor(settings.design_background, p.bg);
    const ink = validColor(settings.design_text, p.ink);
    const accent = validColor(settings.design_accent, p.accent);
    const root = document.documentElement;
    root.dataset.theme = palettes[theme] ? theme : "dark";
    const vars = {
      "--bg":bg, "--ink":ink, "--text":ink, "--muted":p.muted,
      "--line":p.line, "--accent":accent, "--lime":accent,
      "--panel":p.panel, "--panel2":p.soft, "--surface-soft":p.soft,
      "--preview-bg":bg, "--preview-ink":ink, "--preview-accent":accent,
      "--theme-sidebar":p.sidebar
    };
    Object.entries(vars).forEach(([name,value]) => root.style.setProperty(name,value));
    root.style.colorScheme = theme === "white" ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",bg);
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