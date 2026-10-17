(() => {
  const installButton = document.getElementById("studioInstallButton");
  const notificationButton = document.getElementById("studioNotificationsButton");
  let deferredInstallPrompt = null;
  let notificationPanel = null;
  let notificationsEnabledOnThisDevice = false;
  const NOTIFICATION_SETUP_KEY = "monowearStudioPushSetupV1";

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  };

  function addStyles() {
    if (document.getElementById("studioAppStyles")) return;
    const style = document.createElement("style");
    style.id = "studioAppStyles";
    style.textContent = `
      .studio-app-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      #studioNotificationsButton{white-space:nowrap}
      .studio-notice{margin:0 0 18px;padding:14px 16px;border:1px solid #d7d6cd;background:#faf9f4;font-size:12px;line-height:1.6}
      .studio-notice.error{color:#a72c20}.studio-notice.success{color:#42631b}
      .studio-notifications-panel{margin:0 0 24px;background:#faf9f4;border:1px solid #d7d6cd;padding:20px}
      .studio-notifications-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
      .studio-notifications-head h2{margin:0;font-size:20px}
      .studio-notification-item{display:flex;gap:12px;justify-content:space-between;padding:13px 0;border-top:1px solid #e1e0d8}
      .studio-notification-item p{margin:4px 0;font-size:12px;line-height:1.5}
      .studio-notification-item small{color:#77786f;font-size:10px}
      .studio-notification-unread{width:7px;height:7px;flex:0 0 7px;margin-top:6px;border-radius:50%;background:#638d24}
      .studio-notification-copy{flex:1;min-width:0}
      .studio-notification-item button{border:1px solid #d7d6cd;background:transparent;padding:7px 9px;font-size:10px;align-self:center}
      .studio-notification-status{margin:0 0 12px;font-size:12px;line-height:1.6;color:#77786f}
      @media(max-width:800px){.studio-app-actions{width:100%;gap:7px}.studio-app-actions #loggedEmail{display:none}.studio-app-actions button{font-size:9px;padding:11px 9px}.studio-notifications-head{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function showMessage(message, type = "") {
    addStyles();
    let box = document.getElementById("studioAppNotice");
    if (!box) {
      box = document.createElement("div");
      box.id = "studioAppNotice";
      box.className = "studio-notice";
      const main = document.querySelector(".main");
      const topbar = main?.querySelector(".topbar");
      if (topbar && main) main.insertBefore(box, topbar.nextSibling);
      else document.body.prepend(box);
    }
    box.className = "studio-notice " + type;
    box.textContent = message;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function ensureNotificationPanel() {
    addStyles();
    if (notificationPanel) return notificationPanel;
    notificationPanel = document.getElementById("studioNotificationPanel");
    if (!notificationPanel) return null;
    let status = notificationPanel.querySelector("#studioPushStatus");
    if (!status) {
      status = document.createElement("p");
      status.id = "studioPushStatus";
      status.className = "studio-notification-status";
      status.hidden = true;
      const head = notificationPanel.querySelector(".studio-notification-head");
      if (head) head.insertAdjacentElement("afterend", status);
    }
    let refresh = notificationPanel.querySelector("#studioRefreshNotifications");
    if (!refresh) {
      refresh = document.createElement("button");
      refresh.id = "studioRefreshNotifications";
      refresh.type = "button";
      refresh.className = "quiet";
      refresh.textContent = "Refresh";
      notificationPanel.querySelector(".studio-notification-head")?.appendChild(refresh);
      refresh.addEventListener("click", loadNotifications);
    }
    return notificationPanel;
  }

  async function loadNotifications() {
    const panel = ensureNotificationPanel();
    if (!panel) return;
    const status = panel.querySelector("#studioPushStatus");
    try {
      const data = await request("/api/admin/notifications");
      if (status) {
        status.hidden = false;
        status.textContent = data.pushConfigured
          ? (data.subscriptions ? "Push alerts connected on " + data.subscriptions + " device(s)." : "Push alerts are ready to connect on this device.")
          : "Device alerts are not configured yet. Store updates still appear here.";
      }
      window.dispatchEvent(new CustomEvent("monowear:notifications-updated"));
    } catch (error) {
      if (status) {
        status.hidden = false;
        status.textContent = "Notification history will appear after you log in.";
      }
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  async function enableNotifications() {
    // Once the browser has a saved subscription, the control becomes a status
    // indicator. Never ask the owner to enable it again on every Studio visit.
    if (notificationsEnabledOnThisDevice || notificationButton?.dataset.enabled === "true") {
      showMessage("Device alerts are already enabled and saved on this device.", "success");
      ensureNotificationPanel().hidden = false;
      await loadNotifications();
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isIOS && !isStandalone) {
      showMessage("First install MONOWEAR Studio: tap Safari's Share button, choose Add to Home Screen, then open the new MONOWEAR icon. Return here in the installed app and tap ENABLE NOTIFICATIONS.", "");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      showMessage("This browser does not support web push. On iPhone, open this site in Safari, add it to the Home Screen, then open the installed app.", "error");
      return;
    }
    if (!window.isSecureContext) {
      showMessage("Push notifications require a secure HTTPS connection.", "error");
      return;
    }
    notificationButton.disabled = true;
    notificationButton.textContent = "CONNECTING…";
    try {
      const config = await request("/api/admin/push/public-key");
      if (!config.enabled || !config.publicKey) {
        showMessage("The app interface is ready, but push keys have not been configured in Render yet. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to activate Home Screen alerts.", "error");
        ensureNotificationPanel().hidden = false;
        await loadNotifications();
        return;
      }
      const registration = await navigator.serviceWorker.register("/studio-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      // This device's subscription survives reloads. Reopening Studio should never
      // ask for permission or create another "connected" alert.
      if (Notification.permission === "granted" && subscription) {
        await request("/api/admin/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }) });
        notificationsEnabledOnThisDevice = true;
        notificationButton.dataset.enabled = "true";
        try { localStorage.setItem(NOTIFICATION_SETUP_KEY, "1"); } catch {}
        notificationButton.textContent = "DEVICE ALERTS ON ✓";
        notificationButton.disabled = true;
        notificationButton.setAttribute("aria-label", "Device alerts are already enabled");
        showMessage("Device alerts are already enabled on this device. You're all set.", "success");
        ensureNotificationPanel().hidden = false;
        await loadNotifications();
        return;
      }

      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") {
        showMessage("Notifications are blocked for this device. Allow them in your device settings to connect Studio alerts.", "error");
        return;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey)
        });
      }
      await request("/api/admin/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }) });
      // The connection notification is a one-time confirmation per installed browser.
      // If setup was already recorded, keep the existing subscription without another alert.
      let setupAlreadyRecorded = false;
      try { setupAlreadyRecorded = localStorage.getItem(NOTIFICATION_SETUP_KEY) === "1"; } catch {}
      if (!setupAlreadyRecorded) {
        await request("/api/admin/push/test", { method: "POST", body: "{}" });
      }
      notificationsEnabledOnThisDevice = true;
      notificationButton.dataset.enabled = "true";
      try { localStorage.setItem(NOTIFICATION_SETUP_KEY, "1"); } catch {}
      notificationButton.textContent = "DEVICE ALERTS ON ✓";
      notificationButton.disabled = true;
      notificationButton.setAttribute("aria-label", "Device alerts are already enabled");
      notificationButton.title = "Enabled and saved on this device"; 
      showMessage("Device alerts are enabled and saved for this device. You won't need to enable them again here.", "success");
      ensureNotificationPanel().hidden = false;
      await loadNotifications();
    } catch (error) {
      showMessage(error.message || "Could not enable push notifications.", "error");
    } finally {
      if (!notificationsEnabledOnThisDevice) {
        notificationButton.disabled = false;
        if (notificationButton.textContent === "CONNECTING…") notificationButton.textContent = "Enable device alerts";
      }
    }
  }

  notificationButton?.addEventListener("click", async () => {
    await enableNotifications();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      showMessage("On iPhone: open this page in Safari, tap Share, then Add to Home Screen. Open MONOWEAR Studio from the new Home Screen icon to enable push notifications.", "");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/studio-sw.js", { scope: "/" }).catch((error) => console.warn("Studio service worker registration failed:", error));
  }

  const appScreen = document.getElementById("appScreen");
  if (appScreen) {
    const observer = new MutationObserver(() => {
      if (!appScreen.hidden) loadNotifications();
    });
    observer.observe(appScreen, { attributes: true, attributeFilter: ["hidden", "style"] });
  }
  ensureNotificationPanel();

  // Reflect the saved browser subscription on every Studio visit.
  async function restoreNotificationState() {
    if (!notificationButton || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (Notification.permission === "granted" && subscription) {
        notificationsEnabledOnThisDevice = true;
        notificationButton.dataset.enabled = "true";
        try { localStorage.setItem(NOTIFICATION_SETUP_KEY, "1"); } catch {}
        notificationButton.textContent = "DEVICE ALERTS ON ✓";
        notificationButton.disabled = true;
        notificationButton.setAttribute("aria-label", "Device alerts are already enabled on this device");
        notificationButton.title = "Device alerts are already enabled and saved";
      } else {
        notificationsEnabledOnThisDevice = false;
        delete notificationButton.dataset.enabled;
        notificationButton.disabled = false;
        notificationButton.textContent = "Enable device alerts";
        notificationButton.removeAttribute("aria-label");
        notificationButton.removeAttribute("title");
        try { localStorage.removeItem(NOTIFICATION_SETUP_KEY); } catch {}
      }
    } catch (error) {
      console.warn("Could not restore saved Studio alert state:", error);
    }
  }
  restoreNotificationState();

  const isStandaloneApp = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (installButton) {
    installButton.hidden = Boolean(isStandaloneApp);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) installButton.textContent = "HOW TO INSTALL";
  }
})();