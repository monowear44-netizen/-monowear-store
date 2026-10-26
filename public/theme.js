/* MONOWEAR global theme: apply the published Studio theme to every interface. */
(() => {
  "use strict";
  const palettes = {"monochrome-studio":{"bg":"#FFFFFF","text":"#111111","muted":"#8A8A8A","accent":"#111111","onAccent":"#FFFFFF","tileA":"#EDEDED","onTileA":"#111111","tileB":"#D4D4D4","onTileB":"#111111"},"earth-sand":{"bg":"#F5EFE6","text":"#3B2F26","muted":"#8A7866","accent":"#A0643A","onAccent":"#FFFFFF","tileA":"#D9C7AE","onTileA":"#3B2F26","tileB":"#6B7A5A","onTileB":"#F5EFE6"},"midnight-streetwear":{"bg":"#0D0D0F","text":"#F5F5F5","muted":"#8B8B93","accent":"#C6FF3D","onAccent":"#0D0D0F","tileA":"#1E1E22","onTileA":"#F5F5F5","tileB":"#2E2E35","onTileB":"#F5F5F5"},"soft-pastel":{"bg":"#FFF8F5","text":"#4A3B47","muted":"#9A8794","accent":"#E8A0BF","onAccent":"#4A3B47","tileA":"#BAD7E9","onTileA":"#4A3B47","tileB":"#FFE5B4","onTileB":"#4A3B47"},"ocean-navy":{"bg":"#F4F7FA","text":"#0B2545","muted":"#6B7F99","accent":"#E07A5F","onAccent":"#FFFFFF","tileA":"#8DA9C4","onTileA":"#0B2545","tileB":"#0B2545","onTileB":"#F4F7FA"},"forest-luxe":{"bg":"#F3F1EA","text":"#1F3A2E","muted":"#6F7F75","accent":"#B08D57","onAccent":"#1F3A2E","tileA":"#2F5D46","onTileA":"#F3F1EA","tileB":"#D8D2C0","onTileB":"#1F3A2E"},"sunset-pop":{"bg":"#FFF4E0","text":"#1A1A1A","muted":"#7A6A55","accent":"#FF4D2E","onAccent":"#FFFFFF","tileA":"#FFC933","onTileA":"#1A1A1A","tileB":"#6C4BFF","onTileB":"#FFF4E0"}};
  function apply(settings) {
    const theme = String(settings.design_theme || "midnight-streetwear").toLowerCase();
    const p = palettes[theme] || palettes["midnight-streetwear"];
    const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
    const bg = p.bg;
    const ink = p.text;
    const accent = p.accent;
    const root = document.documentElement;
    root.dataset.theme = palettes[theme] ? theme : "dark";
    const vars = {
      "--bg":bg, "--ink":ink, "--text":ink, "--muted":p.muted,
      "--line":p.tileB, "--accent":accent, "--lime":accent,
      "--panel":p.tileA, "--panel2":p.tileB, "--surface-soft":p.tileA,
      "--color-bg":p.bg, "--color-text":p.text, "--color-muted":p.muted,
      "--color-accent":p.accent, "--color-on-accent":p.onAccent,
      "--color-tile-a":p.tileA, "--color-on-tile-a":p.onTileA,
      "--color-tile-b":p.tileB, "--color-on-tile-b":p.onTileB,
      "--preview-bg":bg, "--preview-ink":ink, "--preview-accent":accent,
      "--theme-sidebar":p.bg
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