/* Admin settings for the wardrobe rail. Uses MONOWEAR's existing protected Studio APIs. */
(function () {
  "use strict";
  const form = document.getElementById("wardrobeRailSettingsForm");
  if (!form) return;
  const fileInput = document.getElementById("wardrobeRailBackgroundFile");
  const preview = document.getElementById("wardrobeRailBackgroundPreview");
  const message = document.getElementById("wardrobeRailSettingsMessage");
  const remove = document.getElementById("removeWardrobeRailBackground");
  const field = form.elements.background;

  async function api(url, options) {
    const opts = Object.assign({ credentials: "same-origin" }, options || {});
    if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
      opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
      opts.body = JSON.stringify(opts.body);
    }
    const response = await fetch(url, opts);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  function showPreview(url) {
    const savedBackground = String(url || "");
    field.value = savedBackground;
    preview.hidden = !savedBackground;
    preview.style.width = "min(100%, 440px)";
    preview.style.height = "180px";
    preview.style.margin = "10px 0";
    preview.style.backgroundSize = "cover";
    preview.style.backgroundPosition = "center";
    preview.style.border = "1px solid var(--line)";
    preview.style.backgroundImage = savedBackground
      ? 'linear-gradient(#0002,#0004),url("' + savedBackground.replace(/["\\\\]/g, "") + '")'
      : "none";
    remove.disabled = !savedBackground;
  }
  function say(text, bad) {
    message.textContent = text;
    message.style.color = bad ? "#b42318" : "";
  }
  async function load() {
    try {
      const settings = await api("/api/admin/wardrobe-rail");
      form.elements.show.value = settings.show || "all";
      if (form.elements.model_enabled) form.elements.model_enabled.value = settings.model_enabled || "off";
      showPreview(settings.background || "");
    } catch (error) {
      say(error.message || "Could not load wardrobe rail settings.", true);
    }
  }
  fileInput.addEventListener("change", async function () {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      say("Choose a PNG, JPG or WEBP image.", true);
      fileInput.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      say("The background image must be smaller than 8 MB.", true);
      fileInput.value = "";
      return;
    }
    const body = new FormData();
    body.append("images", file);
    say("Uploading background…");
    try {
      const uploaded = await api("/api/admin/upload", { method: "POST", body: body });
      const url = uploaded.urls && uploaded.urls[0];
      if (!url) throw new Error("The server did not return an image URL.");
      showPreview(url);
      say("Background uploaded. Save to apply it to the storefront.");
    } catch (error) {
      say(error.message || "Background upload failed.", true);
    }
  });
  remove.addEventListener("click", function () {
    showPreview("");
    fileInput.value = "";
    say("Background removed. Save to publish this change.");
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = "SAVING…";
    say("Saving wardrobe rail settings…");
    try {
      const result = await api("/api/admin/wardrobe-rail", {
        method: "PUT",
        body: { show: form.elements.show.value, background: field.value, model_enabled: form.elements.model_enabled ? form.elements.model_enabled.value : "off" }
      });
      showPreview(result.RAIL ? result.RAIL.background : field.value);
      say("Wardrobe rail settings saved. The storefront will reflect your model setting.");
    } catch (error) {
      say(error.message || "Could not save wardrobe rail settings.", true);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  });
  load();
})();