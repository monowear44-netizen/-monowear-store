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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const SESSION_SECRET = process.env.SESSION_SECRET || "";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ============================================================
// DATABASE
// ============================================================

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");

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
`);

// ============================================================
// DATABASE MIGRATIONS
// ============================================================

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((item) => item.name === column);

  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("products", "slug", "TEXT");
ensureColumn("products", "compare_price", "REAL DEFAULT 0");
ensureColumn("products", "images", "TEXT DEFAULT '[]'");
ensureColumn("products", "category", "TEXT DEFAULT ''");
ensureColumn("products", "sizes", "TEXT DEFAULT '[]'");
ensureColumn("products", "colors", "TEXT DEFAULT '[]'");
ensureColumn("products", "stock", "INTEGER DEFAULT 0");
ensureColumn("products", "published", "INTEGER DEFAULT 0");
ensureColumn("products", "featured", "INTEGER DEFAULT 0");
ensureColumn("products", "sort_order", "INTEGER DEFAULT 0");
ensureColumn("products", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");

ensureColumn("orders", "customer_phone", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_address", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_city", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_state", "TEXT DEFAULT ''");
ensureColumn("orders", "shipping_postcode", "TEXT DEFAULT ''");
ensureColumn("orders", "subtotal", "REAL DEFAULT 0");
ensureColumn("orders", "shipping_fee", "REAL DEFAULT 0");
ensureColumn("orders", "discount", "REAL DEFAULT 0");
ensureColumn("orders", "payment_status", "TEXT DEFAULT 'pending'");
ensureColumn("orders", "order_status", "TEXT DEFAULT 'pending'");
ensureColumn("orders", "payment_method", "TEXT DEFAULT 'paystack'");
ensureColumn("orders", "payment_reference", "TEXT DEFAULT ''");
ensureColumn("orders", "notes", "TEXT DEFAULT ''");
ensureColumn("orders", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");

// ============================================================
// DEFAULT SETTINGS
// ============================================================

const defaults = {
  store_name: "MONOWEAR",
  tagline: "LIVE THE NAME. WEAR THE MEANING.",
  currency: "NGN",
  shipping_fee: "0",
  free_shipping_threshold: "0",
  announcement: "",
  instagram: "https://www.instagram.com/",
  x: "https://x.com/monowear44",
  contact_email: process.env.CONTACT_EMAIL || "",
  maintenance_mode: "false",
  hero_background_image: "",
waitlist_background_image: "",
};

const getSettingStatement = db.prepare(
  "SELECT value FROM settings WHERE key = ?"
);

const setSettingStatement = db.prepare(`
  INSERT INTO settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

for (const [key, value] of Object.entries(defaults)) {
  if (!getSettingStatement.get(key)) {
    setSettingStatement.run(key, value);
  }
}

function getSetting(key, fallback = "") {
  const row = getSettingStatement.get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  setSettingStatement.run(key, String(value ?? ""));
}

function moneySetting(key, fallback = 0) {
  const number = Number(getSetting(key, String(fallback)));
  return Number.isFinite(number) ? number : fallback;
}

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

// ============================================================
// MIDDLEWARE
// ============================================================

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.json({ limit: "2mb" }));
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
    images: parseJSON(product.images, []),
    sizes: parseJSON(product.sizes, []),
    colors: parseJSON(product.colors, [])
  };
}

function safeCollection(collection) {
  if (!collection) return null;

  return {
    ...collection,
    published: Boolean(collection.published),
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

function getProductCollections(productId) {
  return db.prepare(`
    SELECT c.*
    FROM collections c
    INNER JOIN product_collections pc
      ON pc.collection_id = c.id
    WHERE pc.product_id = ?
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

function productWithCollections(product) {
  const safe = safeProduct(product);
  if (!safe) return null;

  safe.collections = getProductCollections(product.id);
  return safe;
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

async function sendEmail(to, subject, html) {
  if (!resend || !to) {
    console.log("Email skipped: Resend or recipient is not configured.");
    return false;
  }

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html
    });

    return true;
  } catch (error) {
    console.error("Email error:", error.message);
    return false;
  }
}

async function sendOrderConfirmation(order) {
  const items = parseJSON(order.items, []);

  const rows = items.map((item) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #eee">
        ${escapeHTML(item.name || "MONOWEAR product")}
        ${item.size ? `<br><small>Size: ${escapeHTML(item.size)}</small>` : ""}
        ${item.color ? `<br><small>Color: ${escapeHTML(item.color)}</small>` : ""}
        <br><small>Quantity: ${Number(item.quantity || 1)}</small>
      </td>
      <td style="padding:12px;border-bottom:1px solid #eee;text-align:right">
        ₦${Number(item.price || 0).toLocaleString("en-NG")}
      </td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111">
      <h1 style="letter-spacing:3px">MONOWEAR</h1>
      <p>LIVE THE NAME. WEAR THE MEANING.</p>
      <hr>
      <h2>Order confirmed.</h2>
      <p>Thank you for shopping with MONOWEAR.</p>
      <p>Your payment has been confirmed and your order is being processed.</p>
      <p><strong>Order reference:</strong> ${escapeHTML(order.reference)}</p>
      <table style="width:100%;border-collapse:collapse">
        ${rows}
      </table>
      <p><strong>Total paid: ₦${Number(order.total || 0).toLocaleString("en-NG")}</strong></p>
      <p>We'll update you as your order progresses.</p>
      <p>MONOWEAR</p>
    </div>
  `;

  return sendEmail(
    order.customer_email,
    `MONOWEAR order confirmed — ${order.reference}`,
    html
  );
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
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    store: "MONOWEAR",
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
    const products = db.prepare(`
      SELECT *
      FROM products
      WHERE published = 1
      ORDER BY sort_order ASC, id DESC
    `).all();

    const collections = db.prepare(`
      SELECT *
      FROM collections
      WHERE published = 1
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
      products: products.map(productWithCollections),
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

  res.json(products.map(productWithCollections));
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
    WHERE published = 1
    ORDER BY sort_order ASC, id ASC
  `).all();

  res.json(collections.map((collection) => {
    const safe = safeCollection(collection);

    safe.products = getCollectionProducts(collection.id);

    return safe;
  }));
});

app.get("/api/collections/:slug", (req, res) => {
  const collection = db.prepare(`
    SELECT *
    FROM collections
    WHERE slug = ? AND published = 1
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
    WHERE key IN ('store_name','tagline','announcement','hero_background_image','waitlist_background_image')
  `).all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.set("Cache-Control", "no-store");
  res.json(settings);
});

app.get("/api/admin/settings", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT key, value FROM settings ORDER BY key ASC
  `).all();

  const settings = {};

  for (const row of rows) {
    settings[row.key] = row.value;
  }

  res.json(settings);
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const allowed = [
    "store_name",
    "tagline",
    "currency",
    "shipping_fee",
    "free_shipping_threshold",
    "announcement",
    "instagram",
    "x",
    "contact_email",
    "maintenance_mode",
    "hero_background_image",
    "waitlist_background_image"
  ];

  const updates = req.body || {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      setSetting(key, updates[key]);
    }
  }

  res.json({
    success: true,
    message: "Settings saved."
  });
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

  res.json(products.map(productWithCollections));
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  try {
    const product = normalizeProductInput(req.body);

    const result = db.prepare(`
      INSERT INTO products (
        name, slug, description, price, compare_price,
        image, images, category, sizes, colors,
        stock, published, featured, sort_order
      )
      VALUES (
        @name, @slug, @description, @price, @compare_price,
        @image, @images, @category, @sizes, @colors,
        @stock, @published, @featured, @sort_order
      )
    `).run(product);

    const saved = db.prepare(`
      SELECT * FROM products WHERE id = ?
    `).get(Number(result.lastInsertRowid));

    res.status(201).json(productWithCollections(saved));
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
        stock = @stock,
        published = @published,
        featured = @featured,
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

    res.json(productWithCollections(saved));
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
    published: body.published ? 1 : 0,
    sort_order: Number(body.sort_order || 0)
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
        name, slug, description, cover_image, published, sort_order
      )
      VALUES (
        @name, @slug, @description, @cover_image, @published, @sort_order
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
        sort_order = @sort_order,
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

app.post("/api/newsletter", loginLimiter, (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!validEmail(email)) {
    return res.status(400).json({
      error: "Enter a valid email address."
    });
  }

  try {
    db.prepare(`
      INSERT INTO newsletter (email) VALUES (?)
    `).run(email);

    res.status(201).json({
      success: true,
      message: "You're on the list."
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.json({
        success: true,
        message: "You're already on the list."
      });
    }

    console.error("Newsletter error:", error);

    res.status(500).json({
      error: "Could not subscribe right now."
    });
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

app.post("/api/waitlist", loginLimiter, (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const productId = Number(req.body.product_id || 0);
  const productName = String(req.body.product_name || "").trim();

  if (!validEmail(email)) {
    return res.status(400).json({
      error: "Enter a valid email address."
    });
  }

  db.prepare(`
    INSERT INTO waitlist (email, product_id, product_name)
    VALUES (?, ?, ?)
  `).run(email, productId || null, productName);

  res.status(201).json({
    success: true,
    message: "You've joined the waitlist."
  });
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

function normalizeCheckoutItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Your cart is empty.");
  }

  if (items.length > 50) {
    throw new Error("Too many different products in one order.");
  }

  const combined = new Map();

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

    combined.set(
      productId,
      (combined.get(productId) || 0) + quantity
    );
  }

  const normalized = [];

  for (const [productId, quantity] of combined.entries()) {
    const product = db.prepare(`
      SELECT * FROM products
      WHERE id = ? AND published = 1
    `).get(productId);

    if (!product) {
      throw new Error("A product in your cart is no longer available.");
    }

    if (Number(product.stock) < quantity) {
      throw new Error(
        `${product.name} does not have enough stock available.`
      );
    }

    normalized.push({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      price: Number(product.price),
      quantity,
      size: "",
      color: ""
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

function finalizePaidOrder(reference, paymentReference = "") {
  const transaction = db.transaction(() => {
    const order = getOrderByReference(reference);

    if (!order) {
      throw new Error("Order not found.");
    }

    // Idempotency: never deduct stock twice for the same order.
    if (order.payment_status === "paid") {
      return {
        order,
        alreadyPaid: true
      };
    }

    const items = parseJSON(order.items, []);

    // Validate all items before changing any stock.
    for (const item of items) {
      const product = db.prepare(`
        SELECT id, name, stock
        FROM products
        WHERE id = ?
      `).get(Number(item.product_id));

      if (!product) {
        throw new Error(
          `Product ${item.name || item.product_id} no longer exists.`
        );
      }

      if (Number(product.stock) < Number(item.quantity)) {
        throw new Error(
          `Insufficient stock to fulfil ${product.name}.`
        );
      }
    }

    const decrement = db.prepare(`
      UPDATE products
      SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND stock >= ?
    `);

    for (const item of items) {
      const quantity = Number(item.quantity);
      const result = decrement.run(
        quantity,
        Number(item.product_id),
        quantity
      );

      if (result.changes !== 1) {
        throw new Error("Stock changed during payment processing.");
      }
    }

    db.prepare(`
      UPDATE orders
      SET payment_status = 'paid',
          order_status = 'processing',
          payment_reference = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(paymentReference || reference, order.id);

    recordOrderEvent(
      order.id,
      "processing",
      "Payment confirmed. Order is being processed."
    );

    return {
      order: getOrderById(order.id),
      alreadyPaid: false
    };
  });

  return transaction();
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
}

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

      if (!customerName || !validEmail(customerEmail) || !shippingAddress) {
        return res.status(400).json({
          error: "Enter your name, valid email address and shipping address."
        });
      }

      const items = normalizeCheckoutItems(body.items);

      const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const shippingFee = moneySetting("shipping_fee", 0);
      const freeThreshold = moneySetting("free_shipping_threshold", 0);

      const actualShipping =
        freeThreshold > 0 && subtotal >= freeThreshold
          ? 0
          : shippingFee;

      const discount = Math.max(0, Number(body.discount || 0));

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
          items,
          subtotal,
          shipping_fee,
          discount,
          total,
          payment_status,
          order_status,
          payment_method
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'paystack')
      `).run(
        reference,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingPostcode,
        JSON.stringify(items),
        subtotal,
        actualShipping,
        discount,
        total
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
      transaction.reference
    );

    if (!resultOrder.alreadyPaid) {
      await sendOrderConfirmation(resultOrder.order);
    }

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

// Paystack signs webhook requests using the raw request body.
// Keep this route before the normal JSON parser if raw-body
// signature verification is required.
//
// This route uses express.raw() directly so the signature can
// be verified before trusting the webhook payload.

app.post(
  "/api/paystack/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from("");

      const signature = req.headers["x-paystack-signature"];

      if (!verifyPaystackSignature(rawBody, signature)) {
        return res.status(401).send("Invalid signature.");
      }

      const event = JSON.parse(rawBody.toString("utf8"));

      if (event.event === "charge.success") {
        const transaction = event.data;
        const reference = String(transaction.reference || "");

        const order = getOrderByReference(reference);

        if (order) {
          const expectedAmount = Math.round(Number(order.total) * 100);

          const valid =
            transaction.status === "success" &&
            Number(transaction.amount) === expectedAmount &&
            String(transaction.currency).toUpperCase() === "NGN" &&
            String(transaction.customer?.email || "").toLowerCase() ===
              String(order.customer_email).toLowerCase();

          if (valid) {
            const result = finalizePaidOrder(
              reference,
              transaction.reference
            );

            if (!result.alreadyPaid) {
              await sendOrderConfirmation(result.order);
            }
          }
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
  }
);

// ============================================================
// PAYMENT VERIFICATION API
// ============================================================

app.get("/api/payment/verify/:reference", async (req, res) => {
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
      transaction.reference
    );

    if (!finalized.alreadyPaid) {
      await sendOrderConfirmation(finalized.order);
    }

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

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT *
    FROM orders
    ORDER BY id DESC
    LIMIT 500
  `).all();

  res.json(orders.map(safeOrder));
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

app.put("/api/admin/orders/:id/status", requireAdmin, (req, res) => {
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

  // Admin order-status updates do not mark a payment as paid.
  // Only verified Paystack payments can do that.
  db.prepare(`
    UPDATE orders
    SET order_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, id);

  recordOrderEvent(id, status, `Order status changed to ${status}.`);

  res.json({
    success: true,
    order: safeOrder(getOrderById(id))
  });
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

  const orders = db.prepare(`
    SELECT COUNT(*) AS total FROM orders
  `).get().total;

  const paidOrders = db.prepare(`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE payment_status = 'paid'
  `).get().total;

  const revenue = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total
    FROM orders
    WHERE payment_status = 'paid'
  `).get().total;

  const pendingOrders = db.prepare(`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE payment_status = 'pending'
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
  app.use(express.static(PUBLIC_DIR));
}

// Serve the storefront entry page if it exists.
app.get("/", (req, res, next) => {
  const indexFile = path.join(PUBLIC_DIR, "index.html");

  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MONOWEAR server running on port ${PORT}`);
});
