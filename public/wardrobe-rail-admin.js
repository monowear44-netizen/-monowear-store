(() => {
  "use strict";
  const form = document.getElementById("wardrobeRailSettingsForm");
  if (!form) return;
  const fileInput = document.getElementById("wardrobeRailBackgroundFile");
  const preview = document.getElementById("wardrobeRailBackgroundPreview");
  const message = document.getElementById("wardrobeRailSettingsMessage");
  const remove = document.getElementById("removeWardrobeRailBackground");
  const field = form.elements.background;
  let savedBackground = "";

  const showPreview = (url) => {
    savedBackground = String(url || "");
    field.value = savedBackground;
    preview.hidden = !savedBackground;
    preview.style.backgroundImage = savedBackground ? 'linear-gradient(#0002,#0004),url("' + savedBackground.replace(/["\\\\]/g, "") + '")' : "none";
    remove.disabled = !savedBackground;
  };
  const say = (text, error = false) => {
    message.textContent = text;
    message.style.color = error ? "#b42318" : "";
  };

  async function load() {
    try {
      const settings = await api("/api/admin/wardrobe-rail");
      form.elements.show.value = settings.show || "all";
      showPreview(settings.background || "");
    } catch (error) {
      say(error.message || "Could not load wardrobe rail settings.", true);
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!/^image\\/(png|jpeg|webp)$/i.test(file.type)) {
      say("Choose a PNG, JPG or WEBP image.", true);
      fileInput.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      say("The background image must be smaller than 8 MB.", true);
      fileInput.value = "";
      return;
    }
    const data = new FormData();
    data.append("images", file);
    say("Uploading background…");
    try {
      const uploaded = await api("/api/admin/upload", { method: "POST", body: data });
      const url = uploaded.urls && uploaded.urls[0];
      if (!url) throw new Error("The server did not return an image URL.");
      showPreview(url);
      say("Background uploaded. Save to apply it to the storefront.");
    } catch (error) {
      say(error.message || "Background upload failed.", true);
    }
  });

  remove.addEventListener("click", () => {
    showPreview("");
    fileInput.value = "";
    say("Background removed. Save to publish this change.");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = "SAVING…";
    say("Saving wardrobe rail settings…");
    try {
      const result = await api("/api/admin/wardrobe-rail", {
        method: "PUT",
        body: JSON.stringify({ show: form.elements.show.value, background: field.value })
      });
      showPreview(result.RAIL.background);
      say("Wardrobe rail settings saved.");
    } catch (error) {
      say(error.message || "Could not save wardrobe rail settings.", true);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  });

  load();
})();