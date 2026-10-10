require("dotenv").config();
const { Resend } = require("resend");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const dataDir = "/var/data";
const uploadDir = path.join(dataDir, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
const db = new Database(path.join(dataDir, "monowear.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, phone TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, category TEXT DEFAULT 'Apparel',
 price INTEGER NOT NULL DEFAULT 0, compare_price INTEGER, description TEXT DEFAULT '', image TEXT DEFAULT '',
 sizes TEXT DEFAULT 'S,M,L,XL', stock INTEGER NOT NULL DEFAULT 0, featured INTEGER DEFAULT 0, published INTEGER DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE, customer_id INTEGER, customer_name TEXT NOT NULL,
 email TEXT NOT NULL, phone TEXT DEFAULT '', address TEXT DEFAULT '', items_json TEXT NOT NULL, subtotal INTEGER NOT NULL,
 shipping INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL, status TEXT DEFAULT 'Pending payment',
 payment_status TEXT DEFAULT 'Pending', payment_reference TEXT, notes TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, status TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
`);
const addSetting = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
const defaults = {
 brand_name:"MONOWEAR", tagline:"LIVE THE NAME. WEAR THE MEANING.",
 hero_title:"HELP IS ON THE WAY", hero_subtitle:"A distressed collection about pressure, persistence and finding a way through.",
 hero_cta:"SHOP THE DROP", announcement:"HELP IS ON THE WAY — COMING SOON", currency:"NGN",
 instagram:"", contact_email:"", shipping_fee:"0", free_shipping_threshold:"0",
 policy_returns:"Contact MONOWEAR within 7 days of delivery to discuss an eligible return.",
 policy_shipping:"Delivery timing and fees are confirmed with you after checkout."
};
Object.entries(defaults).forEach(([k,v])=>addSetting.run(k,String(v)));
const adminEmail=(process.env.ADMIN_EMAIL||"").trim().toLowerCase();
const adminPassword=process.env.ADMIN_PASSWORD||"";
if(adminEmail && adminPassword && !db.prepare("SELECT id FROM admins WHERE email=?").get(adminEmail)){
 db.prepare("INSERT INTO admins(email,password_hash) VALUES(?,?)").run(adminEmail,bcrypt.hashSync(adminPassword,12));
}
if(db.prepare("SELECT COUNT(*) n FROM products").get().n===0){
 const seed=db.prepare(`INSERT INTO products(name,slug,category,price,description,image,sizes,stock,featured,published) VALUES(?,?,?,?,?,?,?,?,?,1)`);
 seed.run("Help Is on the Way — Longsleeve","help-is-on-the-way-longsleeve","Longsleeves",18500,"A distressed uniform for the days you keep moving. Part of the Help Is on the Way collection.","","S,M,L,XL,XXL",20,1);
 seed.run("Help Is on the Way — Hoodie","help-is-on-the-way-hoodie","Hoodies",32000,"Built around pressure, persistence, and finding a way through.","","S,M,L,XL,XXL",15,1);
 seed.run("Mono Archive Cap","mono-archive-cap","Accessories",12000,"A low-key everyday piece. Minimal branding, independent spirit.","","One size",30,0);
}
app.disable("x-powered-by");
app.set("trust proxy", isProd ? 1 : false);
app.use(helmet({contentSecurityPolicy:false, crossOriginResourcePolicy:{policy:"cross-origin"}}));
app.use(express.json({limit:"1mb",verify:(req,res,buf)=>{if(req.originalUrl.startsWith("/api/payments/paystack-webhook"))req.rawBody=Buffer.from(buf);}}));
app.use(express.urlencoded({extended:false}));
app.use(session({
 name:"monowear.sid", secret:process.env.SESSION_SECRET||"development-only-change-this-secret",
 resave:false, saveUninitialized:false, store:new SQLiteStore({db:"sessions.sqlite",dir:dataDir}),
 cookie:{httpOnly:true,sameSite:"lax",secure:isProd,maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false});
const checkoutLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false});
function adminOnly(req,res,next){if(!req.session.adminId)return res.status(401).json({error:"Please log in to the studio."});next();}
function customerOrAdmin(req,res,next){if(!req.session.customerId && !req.session.adminId)return res.status(401).json({error:"Log in to view this information."});next();}
function getSettings(){return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value]));}
async function sendOrderConfirmation(order) {
if (!resend || !order || !order.email) return;

try {
const items = JSON.parse(order.items_json || "[]");
const logoUrl = "https://monowear-store.onrender.com/monowear-logo.png";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
const itemRows = items.map((item) => `
  <tr>
    <td style="padding:10px;border-bottom:1px solid #333;">
      ${escapeHtml(item.name)} — ${escapeHtml(item.size || "")} × ${Number(item.qty) || 1}
    </td>
    <td style="padding:10px;border-bottom:1px solid #333;text-align:right;">
      ₦${(Number(item.price) * (Number(item.qty) || 1)).toLocaleString("en-NG")}
    </td>
  </tr>
`).join("");
const html = `
  <div style="background:#111;color:#f5f5f5;padding:32px;font-family:Arial,sans-serif;max-width:600px;margin:auto;">
    <div style="text-align:center;padding-bottom:24px;">
      <img src="${logoUrl}" alt="MONOWEAR" style="width:150px;max-width:100%;height:auto;">
      <p style="letter-spacing:3px;font-size:11px;">LIVE THE NAME. WEAR THE MEANING.</p>
    </div>
    <h2 style="font-size:24px;">ORDER CONFIRMED</h2>
    <p>Hi ${escapeHtml(order.customer_name)},</p>
    <p>Your payment has been verified. Your MONOWEAR order is now being processed.</p>
    <p><strong>Order reference:</strong> ${escapeHtml(order.reference)}</p>
    <table style="width:100%;border-collapse:collapse;margin:24px 0;">
      ${itemRows}
      <tr>
        <td style="padding:12px 10px;">Shipping</td>
        <td style="padding:12px 10px;text-align:right;">₦${Number(order.shipping).toLocaleString("en-NG")}</td>
      </tr>
      <tr>
        <td style="padding:12px 10px;font-weight:bold;">TOTAL</td>
        <td style="padding:12px 10px;text-align:right;font-weight:bold;">₦${Number(order.total).toLocaleString("en-NG")}</td>
      </tr>
    </table>
    <p>Thank you for choosing MONOWEAR.</p>
    <p style="color:#aaa;font-size:12px;">MONOWEAR — LIVE THE NAME. WEAR THE MEANING.</p>
  </div>
`;
await resend.emails.send({
  from: process.env.RESEND_FROM_EMAIL || "MONOWEAR <onboarding@resend.dev>",
  to: [order.email],
  subject: `MONOWEAR Order Confirmed — ${order.reference}`,
  html
});

} catch (error) {
console.error("MONOWEAR confirmation email failed:", error.message);
}
}
function productOut(p){return {...p,sizes:(p.sizes||"").split(",").map(x=>x.trim()).filter(Boolean),featured:!!p.featured,published:!!p.published};}
function slugify(v){return String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"product";}
function validateProduct(b){
 const name=String(b.name||"").trim(), price=Number(b.price), stock=Number(b.stock??0), image=String(b.image||"").trim();
 if(!name)throw Error("Product name is required.");
 if(!Number.isInteger(price)||price<0)throw Error("Price must be a whole number in naira.");
 if(!Number.isInteger(stock)||stock<0)throw Error("Stock must be a non-negative whole number.");
 if(image && !(/^https:\/\/|^\/uploads\//i.test(image)))throw Error("Use an HTTPS image URL or an uploaded /uploads/ image.");
 return {name,slug:slugify(b.slug||name),category:String(b.category||"Apparel").trim().slice(0,80),price,
 compare_price:b.compare_price===""||b.compare_price==null?null:Math.max(0,Number(b.compare_price)||0),
 description:String(b.description||"").trim().slice(0,3000),image,
 sizes:Array.isArray(b.sizes)?b.sizes.join(","):String(b.sizes||"S,M,L,XL"),
 stock,featured:b.featured?1:0,published:b.published===false||b.published===0?0:1};
}
function moneySetting(key){return Math.max(0,Number(getSettings()[key]||0)||0);}
function orderOut(o){return {...o,items:JSON.parse(o.items_json),events:db.prepare("SELECT status,note,created_at FROM order_events WHERE order_id=? ORDER BY id").all(o.id)};}
const uploadStorage=multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,crypto.randomBytes(12).toString("hex")+path.extname(file.originalname).toLowerCase())});
const upload=multer({storage:uploadStorage,limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>{
 const allowed=["image/jpeg","image/png","image/webp","image/gif"];
 cb(allowed.includes(file.mimetype)?null:new Error("Upload a JPG, PNG, WEBP or GIF image."),allowed.includes(file.mimetype));
}});

app.get("/api/store",(req,res)=>{
 const products=db.prepare("SELECT * FROM products WHERE published=1 ORDER BY featured DESC,id DESC").all().map(productOut);
 const s=getSettings();res.json({settings:s,products,paymentEnabled:!!process.env.PAYSTACK_SECRET_KEY});
});
app.get("/api/products/:slug",(req,res)=>{
 const p=db.prepare("SELECT * FROM products WHERE slug=? AND published=1").get(req.params.slug);
 if(!p)return res.status(404).json({error:"Product not found."});res.json(productOut(p));
});

// Customer account endpoints
app.post("/api/account/register",loginLimiter,async(req,res)=>{
 const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||""),phone=String(req.body.phone||"").trim();
 if(name.length<2||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10)return res.status(400).json({error:"Enter your name, a valid email, and a password of at least 10 characters."});
 try{const result=db.prepare("INSERT INTO customers(name,email,password_hash,phone) VALUES(?,?,?,?)").run(name,email,await bcrypt.hash(password,12),phone);
 req.session.customerId=result.lastInsertRowid;req.session.customerEmail=email;res.status(201).json({ok:true,name,email});
 }catch(e){res.status(409).json({error:"An account with that email may already exist."});}
});
app.post("/api/account/login",loginLimiter,async(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 const c=db.prepare("SELECT * FROM customers WHERE email=?").get(email);
 if(!c||!await bcrypt.compare(password,c.password_hash))return res.status(401).json({error:"Email or password is incorrect."});
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:"Could not start session."});req.session.customerId=c.id;req.session.customerEmail=c.email;res.json({ok:true,name:c.name,email:c.email});});
});
app.get("/api/account/me",(req,res)=>{if(!req.session.customerId)return res.json({authenticated:false});const c=db.prepare("SELECT id,name,email,phone FROM customers WHERE id=?").get(req.session.customerId);res.json({authenticated:!!c,customer:c||null});});
app.post("/api/account/logout",(req,res)=>{req.session.destroy(()=>res.json({ok:true}));});
app.get("/api/account/orders",customerOrAdmin,(req,res)=>{
 const rows=req.session.adminId?db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all():db.prepare("SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC").all(req.session.customerId);
 res.json(rows.map(orderOut));
});

app.post("/api/admin/login",loginLimiter,async(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 const a=db.prepare("SELECT * FROM admins WHERE email=?").get(email);
 if(!a||!await bcrypt.compare(password,a.password_hash))return res.status(401).json({error:"Email or password is incorrect."});
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:"Could not start session."});req.session.adminId=a.id;req.session.adminEmail=a.email;res.json({ok:true,email:a.email});});
});
app.post("/api/admin/logout",adminOnly,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/me",(req,res)=>res.json({authenticated:!!req.session.adminId,email:req.session.adminEmail||""}));
app.get("/api/admin/products",adminOnly,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all().map(productOut)));
app.post("/api/admin/products",adminOnly,(req,res)=>{try{const p=validateProduct(req.body);const info=db.prepare(`INSERT INTO products(name,slug,category,price,compare_price,description,image,sizes,stock,featured,published) VALUES(@name,@slug,@category,@price,@compare_price,@description,@image,@sizes,@stock,@featured,@published)`).run(p);res.status(201).json(productOut(db.prepare("SELECT * FROM products WHERE id=?").get(info.lastInsertRowid)));}catch(e){res.status(400).json({error:e.message.includes("UNIQUE")?"That product URL already exists.":e.message});}});
app.put("/api/admin/products/:id",adminOnly,(req,res)=>{try{const p=validateProduct(req.body);const r=db.prepare(`UPDATE products SET name=@name,slug=@slug,category=@category,price=@price,compare_price=@compare_price,description=@description,image=@image,sizes=@sizes,stock=@stock,featured=@featured,published=@published,updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({...p,id:Number(req.params.id)});if(!r.changes)return res.status(404).json({error:"Product not found."});res.json(productOut(db.prepare("SELECT * FROM products WHERE id=?").get(Number(req.params.id))));}catch(e){res.status(400).json({error:e.message.includes("UNIQUE")?"That product URL already exists.":e.message});}});
app.delete("/api/admin/products/:id",adminOnly,(req,res)=>{const r=db.prepare("DELETE FROM products WHERE id=?").run(Number(req.params.id));if(!r.changes)return res.status(404).json({error:"Product not found."});res.json({ok:true});});
app.post("/api/admin/uploads",adminOnly,(req,res)=>upload.single("image")(req,res,err=>{if(err)return res.status(400).json({error:err.message});if(!req.file)return res.status(400).json({error:"Choose an image file."});res.status(201).json({url:"/uploads/"+req.file.filename,filename:req.file.filename});}));
app.put("/api/admin/settings",adminOnly,(req,res)=>{
 const allowed=["brand_name","tagline","hero_title","hero_subtitle","hero_cta","announcement","instagram","contact_email","shipping_fee","free_shipping_threshold","policy_returns","policy_shipping"];
 const save=db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 const tx=db.transaction(b=>allowed.forEach(k=>{if(b[k]!==undefined)save.run(k,String(b[k]).trim().slice(0,2000));}));tx(req.body||{});res.json({settings:getSettings()});
});
app.get("/api/admin/orders",adminOnly,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all().map(orderOut)));
app.patch("/api/admin/orders/:id",adminOnly,(req,res)=>{
 const statuses=["Pending payment","Paid","Processing","Shipped","Delivered","Cancelled"];
 if(!statuses.includes(req.body.status))return res.status(400).json({error:"Invalid order status."});
 const tx=db.transaction(()=>{db.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.status,Number(req.params.id));db.prepare("INSERT INTO order_events(order_id,status,note) VALUES(?,?,?)").run(Number(req.params.id),req.body.status,String(req.body.note||"").slice(0,500));});
 const exists=db.prepare("SELECT id FROM orders WHERE id=?").get(Number(req.params.id));if(!exists)return res.status(404).json({error:"Order not found."});tx();res.json({ok:true});
});
app.get("/api/admin/summary",adminOnly,(req,res)=>{
 res.json({products:db.prepare("SELECT COUNT(*) n FROM products").get().n,orders:db.prepare("SELECT COUNT(*) n FROM orders").get().n,pending:db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('Pending payment','Processing')").get().n,revenue:db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE payment_status='Paid'").get().n});
});

// Checkout creates a server-priced order, then optionally initializes Paystack.
app.post("/api/checkout",checkoutLimiter,async(req,res)=>{
 const {customer_name,email,phone="",address="",items=[]}=req.body||{};
 if(String(customer_name||"").trim().length<2||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||""))||!String(phone||"").trim()||!String(address||"").trim()||!Array.isArray(items)||!items.length||items.length>30)
  return res.status(400).json({error:"Enter your name, valid email, phone, delivery address, and at least one item."});
 const clean=[],deduct=[];let subtotal=0;
 for(const it of items){
  const p=db.prepare("SELECT id,name,slug,price,sizes,stock,published FROM products WHERE id=?").get(Number(it.id));
  const qty=Math.max(1,Math.min(10,Number(it.qty)||1)),size=String(it.size||"").slice(0,20);
  if(!p||!p.published)return res.status(400).json({error:"A product in your bag is no longer available."});
  if(!p.sizes.split(",").map(s=>s.trim()).includes(size))return res.status(400).json({error:`Please choose a valid size for ${p.name}.`});
  if(p.stock<qty)return res.status(400).json({error:`Only ${p.stock} left in stock for ${p.name}.`});
  subtotal+=p.price*qty;clean.push({id:p.id,name:p.name,slug:p.slug,price:p.price,qty,size});deduct.push({id:p.id,qty});
 }
 const s=getSettings(),shipping=Number(s.shipping_fee||0)>=0?Number(s.shipping_fee||0):0,threshold=Number(s.free_shipping_threshold||0);
 const actualShipping=threshold>0&&subtotal>=threshold?0:shipping,total=subtotal+actualShipping;
 const reference="MW-"+crypto.randomBytes(8).toString("hex").toUpperCase();
 const customer=req.session.customerId?db.prepare("SELECT id FROM customers WHERE id=?").get(req.session.customerId):null;
 const create=db.transaction(()=>{
  for(const d of deduct){const changed=db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?").run(d.qty,d.id,d.qty);if(!changed.changes)throw Error("Stock changed while checking out. Please refresh your bag.");}
  const result=db.prepare(`INSERT INTO orders(reference,customer_id,customer_name,email,phone,address,items_json,subtotal,shipping,total,status,payment_status)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(reference,customer?customer.id:null,String(customer_name).trim(),String(email).trim(),String(phone).trim(),String(address).trim(),JSON.stringify(clean),subtotal,actualShipping,total,process.env.PAYSTACK_SECRET_KEY?"Pending payment":"Pending payment","Pending");
  db.prepare("INSERT INTO order_events(order_id,status,note) VALUES(?,?,?)").run(result.lastInsertRowid,"Pending payment","Order created");
  return result.lastInsertRowid;
 });
 let orderId;
 try{orderId=create();}catch(e){return res.status(409).json({error:e.message});}
 if(!process.env.PAYSTACK_SECRET_KEY)return res.status(201).json({order_id:orderId,reference,subtotal,shipping:actualShipping,total,payment_required:false,message:"Order request saved. Payment gateway is not configured yet; the store owner will contact you to confirm payment."});
 try{
  const response=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{"Authorization":"Bearer "+process.env.PAYSTACK_SECRET_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:String(email).trim(),amount:total*100,currency:process.env.PAYMENT_CURRENCY||"NGN",reference,callback_url:BASE_URL+"/payment/verify",metadata:{order_id:orderId,brand:"MONOWEAR"}})});
  const result=await response.json();
  if(!response.ok||!result.status)throw Error(result.message||"Payment initialization failed.");
  db.prepare("UPDATE orders SET payment_reference=? WHERE id=?").run(reference,orderId);
  res.status(201).json({order_id:orderId,reference,subtotal,shipping:actualShipping,total,payment_required:true,authorization_url:result.data.authorization_url,message:"Order created. Continue to secure payment."});
 }catch(e){res.status(502).json({error:"Order was created, but payment could not be initialized. Contact the store owner with reference "+reference+"."});}
});
app.get("/payment/verify", async (req, res) => {
const reference = String(req.query.reference || "");

if (!reference) return res.redirect("/?payment=missing");
if (!process.env.PAYSTACK_SECRET_KEY) {
return res.redirect("/?payment=not-configured");
}

try {
const response = await fetch(
  "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
{
{
  headers: {
    Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY
  }
}
);

const result = await response.json();
if (!response.ok || !result.status || result.data.status !== "success") {
  return res.redirect("/?payment=failed");
}
const order = db.prepare("SELECT * FROM orders WHERE reference = ?").get(reference);
if (!order || Number(result.data.amount) !== order.total * 100) {
  return res.redirect("/?payment=failed");
}
if (order.payment_status !== "Paid") {
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE orders SET payment_status='Paid', status='Processing', updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(order.id);
    db.prepare(
      "INSERT INTO order_events(order_id,status,note) VALUES(?,?,?)"
    ).run(order.id, "Paid", "Payment verified by provider");
  });
  tx();
  await sendOrderConfirmation({
    ...order,
    payment_status: "Paid",
    status: "Processing"
  });
}
return res.redirect(
  "/order-confirmation.html?ref=" + encodeURIComponent(reference)
);

} catch (error) {
console.error("MONOWEAR payment verification failed:", error.message);
return res.redirect("/?payment=error");
}
});
app.post("/api/payments/paystack-webhook", (req, res) => {
const secret = process.env.PAYSTACK_SECRET_KEY;

if (!secret) return res.sendStatus(200);

const signature = req.headers["x-paystack-signature"];
const raw = req.rawBody || Buffer.alloc(0);

const expected = crypto
.createHmac("sha512", secret)
.update(raw)
.digest("hex");

if (
typeof signature !== "string" ||
signature.length !== expected.length ||
!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
) {
return res.sendStatus(401);
}

let event;

try {
event = JSON.parse(raw.toString("utf8"));
} catch {
return res.sendStatus(400);
}

if (event.event === "charge.success" && event.data?.reference) {
try {
const order = db
.prepare("SELECT * FROM orders WHERE reference = ?")
..get(String(event.data.reference));

  if (
    order &&
    event.data.status === "success" &&
    Number(event.data.amount) === order.total * 100 &&
    order.payment_status !== "Paid"
  ) {
    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE orders SET payment_status='Paid', status='Processing', updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(order.id);
      db.prepare(
        "INSERT INTO order_events(order_id,status,note) VALUES(?,?,?)"
      ).run(order.id, "Paid", "Paystack webhook verified");
    });
    tx();
    sendOrderConfirmation({
      ...order,
      payment_status: "Paid",
      status: "Processing"
    }).catch((error) => {
      console.error("MONOWEAR webhook email error:", error.message);
    });
  }
} catch (error) {
  console.error("MONOWEAR webhook processing error:", error.message);
  return res.sendStatus(500);
}

}

return res.sendStatus(200);
});
app.get("/api/orders/track/:reference",(req,res)=>{
 const o=db.prepare("SELECT reference,customer_name,status,payment_status,created_at,updated_at FROM orders WHERE reference=?").get(String(req.params.reference||"").slice(0,60));
 if(!o)return res.status(404).json({error:"Order reference not found."});
 res.json(o);
});
app.get("/studio",(req,res)=>res.sendFile(path.join(__dirname,"public","studio.html")));
app.get("/order-confirmation.html",(req,res)=>res.sendFile(path.join(__dirname,"public","order-confirmation.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>{console.log(`MONOWEAR is running at ${BASE_URL}`);if(!adminEmail||!adminPassword)console.warn("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before using /studio.");if(isProd&&!process.env.SESSION_SECRET)console.warn("Set a strong SESSION_SECRET in production.");});
