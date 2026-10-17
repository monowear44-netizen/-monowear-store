require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Resend } = require("resend");
const webpush = require("web-push");
const archiver = require("archiver");

// ============================================================
// MONOWEAR STORE SERVER
// ============================================================

const app = express();

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM =
  process.env.EMAIL_FROM || "MONOWEAR <orders@monowears.com>";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ORDER_NOTIFICATION_EMAIL = (process.env.ORDER_NOTIFICATION_EMAIL || "monowear44@gmail.com").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const SESSION_SECRET = process.env.SESSION_SECRET || "";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:orders@monowears.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}


const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ============================================================
// DATABASE
// ============================================================

const STORAGE_DIR =
  process.env.RENDER_DISK_PATH || "/var/data";

const DATA_DIR = path.join(STORAGE_DIR, "data");
const UPLOAD_DIR = path.join(STORAGE_DIR, "uploads");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "monowear.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    compare_price REAL DEFAULT 0,
    image TEXT DEFAULT '',
    images TEXT DEFAULT '[]',
    category TEXT DEFAULT '',
    sizes TEXT DEFAULT '[]',
    colors TEXT DEFAULT '[]',
    color_images TEXT DEFAULT '{}',
    stock INTEGER NOT NULL DEFAULT 0,
    published INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT DEFAULT '',
    shipping_address TEXT DEFAULT '',
    shipping_city TEXT DEFAULT '',
    shipping_state TEXT DEFAULT '',
    shipping_postcode TEXT DEFAULT '',
    items TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    shipping_fee REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending',
    order_status TEXT DEFAULT 'pending',
    payment_method TEXT DEFAULT 'paystack',
    payment_reference TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    message TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS newsletter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    product_id INTEGER,
    product_name TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_collections (
    product_id INTEGER NOT NULL,
    collection_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY(product_id, collection_id),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_products_published
    ON products(published);

  CREATE INDEX IF NOT EXISTS idx_orders_reference
    ON orders(reference);

  CREATE INDEX IF NOT EXISTS idx_collections_slug
    ON collections(slug);

  CREATE INDEX IF NOT EXISTS idx_product_collections_product
    ON product_collections(product_id);

  CREATE INDEX IF NOT EXISTS idx_product_collections_collection
    ON product_collections(collection_id);

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '/studio',
    read_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Private first-party website analytics. Store only a random visitor token,
// page path and timestamp; do not store IP addresses or raw user-agent strings.
db.exec(`
  CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    page_path TEXT NOT NULL DEFAULT '/',
    visited_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_site_visits_time ON site_visits(visited_at);
  CREATE INDEX IF NOT EXISTS idx_site_visits_visitor_time ON site_visits(visitor_id, visited_at);
`);
db.prepare("DELETE FROM site_visits WHERE visited_at < datetime('now', '-400 days')").run();
// Remove any older URL-level analytics: the dashboard tracks totals only, never product views.
db.prepare("UPDATE site_visits SET page_path = '/' WHERE page_path <> '/'").run();

// ============================================================
// HISTORICAL LABELD RECORDS — idempotent seed, separate from live orders.
// ============================================================
db.exec(`
CREATE TABLE IF NOT EXISTS historical_records (
 id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE,
 record_type TEXT NOT NULL, record_date TEXT DEFAULT '', category TEXT DEFAULT '',
 description TEXT NOT NULL, amount REAL DEFAULT 0, direction TEXT DEFAULT '',
 status TEXT DEFAULT '', customer_name TEXT DEFAULT '', customer_phone TEXT DEFAULT '',
 reference TEXT DEFAULT '', details TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_historical_records_type ON historical_records(record_type);
`);
const historicalSeed = [
["expense-labeld-pro-2026-10-09","expense","2026-10-09","Software & Subscriptions","LabelD Pro Plan Subscription (monthly)",5000,"out","recorded","","","","Recurring monthly expense; included in historical total."],
["expense-shipping-2026-10-05-a","expense","2026-10-05","Logistics & Shipping","Shipping expense",6000,"out","recorded"],
["expense-shipping-2026-10-05-b","expense","2026-10-05","Logistics & Shipping","Shipping expense",6000,"out","recorded"],
["expense-shipping-2026-10-05-c","expense","2026-10-05","Logistics & Shipping","Shipping expense",5000,"out","recorded"],
["expense-shipping-2026-10-05-d","expense","2026-10-05","Logistics & Shipping","Shipping expense",5000,"out","recorded"],
["expense-email-credits-2026-09-18","expense","2026-09-18","Software & Subscriptions","Email credits purchase (1,000 credits)",1000,"out","recorded"],
["expense-shipping-2026-09-13","expense","2026-09-13","Logistics & Shipping","Shipping expense",5000,"out","recorded"],
["expense-labeld-pro-2026-09-09","expense","2026-09-09","Software & Subscriptions","LabelD Pro Plan Subscription (monthly)",5000,"out","recorded"],
["ledger-shipping-2026-09-11","transaction","2026-09-11","Shipping Fee","Shipping Fee collected",5000,"in","recorded"],
["ledger-withdrawal-aRqTRZrwyIJCcqJVYkIA","withdrawal","2026-09-11","Withdrawal","Withdrawal request",36500,"out","paid","","","aRqTRZrwyIJCcqJVYkIA","Matching manual hold request merged with paid request; counted once."],
["ledger-shipping-2026-09-25","transaction","2026-09-25","Shipping Fee","Shipping Fee collected",5000,"in","recorded"],
["ledger-order-2026-09-25-28000","transaction","2026-09-25","Store order","Store order — fee absorbed by brand",28000,"in","recorded"],
["ledger-withdrawal-uoAgDZUYWyOzWNhq870X","withdrawal","2026-09-27","Withdrawal","Withdrawal request",33000,"out","paid","","","uoAgDZUYWyOzWNhq870X","Matching manual hold request merged with paid request; counted once."],
["ledger-shipping-2026-09-28","transaction","2026-09-28","Shipping Fee","Shipping Fee collected",6000,"in","recorded"],
["ledger-order-2026-09-28-30000","transaction","2026-09-28","Store order","Store order — fee absorbed by brand",30000,"in","recorded"],
["ledger-order-2026-09-28-28000","transaction","2026-09-28","Store order","Store order — fee absorbed by brand",28000,"in","recorded"],
["ledger-shipping-2026-09-29","transaction","2026-09-29","Shipping Fee","Shipping Fee collected",6000,"in","recorded","","","","Repeated copy of same timestamp/amount deduplicated."],
["ledger-order-2026-09-29-28000","transaction","2026-09-29","Store order","Store order — fee absorbed by brand",28000,"in","recorded"],
["ledger-order-2026-09-29-30000","transaction","2026-09-29","Store order","Store order — fee absorbed by brand",30000,"in","recorded"],
["ledger-withdrawal-rN607zvG85DDNOK34CBX","withdrawal","2026-09-29","Withdrawal","Withdrawal request",100000,"out","paid","","","rN607zvG85DDN0K34CBX","Matching manual hold request merged with paid request; counted once."],
["ledger-withdrawal-Rc7EUjhkuKgZRDwfxOPZ","withdrawal","2026-09-30","Withdrawal","Withdrawal request",28000,"out","paid","","","Rc7EUjhkuKgZRDwfxOPZ","Matching manual hold request merged with paid request; counted once."],
["ledger-order-undated-31500","transaction","","Store order","Store order amount shown at end of pasted ledger (date/reference not visible)",31500,"in","needs_review","","","","Date and reference were not visible in copied text."],
["customer-dolapo","customer","","Customer profile","Historical customer profile",0,"","partial","Dolapo","08160362391","","","8 orders; last order 2026-09-27; seven purchase rows visible, one not shown."],
["customer-malik","customer","","Customer profile","Historical customer profile",131500,"","partial","Malik","09164979413","","","1 order; last order 2026-09-28; lifetime spend ₦131,500; manual."],
["customer-riwo-me","customer","","Customer profile","Historical customer profile",64000,"","partial","Riwo Me","07068138065","","","1 order; last order 2026-09-29; lifetime spend ₦64,000; online."],
["customer-precious-banigo","customer","","Customer profile","Historical customer profile",64000,"","partial","Precious Banigo","07037213835","","","1 order; last order 2026-09-28; lifetime spend ₦64,000; online."],
["customer-mubarak","customer","","Customer profile","Historical customer profile",63000,"","partial","Mubarak","08167861865","","","2 orders; last order 2026-09-23; lifetime spend ₦63,000; manual."],
["customer-ekungs","customer","","Customer profile","Historical customer profile",58000,"","partial","Ekungs","08072482930","","","1 order; last order 2026-10-03; lifetime spend ₦58,000; manual."],
["customer-ovakachi-habeebullah","customer","","Customer profile","Historical customer profile",33000,"","partial","Ovakachi Habeebullah","07048336076","","","1 order; last order 2026-09-25; lifetime spend ₦33,000; online."],
["customer-still-danny","customer","","Customer profile","Historical customer profile",30000,"","partial","Still Danny","08106948637","","","1 order; last order 2026-09-29; lifetime spend ₦30,000; manual."],
["customer-timi","customer","","Customer profile","Historical customer profile",0,"","partial","Timi","08160128566","","","1 order; spend and date not visible."],
["summary-labeld-sales","summary","","Reported dashboard totals","LabelD all-time sales",1051599,"in","reported","","","","18 orders across 14 customers."],
["summary-labeld-ltv","summary","","Reported dashboard totals","LabelD customer lifetime value total",950099,"","reported","","","","Preserved exactly as reported; not recalculated."],
["summary-labeld-expenses","summary","","Reported dashboard totals","LabelD all-time expenses",38000,"out","reported","","","","Eight expenses, including ₦27,000 shipping and ₦10,000 subscriptions."],
["summary-labeld-shipping-fees","summary","","Reported dashboard totals","Distinct incoming shipping fees from supplied ledger",22000,"in","reported","","","","Four distinct fees: ₦5k Sep 11, ₦5k Sep 25, ₦6k Sep 28, ₦6k Sep 29."],
  ["completed-order-dolapo-2026-09-27-58000","completed_order","2026-09-27","Completed LabelD order","Dolapo — Mono nexus raglan - Merlot (x1); MONOWEAR LEGACY… (product name truncated in supplied record)",58000,"in","completed","Dolapo","08160362391","LABELD-DOLAPO-20260927-58000","{\"items\":[{\"name\":\"Mono nexus raglan - Merlot\",\"quantity\":1},{\"name\":\"MONOWEAR LEGACY… (name truncated)\",\"quantity\":1}]}"],
  ["completed-order-dolapo-2026-09-20-86000","completed_order","2026-09-20","Completed LabelD order","Dolapo — Y2K retro tee - MIDNIGHT. (x1); MONOWEAR LEGACYT… (product name truncated in supplied record)",86000,"in","completed","Dolapo","08160362391","LABELD-DOLAPO-20260920-86000","{\"items\":[{\"name\":\"Y2K retro tee - MIDNIGHT.\",\"quantity\":1},{\"name\":\"MONOWEAR LEGACYT… (name truncated)\",\"quantity\":1}]}"],
  ["completed-order-dolapo-2026-09-18-108500","completed_order","2026-09-18","Completed LabelD order","Dolapo — Y2K race raglan - long sleeve (x1); leopard archive den… (product name truncated in supplied record)",108500,"in","completed","Dolapo","08160362391","LABELD-DOLAPO-20260918-108500","{\"items\":[{\"name\":\"Y2K race raglan - long sleeve\",\"quantity\":1},{\"name\":\"leopard archive den… (name truncated)\",\"quantity\":1}]}"],
  ["completed-order-dolapo-2026-09-18-129499","completed_order","2026-09-18","Completed LabelD order","Dolapo — Y2K race raglan - long sleeve (x1); mono script line tan… (product name truncated in supplied record)",129499,"in","completed","Dolapo","08160362391","LABELD-DOLAPO-20260918-129499","{\"items\":[{\"name\":\"Y2K race raglan - long sleeve\",\"quantity\":1},{\"name\":\"mono script line tan… (name truncated)\",\"quantity\":1}]}"],
  ["completed-order-dolapo-2026-09-18-73500","completed_order","2026-09-18","Completed LabelD order","Dolapo — Y2K retro tee - BURGUNDY. (x1); leopard archive deni… (product name truncated in supplied record)",73500,"in","completed","Dolapo","08160362391","LABELD-DOLAPO-20260918-73500","{\"items\":[{\"name\":\"Y2K retro tee - BURGUNDY.\",\"quantity\":1},{\"name\":\"leopard archive deni… (name truncated)\",\"quantity\":1}]}"],
  ["completed-order-dolapo-2026-09-13-40500","completed_order","2026-09-13","Completed LabelD order","Dolapo — MOTION TEE - black (x1)",40500,"in","completed","Dolapo","08160362391","LABELD-DOLAPO-20260913-40500","{\"items\":[{\"name\":\"MOTION TEE - black\",\"quantity\":1}]}"],
  ["completed-order-dolapo-undated-37330","completed_order","","Completed LabelD order","Dolapo — The MONO originals - sunbeam (x1); date not shown in supplied record",37330,"in","completed","Dolapo","08160362391","LABELD-DOLAPO-UNDATED-37330","{\"items\":[{\"name\":\"The MONO originals - sunbeam\",\"quantity\":1}]}"]
];
const insertHistorical = db.prepare(`INSERT OR IGNORE INTO historical_records
(source_key,record_type,record_date,category,description,amount,direction,status,customer_name,customer_phone,reference,details)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
db.transaction(() => {
 for (const r of historicalSeed) {
  const [key,type,date,category,description,amount,direction,status,name="",phone="",reference="",details=""] = r;
  insertHistorical.run(key,type,date,category,description,amount,direction,status,name,phone,reference,details);
 }
})();
// ============================================================
// DATABASE MIGRATIONS
// ============================================================

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((item) => item.name === column);

  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }

  return false;
}

ensureColumn("products", "slug", "TEXT");
ensureColumn("products", "compare_price", "REAL DEFAULT 0");
ensureColumn("products", "images", "TEXT DEFAULT '[]'");
ensureColumn("products", "category", "TEXT DEFAULT ''");
ensureColumn("products", "sizes", "TEXT DEFAULT '[]'");
ensureColumn("products", "colors", "TEXT DEFAULT '[]'");
ensureColumn("products", "color_images", "TEXT DEFAULT '{}'");
ensureColumn("products", "stock", "INTEGER DEFAULT 0");
ensureColumn("products", "published", "INTEGER DEFAULT 0");
ensureColumn("products", "featured", "INTEGER DEFAULT 0");
ensureColumn("products", "new_arrival_until", "TEXT DEFAULT ''");
ensureColumn("products", "sort_order", "INTEGER DEFAULT 0");
ensureColumn("products", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");

ensureColumn("orders", "customer_phone", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_address", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_city", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_state", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_postcode", "TEXT DEFAULT ''");
ensureColumn("orders", "dispatch_location", "TEXT DEFAULT 'Ikorodu, Lagos'");
ensureColumn("orders", "subtotal", "REAL DEFAULT 0");
ensureColumn("orders", "shipping_fee", "REAL DEFAULT 0");
ensureColumn("orders", "discount", "REAL DEFAULT 0");
ensureColumn("orders", "payment_status", "TEXT DEFAULT 'pending'");
ensureColumn("orders", "order_status", "TEXT DEFAULT 'pending'");
ensureColumn("orders", "payment_method", "TEXT DEFAULT 'paystack'");
ensureColumn("orders", "payment_reference", "TEXT DEFAULT ''");
ensureColumn("orders", "notes", "TEXT DEFAULT ''");
ensureColumn("orders", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");
ensureColumn("orders", "admin_notification_status", "TEXT DEFAULT ''");
const orderRecordTypeAdded = ensureColumn("orders", "record_type", "TEXT DEFAULT 'abandoned_cart'");
if (orderRecordTypeAdded) {
  db.prepare(`
    UPDATE orders SET record_type = CASE
      WHEN payment_status = 'paid' THEN 'real_order'
      ELSE 'abandoned_cart'
    END
  `).run();
}


// ------------------------------------------------------------
// UPDATE: collection archive state, payment details, email tracking.
// All additive. Existing rows are preserved. Backfills run ONCE,
// only at the moment a column is first created.
// ------------------------------------------------------------
ensureColumn("collections", "archived", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("collections", "release_date", "TEXT DEFAULT ''");

if (ensureColumn("orders", "paid_at", "TEXT")) {
  // Use the exact time recorded when payment was confirmed, if present;
  // otherwise fall back to the order's last update time.
  db.exec(`
    UPDATE orders
    SET paid_at = COALESCE(
      (
        SELECT MIN(e.created_at)
        FROM order_events e
        WHERE e.order_id = orders.id
          AND e.message LIKE 'Payment confirmed%'
      ),
      updated_at
    )
    WHERE payment_status = 'paid' AND paid_at IS NULL
  `);
}

ensureColumn("orders", "paystack_fee", "REAL DEFAULT 0");
ensureColumn("orders", "payment_channel", "TEXT DEFAULT ''");
ensureColumn("orders", "email_sent_at", "TEXT");
ensureColumn("orders", "delivery_email_status", "TEXT DEFAULT ''");
ensureColumn("orders", "delivery_email_sent_at", "TEXT");
ensureColumn("orders", "shipping_provider", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_request_token", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_courier_id", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_service_code", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_courier_name", "TEXT DEFAULT ''");

ensureColumn("orders", "preorder_email_status", "TEXT DEFAULT ''");

if (ensureColumn("orders", "email_status", "TEXT DEFAULT ''")) {
  // Orders already paid before this update are marked "legacy" so the
  // update never emails past customers again.
  db.exec(`
    UPDATE orders
    SET email_status = 'legacy'
    WHERE payment_status = 'paid'
  `);
}

// ============================================================
// DEFAULT SETTINGS
// ============================================================

const defaults = {
  store_name: "MONOWEAR",
  brand_name: "MONOWEAR",
  tagline: "LIVE THE NAME. WEAR THE MEANING.",
  story_title: "Built for the ones who keep going.",
  brand_story: "MONO is a state of mind: self-reliant, intentional, and unwilling to wait for permission. Every piece carries a reminder to keep showing up for your own future.",
  hero_title: "HELP IS ON THE WAY.",
  hero_subtitle: "A distressed collection about pressure, persistence and finding a way through.",
  hero_cta: "SHOP THE DROP ↗",
  currency: "NGN",
  shipping_fee: "0",
  free_shipping_threshold: "0",
  active_dispatch_location: "Ijebu Ode, Ogun State",
  shipping_ikorodu_lagos: "",
  shipping_ikorodu_ogun: "",
  shipping_ikorodu_nationwide: "",
  shipping_ijebu_lagos: "",
  shipping_ijebu_ogun: "",
  shipping_ijebu_nationwide: "",
  announcement: "HELP IS ON THE WAY — COMING SOON",
  drop_preorder_date: "2026-10-21",
  drop_launch_date: "2026-11-10",
  x: "https://x.com/monowear44",
  contact_email: process.env.CONTACT_EMAIL || "",
  maintenance_mode: "false",
  hero_background_image: "",
  waitlist_background_image: "",
  policy_returns: "",
  policy_shipping: "",
  logo_image: "",
  design_theme: "dark",
  design_background: "#f0efe9",
  design_text: "#141414",
  design_accent: "#c6ff4b",
  design_font: "Manrope",
  design_hero_alignment: "left",
  design_radius: "square",
  design_product_columns: "3",
  design_product_ratio: "portrait",
  design_hero_height: "standard"
};
// ============================================================
// INITIAL ADMIN
// ============================================================

if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  const existingAdmin = db
    .prepare("SELECT id FROM admins WHERE email = ?")
    .get(ADMIN_EMAIL);

  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

    db.prepare(`
      INSERT INTO admins (email, password_hash)
      VALUES (?, ?)
    `).run(ADMIN_EMAIL, passwordHash);

    console.log("Initial MONOWEAR admin account created.");
  }
}

// ============================================================
// INITIAL COLLECTIONS
// ============================================================

const initialCollections = [
  {
    name: "HELP IS ON THE WAY",
    slug: "help-is-on-the-way",
    description:
      "A reminder that even when the road gets heavy, movement continues. HELP IS ON THE WAY.",
    sort_order: 1
  },
  {
    name: "MONO ORIGINALS",
    slug: "mono-originals",
    description:
      "The foundations of MONOWEAR. Essential pieces made to carry the meaning.",
    sort_order: 2
  },
  {
    name: "MONO ARCHIVES",
    slug: "mono-archives",
    description:
      "Past expressions, archived designs and pieces from the MONOWEAR story.",
    sort_order: 3
  }
];

const insertCollection = db.prepare(`
  INSERT OR IGNORE INTO collections
  (name, slug, description, published, sort_order)
  VALUES (?, ?, ?, 0, ?)
`);

for (const collection of initialCollections) {
  insertCollection.run(
    collection.name,
    collection.slug,
    collection.description,
    collection.sort_order
  );
}

// Seed the announced release date only if it has not already been customised.
db.prepare(`
  UPDATE collections SET release_date = '2026-10-21'
  WHERE slug = 'help-is-on-the-way'
    AND (release_date IS NULL OR release_date = '')
`).run();

 
// ============================================================
// MONOWEAR PRODUCT CATALOGUE DRAFTS
// Idempotent: creates missing catalogue items without duplicating
// them. Existing core products keep their price, stock, image and
// publication state. New concepts remain unpublished until reviewed.
// ============================================================

const catalogueDrafts = [
  {
    name: "MONO HELP IS ON THE WAY HOODIE",
    slug: "mono-help-is-on-the-way-hoodie",
    aliases: ["Hoodie", "MONO HELP IS ON THE WAY HOODIE"],
    description: "A statement piece from MONOWEAR’s HELP IS ON THE WAY drop. Inspired by pressure, persistence, and the determination to find a way through, this hoodie represents the strength it takes to keep moving when life gets heavy. Help can arrive as an opportunity, a person, a second chance—or the strength you discover within yourself. Designed for those who keep going, even when the way forward isn’t clear.",
    category: "Hoodies",
    collection: "help-is-on-the-way"
  },
  {
    name: "MONO HELP IS ON THE WAY LONGSLEEVE",
    slug: "mono-help-is-on-the-way-longsleeve",
    aliases: ["Longsleeve", "MONO HELP IS ON THE WAY LONGSLEEVE"],
    description: "A streetwear essential from MONOWEAR’s HELP IS ON THE WAY drop. Built around pressure, persistence, and finding your way forward, this piece represents the journey of becoming stronger through what you face. Sometimes help arrives through an unexpected opportunity. Sometimes it comes from someone who believes in you. And sometimes, you become the help you have been waiting for. Keep moving. Your way through will come.",
    category: "Longsleeves",
    collection: "help-is-on-the-way"
  },
  {
    name: "MONO ARCHIVE CAP",
    slug: "mono-archive-cap",
    aliases: ["Mono Archive Cap", "MONO ARCHIVE CAP"],
    description: "An everyday essential from MONOWEAR. The MONO ARCHIVE CAP brings understated streetwear into your daily rotation, built around the meaning behind the name: independence, self-reliance, and freedom. Simple enough to wear every day. Distinct enough to represent something. LIVE THE NAME. WEAR THE MEANING.",
    category: "Accessories",
    collection: "mono-originals"
  },
  {
    name: "THE MONO ORIGINALS — MOSS",
    slug: "the-mono-originals-moss",
    description: "Part of THE MONO ORIGINALS, a line built around the foundations of MONOWEAR. Rooted in independence and everyday expression, this piece represents the core of the brand: clothing with meaning, made for those who choose their own direction. Confirm the garment type and colour details before publishing.",
    category: "Unspecified garment",
    collection: "mono-originals"
  },
  {
    name: "Y2K RETRO TEE",
    slug: "y2k-retro-tee",
    description: "Inspired by vintage cars, nostalgia, and the freedom of the open road. The Y2K RETRO TEE captures a retro-inspired aesthetic built around movement, independence, and going your own way. Its vintage-car concept represents the freedom to choose your direction rather than wait for someone else to take you there. The plot twist? You were never waiting for a passenger. You were always meant to drive alone. MONO — move on your own.",
    category: "Tees",
    collection: "mono-archives"
  },
  {
    name: "MONOWEAR MOTION TEE",
    slug: "monowear-motion-tee",
    description: "Movement is more than going somewhere. It is the decision to keep progressing, even when the destination is still uncertain. The MONOWEAR MOTION TEE represents consistency, independence, and the mindset of someone who refuses to remain where they started. Every step counts. Every day is another opportunity to move forward.",
    category: "Tees",
    collection: "mono-originals"
  },
  {
    name: "MONO CROPPED TEE — INDEPENDENCE",
    slug: "mono-cropped-tee-independence",
    description: "A statement piece from MONOWEAR’s Independence campaign. Created around the idea of standing on your own, this cropped tee represents freedom, self-reliance, and the confidence to exist without depending on outside approval. Independence is not just a look. It is a way of moving through life.",
    category: "Cropped Tees",
    collection: "mono-archives"
  },
  {
    name: "MONO MULTICOLOR LETTER-BOX GRAPHIC TEE",
    slug: "mono-multicolor-letter-box-graphic-tee",
    description: "A graphic-led MONOWEAR streetwear piece featuring a multicolour letter-box chest design. Created for a distinctive visual identity while staying connected to the brand’s independent spirit, this piece brings expressive graphics into everyday streetwear. Confirm the final graphic and colourway before publishing.",
    category: "Graphic Tees",
    collection: "mono-archives"
  },
  {
    name: "MONO WHITE GRAPHIC TEE",
    slug: "mono-white-graphic-tee",
    description: "A clean canvas for MONOWEAR’s independent identity. Designed around the brand’s streetwear aesthetic, the MONO WHITE GRAPHIC TEE offers a versatile everyday piece with room for distinctive graphic expression. Minimal in colour. Meaningful in identity.",
    category: "Graphic Tees",
    collection: "mono-originals"
  },
  {
    name: "MONO BLACK GRAPHIC TEE",
    slug: "mono-black-graphic-tee",
    description: "A black streetwear essential from MONOWEAR. Built around the brand’s dark aesthetic and independent identity, this graphic tee brings a strong visual presence to everyday dressing. Made for those who define themselves rather than follow the crowd. LIVE THE NAME. WEAR THE MEANING.",
    category: "Graphic Tees",
    collection: "mono-originals"
  },
  {
    name: "MONO LEOPARD DENIM ARCHIVE JEANS — 02",
    slug: "mono-leopard-denim-archive-jeans-02",
    description: "An expressive denim concept from the MONOWEAR archive. The MONO LEOPARD DENIM ARCHIVE JEANS — 02 brings a distinctive leopard-inspired design into the brand’s streetwear identity. Created for those who treat personal style as an extension of individuality, this piece stands apart from ordinary denim. A statement from the archive. A look of your own.",
    category: "Denim",
    collection: "mono-archives"
  },
  {
    name: "NEXUS RAGLAN",
    slug: "nexus-raglan",
    description: "A streetwear piece from MONOWEAR built around individuality and expression. The NEXUS RAGLAN brings a distinctive silhouette into the MONOWEAR wardrobe, offering a foundation for everyday styling while staying true to the brand’s independent spirit. Wear your own direction. Define your own identity.",
    category: "Raglan",
    collection: "mono-archives"
  },
  {
    name: "PARDON MY SWAG — NEWSPAPER BEANIE",
    slug: "pardon-my-swag-newspaper-beanie",
    description: "A graphic-inspired accessory concept from MONOWEAR. The PARDON MY SWAG NEWSPAPER BEANIE brings a newspaper-inspired aesthetic into streetwear, combining expressive design with an unapologetic sense of personal style. For those who wear their individuality without asking permission.",
    category: "Accessories",
    collection: "mono-archives"
  },
  {
    name: "MONO LEGACY TRACK PANTS",
    slug: "mono-legacy-track-pants",
    description: "Built around the idea of leaving something behind that carries your name. The MONO LEGACY TRACK PANTS represent the journey of building your own path, staying consistent, and creating a legacy through your actions. A streetwear essential connected to a bigger purpose: independence that outlives the moment.",
    category: "Track Pants",
    collection: "mono-archives"
  },
  {
    name: "STORY OF A BOY WHO NEVER SETTLES",
    slug: "story-of-a-boy-who-never-settles",
    description: "A MONOWEAR concept built around ambition, movement, and refusing to settle for a life that does not feel like your own. For the ones building quietly, choosing their own direction, and turning pressure into progress. Confirm the garment type and artwork before publishing.",
    category: "Unspecified garment",
    collection: "mono-archives"
  },
  {
    name: "MONO PLAIN WHITE TEE",
    slug: "mono-plain-white-tee",
    description: "A clean everyday staple for the MONOWEAR wardrobe. Simple, versatile, and designed to work across everyday streetwear looks. Confirm the fit, fabric, and exact colour before publishing.",
    category: "Tees",
    collection: "mono-originals"
  },
  {
    name: "HELP IS ON THE WAY CAP",
    slug: "help-is-on-the-way-cap",
    description: "A cap concept for MONOWEAR’s HELP IS ON THE WAY drop. Inspired by pressure, persistence, and finding a way through, this accessory carries the drop’s message into an everyday streetwear essential. Confirm the final artwork and colourway before publishing.",
    category: "Accessories",
    collection: "help-is-on-the-way"
  },
  {
    name: "MONO BLACK LONGSLEEVE",
    slug: "mono-black-longsleeve",
    description: "A black longsleeve streetwear concept from MONOWEAR. Designed around the brand’s dark visual identity and independent spirit, this piece is intended as a versatile everyday layer. Confirm whether this is a separate design from the HELP IS ON THE WAY longsleeve before publishing.",
    category: "Longsleeves",
    collection: "mono-originals"
  }
];

const findProductBySlug = db.prepare("SELECT * FROM products WHERE slug = ?");
const findProductByName = db.prepare("SELECT * FROM products WHERE lower(name) = lower(?) LIMIT 1");
const insertCatalogueDraft = db.prepare(`
  INSERT INTO products
    (name, slug, description, price, compare_price, image, images, category,
     sizes, colors, stock, published, featured, sort_order)
  VALUES
    (@name, @slug, @description, 0, 0, '', '[]', @category,
     '[]', '[]', 0, 0, 0, @sort_order)
`);
const updateExistingCatalogueProduct = db.prepare(`
  UPDATE products
  SET name = ?, description = ?, category = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const findCollectionBySlug = db.prepare("SELECT id FROM collections WHERE slug = ?");
const linkCatalogueProduct = db.prepare(`
  INSERT OR IGNORE INTO product_collections (product_id, collection_id, sort_order)
  VALUES (?, ?, 0)
`);

for (let index = 0; index < catalogueDrafts.length; index += 1) {
  const item = catalogueDrafts[index];
  let product = findProductBySlug.get(item.slug);

  if (!product && Array.isArray(item.aliases)) {
    for (const alias of item.aliases) {
      product = findProductByName.get(alias);
      if (product) break;
    }
  }

  if (product) {
    // Preserve the existing product's price, stock, image and publication state.
    updateExistingCatalogueProduct.run(item.name, item.description, item.category, product.id);
  } else {
    const result = insertCatalogueDraft.run({
      name: item.name,
      slug: item.slug,
      description: item.description,
      category: item.category,
      sort_order: 100 + index
    });
    product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(result.lastInsertRowid));
  }

  const collection = findCollectionBySlug.get(item.collection);
  if (collection) linkCatalogueProduct.run(product.id, collection.id);
}

// ============================================================
// ADMIN PUSH NOTIFICATIONS
// ============================================================
function recordAdminNotification(type, title, body, url = "/studio") {
  const safeUrl = String(url || "/studio").startsWith("/") ? String(url || "/studio") : "/studio";
  const result = db.prepare(
    "INSERT INTO admin_notifications (type, title, body, url) VALUES (?, ?, ?, ?)"
  ).run(String(type || "info").slice(0, 40), String(title || "MONOWEAR update").slice(0, 140), String(body || "").slice(0, 500), safeUrl);
  const notification = db.prepare("SELECT * FROM admin_notifications WHERE id = ?").get(result.lastInsertRowid);
  sendPushToAdmins(notification).catch((error) => console.error("Admin push notification error:", error.message));
  return notification;
}

async function sendPushToAdmins(notification) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const subscriptions = db.prepare("SELECT id, subscription_json FROM push_subscriptions").all();
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.url || "/studio",
    tag: "monowear-" + notification.id,
    notificationId: notification.id
  });
  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription_json), payload);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
      } else {
        console.error("Push delivery failed:", error.statusCode || error.message);
      }
    }
  }
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Lets the logo load inside email apps that fetch images in a browser.
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

app.use(
  express.json({
    limit: "2mb",
    // Keep the exact raw bytes of Paystack webhook requests so the
    // signature can be verified. Only this one route is affected.
    verify: (req, res, buf) => {
      if (
        req.originalUrl === "/api/paystack/webhook" ||
        req.originalUrl === "/api/payments/paystack-webhook"
      ) {
        req.rawBody = buf;
      }
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

if (!SESSION_SECRET) {
  console.warn(
    "WARNING: SESSION_SECRET is missing. Configure it in your hosting environment."
  );
}

app.use(
  session({
    name: "monowear.sid",
    store: new SQLiteStore({
      db: "sessions.sqlite",
      dir: DATA_DIR
    }),
    secret: SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

// Record storefront document visits only. Never count Studio/admin/API/assets,
// and never count the authenticated store owner browsing their own storefront.
app.use((req, res, next) => {
  try {
    if (req.method !== "GET" || req.session?.adminId) return next();

    const pathname = String(req.path || "/");
    if (
      pathname === "/studio" || pathname.startsWith("/api/") ||
      pathname.startsWith("/uploads/") || pathname.startsWith("/assets/") ||
      pathname.startsWith("/.well-known/") || pathname === "/favicon.ico" ||
      pathname === "/robots.txt" || pathname === "/sitemap.xml"
    ) return next();

    const accept = String(req.headers.accept || "");
    if (!accept.includes("text/html")) return next();

    const userAgent = String(req.headers["user-agent"] || "");
    if (/bot|crawler|spider|headless|preview|facebookexternalhit|twitterbot|whatsapp/i.test(userAgent)) {
      return next();
    }

    const cookies = Object.fromEntries(
      String(req.headers.cookie || "").split(";").map((part) => {
        const index = part.indexOf("=");
        return index < 0 ? ["", ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
      }).filter(([key]) => key)
    );

    let visitorId = cookies.mw_visitor;
    if (!visitorId || !/^[a-f0-9]{64}$/.test(visitorId)) {
      visitorId = crypto.randomBytes(32).toString("hex");
      res.append("Set-Cookie", "mw_visitor=" + visitorId + "; Max-Age=31536000; Path=/; SameSite=Lax; HttpOnly; Secure");
    }

    // Count visits only. Do not persist the URL or product slug a visitor opened.
    db.prepare("INSERT INTO site_visits (visitor_id, page_path) VALUES (?, '/')").run(visitorId);
  } catch (error) {
    // Analytics must never interrupt storefront requests.
    console.warn("Website analytics skipped:", error.message);
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many attempts. Please try again later."
  }
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================
// HELPERS
// ============================================================

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function parseJSON(value, fallback = []) {
  try {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    if (typeof value !== "string") {
      return value;
    }

    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeProduct(product) {
  if (!product) return null;

  return {
    ...product,
    price: Number(product.price || 0),
    compare_price: Number(product.compare_price || 0),
    stock: Number(product.stock || 0),
    published: Boolean(product.published),
    featured: Boolean(product.featured),
    new_arrival: Boolean(product.new_arrival_until && Date.parse(product.new_arrival_until) > Date.now()),
    new_arrival_until: product.new_arrival_until || "",
    images: parseJSON(product.images, []),
    sizes: parseJSON(product.sizes, []),
    colors: parseJSON(product.colors, []),
    color_images: parseJSON(product.color_images, {})
  };
}

function safeCollection(collection) {
  if (!collection) return null;

  return {
    ...collection,
    published: Boolean(collection.published),
    archived: Boolean(collection.archived),
    sort_order: Number(collection.sort_order || 0)
  };
}

function safeOrder(order) {
  if (!order) return null;

  return {
    ...order,
    items: parseJSON(order.items, []),
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    discount: Number(order.discount || 0),
    total: Number(order.total || 0)
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({
      error: "Admin login required."
    });
  }

  next();
}

function requireCustomer(req, res, next) {
  if (!req.session || !req.session.customerId) {
    return res.status(401).json({
      error: "Please log in to continue."
    });
  }

  next();
}

function recordOrderEvent(orderId, status, message = "") {
  db.prepare(`
    INSERT INTO order_events (order_id, status, message)
    VALUES (?, ?, ?)
  `).run(orderId, status, message);
}

function getProductCollections(productId, includeHidden = false) {
  const visibleFilter = includeHidden
    ? ""
    : "AND c.published = 1 AND c.archived = 0";

  return db.prepare(`
    SELECT c.*
    FROM collections c
    INNER JOIN product_collections pc
      ON pc.collection_id = c.id
    WHERE pc.product_id = ?
    ${visibleFilter}
    ORDER BY pc.sort_order ASC, c.sort_order ASC
  `).all(productId).map(safeCollection);
}

function getCollectionProducts(collectionId, includeUnpublished = false) {
  const publishedFilter = includeUnpublished ? "" : "AND p.published = 1";

  return db.prepare(`
    SELECT p.*
    FROM products p
    INNER JOIN product_collections pc
      ON pc.product_id = p.id
    WHERE pc.collection_id = ?
    ${publishedFilter}
    ORDER BY pc.sort_order ASC, p.sort_order ASC, p.id DESC
  `).all(collectionId).map(safeProduct);
}

function productWithCollections(product, includeHidden = false) {
  const safe = safeProduct(product);
  if (!safe) return null;

  safe.collections = getProductCollections(product.id, includeHidden);
  return safe;
}

// Replace the set of collections a product belongs to.
function setProductCollections(productId, collectionIds) {
  const ids = [...new Set(
    (Array.isArray(collectionIds) ? collectionIds : [])
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0)
  )];

  const exists = db.prepare("SELECT id FROM collections WHERE id = ?");

  const insert = db.prepare(`
    INSERT OR IGNORE INTO product_collections
    (product_id, collection_id, sort_order)
    VALUES (?, ?, 0)
  `);

  db.transaction(() => {
    db.prepare(
      "DELETE FROM product_collections WHERE product_id = ?"
    ).run(productId);

    for (const collectionId of ids) {
      if (exists.get(collectionId)) {
        insert.run(productId, collectionId);
      }
    }
  })();
}

function getOrderByReference(reference) {
  return db.prepare(`
    SELECT * FROM orders WHERE reference = ?
  `).get(reference);
}

function getOrderById(id) {
  return db.prepare(`
    SELECT * FROM orders WHERE id = ?
  `).get(id);
}

// ============================================================
// UPLOADS
// ============================================================

const storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, UPLOAD_DIR);
  },

  filename: function (req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];

    if (!allowed.includes(extension)) {
      return callback(new Error("Unsupported image format."));
    }

    callback(
      null,
      `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`
    );
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 10
  },
  fileFilter: function (req, file, callback) {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return callback(new Error("Only image files are allowed."));
    }

    callback(null, true);
  }
});

app.use("/uploads", express.static(UPLOAD_DIR));

// ============================================================
// EMAIL
// ============================================================

// Sends one email through Resend and returns { ok, error }.
// Resend reports most failures in its response rather than throwing,
// so both paths are checked and reported honestly.
async function sendEmail(to, subject, html) {
  if (!resend) {
    console.log("Email skipped: RESEND_API_KEY is not configured.");
    return {
      ok: false,
      error: "Email is not configured (RESEND_API_KEY is missing)."
    };
  }

  if (!to) {
    return { ok: false, error: "No recipient address." };
  }

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html
    });

    if (error) {
      const message = error.message || String(error);
      console.error("Email error:", message);
      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (error) {
    console.error("Email error:", error.message);
    return { ok: false, error: error.message };
  }
}

// Public address of the logo uploaded in Studio (Store editor).
function emailLogoUrl() {
  const logo = String(getSetting("logo_image", "") || "").trim();

  if (!logo) return "";
  if (/^https?:\/\//i.test(logo)) return logo;
  if (logo.startsWith("/") && BASE_URL) return BASE_URL + logo;

  return "";
}

// Shared MONOWEAR email layout (matches the storefront palette).
function emailShell(bodyHtml) {
  const logo = emailLogoUrl();

  const header = logo
    ? `<img src="${escapeHTML(logo)}" alt="MONOWEAR" width="150"
         style="display:block;margin:0 auto;border:0;max-width:150px;height:auto">`
    : `<div style="font-size:24px;font-weight:800;letter-spacing:6px;color:#141414">MONOWEAR</div>`;

  return `
  <div style="background:#f0efe9;padding:24px 12px">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#141414">
      <div style="padding:30px 24px;text-align:center">${header}</div>
      <div style="height:4px;background:#c6ff4b"></div>
      <div style="padding:28px 24px;font-size:14px;line-height:1.6">${bodyHtml}</div>
      <div style="background:#141414;padding:18px 24px;text-align:center;color:#c6ff4b;font-size:11px;letter-spacing:2px">
        LIVE THE NAME. WEAR THE MEANING.
      </div>
    </div>
  </div>`;
}

// Notify the store owner once when a customer's payment is confirmed.
async function sendNewOrderNotificationOnce(orderId) {
  const order = getOrderById(orderId);
  if (!order || order.payment_status !== 'paid') return { sent: false, reason: 'not_paid' };
  if (['sent', 'sending', 'skipped'].includes(order.admin_notification_status)) return { sent: false, reason: order.admin_notification_status };
  if (!ORDER_NOTIFICATION_EMAIL) {
    db.prepare("UPDATE orders SET admin_notification_status = 'skipped' WHERE id = ?").run(order.id);
    console.warn('Order notification skipped: ORDER_NOTIFICATION_EMAIL is not configured.');
    return { sent: false, reason: 'notification_email_missing' };
  }
  const claim = db.prepare("UPDATE orders SET admin_notification_status = 'sending' WHERE id = ? AND (admin_notification_status IS NULL OR admin_notification_status IN ('', 'failed'))").run(order.id);
  if (!claim.changes) return { sent: false, reason: 'already_claimed' };
  const items = parseJSON(order.items, []);
  const naira = (value) => '₦' + Number(value || 0).toLocaleString('en-NG');
  const rows = items.map((item) => {
    const name = escapeHTML(item.name || 'MONOWEAR product');
    const size = item.size ? '<br>Size: ' + escapeHTML(item.size) : '';
    const color = item.color ? '<br>Color: ' + escapeHTML(item.color) : '';
    const qty = Number(item.quantity || 1);
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><strong>' + name + '</strong>' + size + color + '<br>Qty: ' + qty + '</td><td style="text-align:right;border-bottom:1px solid #eee">' + naira(Number(item.price || 0) * qty) + '</td></tr>';
  }).join('');
  const address = [order.shipping_address, [order.shipping_city, order.shipping_state].filter(Boolean).join(', '), order.shipping_postcode].filter(Boolean).map(escapeHTML).join('<br>');
  const body = '<h2>New MONOWEAR order received</h2><p>A customer has completed payment.</p>' +
    '<p><strong>Reference:</strong> ' + escapeHTML(order.reference) + '<br><strong>Customer:</strong> ' + escapeHTML(order.customer_name) + '<br><strong>Email:</strong> ' + escapeHTML(order.customer_email || 'Not provided') + '<br><strong>Phone:</strong> ' + escapeHTML(order.customer_phone || 'Not provided') + '</p>' +
    '<table style="width:100%;border-collapse:collapse">' + rows + '</table>' +
    '<p><strong>Subtotal:</strong> ' + naira(order.subtotal) + '<br><strong>Delivery:</strong> ' + naira(order.shipping_fee) + '<br><strong>Total paid:</strong> ' + naira(order.total) + '</p>' +
    (address ? '<p><strong>Delivery address</strong><br>' + address + '</p>' : '') + '<p>Open MONOWEAR Studio to manage this order.</p>';
  const result = await sendEmail(ORDER_NOTIFICATION_EMAIL, 'New MONOWEAR order — ' + order.reference, emailShell(body));
  db.prepare('UPDATE orders SET admin_notification_status = ? WHERE id = ?').run(result.ok ? 'sent' : 'failed', order.id);
  if (!result.ok) console.error('Admin order notification failed:', result.error || 'unknown error');
  return result.ok ? { sent: true } : { sent: false, reason: 'failed', error: result.error };
}

// Builds and sends the order confirmation. Returns { ok, error }.
async function sendOrderConfirmation(order) {
  const items = parseJSON(order.items, []);
  const naira = (value) =>
    "₦" + Number(value || 0).toLocaleString("en-NG");

  const rows = items.map((item) => {
    const quantity = Number(item.quantity || 1);
    const lineTotal = Number(item.price || 0) * quantity;

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee">
          <strong>${escapeHTML(item.name || "MONOWEAR product")}</strong>
          ${item.size ? `<br><span style="color:#777;font-size:12px">Size: ${escapeHTML(item.size)}</span>` : ""}
          ${item.color ? `<br><span style="color:#777;font-size:12px">Color: ${escapeHTML(item.color)}</span>` : ""}
          <br><span style="color:#777;font-size:12px">Qty: ${quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;vertical-align:top">
          ${naira(lineTotal)}
        </td>
      </tr>`;
  }).join("");

  const discountRow = Number(order.discount) > 0
    ? `<tr><td>Discount</td><td style="text-align:right">-${naira(order.discount)}</td></tr>`
    : "";

  const address = [
    order.shipping_address,
    [order.shipping_city, order.shipping_state].filter(Boolean).join(", "),
    order.shipping_postcode
  ].filter(Boolean).map(escapeHTML).join("<br>");

  const body = `
    <h2 style="margin:0 0 12px;font-size:22px">Order confirmed.</h2>
    <p>Hi ${escapeHTML(order.customer_name)}, thank you for shopping with MONOWEAR.
       Your payment has been received and your order is being processed.</p>
    <p><strong>Order reference:</strong> ${escapeHTML(order.reference)}</p>

    <table style="width:100%;border-collapse:collapse;margin-top:8px">${rows}</table>

    <table style="width:100%;margin-top:14px;border-collapse:collapse">
      <tr><td>Subtotal</td><td style="text-align:right">${naira(order.subtotal)}</td></tr>
      <tr><td>Delivery</td><td style="text-align:right">${naira(order.shipping_fee)}</td></tr>
      ${discountRow}
      <tr>
        <td style="padding-top:10px"><strong>Total paid</strong></td>
        <td style="padding-top:10px;text-align:right"><strong>${naira(order.total)}</strong></td>
      </tr>
    </table>

    ${address ? `<p style="margin-top:22px"><strong>Delivering to</strong><br>${address}</p>` : ""}

    <p style="margin-top:22px">We'll keep your order moving. Reply to this email if you need anything.</p>
  `;

  return sendEmail(
    order.customer_email,
    `MONOWEAR order confirmed — ${order.reference}`,
    emailShell(body)
  );
}

// Dedicated customer email for successfully paid HELP IS ON THE WAY preorders.
function isHelpIsOnTheWayPreorder(order) {
  if (!order) return false;
  const items = parseJSON(order.items, []);
  const ids = [...new Set(items.map(item => Number(item.product_id)).filter(id => Number.isInteger(id) && id > 0))];
  if (!ids.length) return false;
  const placeholders = ids.map(() => "?").join(",");
  const found = db.prepare(
    "SELECT 1 FROM product_collections pc JOIN collections c ON c.id = pc.collection_id " +
    "WHERE pc.product_id IN (" + placeholders + ") AND (" +
    "LOWER(COALESCE(c.slug, '')) LIKE '%help-is-on-the-way%' OR " +
    "LOWER(COALESCE(c.name, '')) LIKE '%help is on the way%') LIMIT 1"
  ).get(...ids);
  return Boolean(found);
}

async function sendSuccessfulPreorderEmail(order) {
  const items = parseJSON(order.items, []);
  const naira = value => "₦" + Number(value || 0).toLocaleString("en-NG");
  const rows = items.map(item => {
    const qty = Number(item.quantity || 1);
    return '<tr><td style="padding:12px 0;border-bottom:1px solid #eee"><strong>' + escapeHTML(item.name || "MONOWEAR product") +
      (item.size ? '<br><span style="color:#777;font-size:12px">Size: ' + escapeHTML(item.size) + "</span>" : "") +
      (item.color ? '<br><span style="color:#777;font-size:12px">Colour: ' + escapeHTML(item.color) + "</span>" : "") +
      '<br><span style="color:#777;font-size:12px">Qty: ' + qty + '</span></td><td style="text-align:right;border-bottom:1px solid #eee">' + naira(Number(item.price || 0) * qty) + "</td></tr>";
  }).join("");
  const body = '<p style="font-size:11px;letter-spacing:3px">MONOWEAR — THE PRELUDE</p>' +
    '<h2>Your preorder is confirmed.</h2>' +
    '<p>Hi ' + escapeHTML(order.customer_name) + ', your payment was successful and your <strong>HELP IS ON THE WAY</strong> preorder is officially recorded.</p>' +
    '<p><strong>Order reference:</strong> ' + escapeHTML(order.reference) + "</p>" +
    '<table style="width:100%;border-collapse:collapse">' + rows + "</table>" +
    '<p>Subtotal: ' + naira(order.subtotal) + '<br>Delivery: ' + naira(order.shipping_fee) +
    '<br><strong>Total paid: ' + naira(order.total) + "</strong></p>" +
    '<p><strong>OFFICIAL DROP — NOVEMBER 10, 2026</strong></p>' +
    '<p>This is your preorder confirmation, separate from MONOWEAR regular order confirmations. Thank you for getting in before the official release.</p>' +
    '<p><strong>HELP IS ON THE WAY.</strong><br>LIVE THE NAME. WEAR THE MEANING.</p>';
  return sendEmail(order.customer_email, "MONOWEAR Prelude preorder confirmed — " + order.reference, emailShell(body));
}

async function sendPreorderConfirmationOnce(orderId, options = {}) {
  const order = getOrderById(orderId);
  if (!order || order.payment_status !== "paid") return { sent: false, reason: "not_paid" };
  if (!options.force && ["sent", "sending", "legacy", "skipped"].includes(order.preorder_email_status)) return { sent: false, reason: order.preorder_email_status };
  const claim = options.force
    ? db.prepare("UPDATE orders SET preorder_email_status = 'sending' WHERE id = ?").run(order.id)
    : db.prepare("UPDATE orders SET preorder_email_status = 'sending' WHERE id = ? AND (preorder_email_status IS NULL OR preorder_email_status IN ('', 'failed'))").run(order.id);
  if (!claim.changes) return { sent: false, reason: "already_claimed" };
  const result = await sendSuccessfulPreorderEmail(getOrderById(order.id));
  db.prepare("UPDATE orders SET preorder_email_status = ? WHERE id = ?").run(result.ok ? "sent" : "failed", order.id);
  if (!result.ok) {
    recordOrderEvent(order.id, order.order_status || "processing", "Preorder confirmation email failed: " + (result.error || "unknown error"));
    recordAdminNotification("email", "Preorder confirmation email failed", "Order " + order.reference + ": " + (result.error || "unknown email error"), "/studio");
    console.error("Preorder confirmation email failed:", result.error || "unknown error");
    return { sent: false, reason: "failed", error: result.error };
  }
  return { sent: true };
}

// Sends the confirmation at most once per order.
// - Only for orders already verified as paid.
// - The "sending" claim is atomic, so the webhook and the browser
//   callback cannot both send it.
// - A failed send is recorded and can be retried (or forced from Studio).
async function sendOrderConfirmationOnce(orderId, options = {}) {
  const force = Boolean(options.force);
  const order = getOrderById(orderId);
  if (order && order.payment_status === 'paid') await sendNewOrderNotificationOnce(orderId);

  if (!order || order.payment_status !== "paid") {
    return { sent: false, reason: "not_paid" };
  }

  if (isHelpIsOnTheWayPreorder(order)) {
    return sendPreorderConfirmationOnce(orderId, options);
  }

  if (
    !force &&
    ["sent", "sending", "legacy", "skipped"].includes(order.email_status)
  ) {
    return { sent: false, reason: order.email_status };
  }

  const claim = force
    ? db.prepare(
        "UPDATE orders SET email_status = 'sending' WHERE id = ?"
      ).run(order.id)
    : db.prepare(`
        UPDATE orders SET email_status = 'sending'
        WHERE id = ?
          AND (email_status IS NULL OR email_status IN ('', 'failed'))
      `).run(order.id);

  if (!claim.changes) {
    return { sent: false, reason: "already_claimed" };
  }

  const result = await sendOrderConfirmation(getOrderById(order.id));

  if (result.ok) {
    db.prepare(`
      UPDATE orders
      SET email_status = 'sent', email_sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(order.id);

    return { sent: true };
  }

  db.prepare(
    "UPDATE orders SET email_status = 'failed' WHERE id = ?"
  ).run(order.id);

  recordOrderEvent(
    order.id,
    order.order_status || "processing",
    `Confirmation email failed: ${result.error || "unknown error"}`
  );
  recordAdminNotification("email", "Order confirmation email failed", "Order " + order.reference + ": " + (result.error || "unknown email error"), "/studio");

  return { sent: false, reason: "failed", error: result.error };
}

// Sends a separate delivery confirmation when an order is marked delivered.
async function sendOrderDeliveredEmail(order) {
  const trackingUrl = BASE_URL ? `${BASE_URL}/track.html` : "";
  const trackingLink = trackingUrl
    ? `<p><a href="${escapeHTML(trackingUrl)}" style="display:inline-block;background:#c6ff4b;color:#141414;padding:12px 18px;text-decoration:none;font-weight:bold">TRACK YOUR ORDER</a></p>`
    : "";
  const body = `
    <h2 style="margin:0 0 12px;font-size:22px">Your order has been delivered.</h2>
    <p>Hi ${escapeHTML(order.customer_name)}, your MONOWEAR order has been marked as delivered.</p>
    <p><strong>Order reference:</strong> ${escapeHTML(order.reference)}</p>
    <p>We hope you enjoy your piece. Thank you for choosing MONOWEAR.</p>
    ${trackingLink}
    <p>If you have any issue with your delivery, reply to this email or contact monowear44@gmail.com.</p>
  `;
  return sendEmail(
    order.customer_email,
    `MONOWEAR order delivered — ${order.reference}`,
    emailShell(body)
  );
}

// Claims the delivery email atomically to prevent duplicate messages.
// If a send fails, marking the same order Delivered again retries it.
async function sendOrderDeliveredEmailOnce(orderId) {
  const order = getOrderById(orderId);
  if (!order || order.payment_status !== "paid") {
    return { sent: false, reason: "order_not_paid_or_missing" };
  }
  if (["sent", "sending", "legacy", "skipped"].includes(order.delivery_email_status)) {
    return { sent: false, reason: order.delivery_email_status };
  }
  const claim = db.prepare(`
    UPDATE orders SET delivery_email_status = 'sending'
    WHERE id = ?
      AND (delivery_email_status IS NULL OR delivery_email_status IN ('', 'failed'))
  `).run(order.id);
  if (!claim.changes) {
    return { sent: false, reason: "already_claimed" };
  }
  const result = await sendOrderDeliveredEmail(getOrderById(order.id));
  if (result.ok) {
    db.prepare(`
      UPDATE orders
      SET delivery_email_status = 'sent',
          delivery_email_sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(order.id);
    return { sent: true };
  }
  db.prepare("UPDATE orders SET delivery_email_status = 'failed' WHERE id = ?").run(order.id);
  recordOrderEvent(
    order.id,
    "delivered",
    `Delivery email failed: ${result.error || "unknown error"}`
  );
  return { sent: false, reason: "failed", error: result.error };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

// ============================================================
 // ADMIN MONITORING & BACKUP
 // ============================================================

 app.get("/api/admin/monitoring", requireAdmin, (req, res) => {
   try {
     const summary = db.prepare(`
       SELECT
         COUNT(*) AS total_orders,
         SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
         SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) AS pending_payments,
         SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END) AS failed_emails,
         SUM(CASE WHEN payment_status = 'paid' AND email_status = 'failed' THEN 1 ELSE 0 END) AS paid_orders_missing_email,
         MAX(updated_at) AS latest_order_update
       FROM orders
       WHERE COALESCE(record_type, 'real_order') = 'real_order'
     `).get();
     const attention = db.prepare(`
       SELECT reference, payment_status, order_status, email_status, updated_at
       FROM orders
       WHERE COALESCE(record_type, 'real_order') = 'real_order'
         AND (payment_status = 'pending' OR email_status = 'failed')
       ORDER BY updated_at DESC
       LIMIT 20
     `).all();
     res.json({
       ok: true,
       checked_at: new Date().toISOString(),
       database: db.open ? "connected" : "unavailable",
       email_configured: Boolean(resend),
       paystack_configured: Boolean(PAYSTACK_SECRET_KEY),
       summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, value ?? 0])),
       attention
     });
   } catch (error) {
     console.error("Monitoring check failed:", error);
     res.status(500).json({ ok: false, error: "Store monitoring is temporarily unavailable." });
   }
 });

 app.get("/api/admin/backup", requireAdmin, async (req, res, next) => {
   const backupPath = path.join(STORAGE_DIR, `monowear-backup-${Date.now()}.sqlite`);
   try {
     await db.backup(backupPath);
     const filename = `monowear-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
     res.setHeader("Content-Type", "application/zip");
     res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
     const archive = archiver("zip", { zlib: { level: 6 } });
     let cleaned = false;
     const cleanup = () => {
       if (cleaned) return;
       cleaned = true;
       fs.promises.rm(backupPath, { force: true }).catch(() => {});
     };
     archive.on("error", (error) => {
       cleanup();
       if (!res.headersSent) next(error);
       else res.destroy(error);
     });
     res.on("close", cleanup);
     archive.pipe(res);
     archive.file(backupPath, { name: "database/monowear.sqlite" });
     archive.directory(UPLOAD_DIR, "uploads");
     archive.append(
       "MONOWEAR backup\nContains the SQLite database and uploaded product/media files.\nKeep this archive private because it contains customer and order data.\n",
       { name: "README.txt" }
     );
     await archive.finalize();
   } catch (error) {
     await fs.promises.rm(backupPath, { force: true }).catch(() => {});
     console.error("Store backup failed:", error);
     if (!res.headersSent) res.status(500).json({ error: "Backup could not be created. Please try again." });
   }
 });

 // ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    store: "MONOWEAR",
    // Render supplies this value for the deployed Git revision.
    revision: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || "unknown",
    time: new Date().toISOString()
  });
});

// ============================================================
// PUBLIC SETTINGS
// ============================================================

app.get("/api/settings", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = {};

  for (const row of rows) {
    settings[row.key] = row.value;
  }

  res.json(settings);
});

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        error: "Enter your email and password."
      });
    }

    const admin = db.prepare(`
      SELECT * FROM admins WHERE email = ?
    `).get(email);

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({
        error: "Invalid admin email or password."
      });
    }

    req.session.adminId = admin.id;
    req.session.adminEmail = admin.email;

    req.session.save((error) => {
      if (error) {
        console.error("Session save error:", error);
        return res.status(500).json({
          error: "Could not establish your session."
        });
      }

      res.json({
        success: true,
        message: "Login successful.",
        admin: {
          id: admin.id,
          email: admin.email
        }
      });
    });
  } catch (error) {
    console.error("Admin login error:", error);

    res.status(500).json({
      error: "Admin login failed."
    });
  }
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({
    authenticated: true,
    admin: {
      id: req.session.adminId,
      email: req.session.adminEmail
    }
  });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("monowear.sid");

    res.json({
      success: true
    });
  });
});

// ============================================================
// CUSTOMER AUTHENTICATION
// ============================================================

app.post("/api/customer/register", loginLimiter, (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !validEmail(email) || password.length < 8) {
      return res.status(400).json({
        error: "Enter a valid name and email. Password must be at least 8 characters."
      });
    }

    const existing = db.prepare(`
      SELECT id FROM customers WHERE email = ?
    `).get(email);

    if (existing) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    const passwordHash = bcrypt.hashSync(password, 12);

    const result = db.prepare(`
      INSERT INTO customers (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run(name, email, passwordHash);

    req.session.customerId = Number(result.lastInsertRowid);
    req.session.customerEmail = email;

    res.status(201).json({
      success: true,
      customer: {
        id: Number(result.lastInsertRowid),
        name,
        email
      }
    });
  } catch (error) {
    console.error("Customer registration error:", error);

    res.status(500).json({
      error: "Could not create customer account."
    });
  }
});

app.post("/api/customer/login", loginLimiter, (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const customer = db.prepare(`
      SELECT * FROM customers WHERE email = ?
    `).get(email);

    if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    req.session.customerId = customer.id;
    req.session.customerEmail = customer.email;

    res.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email
      }
    });
  } catch (error) {
    console.error("Customer login error:", error);

    res.status(500).json({
      error: "Customer login failed."
    });
  }
});

app.get("/api/customer/me", requireCustomer, (req, res) => {
  const customer = db.prepare(`
    SELECT id, name, email, created_at
    FROM customers
    WHERE id = ?
  `).get(req.session.customerId);

  if (!customer) {
    return res.status(404).json({
      error: "Customer account not found."
    });
  }

  res.json({
    authenticated: true,
    customer
  });
});

app.post("/api/customer/logout", (req, res) => {
  delete req.session.customerId;
  delete req.session.customerEmail;

  res.json({
    success: true
  });
});
// ============================================================
// PUBLIC STORE API
// ============================================================

app.get("/api/store", (req, res) => {
  try {
    syncFeaturedDropStatuses();
    const products = db.prepare(`
      SELECT *
      FROM products
      WHERE published = 1
      ORDER BY sort_order ASC, id DESC
    `).all();

    const collections = db.prepare(`
      SELECT *
      FROM collections
      WHERE published = 1 AND archived = 0
      ORDER BY sort_order ASC, id ASC
    `).all();

    const rows = db.prepare(`
      SELECT key, value FROM settings
    `).all();

    const settings = {};

    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json({
      products: products.map((product) => productWithCollections(product)),
      collections: collections.map(collection => ({
        ...safeCollection(collection),
        products: getCollectionProducts(collection.id)
      })),
      settings
    });
  } catch (error) {
    console.error("Store API error:", error);

    res.status(500).json({
      error: "Could not load the store."
    });
  }
});
// ============================================================
// PUBLIC PRODUCTS
// ============================================================

app.get("/api/products", (req, res) => {
  syncFeaturedDropStatuses();
  const { category, featured, search, limit } = req.query;

  let sql = "SELECT * FROM products WHERE published = 1";
  const params = [];

  if (category) {
    sql += " AND category = ?";
    params.push(String(category));
  }

  if (featured === "true") {
    sql += " AND featured = 1";
  }

  if (search) {
    sql += " AND (name LIKE ? OR description LIKE ?)";
    const query = `%${String(search).slice(0, 100)}%`;
    params.push(query, query);
  }

  sql += " ORDER BY sort_order ASC, id DESC";

  const parsedLimit = Math.min(
    Math.max(parseInt(limit, 10) || 100, 1),
    200
  );

  sql += " LIMIT ?";
  params.push(parsedLimit);

  const products = db.prepare(sql).all(...params);

  res.json(products.map((product) => productWithCollections(product)));
});

app.get("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);

  const product = db.prepare(`
    SELECT * FROM products
    WHERE id = ? AND published = 1
  `).get(id);

  if (!product) {
    return res.status(404).json({
      error: "Product not found."
    });
  }

  res.json(productWithCollections(product));
});

app.get("/api/product/:slug", (req, res) => {
  const product = db.prepare(`
    SELECT * FROM products
    WHERE slug = ? AND published = 1
  `).get(String(req.params.slug));

  if (!product) {
    return res.status(404).json({
      error: "Product not found."
    });
  }

  res.json(productWithCollections(product));
});

// ============================================================
// PUBLIC COLLECTIONS
// ============================================================

app.get("/api/collections", (req, res) => {
  const collections = db.prepare(`
    SELECT *
    FROM collections
    WHERE published = 1 AND archived = 0
    ORDER BY sort_order ASC, id ASC
  `).all();

  res.json(collections.map((collection) => {
    const safe = safeCollection(collection);

    safe.products = getCollectionProducts(collection.id);

    return safe;
  }));
});

// Public release index includes active published drops and deliberately archived drops.
app.get("/api/drops", (req, res) => {
  const drops = db.prepare(`
    SELECT *
    FROM collections
    WHERE (published = 1 AND archived = 0) OR archived = 1
    ORDER BY archived ASC, sort_order ASC, id ASC
  `).all();

  res.set("Cache-Control", "no-store");
  res.json(drops.map((drop) => ({
    ...safeCollection(drop),
    products: getCollectionProducts(drop.id)
  })));
});

app.get("/api/collections/:slug", (req, res) => {
  const collection = db.prepare(`
    SELECT *
    FROM collections
    WHERE slug = ? AND published = 1 AND archived = 0
  `).get(String(req.params.slug));

  if (!collection) {
    return res.status(404).json({
      error: "Collection not found."
    });
  }

  res.json({
    ...safeCollection(collection),
    products: getCollectionProducts(collection.id)
  });
});

// ============================================================
// ADMIN SETTINGS
// ============================================================

app.get("/api/store-settings", (req, res) => {
  const rows = db.prepare(`
    SELECT key, value FROM settings
    WHERE key IN (
      'store_name',
      'brand_name',
      'tagline',
      'announcement',
      'hero_title',
      'hero_subtitle',
      'hero_cta',
      'hero_background_image',
      'waitlist_background_image'
    )
  `).all();

  const settings = {};

  for (const row of rows) {
    settings[row.key] = row.value;
  }

  res.set("Cache-Control", "no-store");
  res.json(settings);
});
// ============================================================
// ADMIN PRODUCT MANAGEMENT
// ============================================================

function normalizeProductInput(body) {
  const name = String(body.name || "").trim();

  let slug = slugify(body.slug || name);

  if (!slug) {
    slug = `product-${Date.now()}`;
  }

  const price = Number(body.price);
  const comparePrice = Number(body.compare_price || 0);
  const stock = Math.max(0, Math.floor(Number(body.stock || 0)));

  if (!name) {
    throw new Error("Product name is required.");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Product price must be a valid non-negative number.");
  }

  if (!Number.isFinite(comparePrice) || comparePrice < 0) {
    throw new Error("Compare price must be a valid non-negative number.");
  }

  return {
    name,
    slug,
    description: String(body.description || ""),
    price,
    compare_price: comparePrice,
    image: String(body.image || ""),
    images: JSON.stringify(
      Array.isArray(body.images) ? body.images : []
    ),
    category: String(body.category || ""),
    sizes: JSON.stringify(
      Array.isArray(body.sizes) ? body.sizes : []
    ),
    colors: JSON.stringify(
      Array.isArray(body.colors) ? body.colors : []
    ),
    color_images: JSON.stringify(
      body.color_images && typeof body.color_images === "object" && !Array.isArray(body.color_images) ? body.color_images : {}
    ),
    stock,
    published: body.published ? 1 : 0,
    featured: body.featured ? 1 : 0,
    sort_order: Number(body.sort_order || 0)
  };
}

app.get("/api/admin/products", requireAdmin, (req, res) => {
  const products = db.prepare(`
    SELECT * FROM products
    ORDER BY sort_order ASC, id DESC
  `).all();

  res.json(products.map((product) => productWithCollections(product, true)));
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  try {
    const product = normalizeProductInput(req.body);

    const result = db.prepare(`
      INSERT INTO products (
        name, slug, description, price, compare_price,
        image, images, category, sizes, colors, color_images,
        stock, published, featured, sort_order
      )
      VALUES (
        @name, @slug, @description, @price, @compare_price,
        @image, @images, @category, @sizes, @colors, @color_images,
        @stock, @published, @featured, @sort_order
      )
    `).run(product);

    const saved = db.prepare(`
      SELECT * FROM products WHERE id = ?
    `).get(Number(result.lastInsertRowid));

    if (Array.isArray(req.body.collection_ids)) {
      setProductCollections(saved.id, req.body.collection_ids);
    }

    res.status(201).json(productWithCollections(saved, true));
  } catch (error) {
    const duplicate = String(error.message).includes("UNIQUE");

    res.status(duplicate ? 409 : 400).json({
      error: duplicate
        ? "A product with this slug already exists."
        : error.message
    });
  }
});

app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);

    const existing = db.prepare(`
      SELECT * FROM products WHERE id = ?
    `).get(id);

    if (!existing) {
      return res.status(404).json({
        error: "Product not found."
      });
    }

    const product = normalizeProductInput({
      ...existing,
      images: parseJSON(existing.images, []),
      sizes: parseJSON(existing.sizes, []),
      colors: parseJSON(existing.colors, []),
      color_images: parseJSON(existing.color_images, {}),
      ...req.body
    });

    db.prepare(`
      UPDATE products SET
        name = @name,
        slug = @slug,
        description = @description,
        price = @price,
        compare_price = @compare_price,
        image = @image,
        images = @images,
        category = @category,
        sizes = @sizes,
        colors = @colors,
        color_images = @color_images,
        stock = @stock,
        published = @published,
        featured = @featured,
        new_arrival_until = CASE WHEN @featured = 1 THEN '' ELSE new_arrival_until END,
        sort_order = @sort_order,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      ...product,
      id
    });

    const saved = db.prepare(`
      SELECT * FROM products WHERE id = ?
    `).get(id);

    if (Array.isArray(req.body.collection_ids)) {
      setProductCollections(id, req.body.collection_ids);
    }

    res.json(productWithCollections(saved, true));
  } catch (error) {
    const duplicate = String(error.message).includes("UNIQUE");

    res.status(duplicate ? 409 : 400).json({
      error: duplicate
        ? "Another product already uses this slug."
        : error.message
    });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  const result = db.prepare(`
    DELETE FROM products WHERE id = ?
  `).run(id);

  if (!result.changes) {
    return res.status(404).json({
      error: "Product not found."
    });
  }

  res.json({
    success: true,
    message: "Product deleted."
  });
});

// ============================================================
// ADMIN COLLECTION MANAGEMENT
// ============================================================

function normalizeCollectionInput(body) {
  const name = String(body.name || "").trim();

  const slug = slugify(body.slug || name);

  if (!name) {
    throw new Error("Collection name is required.");
  }

  if (!slug) {
    throw new Error("Collection slug is required.");
  }

  return {
    name,
    slug,
    description: String(body.description || ""),
    cover_image: String(body.cover_image || body.coverImage || ""),
    archived: body.archived ? 1 : 0,
    // An archived collection is never published.
    published: body.archived ? 0 : (body.published ? 1 : 0),
    sort_order: Number(body.sort_order || 0),
    release_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.release_date || ""))
      ? String(body.release_date)
      : ""
  };
}

app.get("/api/admin/collections", requireAdmin, (req, res) => {
  const collections = db.prepare(`
    SELECT * FROM collections
    ORDER BY sort_order ASC, id ASC
  `).all();

  res.json(collections.map((collection) => ({
    ...safeCollection(collection),
    products: getCollectionProducts(collection.id, true)
  })));
});

app.get("/api/admin/collections/:id", requireAdmin, (req, res) => {
  const collection = db.prepare(`
    SELECT * FROM collections WHERE id = ?
  `).get(Number(req.params.id));

  if (!collection) {
    return res.status(404).json({
      error: "Collection not found."
    });
  }

  res.json({
    ...safeCollection(collection),
    products: getCollectionProducts(collection.id, true)
  });
});

app.post("/api/admin/collections", requireAdmin, (req, res) => {
  try {
    const collection = normalizeCollectionInput(req.body);

    const result = db.prepare(`
      INSERT INTO collections (
        name, slug, description, cover_image, published, archived, sort_order, release_date
      )
      VALUES (
        @name, @slug, @description, @cover_image, @published, @archived, @sort_order, @release_date
      )
    `).run(collection);

    const saved = db.prepare(`
      SELECT * FROM collections WHERE id = ?
    `).get(Number(result.lastInsertRowid));

    res.status(201).json({
      ...safeCollection(saved),
      products: []
    });
  } catch (error) {
    const duplicate = String(error.message).includes("UNIQUE");

    res.status(duplicate ? 409 : 400).json({
      error: duplicate
        ? "A collection with this slug already exists."
        : error.message
    });
  }
});

app.put("/api/admin/collections/:id", requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);

    const existing = db.prepare(`
      SELECT * FROM collections WHERE id = ?
    `).get(id);

    if (!existing) {
      return res.status(404).json({
        error: "Collection not found."
      });
    }

    const collection = normalizeCollectionInput({
      ...existing,
      ...req.body
    });

    db.prepare(`
      UPDATE collections SET
        name = @name,
        slug = @slug,
        description = @description,
        cover_image = @cover_image,
        published = @published,
        archived = @archived,
        sort_order = @sort_order,
        release_date = @release_date,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      ...collection,
      id
    });

    const saved = db.prepare(`
      SELECT * FROM collections WHERE id = ?
    `).get(id);

    res.json({
      ...safeCollection(saved),
      products: getCollectionProducts(id, true)
    });
  } catch (error) {
    const duplicate = String(error.message).includes("UNIQUE");

    res.status(duplicate ? 409 : 400).json({
      error: duplicate
        ? "Another collection already uses this slug."
        : error.message
    });
  }
});

app.delete("/api/admin/collections/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  const result = db.prepare(`
    DELETE FROM collections WHERE id = ?
  `).run(id);

  if (!result.changes) {
    return res.status(404).json({
      error: "Collection not found."
    });
  }

  res.json({
    success: true,
    message: "Collection deleted."
  });
});

// Assign or replace a collection's products.
// Expected JSON:
// { "product_ids": [1, 2, 3] }

app.put(
  "/api/admin/collections/:id/products",
  requireAdmin,
  (req, res) => {
    const collectionId = Number(req.params.id);
    const productIds = req.body.product_ids;

    if (!Array.isArray(productIds)) {
      return res.status(400).json({
        error: "product_ids must be an array."
      });
    }

    const collection = db.prepare(`
      SELECT id FROM collections WHERE id = ?
    `).get(collectionId);

    if (!collection) {
      return res.status(404).json({
        error: "Collection not found."
      });
    }

    const ids = [...new Set(
      productIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    const transaction = db.transaction(() => {
      db.prepare(`
        DELETE FROM product_collections
        WHERE collection_id = ?
      `).run(collectionId);

      const insert = db.prepare(`
        INSERT INTO product_collections (
          product_id, collection_id, sort_order
        )
        VALUES (?, ?, ?)
      `);

      ids.forEach((productId, index) => {
        const exists = db.prepare(`
          SELECT id FROM products WHERE id = ?
        `).get(productId);

        if (exists) {
          insert.run(productId, collectionId, index);
        }
      });
    });

    try {
      transaction();

      res.json({
        success: true,
        message: "Collection products updated.",
        products: getCollectionProducts(collectionId, true)
      });
    } catch (error) {
      console.error("Collection assignment error:", error);

      res.status(500).json({
        error: "Could not update collection products."
      });
    }
  }
);

// Add one product to a collection without replacing other assignments.

app.post(
  "/api/admin/collections/:id/products/:productId",
  requireAdmin,
  (req, res) => {
    const collectionId = Number(req.params.id);
    const productId = Number(req.params.productId);

    const collection = db.prepare(`
      SELECT id FROM collections WHERE id = ?
    `).get(collectionId);

    const product = db.prepare(`
      SELECT id FROM products WHERE id = ?
    `).get(productId);

    if (!collection || !product) {
      return res.status(404).json({
        error: "Collection or product not found."
      });
    }

    db.prepare(`
      INSERT OR IGNORE INTO product_collections (
        product_id, collection_id, sort_order
      )
      VALUES (?, ?, 0)
    `).run(productId, collectionId);

    res.json({
      success: true,
      products: getCollectionProducts(collectionId, true)
    });
  }
);

// Remove one product from a collection.

app.delete(
  "/api/admin/collections/:id/products/:productId",
  requireAdmin,
  (req, res) => {
    const collectionId = Number(req.params.id);
    const productId = Number(req.params.productId);

    db.prepare(`
      DELETE FROM product_collections
      WHERE collection_id = ? AND product_id = ?
    `).run(collectionId, productId);

    res.json({
      success: true,
      products: getCollectionProducts(collectionId, true)
    });
  }
);

// ============================================================
// PRODUCT IMAGE UPLOAD
// ============================================================

app.post(
  "/api/admin/upload",
  requireAdmin,
  upload.array("images", 10),
  (req, res) => {
    const files = (req.files || []).map((file) => ({
      filename: file.filename,
      url: `/uploads/${file.filename}`
    }));

    res.json({
      success: true,
      files,
      urls: files.map((file) => file.url)
    });
  }
);
// ============================================================
// STUDIO IMAGE UPLOAD COMPATIBILITY
// ============================================================

app.post(
  "/api/admin/uploads",
  requireAdmin,
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Please select an image."
      });
    }

    res.json({
      success: true,
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`
    });
  }
);
// ============================================================
// NEWSLETTER
// ============================================================

app.post("/api/newsletter", loginLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!validEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    db.prepare("INSERT INTO newsletter (email) VALUES (?)").run(email);
    recordAdminNotification("waitlist", "New MONOWEAR waitlist signup", email + " joined the storefront waitlist.", "/studio");

    const notice = await sendEmail(
      ORDER_NOTIFICATION_EMAIL,
      "New MONOWEAR waitlist signup",
      `<div style="font-family:Arial,sans-serif;color:#101827;line-height:1.6">
        <p style="letter-spacing:3px;font-size:12px;color:#9b7927;font-weight:bold">MONOWEAR / STUDIO ALERT</p>
        <h2 style="margin-bottom:8px">Someone joined your waitlist.</h2>
        <p><strong>Email:</strong> ${escapeHTML(email)}</p>
        <p>Open MONOWEAR Studio to view your full subscriber list.</p>
        <p><a href="https://monowear-store.onrender.com/studio" style="display:inline-block;background:#071426;color:#f5f1e6;padding:12px 18px;text-decoration:none">OPEN STUDIO</a></p>
      </div>`
    );
    if (!notice.ok) console.error("Waitlist notification email failed:", notice.error);

    res.status(201).json({ success: true, message: "You're on the list." });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.json({ success: true, message: "You're already on the list." });
    }
    console.error("Newsletter error:", error);
    res.status(500).json({ error: "Could not subscribe right now." });
  }
});

app.get("/api/admin/newsletter", requireAdmin, (req, res) => {
  const subscribers = db.prepare(`
    SELECT * FROM newsletter ORDER BY id DESC
  `).all();

  res.json(subscribers);
});

// ============================================================
// PRODUCT WAITLIST
// ============================================================

app.post("/api/waitlist", loginLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const productId = Number(req.body.product_id || 0);
  const productName = String(req.body.product_name || "").trim();

  if (!validEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    db.prepare(`
      INSERT INTO waitlist (email, product_id, product_name)
      VALUES (?, ?, ?)
    `).run(email, productId || null, productName);

    const subject = productName ? "New MONOWEAR product waitlist signup" : "New MONOWEAR waitlist signup";
    recordAdminNotification("waitlist", subject, email + (productName ? " joined the waitlist for " + productName + "." : " joined the product waitlist."), "/studio");
    const notice = await sendEmail(
      ORDER_NOTIFICATION_EMAIL,
      subject,
      `<div style="font-family:Arial,sans-serif;color:#101827;line-height:1.6">
        <p style="letter-spacing:3px;font-size:12px;color:#9b7927;font-weight:bold">MONOWEAR / STUDIO ALERT</p>
        <h2 style="margin-bottom:8px">New product waitlist signup.</h2>
        <p><strong>Email:</strong> ${escapeHTML(email)}</p>
        <p><strong>Product:</strong> ${escapeHTML(productName || "General waitlist")}</p>
        <p><a href="https://monowear-store.onrender.com/studio" style="display:inline-block;background:#071426;color:#f5f1e6;padding:12px 18px;text-decoration:none">OPEN STUDIO</a></p>
      </div>`
    );
    if (!notice.ok) console.error("Product waitlist notification email failed:", notice.error);

    res.status(201).json({ success: true, message: "You've joined the waitlist." });
  } catch (error) {
    console.error("Product waitlist error:", error);
    res.status(500).json({ error: "Could not join the waitlist right now." });
  }
});

app.get("/api/admin/waitlist", requireAdmin, (req, res) => {
  res.json(
    db.prepare(`
      SELECT * FROM waitlist ORDER BY id DESC
    `).all()
  );
});

// ============================================================
// PAYMENT AND INVENTORY HELPERS
// ============================================================

// Stock is NOT deducted when someone merely starts checkout.
// It is deducted only after Paystack confirms payment.
// Read a setting from the database, using a fallback if missing.
function getSetting(key, fallback = "") {
  const row = db.prepare(
    "SELECT value FROM settings WHERE key = ?"
  ).get(key);

  if (!row || row.value === null || row.value === undefined) {
    return Object.prototype.hasOwnProperty.call(defaults, key)
      ? defaults[key]
      : fallback;
  }

  return row.value;
}

// Read a setting as a valid, non-negative monetary number.
// Move featured products into New Arrivals on launch, then into the normal catalogue after 24 hours.
function syncFeaturedDropStatuses() {
  const launchDate = String(getSetting("drop_launch_date", "2026-11-10") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) return;
  const launchAt = new Date(launchDate + "T00:00:00+01:00").getTime();
  if (!Number.isFinite(launchAt) || Date.now() < launchAt) return;
  const now = Date.now();
  const arrivalUntil = launchAt + 24 * 60 * 60 * 1000;
  if (now < arrivalUntil) {
    db.prepare("UPDATE products SET featured = 0, new_arrival_until = CASE WHEN new_arrival_until IS NULL OR new_arrival_until = '' THEN ? ELSE new_arrival_until END, updated_at = CURRENT_TIMESTAMP WHERE featured = 1").run(new Date(arrivalUntil).toISOString());
  } else {
    db.prepare("UPDATE products SET featured = 0, new_arrival_until = '', updated_at = CURRENT_TIMESTAMP WHERE featured = 1").run();
    db.prepare("UPDATE products SET new_arrival_until = '', updated_at = CURRENT_TIMESTAMP WHERE new_arrival_until <> '' AND new_arrival_until <= ?").run(new Date(now).toISOString());
  }
}

function moneySetting(key, fallback = 0) {
  const value = Number(getSetting(key, fallback));

  return Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}
function normalizeCheckoutItems(items) {
  syncFeaturedDropStatuses();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Your cart is empty.");
  }

  if (items.length > 50) {
    throw new Error("Too many different products in one order.");
  }

  // One order line per product + size + color, so the same product in
  // two sizes stays as two lines. Stock is checked per product in total.
  const lines = new Map();
  const perProduct = new Map();

  for (const item of items) {
    const productId = Number(item.product_id ?? item.id);
    const quantity = Number(item.quantity);

    if (
      !Number.isInteger(productId) ||
      productId < 1 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      throw new Error("Your cart contains an invalid product or quantity.");
    }

    const size = String(item.size ?? "").trim().slice(0, 40);
    const color = String(item.color ?? "").trim().slice(0, 40);
    const key = `${productId}|${size}|${color}`;

    const line = lines.get(key) || { productId, size, color, quantity: 0 };
    line.quantity += quantity;
    lines.set(key, line);

    perProduct.set(productId, (perProduct.get(productId) || 0) + quantity);
  }

  const products = new Map();

  for (const [productId, totalQuantity] of perProduct.entries()) {
    const product = db.prepare(`
      SELECT * FROM products
      WHERE id = ? AND published = 1
    `).get(productId);

    if (!product) {
      throw new Error("A product in your cart is no longer available.");
    }

    if (Number(product.featured) === 1) {
      const preorderDate = String(getSetting("drop_preorder_date", "2026-10-21") || "2026-10-21");
      const preorderOpens = new Date(preorderDate + "T00:00:00+01:00");
      if (Number.isFinite(preorderOpens.getTime()) && Date.now() < preorderOpens.getTime()) {
        throw new Error(product.name + " is part of the next drop. Pre-orders open on " + preorderDate + ".");
      }
    }

    if (Number(product.stock) < totalQuantity) {
      throw new Error(
        `${product.name} does not have enough stock available.`
      );
    }

    products.set(productId, product);
  }

  const normalized = [];

  for (const line of lines.values()) {
    const product = products.get(line.productId);
    const sizes = parseJSON(product.sizes, []);
    const colors = parseJSON(product.colors, []);

    if (line.size && sizes.length && !sizes.includes(line.size)) {
      throw new Error(
        `The size "${line.size}" is not available for ${product.name}.`
      );
    }

    if (line.color && colors.length && !colors.includes(line.color)) {
      throw new Error(
        `The color "${line.color}" is not available for ${product.name}.`
      );
    }

    normalized.push({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      price: Number(product.price),
      quantity: line.quantity,
      size: line.size,
      color: line.color
    });
  }

  return normalized;
}

function verifyPaystackSignature(rawBody, signature) {
  if (!PAYSTACK_SECRET_KEY || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function paystackRequest(endpoint, options = {}) {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("Paystack is not configured.");
  }

  const response = await fetch(
    `https://api.paystack.co${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Paystack request failed.");
  }

  return data;
}

// Fee (kobo -> naira) and payment channel as reported by Paystack.
// If Paystack does not report a fee, 0 is stored and shown as unknown.
function paymentDetails(transaction) {
  const feeKobo = Number(transaction && transaction.fees);

  return {
    fee: Number.isFinite(feeKobo) && feeKobo > 0 ? feeKobo / 100 : 0,
    channel: String((transaction && transaction.channel) || "").slice(0, 40)
  };
}

// A payment only counts if Paystack says it succeeded AND the reference,
// amount, currency and customer email all match the order.
function isValidPayment(order, transaction) {
  return Boolean(order && transaction) &&
    transaction.status === "success" &&
    String(transaction.reference || "") === String(order.reference) &&
    Number(transaction.amount) === Math.round(Number(order.total) * 100) &&
    String(transaction.currency || "").toUpperCase() === "NGN" &&
    String(transaction.customer?.email || "").toLowerCase() ===
      String(order.customer_email).toLowerCase();
}

function finalizePaidOrder(reference, paymentReference = "", details = {}) {
  const transaction = db.transaction(() => {
    const order = getOrderByReference(reference);

    if (!order) {
      throw new Error("Order not found.");
    }

    // Idempotency: never deduct stock twice for the same order.
    if (order.payment_status === "paid") {
      return {
        order,
        alreadyPaid: true,
        shortfalls: []
      };
    }

    const items = parseJSON(order.items, []);
    const shortfalls = [];
    const remaining = new Map();

    const selectProduct = db.prepare(`
      SELECT id, name, stock FROM products WHERE id = ?
    `);

    const decrement = db.prepare(`
      UPDATE products
      SET stock = MAX(stock - ?, 0), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // The customer has already paid, so the order is always recorded as
    // paid. If stock ran short in the meantime, stock stops at 0 and the
    // order is flagged for you instead of being lost.
    for (const item of items) {
      const quantity = Number(item.quantity) || 0;
      const product = selectProduct.get(Number(item.product_id));

      if (!product) {
        shortfalls.push(`${item.name || item.product_id} no longer exists`);
        continue;
      }

      const available = remaining.has(product.id)
        ? remaining.get(product.id)
        : Number(product.stock);

      if (available < quantity) {
        shortfalls.push(
          `${product.name}: ordered ${quantity}, only ${Math.max(available, 0)} in stock`
        );
      }

      remaining.set(product.id, Math.max(available - quantity, 0));
      decrement.run(quantity, product.id);
    }

    db.prepare(`
      UPDATE orders
      SET payment_status = 'paid',
          record_type = 'real_order',
          order_status = 'processing',
          payment_reference = ?,
          paid_at = CURRENT_TIMESTAMP,
          paystack_fee = ?,
          payment_channel = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      paymentReference || reference,
      Number(details.fee) || 0,
      String(details.channel || ""),
      order.id
    );

    recordOrderEvent(
      order.id,
      "processing",
      "Payment confirmed. Order is being processed."
    );

    if (shortfalls.length) {
      recordOrderEvent(
        order.id,
        "processing",
        `NEEDS ATTENTION — stock shortfall at payment: ${shortfalls.join("; ")}`
      );
    }

    return {
      order: getOrderById(order.id),
      alreadyPaid: false,
      shortfalls
    };
  });

  const result = transaction();
  if (!result.alreadyPaid) {
    const amount = Number(result.order.total || 0).toLocaleString("en-NG");
    recordAdminNotification(
      "order",
      "New MONOWEAR order — " + result.order.reference,
      "Payment confirmed: ₦" + amount + " from " + (result.order.customer_name || "a customer") + ". Order is processing.",
      "/studio"
    );
    if (result.shortfalls?.length) {
      recordAdminNotification("stock", "Stock needs attention", result.shortfalls.join("; "), "/studio");
    } else {
      const paidItems = parseJSON(result.order.items, []);
      for (const item of paidItems) {
        const product = db.prepare("SELECT name, stock FROM products WHERE id = ?").get(Number(item.product_id));
        if (product && Number(product.stock) <= 5) {
          recordAdminNotification("stock", "Low stock: " + product.name, "Only " + product.stock + " left in stock.", "/studio");
        }
      }
    }
  }
  return result;
}

function markOrderFailed(reference, message = "Payment was not completed.") {
  const order = getOrderByReference(reference);

  if (!order || order.payment_status === "paid") {
    return;
  }

  db.prepare(`
    UPDATE orders
    SET payment_status = 'failed',
        order_status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND payment_status != 'paid'
  `).run(order.id);

  recordOrderEvent(order.id, "cancelled", message);
  recordAdminNotification("payment", "Payment failed", "Order " + order.reference + ": " + message, "/studio");
}

// ============================================================
// MONOWEAR FIXED SHIPPING FEES
// Origin: Ijebu Ode, Ogun State. Customer pays one fee per order.
// These are MONOWEAR's provisional customer-facing fees, not live
// GIG Logistics quotes. Confirm current carrier rates before relying
// on them as exact courier costs.
// ============================================================
const MONOWEAR_FIXED_SHIPPING_FEES = {
  "ogun": 3000,
  "lagos": 4000,
  "oyo": 4500,
  "osun": 4500,
  "ondo": 4500,
  "ekiti": 5000,
  "kwara": 5500,
  "edo": 6000,
  "delta": 6000,
  "kogi": 6000,
  "federal capital territory": 6500,
  "fct": 6500,
  "abuja": 6500,
  "abia": 6500,
  "anambra": 6500,
  "ebonyi": 6500,
  "enugu": 6500,
  "imo": 6500,
  "benue": 6500,
  "nasarawa": 6500,
  "nassarawa": 6500,
  "niger": 6500,
  "plateau": 6500,
  "kaduna": 7000,
  "rivers": 7000,
  "akwa ibom": 7000,
  "cross river": 7000,
  "bayelsa": 7000,
  "bauchi": 7500,
  "gombe": 7500,
  "adamawa": 7500,
  "jigawa": 7500,
  "kano": 7500,
  "taraba": 7500,
  "katsina": 8000,
  "kebbi": 8000,
  "sokoto": 8000,
  "zamfara": 8000,
  "yobe": 8000,
  "borno": 8500
};

function normalizeShippingState(value) {
  const state = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const aliases = {
    "federal capital territory (fct)": "federal capital territory",
    "federal capital territory, abuja": "federal capital territory",
    "abuja fct": "federal capital territory",
    "fct abuja": "federal capital territory",
    "nassarawa state": "nasarawa",
    "ogun state": "ogun",
    "lagos state": "lagos",
    "oyo state": "oyo",
    "osun state": "osun",
    "ondo state": "ondo",
    "ekiti state": "ekiti",
    "kwara state": "kwara",
    "edo state": "edo",
    "delta state": "delta",
    "kogi state": "kogi",
    "abia state": "abia",
    "anambra state": "anambra",
    "ebonyi state": "ebonyi",
    "enugu state": "enugu",
    "imo state": "imo",
    "benue state": "benue",
    "nasarawa state": "nasarawa",
    "niger state": "niger",
    "plateau state": "plateau",
    "kaduna state": "kaduna",
    "rivers state": "rivers",
    "akwa ibom state": "akwa ibom",
    "cross river state": "cross river",
    "bayelsa state": "bayelsa",
    "bauchi state": "bauchi",
    "gombe state": "gombe",
    "adamawa state": "adamawa",
    "jigawa state": "jigawa",
    "kano state": "kano",
    "taraba state": "taraba",
    "katsina state": "katsina",
    "kebbi state": "kebbi",
    "sokoto state": "sokoto",
    "zamfara state": "zamfara",
    "yobe state": "yobe",
    "borno state": "borno"
  };
  return aliases[state] || state.replace(/ state$/, "");
}

function getFixedShippingQuote(stateValue, items = []) {
  const state = normalizeShippingState(stateValue);
  const perItemAmount = MONOWEAR_FIXED_SHIPPING_FEES[state];
  const itemCount = Math.max(1, items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0));
  const amount = perItemAmount * itemCount;
  if (!Number.isFinite(amount)) {
    const error = new Error("We cannot calculate a fixed delivery fee for that state yet. Please contact MONOWEAR before paying.");
    error.statusCode = 400;
    throw error;
  }
  const rate = {
    courier_id: "monowear-fixed",
    service_code: state,
    courier_name: "MONOWEAR fixed delivery",
    service_type: "standard delivery",
    amount,
    per_item_amount: perItemAmount,
    item_count: itemCount,
    delivery_time: "Delivery estimate confirmed after dispatch",
    request_token: "fixed-" + state.replace(/[^a-z0-9]+/g, "-")
  };
  return {
    amount,
    per_item_amount: perItemAmount,
    item_count: itemCount,
    carrier: "MONOWEAR fixed delivery",
    delivery_time: rate.delivery_time,
    rates: [rate],
    origin: "Ijebu Ode, Ogun State",
    destination: { state: String(stateValue || "").trim() },
    currency: "NGN",
    provider: "MONOWEAR fixed delivery",
    request_token: rate.request_token
  };
}

// Shipping is handled by MONOWEAR's fixed per-item fee schedule.

app.post("/api/shipping/quote", checkoutLimiter, (req, res) => {
  try {
    const body = req.body || {};
    if (!String(body.city || "").trim() || !String(body.state || "").trim()) {
      return res.status(400).json({ error: "Enter the delivery city/LGA and state to calculate shipping." });
    }
    const items = normalizeCheckoutItems(body.items || []);
    if (!items.length) return res.status(400).json({ error: "Your cart is empty." });
    const quote = getFixedShippingQuote(body.state, items);
    return res.json({ success: true, quote });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message || "Could not calculate the fixed delivery fee." });
  }
});

// ============================================================
// CHECKOUT
// ============================================================

app.post(
  "/api/checkout",
  checkoutLimiter,
  async (req, res) => {
    try {
      if (!PAYSTACK_SECRET_KEY) {
        return res.status(503).json({
          error: "Online payment is not configured yet."
        });
      }

      const body = req.body || {};

      const customerName = String(body.customer_name || body.name || "").trim();
      const customerEmail = String(body.customer_email || body.email || "")
        .trim()
        .toLowerCase();

      const customerPhone = String(body.customer_phone || body.phone || "").trim();

      const shippingAddress = String(body.shipping_address || body.address || "").trim();
      const shippingCity = String(body.shipping_city || body.city || "").trim();
      const shippingState = String(body.shipping_state || body.state || "").trim();
      const shippingPostcode = String(body.shipping_postcode || body.postcode || "").trim();
      const dispatchLocation = "Ijebu Ode, Ogun State";

      if (!customerName || !validEmail(customerEmail) || !shippingAddress || !shippingCity || !shippingState) {
        return res.status(400).json({
          error: "Enter your name, valid email address, full delivery address, city/LGA and state."
        });
      }

      const items = normalizeCheckoutItems(body.items);

      const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      // Recalculate the fixed state fee on the server so the browser cannot
      // change the delivery charge. One fixed fee applies per order.
      const shippingQuote = getFixedShippingQuote(shippingState, items);
      const selectedCourierId = String(body.shipping_courier_id || "");
      const selectedServiceCode = String(body.shipping_service_code || "");
      const selectedRate = shippingQuote.rates.find((rate) =>
        rate.courier_id === selectedCourierId && rate.service_code === selectedServiceCode
      );
      if (!selectedRate || Number(body.shipping_quote_amount) !== selectedRate.amount) {
        return res.status(409).json({
          error: "The fixed delivery fee has changed. Please refresh the delivery price and try again.",
          shipping_quote: { amount: shippingQuote.amount, carrier: shippingQuote.carrier, delivery_time: shippingQuote.delivery_time, rates: shippingQuote.rates }
        });
      }
      const actualShipping = selectedRate.amount;

      // Discounts must never come from the browser. Re-enable only when
      // server-side discount codes exist.
      const discount = 0;

      const total = Math.max(0, subtotal + actualShipping - discount);

      if (total <= 0) {
        return res.status(400).json({
          error: "Order total must be greater than zero."
        });
      }

      const reference = `MONO-${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;

      const result = db.prepare(`
        INSERT INTO orders (
          reference,
          customer_name,
          customer_email,
          customer_phone,
          shipping_address,
          shipping_city,
          shipping_state,
          shipping_postcode,
          dispatch_location,
          items,
          subtotal,
          shipping_fee,
          discount,
          total,
          payment_status,
          order_status,
          payment_method,
          record_type,
          shipping_provider,
          shipping_request_token,
          shipping_courier_id,
          shipping_service_code,
          shipping_courier_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'paystack', 'abandoned_cart', ?, ?, ?, ?, ?)
      `).run(
        reference,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingPostcode,
        dispatchLocation,
        JSON.stringify(items),
        subtotal,
        actualShipping,
        discount,
        total,
        selectedRate.courier_name,
        selectedRate.request_token,
        selectedRate.courier_id,
        selectedRate.service_code,
        selectedRate.courier_name
      );

      const orderId = Number(result.lastInsertRowid);

      recordOrderEvent(
        orderId,
        "pending",
        "Order created. Awaiting payment."
      );

      let payment;

      try {
        payment = await paystackRequest("/transaction/initialize", {
          method: "POST",
          body: JSON.stringify({
            email: customerEmail,
            amount: Math.round(total * 100),
            currency: "NGN",
            reference,
            callback_url: BASE_URL
              ? `${BASE_URL}/payment/callback`
              : undefined,
            metadata: {
              order_reference: reference,
              order_id: orderId,
              customer_name: customerName,
              custom_fields: [
                {
                  display_name: "MONOWEAR order",
                  variable_name: "monowear_order",
                  value: reference
                }
              ]
            }
          })
        });
      } catch (error) {
        markOrderFailed(reference, "Payment initialization failed.");

        throw error;
      }

      res.json({
        success: true,
        reference,
        authorization_url: payment.data.authorization_url,
        access_code: payment.data.access_code
      });
    } catch (error) {
      console.error("Checkout error:", error);

      res.status(400).json({
        error: error.message || "Could not start checkout."
      });
    }
  }
);

// ============================================================
// PAYSTACK CALLBACK
// ============================================================

app.get("/payment/callback", async (req, res) => {
  const reference = String(req.query.reference || "").trim();

  if (!reference) {
    return res.status(400).send("Missing payment reference.");
  }

  try {
    const result = await paystackRequest(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );

    const transaction = result.data;
    const order = getOrderByReference(reference);

    if (!order) {
      return res.status(404).send("Order not found.");
    }

    const expectedAmount = Math.round(Number(order.total) * 100);

    const valid =
      transaction.status === "success" &&
      transaction.reference === reference &&
      Number(transaction.amount) === expectedAmount &&
      String(transaction.currency).toUpperCase() === "NGN" &&
      String(transaction.customer?.email || "").toLowerCase() ===
        String(order.customer_email).toLowerCase();

    if (!valid) {
      markOrderFailed(reference, "Payment verification failed.");

      return res.status(400).send(
        "We could not verify this payment. Please contact MONOWEAR support."
      );
    }

    const resultOrder = finalizePaidOrder(
      reference,
      transaction.reference,
      paymentDetails(transaction)
    );

    // Sent once, only after verified payment. Also retries an earlier
    // failed send, but never re-sends one that already went out.
    await sendOrderConfirmationOnce(resultOrder.order.id);

    const redirect = getSetting("storefront_url", "");

    if (redirect) {
      return res.redirect(
        `${redirect.replace(/\/$/, "")}/order-success?reference=${encodeURIComponent(reference)}`
      );
    }

    res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>MONOWEAR — Payment confirmed</title>
          <style>
            body {
              margin: 0;
              background: #090909;
              color: #fff;
              font-family: Arial, sans-serif;
              display: grid;
              place-items: center;
              min-height: 100vh;
              text-align: center;
              padding: 24px;
            }
            main { max-width: 500px; }
            h1 { letter-spacing: 5px; }
            a {
              display: inline-block;
              margin-top: 24px;
              color: #111;
              background: #fff;
              padding: 14px 22px;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <main>
            <h1>MONOWEAR</h1>
            <h2>Payment confirmed.</h2>
            <p>Your order ${escapeHTML(reference)} has been confirmed.</p>
            <p>LIVE THE NAME. WEAR THE MEANING.</p>
            <a href="/">RETURN TO STORE</a>
          </main>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Payment callback error:", error);

    res.status(500).send(
      "We could not verify your payment right now. Please contact MONOWEAR support with your payment reference."
    );
  }
});

// ============================================================
// PAYSTACK WEBHOOK
// ============================================================

// Paystack signs the raw request body with your secret key. The raw
// bytes are captured by the JSON parser's verify hook (see MIDDLEWARE),
// because the body is already parsed before this route runs.

const paystackWebhookHandler = async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from("");

    const signature = req.headers["x-paystack-signature"];

    if (!verifyPaystackSignature(rawBody, signature)) {
      return res.status(401).send("Invalid signature.");
    }

    const event = req.body || {};

    if (event.event === "charge.success") {
      const transaction = event.data || {};
      const reference = String(transaction.reference || "");
      const order = getOrderByReference(reference);

      if (order && isValidPayment(order, transaction)) {
        const result = finalizePaidOrder(
          reference,
          transaction.reference,
          paymentDetails(transaction)
        );

        await sendOrderConfirmationOnce(result.order.id);
      }
    }

    if (event.event === "charge.failed") {
      const reference = String(event.data?.reference || "");

      if (reference) {
        markOrderFailed(reference, "Paystack reported a failed payment.");
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Paystack webhook error:", error);

    res.sendStatus(500);
  }
};

app.post("/api/paystack/webhook", paystackWebhookHandler);

// Alias: the project README used to document this URL.
app.post("/api/payments/paystack-webhook", paystackWebhookHandler);

// ============================================================
// PAYMENT VERIFICATION API
// ============================================================

app.get("/api/payment/verify/:reference", checkoutLimiter, async (req, res) => {
  try {
    const reference = String(req.params.reference || "");

    const order = getOrderByReference(reference);

    if (!order) {
      return res.status(404).json({
        error: "Order not found."
      });
    }

    const result = await paystackRequest(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );

    const transaction = result.data;

    const valid =
      transaction.status === "success" &&
      transaction.reference === reference &&
      Number(transaction.amount) === Math.round(Number(order.total) * 100) &&
      String(transaction.currency).toUpperCase() === "NGN" &&
      String(transaction.customer?.email || "").toLowerCase() ===
        String(order.customer_email).toLowerCase();

    if (!valid) {
      return res.status(400).json({
        success: false,
        payment_status: order.payment_status,
        error: "Payment has not been verified."
      });
    }

    const finalized = finalizePaidOrder(
      reference,
      transaction.reference,
      paymentDetails(transaction)
    );

    await sendOrderConfirmationOnce(finalized.order.id);

    res.json({
      success: true,
      payment_status: "paid",
      order: safeOrder(finalized.order)
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    res.status(500).json({
      error: "Payment verification failed."
    });
  }
});

// ============================================================
// ORDER TRACKING
// ============================================================

app.get("/api/orders/track/:reference", (req, res) => {
  const reference = String(req.params.reference || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();

  if (!reference || !validEmail(email)) {
    return res.status(400).json({
      error: "Enter your order reference and email address."
    });
  }

  const order = db.prepare(`
    SELECT *
    FROM orders
    WHERE reference = ?
      AND LOWER(customer_email) = ?
  `).get(reference, email);

  if (!order) {
    return res.status(404).json({
      error: "We could not find an order matching those details."
    });
  }

  const events = db.prepare(`
    SELECT status, message, created_at
    FROM order_events
    WHERE order_id = ?
    ORDER BY id ASC
  `).all(order.id);

  res.json({
    order: safeOrder(order),
    events
  });
});

app.get("/api/customer/orders", requireCustomer, (req, res) => {
  const orders = db.prepare(`
    SELECT *
    FROM orders
    WHERE LOWER(customer_email) = LOWER(?)
    ORDER BY id DESC
  `).all(req.session.customerEmail);

  res.json(orders.map(safeOrder));
});

// ============================================================
// ADMIN ORDER MANAGEMENT
// ============================================================

app.get("/api/admin/historical-records", requireAdmin, (req, res) => {
 try {
  const records = db.prepare(`SELECT id,source_key,record_type,record_date,category,description,amount,direction,status,customer_name,customer_phone,reference,details FROM historical_records ORDER BY CASE WHEN record_date='' THEN 1 ELSE 0 END, record_date DESC, id DESC`).all();
  const reportedSales = Number(db.prepare("SELECT COALESCE(MAX(amount),0) amount FROM historical_records WHERE source_key='summary-labeld-sales'").get().amount || 0);
  const paidSite = Number(db.prepare("SELECT COALESCE(SUM(total),0) amount FROM orders WHERE payment_status='paid' AND COALESCE(record_type,'real_order')='real_order'").get().amount || 0);
  res.set("Cache-Control", "no-store");
  res.json({records,summary:{
   records:records.length,
   expenses:db.prepare("SELECT COALESCE(SUM(amount),0) total FROM historical_records WHERE record_type='expense'").get().total,
   shippingExpenses:db.prepare("SELECT COALESCE(SUM(amount),0) total FROM historical_records WHERE record_type='expense' AND category='Logistics & Shipping'").get().total,
   customerCount:db.prepare("SELECT COUNT(*) total FROM historical_records WHERE record_type='customer'").get().total,
   labeldSales:reportedSales,
   websitePaidRevenue:paidSite,
   combinedSales:reportedSales + paidSite,
   websitePaidOrders:db.prepare("SELECT COUNT(*) total FROM orders WHERE payment_status='paid' AND COALESCE(record_type,'real_order')='real_order'").get().total
  }});
 } catch(error) { console.error("Historical records error:",error); res.status(500).json({error:"Could not load historical records."}); }
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*,
      EXISTS (
        SELECT 1 FROM order_events e
        WHERE e.order_id = orders.id
          AND e.message LIKE 'NEEDS ATTENTION%'
      ) AS attention
    FROM orders
    WHERE COALESCE(record_type, 'real_order') = 'real_order'
      AND payment_status = 'paid'
      AND LOWER(COALESCE(order_status, 'pending')) NOT IN ('shipped', 'delivered')
    ORDER BY id DESC
    LIMIT 500
  `).all();

  res.json(orders.map(safeOrder));
});

app.get("/api/admin/completed-orders", requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*,
      EXISTS (
        SELECT 1 FROM order_events e
        WHERE e.order_id = orders.id
          AND e.message LIKE 'NEEDS ATTENTION%'
      ) AS attention
    FROM orders
    WHERE COALESCE(record_type, 'real_order') = 'real_order'
      AND payment_status = 'paid'
      AND LOWER(COALESCE(order_status, 'pending')) IN ('shipped', 'delivered')
    ORDER BY id DESC
    LIMIT 500
  `).all().map(safeOrder);
  const historical = db.prepare(`
    SELECT * FROM historical_records WHERE record_type='completed_order'
    ORDER BY CASE WHEN record_date='' THEN 1 ELSE 0 END, record_date DESC, id DESC
  `).all().map((r) => {
    let parsed = {};
    try { parsed = JSON.parse(r.details || "{}"); } catch (_) {}
    return {
      id: -Number(r.id),
      reference: r.reference || r.source_key,
      record_type: "historical_order",
      customer_name: r.customer_name || "LabelD customer",
      customer_email: "historical-order@labeld.local",
      customer_phone: r.customer_phone || "",
      shipping_address: "Imported from LabelD history",
      shipping_city: "",
      shipping_state: "",
      shipping_postcode: "",
      dispatch_location: "LabelD historical record",
      items: Array.isArray(parsed.items) ? parsed.items : [{name:r.description,quantity:1}],
      subtotal: Number(r.amount || 0),
      shipping_fee: 0,
      discount: 0,
      total: Number(r.amount || 0),
      payment_status: "paid",
      order_status: "delivered",
      payment_method: "LabelD historical",
      payment_reference: r.reference || r.source_key,
      notes: "Historical LabelD order. This record is not a current Paystack payment.",
      created_at: r.record_date || "",
      paid_at: r.record_date || "",
      email_status: "legacy",
      attention: 0
    };
  });
  res.set("Cache-Control", "no-store");
  res.json([...historical, ...orders]);
});

app.get("/api/admin/abandoned-carts", requireAdmin, (req, res) => {
  const carts = db.prepare(`
    SELECT orders.*,
      EXISTS (
        SELECT 1 FROM order_events e
        WHERE e.order_id = orders.id
          AND e.message LIKE 'NEEDS ATTENTION%'
      ) AS attention
    FROM orders
    WHERE COALESCE(record_type, 'real_order') = 'abandoned_cart'
      AND payment_status != 'paid'
    ORDER BY id DESC
    LIMIT 500
  `).all();

  res.json(carts.map(safeOrder));
});

app.get("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const order = getOrderById(Number(req.params.id));

  if (!order) {
    return res.status(404).json({
      error: "Order not found."
    });
  }

  const events = db.prepare(`
    SELECT *
    FROM order_events
    WHERE order_id = ?
    ORDER BY id ASC
  `).all(order.id);

  res.json({
    ...safeOrder(order),
    events
  });
});

app.put("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || "").trim().toLowerCase();

  const allowed = [
    "pending",
    "processing",
    "paid",
    "packed",
    "shipped",
    "delivered",
    "cancelled",
    "refunded"
  ];

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "Invalid order status."
    });
  }

  const order = getOrderById(id);

  if (!order) {
    return res.status(404).json({
      error: "Order not found."
    });
  }

  const currentStatus = String(order.order_status || "").toLowerCase();

  // Shipped orders can advance to Delivered, but cannot move backwards.
  if (currentStatus === "shipped" && status !== "delivered") {
    return res.status(409).json({
      error: "This order has shipped. It can only be marked delivered."
    });
  }

  // Delivered orders stay locked, except a failed delivery email can be retried.
  if (currentStatus === "delivered") {
    if (status === "delivered" && order.delivery_email_status === "failed") {
      const emailResult = await sendOrderDeliveredEmailOnce(id);
      return res.json({
        success: true,
        order: safeOrder(getOrderById(id)),
        delivery_email_sent: Boolean(emailResult.sent),
        delivery_email_error: emailResult.error || null
      });
    }
    return res.status(409).json({
      error: "This delivered order is locked."
    });
  }

  // Admin status updates never mark payment as paid; only verified Paystack does that.
  db.prepare(`
    UPDATE orders
    SET order_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, id);

  // A refund must still be issued separately in Paystack.
  if (status === "refunded" && order.payment_status === "paid") {
    db.prepare("UPDATE orders SET payment_status = 'refunded' WHERE id = ?").run(id);
  }

  recordOrderEvent(id, status, `Order status changed to ${status}.`);
  if (status === "shipped" || status === "delivered" || status === "cancelled" || status === "refunded") {
    recordAdminNotification(
      "order_status",
      "Order " + order.reference + " — " + status,
      "Customer: " + (order.customer_name || "Unknown") + ". Order status changed to " + status + ".",
      "/studio"
    );
  }

  let deliveryEmailResult = null;
  if (status === "delivered" && order.payment_status === "paid") {
    deliveryEmailResult = await sendOrderDeliveredEmailOnce(id);
  }

  res.json({
    success: true,
    order: safeOrder(getOrderById(id)),
    ...(status === "delivered" ? {
      delivery_email_sent: Boolean(deliveryEmailResult && deliveryEmailResult.sent),
      delivery_email_error: deliveryEmailResult?.error || null
    } : {})
  });
});

app.put("/api/admin/orders/:id/record-type", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const recordType = String(req.body.record_type || "").trim().toLowerCase();
  if (!["real_order", "abandoned_cart"].includes(recordType)) {
    return res.status(400).json({ error: "Invalid order classification." });
  }
  const order = getOrderById(id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.payment_status === "paid" && recordType !== "real_order") {
    return res.status(400).json({ error: "A verified paid order must stay in Real orders." });
  }
  if (["shipped", "delivered"].includes(String(order.order_status || "").toLowerCase())) {
    return res.status(409).json({ error: "This completed order is locked and cannot be reclassified." });
  }
  db.prepare(`UPDATE orders SET record_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(recordType, id);
  recordOrderEvent(id, recordType, recordType === "abandoned_cart"
    ? "Classified as abandoned cart by store admin."
    : "Classified as a real order by store admin.");
  res.json({ success: true, order: safeOrder(getOrderById(id)) });
});

// ============================================================
// ADMIN DASHBOARD SUMMARY
// ============================================================

app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  const products = db.prepare(`
    SELECT COUNT(*) AS total FROM products
  `).get().total;

  const publishedProducts = db.prepare(`
    SELECT COUNT(*) AS total FROM products WHERE published = 1
  `).get().total;

  const collections = db.prepare(`
    SELECT COUNT(*) AS total FROM collections
  `).get().total;

  const publishedCollections = db.prepare(`
    SELECT COUNT(*) AS total FROM collections WHERE published = 1
  `).get().total;

  // New orders are paid real orders still being processed; shipped/delivered orders
  // live in Completed & shipped and are not counted as new.
  const orders = db.prepare(`
    SELECT COUNT(*) AS total FROM orders
    WHERE COALESCE(record_type, 'real_order') = 'real_order'
      AND payment_status = 'paid'
      AND LOWER(COALESCE(order_status, 'pending')) NOT IN ('shipped', 'delivered')
  `).get().total;

  const paidOrders = db.prepare(`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE COALESCE(record_type, 'real_order') = 'real_order'
      AND payment_status = 'paid'
  `).get().total;

  // Product revenue uses verified paid order total minus delivery, matching the payments report.
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(MAX(COALESCE(total, 0) - COALESCE(shipping_fee, 0), 0)), 0) AS total
    FROM orders
    WHERE COALESCE(record_type, 'real_order') = 'real_order'
      AND payment_status = 'paid'
  `).get().total;

  // Needs attention means a paid real order has a recorded stock-shortfall flag.
  const pendingOrders = db.prepare(`
    SELECT COUNT(DISTINCT o.id) AS total
    FROM orders o
    WHERE COALESCE(o.record_type, 'real_order') = 'real_order'
      AND o.payment_status = 'paid'
      AND LOWER(COALESCE(o.order_status, 'pending')) NOT IN ('shipped', 'delivered')
      AND EXISTS (
        SELECT 1 FROM order_events e
        WHERE e.order_id = o.id
          AND e.message LIKE 'NEEDS ATTENTION%'
      )
  `).get().total;

  const lowStock = db.prepare(`
    SELECT COUNT(*) AS total
    FROM products
    WHERE stock <= 5
  `).get().total;

  res.json({
    products,
    publishedProducts,
    collections,
    publishedCollections,
    orders,
    paidOrders,
    revenue: Number(revenue || 0),
    pendingOrders,
    lowStock
  });
});
// ============================================================
// ADMIN WEBSITE TRAFFIC ANALYTICS
// ============================================================

const TRAFFIC_PERIODS = {
  today: { label: "Today", modifier: null },
  "7d": { label: "7 days", modifier: "-7 days" },
  "14d": { label: "2 weeks", modifier: "-14 days" },
  "28d": { label: "4 weeks", modifier: "-28 days" },
  "6m": { label: "6 months", modifier: "-6 months" },
  "1y": { label: "1 year", modifier: "-1 year" }
};

app.get("/api/admin/traffic", requireAdmin, (req, res) => {
  const periodKey = String(req.query.period || "today");
  const period = TRAFFIC_PERIODS[periodKey] || TRAFFIC_PERIODS.today;
  let whereSql;
  let params = [];

  if (periodKey === "today") {
    // Nigeria local calendar day (UTC+1).
    whereSql = "date(visited_at, '+1 hour') = date('now', '+1 hour')";
  } else {
    whereSql = "visited_at >= datetime('now', ?)";
    params = [period.modifier];
  }

  const totals = db.prepare(`
    SELECT COUNT(DISTINCT visitor_id) AS visitors,
           COUNT(*) AS pageViews
    FROM site_visits
    WHERE ${whereSql}
  `).get(...params);

  res.set("Cache-Control", "no-store");
  res.json({
    period: periodKey,
    label: period.label,
    visitors: Number(totals.visitors || 0),
    pageViews: Number(totals.pageViews || 0)
  });
});

// ============================================================
// ADMIN PAYMENTS, PAYOUTS AND EMAIL TOOLS
// ============================================================

// Revenue = orders Paystack has verified as paid. Refunded orders are
// reported separately. Lagos is UTC+1 all year; SQLite stores UTC.
const PAID_AT = "COALESCE(paid_at, created_at)";

function paymentTotals(where = "1 = 1") {
  const row = db.prepare(`
    SELECT COUNT(*) AS orders,
           COALESCE(SUM(total), 0) AS gross,
           COALESCE(SUM(shipping_fee), 0) AS delivery,
           COALESCE(SUM(paystack_fee), 0) AS fees
    FROM orders
    WHERE ${where}
  `).get();

  const gross = Number(row.gross || 0);
  const delivery = Number(row.delivery || 0);
  const fees = Number(row.fees || 0);

  return {
    orders: Number(row.orders || 0),
    gross,
    products: Math.max(gross - delivery, 0),
    delivery,
    fees,
    net: gross - fees
  };
}

app.get("/api/admin/payments", requireAdmin, (req, res) => {
  try {
    const status = String(req.query.status || "all").toLowerCase();
    const q = String(req.query.q || "").trim().slice(0, 80);

    let sql = `
      SELECT id, reference, customer_name, customer_email, total,
             shipping_fee, paystack_fee, payment_channel,
             payment_status, order_status, payment_reference,
             paid_at, created_at, email_status
      FROM orders
      WHERE 1 = 1
    `;
    const params = [];

    if (["paid", "pending", "failed", "refunded"].includes(status)) {
      sql += " AND payment_status = ?";
      params.push(status);
    }

    if (q) {
      sql += " AND (reference LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    sql += " ORDER BY id DESC LIMIT 200";

    const history = db.prepare(sql).all(...params).map((row) => ({
      ...row,
      total: Number(row.total || 0),
      shipping_fee: Number(row.shipping_fee || 0),
      paystack_fee: Number(row.paystack_fee || 0)
    }));

    const paid = "payment_status = 'paid' AND COALESCE(record_type, 'real_order') = 'real_order'";

    res.set("Cache-Control", "no-store");

    res.json({
      revenue: {
        all: paymentTotals(paid),
        today: paymentTotals(
          `${paid} AND date(${PAID_AT}, '+1 hour') = date('now', '+1 hour')`
        ),
        month: paymentTotals(
          `${paid} AND strftime('%Y-%m', ${PAID_AT}, '+1 hour') = strftime('%Y-%m', 'now', '+1 hour')`
        )
      },
      other: {
        pending: paymentTotals("payment_status = 'pending'"),
        failed: paymentTotals("payment_status = 'failed'"),
        refunded: paymentTotals("payment_status = 'refunded'")
      },
      history
    });
  } catch (error) {
    console.error("Payments summary error:", error);

    res.status(500).json({
      error: "Could not load payments."
    });
  }
});

// Payouts come live from Paystack (separate from sales revenue).
let payoutCache = { at: 0, data: null };

function toNairaOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : null;
}

app.get("/api/admin/payouts", requireAdmin, async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) {
    return res.json({
      available: false,
      error: "Paystack is not configured."
    });
  }

  const fresh = req.query.refresh === "1";

  if (!fresh && payoutCache.data && Date.now() - payoutCache.at < 60000) {
    return res.json(payoutCache.data);
  }

  const [settlementResult, balanceResult] = await Promise.allSettled([
    paystackRequest("/settlement?perPage=50"),
    paystackRequest("/balance")
  ]);

  const output = {
    available: true,
    settlements: [],
    balances: [],
    errors: {}
  };

  if (settlementResult.status === "fulfilled") {
    const list = Array.isArray(settlementResult.value.data)
      ? settlementResult.value.data
      : [];

    output.settlements = list.map((item) => ({
      id: item.id,
      status: String(item.status || ""),
      currency: String(item.currency || "NGN"),
      date:
        item.settlement_date ||
        item.settled_at ||
        item.createdAt ||
        item.created_at ||
        "",
      gross: toNairaOrNull(item.total_amount),
      fees: toNairaOrNull(item.total_fees),
      paid_out: toNairaOrNull(item.effective_amount ?? item.total_amount)
    }));
  } else {
    output.errors.settlements =
      settlementResult.reason?.message || "Could not load settlements.";
  }

  if (balanceResult.status === "fulfilled") {
    const list = Array.isArray(balanceResult.value.data)
      ? balanceResult.value.data
      : [];

    output.balances = list.map((item) => ({
      currency: String(item.currency || "NGN"),
      balance: toNairaOrNull(item.balance)
    }));
  } else {
    output.errors.balance =
      balanceResult.reason?.message || "Could not load balance.";
  }

  payoutCache = { at: Date.now(), data: output };

  res.set("Cache-Control", "no-store");
  res.json(output);
});

// Re-checks recent unpaid orders directly with Paystack and marks the
// genuinely paid ones as paid (for example after missed webhooks).
app.post("/api/admin/payments/reconcile", requireAdmin, async (req, res) => {
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(503).json({
      error: "Paystack is not configured."
    });
  }

  const sendEmails = req.body && req.body.send_emails === true;

  const candidates = db.prepare(`
    SELECT *
    FROM orders
    WHERE payment_status IN ('pending', 'failed')
      AND payment_method = 'paystack'
      AND created_at >= datetime('now', '-30 days')
    ORDER BY id DESC
    LIMIT 50
  `).all();

  const recovered = [];
  const problems = [];
  let notPaid = 0;

  for (const order of candidates) {
    try {
      const result = await paystackRequest(
        `/transaction/verify/${encodeURIComponent(order.reference)}`
      );

      const transaction = result.data;

      if (!isValidPayment(order, transaction)) {
        notPaid += 1;
        continue;
      }

      const done = finalizePaidOrder(
        order.reference,
        transaction.reference,
        paymentDetails(transaction)
      );

      recovered.push({
        reference: order.reference,
        total: Number(order.total || 0),
        shortfalls: done.shortfalls
      });

      if (sendEmails) {
        await sendOrderConfirmationOnce(done.order.id);
      } else {
        db.prepare(`
          UPDATE orders SET email_status = 'skipped'
          WHERE id = ? AND (email_status IS NULL OR email_status = '')
        `).run(done.order.id);
      }
    } catch (error) {
      if (/not found/i.test(String(error.message))) {
        notPaid += 1;
      } else if (problems.length < 5) {
        problems.push(`${order.reference}: ${error.message}`);
      }
    }
  }

  res.json({
    success: true,
    checked: candidates.length,
    recovered,
    not_paid: notPaid,
    problems
  });
});

app.post(
  "/api/admin/orders/:id/resend-confirmation",
  requireAdmin,
  async (req, res) => {
    const order = getOrderById(Number(req.params.id));

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order.payment_status !== "paid") {
      return res.status(400).json({
        error: "Confirmation emails are only sent for verified paid orders."
      });
    }

    const result = await sendOrderConfirmationOnce(order.id, { force: true });

    if (!result.sent) {
      return res.status(502).json({
        error: result.error || "The email could not be sent."
      });
    }

    res.json({
      success: true,
      order: safeOrder(getOrderById(order.id))
    });
  }
);

// Shows whether email is set up. Never returns keys or secrets.
app.get("/api/admin/email-status", requireAdmin, (req, res) => {
  res.json({
    resend_configured: Boolean(resend),
    from: EMAIL_FROM,
    base_url: BASE_URL,
    base_url_set: Boolean(BASE_URL),
    logo_set: Boolean(emailLogoUrl()),
    logo_url: emailLogoUrl(),
    paystack_configured: Boolean(PAYSTACK_SECRET_KEY)
  });
});

app.post("/api/admin/email/test", requireAdmin, async (req, res) => {
  const to = req.session.adminEmail;

  const body = `
    <h2 style="margin:0 0 12px;font-size:22px">Test email.</h2>
    <p>If you can read this, MONOWEAR emails are sending correctly from
       <strong>${escapeHTML(EMAIL_FROM)}</strong>.</p>
    <p>The logo above is the one customers will see on order confirmations.</p>
  `;

  const result = await sendEmail(
    to,
    "MONOWEAR test email",
    emailShell(body)
  );

  if (!result.ok) {
    return res.status(502).json({
      error: result.error || "The test email could not be sent."
    });
  }

  res.json({ success: true, to });
});

// Download a consistent copy of the database (admin only).
// It contains customer and order data: store the file privately.
app.get("/api/admin/backup", loginLimiter, requireAdmin, async (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(DATA_DIR, `backup-${stamp}.db`);

  try {
    await db.backup(file);

    res.download(file, `monowear-${stamp}.db`, () => {
      fs.unlink(file, () => {});
    });
  } catch (error) {
    console.error("Backup error:", error);

    fs.unlink(file, () => {});

    res.status(500).json({
      error: "Could not create a backup."
    });
  }
});

// ============================================================
// ADMIN PUSH NOTIFICATION API
// ============================================================
app.get("/api/admin/push/public-key", requireAdmin, (req, res) => {
  res.json({ enabled: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY), publicKey: VAPID_PUBLIC_KEY || "" });
});

app.post("/api/admin/push/subscribe", requireAdmin, (req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: "Push notifications are not configured on the server yet." });
  }
  const subscription = req.body?.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: "Invalid push subscription." });
  }
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, subscription_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(endpoint) DO UPDATE SET subscription_json = excluded.subscription_json, updated_at = CURRENT_TIMESTAMP
  `).run(subscription.endpoint, JSON.stringify(subscription));
  res.json({ success: true });
});

app.post("/api/admin/push/unsubscribe", requireAdmin, (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  if (endpoint) db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  res.json({ success: true });
});

app.post("/api/admin/push/test", requireAdmin, (req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: "Push notifications are not configured on the server yet." });
  }
  const notification = recordAdminNotification("test", "Studio is connected", "Important store activity will appear here.", "/studio");
  res.json({ success: true, notification });
});

app.get("/api/admin/notifications", requireAdmin, (req, res) => {
  const notifications = db.prepare("SELECT * FROM admin_notifications ORDER BY id DESC LIMIT 100").all();
  const unread = db.prepare("SELECT COUNT(*) AS count FROM admin_notifications WHERE read_at IS NULL").get().count;
  res.json({ notifications, unread, pushConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY), subscriptions: db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get().count });
});

app.post("/api/admin/notifications/:id/read", requireAdmin, (req, res) => {
  db.prepare("UPDATE admin_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(req.params.id));
  res.json({ success: true });
});

// ============================================================
// ADMIN STUDIO PAGE
// ============================================================

app.get("/studio", (req, res) => {
  const studioFile = path.join(__dirname, "public", "studio.html");

  if (fs.existsSync(studioFile)) {
    return res.sendFile(studioFile);
  }

  const rootStudioFile = path.join(__dirname, "studio.html");

  if (fs.existsSync(rootStudioFile)) {
    return res.sendFile(rootStudioFile);
  }

  return res.status(404).send(
    "Studio page not found. Check that studio.html exists in the project."
  );
});
// ============================================================
// STOREFRONT FILES
// ============================================================

const PUBLIC_DIR = path.join(__dirname, "public");

if (fs.existsSync(PUBLIC_DIR)) {
  // Let the root route below inject current product/drop metadata before HTML is served.
  app.use(express.static(PUBLIC_DIR, { index: false }));
}

// Serve the storefront with live social-preview metadata.
app.get("/", (req, res, next) => {
  const indexFile = path.join(PUBLIC_DIR, "index.html");

  if (fs.existsSync(indexFile)) {
    try {
      let html = fs.readFileSync(indexFile, "utf8");
      const now = Date.now();
      const featured = db.prepare(
        "SELECT * FROM products WHERE published = 1 AND featured = 1 ORDER BY sort_order ASC, id DESC LIMIT 1"
      ).get();
      // Prefer a featured product. If none exists, promote the newest published
      // product so shared links still show a current drop item and countdown.
      const product = featured || db.prepare(
        "SELECT * FROM products WHERE published = 1 ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT 1"
      ).get();
      const settingRows = db.prepare("SELECT key, value FROM settings").all();
      const socialSettings = Object.fromEntries(settingRows.map((row) => [row.key, row.value]));
      const baseUrl = "https://monowears.com";
      const preorderDate = String(socialSettings.drop_preorder_date || "2026-10-21");
      const launchDate = String(socialSettings.drop_launch_date || "2026-11-10");
      const preorderAt = new Date(preorderDate + "T00:00:00+01:00").getTime();
      const launchAt = new Date(launchDate + "T00:00:00+01:00").getTime();
      const targetAt = now < preorderAt ? preorderAt : now < launchAt ? launchAt : 0;
      const targetLabel = now < preorderAt ? "PRE-ORDERS OPEN IN" : now < launchAt ? "DROP GOES LIVE IN" : "DROP LIVE";
      const daysLeft = targetAt ? Math.max(0, Math.ceil((targetAt - now) / 86400000)) : 0;
      const countdown = targetAt ? daysLeft + (daysLeft === 1 ? " DAY" : " DAYS") : "AVAILABLE NOW";
      const productName = product && product.name ? String(product.name) : "Help Is On The Way";
      const title = product
        ? "MONOWEARS — " + productName + " | " + targetLabel + " " + countdown
        : "MONOWEARS — Help Is On The Way | " + targetLabel + " " + countdown;
      const description = product
        ? (featured ? "Featured piece: " : "New drop: ") + productName + ". " + targetLabel + (targetAt ? " " + countdown + ". " : ". ") + "Discover the Monowears drop."
        : "Help Is On The Way by MONOWEARS. " + targetLabel + (targetAt ? " " + countdown + ". " : ". ") + "Independent streetwear from Nigeria. Live the name. Wear the meaning.";
      const escapeAttr = (value) => String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      let image = featured && featured.image ? String(featured.image) : "";
      if (!image && featured && featured.images) {
        try {
          const images = Array.isArray(featured.images) ? featured.images : JSON.parse(featured.images);
          image = Array.isArray(images) ? String(images[0] || "") : "";
        } catch {}
      }
      // Use the selected product image, or the brand logo if no product image exists.
      if (!image) image = String(socialSettings.logo_image || "");
      if (image && !/^https?:\/\//i.test(image)) image = baseUrl + (image.startsWith("/") ? "" : "/") + image;
      const tags = {
        "og:title": title,
        "og:description": description,
        "og:url": baseUrl + "/",
        "og:site_name": "MONOWEARS",
        "twitter:title": title,
        "twitter:description": description
      };
      for (const [property, value] of Object.entries(tags)) {
        const escaped = escapeAttr(value);
        const propertyAttr = property.startsWith("og:") ? "property" : "name";
        const regex = new RegExp('<meta\\s+(?:property|name)=["\']' + property + '["\'][^>]*>', "i");
        const tag = '<meta ' + propertyAttr + '="' + property + '" content="' + escaped + '">';
        if (regex.test(html)) html = html.replace(regex, tag);
        else html = html.replace("</head>", "  " + tag + "\n</head>");
      }
      // Remove every existing image preview tag first. This prevents stale LabelD
      // metadata in the static HTML from winning when links are shared elsewhere.
      html = html.replace(/<meta\s+(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*>\s*/gi, "");
      if (image) {
        const imageTag = '<meta property="og:image" content="' + escapeAttr(image) + '">';
        const twitterImageTag = '<meta name="twitter:image" content="' + escapeAttr(image) + '">';
        html = html.replace("</head>", "  " + imageTag + "\n  " + twitterImageTag + "\n</head>");
      }
      html = html.replace(/<title>[^<]*<\/title>/i, "<title>" + escapeAttr(title) + "</title>");
      return res.type("html").send(html);
    } catch (error) {
      console.error("Social preview metadata error:", error);
      return res.sendFile(indexFile);
    }
  }

  res.status(200).send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>MONOWEAR</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #080808;
            color: #fff;
            font-family: Arial, sans-serif;
            text-align: center;
          }
          h1 { letter-spacing: 7px; }
          p { letter-spacing: 2px; }
        </style>
      </head>
      <body>
        <main>
          <h1>MONOWEAR</h1>
          <p>LIVE THE NAME. WEAR THE MEANING.</p>
        </main>
      </body>
    </html>
  `);
});

// ============================================================
// ERROR HANDLING
// ============================================================

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  const status =
    error instanceof multer.MulterError ? 400 : 500;

  res.status(status).json({
    error:
      status === 400
        ? error.message
        : "Something went wrong. Please try again."
  });
});

// ============================================================
// START SERVER
// ============================================================
// ============================================================
// MONOWEAR STUDIO — SAVE STORE SETTINGS
// ============================================================

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  try {
    const body = req.body || {};

    const allowedKeys = Object.keys(defaults);

    const saveSettings = db.transaction(() => {
      const statement = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
      `);

      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          statement.run(key, String(body[key] ?? ""));
        }
      }
    });

    saveSettings();

    const rows = db.prepare(
      "SELECT key, value FROM settings"
    ).all();

    const settings = Object.fromEntries(
      rows.map(row => [row.key, row.value])
    );

    res.set("Cache-Control", "no-store");

    res.json({
      success: true,
      message: "Store settings saved successfully.",
      settings
    });
  } catch (error) {
    console.error("Save store settings error:", error);

    res.status(500).json({
      error: "Unable to save store settings. Please try again."
    });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`MONOWEAR server running on port ${PORT}`);
});
