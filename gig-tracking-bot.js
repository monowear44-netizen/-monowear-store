"use strict";
const { chromium: playwrightChromium } = require("playwright-core");
const chromiumBinary = require("@sparticuz/chromium");

const INTERVAL_MS = 15 * 60 * 1000;
const TRACKER_URL = "https://portal.gigagilitysystems.com/public/track";
const KNOWN_SCAN = [
  "SHIPMENT CREATED AT SERVICE CENTER", "SHIPMENT CREATED",
  "SHIPMENT RECEIVED FROM THE STORE", "SHIPMENT ARRIVED SERVICE CENTRE",
  "SHIPMENT ARRIVED SERVICE CENTER", "SHIPMENT ARRIVED PROCESSING CENTER",
  "SHIPMENT DEPARTS SERVICE CENTRE", "SHIPMENT DEPARTS SERVICE CENTER",
  "SHIPMENT DEPART ORIGINAL SERVICE CENTER", "SHIPMENT ENROUTE DELIVERY",
  "SHIPMENT WITH DELIVERY COURIER", "SHIPMENT ARRIVED FINAL DESTINATION",
  "ARRIVED DELIVERY FACILITY", "DELIVERY ATTEMPTED", "DELIVERY UNSUCCESSFUL",
  "SHIPMENT ENROUTE RETURN", "SHIPMENT REREOUTED", "SHIPMENT CANCELLED",
  "DAMAGED SHIPMENT", "DELIVERED", "IN TRANSIT", "OUT FOR DELIVERY"
];

function cleanLines(text) {
  return String(text || "").split(/\r?\n/).map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function parseDateNear(lines, index) {
  const candidates = [lines[index - 1], lines[index + 1], lines[index + 2], lines[index - 2]].filter(Boolean);
  for (const value of candidates) {
    if (!/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2})\b/i.test(value)) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().replace("T", " ").replace("Z", "");
  }
  return null;
}

function extractScans(bodyText) {
  const lines = cleanLines(bodyText);
  const scans = [];
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (!KNOWN_SCAN.some(label => upper.includes(label))) continue;
    if (/KNOW THE MEANING|FREQUENTLY ASKED|TRACK SHIPMENT|SHIPMENT ORIGIN|DESTINATION/.test(upper)) continue;
    const message = lines[i].slice(0, 240);
    if (!scans.some(x => x.message.toLowerCase() === message.toLowerCase())) {
      scans.push({ message, created_at: parseDateNear(lines, i) });
    }
  }
  return scans;
}

async function fetchGIGScans(page, waybill) {
  const network = [];
  page.removeAllListeners("request");
  page.removeAllListeners("response");
  page.on("request", req => {
    if (/track|shipment|waybill/i.test(req.url()) || req.method() === "POST" || ["xhr", "fetch"].includes(req.resourceType())) {
      network.push(req.method() + " " + req.resourceType() + " " + req.url());
    }
  });
  page.on("pageerror", error => network.push("PAGEERROR " + error.stack));
  page.on("console", message => { if (message.type() === "error") network.push("CONSOLE " + message.text()); });
  page.on("response", res => {
    if (/track|shipment|waybill/i.test(res.url())) network.push("RESPONSE " + res.status() + " " + res.url());
  });
  await page.goto(TRACKER_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(12000);
  const jsInspection = await page.evaluate(async () => {
    const urls = Array.from(document.scripts).map(s => s.src).filter(Boolean);
    const hits = [];
    for (const url of urls) {
      try {
        const response = await fetch(url);
        const source = await response.text();
        const match = source.search(/trackNowBtn|waybillInput|trackShipment/i);
        if (match >= 0) hits.push({ url, snippet: source.slice(Math.max(0, match - 500), match + 1800) });
      } catch {}
    }
    return hits.slice(0, 5);
  });
  let input = page.getByPlaceholder(/waybill|tracking|shipment/i).first();
  if (!(await input.count())) input = page.locator("input[type='text'], input:not([type])").first();
  await input.waitFor({ state: "visible", timeout: 25000 });
  const inputDetails = await input.evaluate(el => ({ html: el.outerHTML, parent: el.parentElement?.outerHTML?.slice(0, 1200) }));
  await input.fill(String(waybill));
  const submitById = page.locator("#trackNowBtn");
  if (await submitById.count()) await submitById.click({ force: true, timeout: 15000 });
  else {
    const submit = page.getByRole("button", { name: /track|search|submit/i }).first();
    if (await submit.count()) await submit.click({ force: true, timeout: 15000 });
    else await input.press("Enter").catch(() => {});
  }
  await page.waitForTimeout(9000);
  let body = await page.locator("body").innerText({ timeout: 15000 });
  if (!body.includes(String(waybill)) && !/shipment origin/i.test(body)) {
    const trackTarget = await page.getByText(/track now/i).first().evaluate(el => ({ tag: el.tagName, html: el.outerHTML, parent: el.parentElement?.outerHTML?.slice(0, 1600) })).catch(() => null);
    const inputs = await page.locator("input").evaluateAll(els => els.map(e => ({ html: e.outerHTML, value: e.value, visible: !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) })));
    const forms = await page.locator("form").evaluateAll(els => els.map(e => e.outerHTML.slice(0, 1800)));
    const scripts = await page.locator("script[src]").evaluateAll(els => els.map(e => e.src));
    const blobScripts = await page.evaluate(async () => {
      const urls = Array.from(document.scripts).map(s => s.src).filter(src => src.startsWith("blob:"));
      const out = [];
      for (const url of urls) {
        try { const source = await (await fetch(url)).text(); out.push({ url, source: source.slice(0, 3500) }); } catch (e) { out.push({ url, error: e.message }); }
      }
      return out;
    });
    const buttonState = await page.locator("#trackNowBtn").count()
      ? await page.locator("#trackNowBtn").evaluate(el => ({ disabled: el.disabled, html: el.outerHTML, onclick: String(el.onclick) }))
      : await page.locator("button").evaluateAll(els => els.map(el => ({ disabled: el.disabled, html: el.outerHTML.slice(0, 500) })));
    const excerptAt = body.toLowerCase().lastIndexOf("track shipment");
    throw new Error("GIG tracker response missing. URL=" + page.url() + " TITLE=" + await page.title() + " INPUTDETAILS=" + JSON.stringify(inputDetails) + " INPUTS=" + JSON.stringify(inputs) + " BUTTON=" + JSON.stringify(buttonState) + " FORMS=" + JSON.stringify(forms) + " TRACKTARGET=" + JSON.stringify(trackTarget) + " SCRIPTS=" + JSON.stringify(scripts) + " BLOBS=" + JSON.stringify(blobScripts) + " JSINSPECTION=" + JSON.stringify(jsInspection) + " NETWORK=" + JSON.stringify(network) + " RESULTTEXT=" + body.slice(Math.max(0, excerptAt - 300), excerptAt + 1400).replace(/\\s+/g, " "));
  }
  if (/no shipment found|invalid waybill|waybill not found/i.test(body)) {
    throw new Error("GIG tracker returned no shipment for this waybill.");
  }
  const marker = body.lastIndexOf("Track Shipment");
  const resultPanel = marker >= 0 ? body.slice(marker) : body;
  const scans = extractScans(resultPanel);
  if (!scans.length) {
    throw new Error("GIG returned the tracking panel, but no shipment scan could be read. No status was invented.");
  }
  return scans;
}

async function runGigTrackingCheck(db) {
  const orders = db.prepare("SELECT id, reference, shipment_tracking_number FROM orders WHERE LOWER(COALESCE(shipment_carrier, '')) LIKE '%gig%' AND TRIM(COALESCE(shipment_tracking_number, '')) <> '' AND LOWER(COALESCE(order_status, '')) NOT IN ('delivered', 'cancelled')").all();
  if (!orders.length) return;
  let browser;
  try {
    const executablePath = await chromiumBinary.executablePath();
    browser = await playwrightChromium.launch({ args: chromiumBinary.args, executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    for (const order of orders) {
      try {
        const scans = await fetchGIGScans(page, order.shipment_tracking_number);
        const insert = db.prepare("INSERT INTO order_events (order_id, status, message, created_at) SELECT ?, 'carrier_update', ?, COALESCE(?, CURRENT_TIMESTAMP) WHERE NOT EXISTS (SELECT 1 FROM order_events WHERE order_id = ? AND status = 'carrier_update' AND LOWER(message) = LOWER(?))");
        let added = 0;
        const save = db.transaction(() => {
          for (const scan of scans) {
            const result = insert.run(order.id, scan.message, scan.created_at, order.id, scan.message);
            added += result.changes;
            if (/\bdelivered\b|delivery confirmed/i.test(scan.message)) {
              db.prepare("UPDATE orders SET order_status = 'delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
            }
          }
        });
        save();
        console.log("[GIG tracking] " + order.reference + ": " + added + " new scan(s), " + scans.length + " read.");
      } catch (error) {
        console.error("[GIG tracking] " + order.reference + ": " + error.message);
      }
    }
  } catch (error) {
    console.error("[GIG tracking] Browser check failed:", error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function startGigTrackingBot(db) {
  if (process.env.DISABLE_GIG_TRACKING_BOT === "true") {
    console.log("[GIG tracking] Bot disabled by environment.");
    return;
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await runGigTrackingCheck(db); }
    finally { running = false; }
  };
  const first = setTimeout(run, 45000);
  if (first.unref) first.unref();
  const interval = setInterval(run, INTERVAL_MS);
  if (interval.unref) interval.unref();
  console.log("[GIG tracking] Public tracker monitor scheduled every 15 minutes.");
}

module.exports = { startGigTrackingBot, runGigTrackingCheck, extractScans };
