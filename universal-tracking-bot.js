"use strict";

// Carrier-agnostic browser tracking. It behaves like a person using the carrier's
// public tracking page: open the URL saved on the order, enter the waybill, submit,
// then read the visible tracking timeline. It does not depend on a carrier API.
const { chromium } = require("playwright-core");
const chromiumBinary = require("@sparticuz/chromium");

const INTERVAL_MS = 15 * 60 * 1000;
const GIG_FALLBACK_URL = "https://web2.giglogistics.com/?LSCWP_CTRL=before_optm";
const STATUS_PATTERN = /\b(?:shipment created|order created|label created|booked|booking confirmed|picked up|pick up|collected|received|accepted|dispatched|departed|arrived|in transit|transit|out for delivery|with delivery|delivery attempted|attempted delivery|delivered|delivery confirmed|delivery failed|unsuccessful delivery|exception|held|on hold|returned|return to sender|rts|customs|clearance|processed|processing|sorted|at facility|at service cent(?:er|re)|handed over|handover|cancelled|canceled)\b/i;
const DATE_PATTERN = /\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2})\b/i;

function cleanLines(value) {
  return String(value || "").split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function parseDateNear(lines, index) {
  for (const value of [lines[index], lines[index - 1], lines[index + 1], lines[index + 2], lines[index - 2]]) {
    if (!value || !DATE_PATTERN.test(value)) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().replace("T", " ").replace("Z", "");
  }
  return null;
}

function extractTrackingEvents(bodyText) {
  const lines = cleanLines(bodyText);
  const events = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!STATUS_PATTERN.test(line)) continue;
    if (/track (?:another|new)|tracking number|waybill number|shipment tracking|frequently asked|customer service/i.test(line)) continue;
    const message = line.slice(0, 240);
    if (!events.some(event => event.message.toLowerCase() === message.toLowerCase())) {
      events.push({ message, created_at: parseDateNear(lines, i) });
    }
  }
  return events.slice(-40);
}

function makeTrackingUrl(rawUrl, trackingNumber) {
  const encoded = encodeURIComponent(String(trackingNumber || "").trim());
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  return raw
    .replace(/\{(?:tracking_number|tracking|waybill|awb)\}/gi, encoded)
    .replace(/%7B(?:tracking_number|tracking|waybill|awb)%7D/gi, encoded);
}

async function visibleInputCandidates(page) {
  return page.locator("input:not([type='hidden']), textarea").evaluateAll(elements => elements
    .filter(el => {
      const style = window.getComputedStyle(el);
      return !el.disabled && style.display !== "none" && style.visibility !== "hidden"
        && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    })
    .map(el => ({
      tag: el.tagName,
      type: (el.getAttribute("type") || "").toLowerCase(),
      placeholder: el.getAttribute("placeholder") || "",
      name: el.getAttribute("name") || "",
      id: el.id || "",
      aria: el.getAttribute("aria-label") || ""
    })));
}

async function submitTrackingPage(page, trackingNumber) {
  const inputs = await visibleInputCandidates(page);
  const score = item => {
    const text = [item.placeholder, item.name, item.id, item.aria].join(" ").toLowerCase();
    let value = 0;
    if (/tracking|waybill|awb|consignment|shipment|parcel|cnote|reference/.test(text)) value += 10;
    if (["text", "search", "number", ""].includes(item.type)) value += 2;
    if (/email|phone|password|date/.test(item.type)) value -= 20;
    return value;
  };
  const candidates = inputs.filter(item => score(item) > 0).sort((a, b) => score(b) - score(a));
  const numberAlreadyVisible = (await page.locator("body").innerText()).includes(String(trackingNumber));
  if (!numberAlreadyVisible && candidates.length) {
    const selectorFor = item => {
      if (item.id) return "#" + item.id.replace(/([:.\[\],=@])/g, "\\$1");
      if (item.name) return `input[name="${item.name.replace(/"/g, "\\\"")}"]`;
      if (item.placeholder) return `input[placeholder="${item.placeholder.replace(/"/g, "\\\"")}"]`;
      return "input:not([type='hidden']), textarea";
    };
    const input = page.locator(selectorFor(candidates[0])).first();
    await input.fill(String(trackingNumber), { timeout: 12000 });
    const buttons = page.getByRole("button", { name: /track|trace|search|find|submit|go/i });
    if (await buttons.count()) {
      await buttons.first().click({ timeout: 15000 });
    } else {
      const submit = page.locator("form").first();
      if (await submit.count()) {
        await input.press("Enter").catch(() => {});
      } else {
        await input.press("Enter").catch(() => {});
      }
    }
  } else if (!numberAlreadyVisible && !candidates.length) {
    throw new Error("No visible tracking-number field was found on the supplied carrier tracking page.");
  }
  await page.waitForTimeout(6500);
  return await page.locator("body").innerText({ timeout: 15000 });
}

async function readCarrierTracking(page, order) {
  const trackingNumber = String(order.shipment_tracking_number || "").trim();
  const carrier = String(order.shipment_carrier || "Carrier").trim();
  const rawUrl = order.shipment_tracking_url || (/gig/i.test(carrier) ? GIG_FALLBACK_URL : "");
  if (!rawUrl) throw new Error("Add the carrier's public tracking website URL to this order in Studio.");
  const url = makeTrackingUrl(rawUrl, trackingNumber);
  let parsed;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
  } catch {
    throw new Error("The saved tracking website URL is invalid.");
  }

  await page.goto(parsed.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1800);
  const body = await submitTrackingPage(page, trackingNumber);
  if (/no shipment found|invalid (?:tracking|waybill)|tracking number not found|not found for this (?:tracking|waybill)|no records found/i.test(body)) {
    throw new Error("The carrier website says this tracking number was not found.");
  }
  const events = extractTrackingEvents(body);
  if (!events.length) {
    throw new Error("The carrier page opened, but no readable shipment updates were found. No status was guessed.");
  }
  return events;
}

async function runUniversalTrackingCheck(db) {
  const orders = db.prepare(`
    SELECT id, reference, shipment_carrier, shipment_tracking_number, shipment_tracking_url
    FROM orders
    WHERE TRIM(COALESCE(shipment_tracking_number, '')) <> ''
      AND LOWER(COALESCE(order_status, '')) NOT IN ('delivered', 'cancelled')
  `).all();
  if (!orders.length) return;

  let browser;
  try {
    const executablePath = await chromiumBinary.executablePath();
    browser = await chromium.launch({ args: chromiumBinary.args, executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    page.setDefaultTimeout(15000);

    for (const order of orders) {
      try {
        const events = await readCarrierTracking(page, order);
        const insert = db.prepare(`
          INSERT INTO order_events (order_id, status, message, created_at)
          SELECT ?, 'carrier_update', ?, COALESCE(?, CURRENT_TIMESTAMP)
          WHERE NOT EXISTS (
            SELECT 1 FROM order_events
            WHERE order_id = ? AND status = 'carrier_update' AND LOWER(message) = LOWER(?)
          )
        `);
        let added = 0;
        const save = db.transaction(() => {
          for (const event of events) {
            const result = insert.run(order.id, event.message, event.created_at, order.id, event.message);
            added += result.changes;
            if (/\bdelivered\b|delivery confirmed/i.test(event.message)) {
              db.prepare("UPDATE orders SET order_status = 'delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
            }
          }
        });
        save();
        console.log(`[Universal tracking] ${order.reference} (${order.shipment_carrier || "carrier"}): ${added} new update(s), ${events.length} read.`);
      } catch (error) {
        console.error(`[Universal tracking] ${order.reference} (${order.shipment_carrier || "carrier"}): ${error.message}`);
      }
    }
  } catch (error) {
    console.error("[Universal tracking] Browser check failed:", error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function startUniversalTrackingBot(db) {
  if (process.env.DISABLE_UNIVERSAL_TRACKING_BOT === "true") {
    console.log("[Universal tracking] Bot disabled by environment.");
    return;
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await runUniversalTrackingCheck(db); }
    finally { running = false; }
  };
  const first = setTimeout(run, 45000);
  if (first.unref) first.unref();
  const interval = setInterval(run, INTERVAL_MS);
  if (interval.unref) interval.unref();
  console.log("[Universal tracking] Browser-based carrier tracking scheduled every 15 minutes.");
}

module.exports = {
  startUniversalTrackingBot,
  runUniversalTrackingCheck,
  extractTrackingEvents,
  makeTrackingUrl,
  readCarrierTracking
};
