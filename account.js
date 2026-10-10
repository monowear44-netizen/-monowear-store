const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(Number(n || 0));
async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}
async function post(url, body = {}) {
  return request(url, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
async function showAccount() {
  const guest = $("accountGuest");
  const dashboard = $("accountDashboard");
  try {
    const data = await request("/api/account/me");
    if (!data.authenticated || !data.customer) {
      guest.hidden = false;
      dashboard.hidden = true;
      return;
    }
    guest.hidden = true;
    dashboard.hidden = false;
    $("welcomeName").textContent =
      "Welcome, " + data.customer.name;
    $("myOrders").textContent = "Loading your orders…";
    try {
      const orders = await request("/api/account/orders");
      if (!Array.isArray(orders) || orders.length === 0) {
        $("myOrders").innerHTML =
          '<p class="muted">No orders yet. Your orders will appear here.</p>';
        return;
      }
      $("myOrders").innerHTML = orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        return `
          <article class="account-order">
            <h4>${esc(order.reference)} · ${money(order.total)}</h4>
            <p>${esc(order.status)} · Payment: ${esc(order.payment_status)}</p>
            <p>${items.map((item) =>
              `${esc(item.name)} (${esc(item.size)}) × ${esc(item.qty)}`
            ).join(", ")}</p>
            <small>${esc(order.created_at)}</small>
          </article>
        `;
      }).join("");
    } catch (error) {
      $("myOrders").textContent =
        "Your account is open, but your orders could not be loaded. Please refresh.";
      console.error("MONOWEAR orders error:", error);
    }
  } catch (error) {
    console.error("MONOWEAR account error:", error);
    guest.hidden = false;
    dashboard.hidden = true;
    const message = $("accountLoginMessage");
    if (message) {
      message.textContent =
        "We couldn't load your account. Please refresh the page and try again.";
    }
  }
}
$("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $("registerMessage");
  const button = form.querySelector('button[type="submit"], button:not([type])');
  message.textContent = "";
  if (button) {
    button.disabled = true;
    button.textContent = "CREATING ACCOUNT…";
  }
  try {
    await post(
      "/api/account/register",
      Object.fromEntries(new FormData(form))
    );
    form.reset();
    await showAccount();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "CREATE ACCOUNT ↗";
    }
  }
});
$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $("accountLoginMessage");
  const button = form.querySelector('button[type="submit"], button:not([type])');
  message.textContent = "";
  if (button) {
    button.disabled = true;
    button.textContent = "SIGNING IN…";
  }
  try {
    await post(
      "/api/account/login",
      Object.fromEntries(new FormData(form))
    );
    form.reset();
    await showAccount();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "SIGN IN ↗";
    }
  }
});
$("accountLogout").addEventListener("click", async () => {
  const button = $("accountLogout");
  button.disabled = true;
  try {
    await post("/api/account/logout", {});
    await showAccount();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});
showAccount();
