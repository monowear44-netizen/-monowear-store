(() => {
  const installButton = document.getElementById("studioInstallButton");
  const notificationButton = document.getElementById("studioNotificationsButton");
  let deferredInstallPrompt = null;
  let notificationPanel = null;

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
    notificationPanel = document.createElement("section");
    notificationPanel.className = "studio-notifications-panel";
    notificationPanel.id = "studioNotificationsPanel";
    notificationPanel.hidden = true;
    notificationPanel.innerHTML = '<div class="studio-notifications-head"><div><p class="eyebrow">STORE ACTIVITY</p><h2>Notifications</h2></div><button id="studioRefreshNotifications" class="secondary" type="button">REFRESH ↻</button></div><p id="studioPushStatus" class="studio-notification-status">Checking notification setup…</p><div id="studioNotificationItems"></div>';
    const main = document.querySelector(".main");
    const topbar = main?.querySelector(".topbar");
    if (main && topbar) main.insertBefore(notificationPanel, topbar.nextSibling);
    notificationPanel.querySelector("#studioRefreshNotifications").addEventListener("click", loadNotifications);
    return notificationPanel;
  }

  async function loadNotifications() {
    const panel = ensureNotificationPanel();
    const list = panel.querySelector("#studioNotificationItems");
    const status = panel.querySelector("#studioPushStatus");
    try {
      const data = await request("/api/admin/notifications");
      status.textContent = data.pushConfigured
        ? (data.subscriptions ? "Push is configured · " + data.subscriptions + " device subscription(s) · notifications are saved here too." : "Push is configured, but this device has not subscribed yet.")
        : "Push service needs secure VAPID keys in Render before alerts can reach your Home Screen. The in-app notification history is ready.";
      if (!data.notifications.length) {
        list.innerHTML = '<p class="muted">No store notifications yet. New confirmed orders and important events will appear here.</p>';
      } else {
        list.innerHTML = data.notifications.map((item) => {
          const unread = !item.read_at;
          const date = item.created_at ? new Date(item.created_at.replace(" ", "T") + (item.created_at.includes("Z") ? "" : "Z")).toLocaleString() : "";
          return '<article class="studio-notification-item">' + (unread ? '<span class="studio-notification-unread"></span>' : '<span style="width:7px;flex:0 0 7px"></span>') +
            '<div class="studio-notification-copy"><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.body) + '</p><small>' + escapeHtml(date) + '</small></div>' +
            (unread ? '<button type="button" data-read="' + Number(item.id) + '">MARK READ</button>' : '') + '</article>';
        }).join("");
        list.querySelectorAll("[data-read]").forEach((button) => button.addEventListener("click", async () => {
          try { await request("/api/admin/notifications/" + Number(button.dataset.read) + "/read", { method: "POST", body: "{}" }); await loadNotifications(); }
          catch (error) { showMessage(error.message, "error"); }
        }));
      }
    } catch (error) {
      status.textContent = "Log in to MONOWEAR Studio to view notifications.";
      list.innerHTML = "";
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
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showMessage("Notifications are blocked. Allow notifications for MONOWEAR Studio in your device settings, then try again.", "error");
        return;
      }
      const registration = await navigator.serviceWorker.register("/studio-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey)
        });
      }
      await request("/api/admin/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }) });
      await request("/api/admin/push/test", { method: "POST", body: "{}" });
      notificationButton.textContent = "NOTIFICATIONS ON ✓";
      showMessage("This device is subscribed. A test push has been sent; check your Home Screen notification settings.", "success");
      ensureNotificationPanel().hidden = false;
      await loadNotifications();
    } catch (error) {
      showMessage(error.message || "Could not enable push notifications.", "error");
    } finally {
      notificationButton.disabled = false;
      if (notificationButton.textContent === "CONNECTING…") notificationButton.textContent = "ENABLE NOTIFICATIONS";
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
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    if (installButton) installButton.hidden = true;
  }
})();