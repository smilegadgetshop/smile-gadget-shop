require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "data", "shop.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
 description TEXT DEFAULT '', price INTEGER NOT NULL CHECK(price >= 0),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), image TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE NOT NULL,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
 delivery_note TEXT DEFAULT '', items_json TEXT NOT NULL, total INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'Received', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
);
`);
const adminName = process.env.ADMIN_USERNAME || "admin";
const adminPass = process.env.ADMIN_PASSWORD || "ChangeThisPassword123!";
if (!db.prepare("SELECT id FROM admins WHERE username=?").get(adminName)) {
 db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)").run(adminName,bcrypt.hashSync(adminPass,12));
}
const seed = [
 ["Android Smartphone","Phones","Everyday smartphone. Replace with your actual model and specifications.",450000,8,""],
 ["Laptop Computer","Computers","Reliable laptop for work and study.",1250000,4,""],
 ["Wireless Headphones","Audio","Wireless audio accessory.",95000,15,""],
 ["Smart Watch","Accessories","Smart wearable device.",120000,10,""],
 ["Bluetooth Speaker","Audio","Portable Bluetooth speaker.",85000,12,""],
 ["10-inch Tablet","Phones","Tablet for entertainment and productivity.",580000,5,""],
 ["Computer Monitor","Computers","Desktop monitor.",420000,3,""],
 ["Power Bank","Accessories","Portable charging accessory.",65000,20,""]
];
if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) {
 const insert=db.prepare("INSERT INTO products(name,category,description,price,stock,image) VALUES(?,?,?,?,?,?)");
 seed.forEach(p=>insert.run(...p));
}
fs.mkdirSync(path.join(__dirname,"public","uploads"),{recursive:true});
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
 secret:process.env.SESSION_SECRET || "development-only-change-me",
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(__dirname,"public")));
const loginLimiter=rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false});
const upload=multer({
 storage:multer.diskStorage({
  destination:(req,file,cb)=>cb(null,path.join(__dirname,"public","uploads")),
  filename:(req,file,cb)=>cb(null,crypto.randomBytes(12).toString("hex")+path.extname(file.originalname).toLowerCase())
 }),
 limits:{fileSize:4*1024*1024},
 fileFilter:(req,file,cb)=>cb(null,/^image\/(jpeg|png|webp)$/.test(file.mimetype))
});
const requireAdmin=(req,res,next)=>req.session.admin?next():res.status(401).json({error:"Please sign in as shop admin."});
const clean=(v,max=200)=>String(v??"").trim().slice(0,max);

app.get("/api/products",(req,res)=>{
 const rows=db.prepare("SELECT id,name,category,description,price,stock,image FROM products WHERE active=1 ORDER BY id DESC").all();
 res.json(rows);
});
app.post("/api/orders",(req,res)=>{
 const name=clean(req.body.name,100),phone=clean(req.body.phone,40),address=clean(req.body.address,300);
 const note=clean(req.body.note,300),items=Array.isArray(req.body.items)?req.body.items:[];
 if(!name||!phone||!address||!items.length) return res.status(400).json({error:"Name, phone, delivery address and at least one item are required."});
 const normalized=[];let total=0;
 for(const item of items){
  const id=Number(item.productId),qty=Math.max(1,Math.min(99,Number(item.quantity)||1));
  const p=db.prepare("SELECT id,name,price,stock,active FROM products WHERE id=?").get(id);
  if(!p||!p.active) return res.status(400).json({error:"One of the selected products is no longer available."});
  if(p.stock<qty) return res.status(400).json({error:`Not enough stock for ${p.name}. Please contact the shop.`});
  normalized.push({productId:p.id,name:p.name,unitPrice:p.price,quantity:qty,lineTotal:p.price*qty});total+=p.price*qty;
 }
 const reference="SGS-"+crypto.randomInt(100000,999999);
 const create=db.transaction(()=>{
  const result=db.prepare(`INSERT INTO orders(reference,customer_name,phone,address,delivery_note,items_json,total)
   VALUES(?,?,?,?,?,?,?)`).run(reference,name,phone,address,note,JSON.stringify(normalized),total);
  normalized.forEach(i=>db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(i.quantity,i.productId));
  return result.lastInsertRowid;
 });
 create();
 res.status(201).json({reference,total,whatsapp:process.env.WHATSAPP_NUMBER||"256704546118"});
});
app.get("/api/track/:reference",(req,res)=>{
 const o=db.prepare("SELECT reference,status,created_at FROM orders WHERE reference=?").get(clean(req.params.reference,30).toUpperCase());
 if(!o)return res.status(404).json({error:"Order reference not found. Please check it or contact the shop."});
 res.json(o);
});
app.post("/api/admin/login",loginLimiter,async(req,res)=>{
 const username=clean(req.body.username,80),password=String(req.body.password||"");
 const admin=db.prepare("SELECT * FROM admins WHERE username=?").get(username);
 if(!admin||!await bcrypt.compare(password,admin.password_hash))return res.status(401).json({error:"Incorrect username or password."});
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:"Could not start admin session."});req.session.admin={id:admin.id,username:admin.username};res.json({ok:true,username});});
});
app.post("/api/admin/logout",requireAdmin,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/me",(req,res)=>res.json({loggedIn:!!req.session.admin,username:req.session.admin?.username||null}));
app.get("/api/admin/products",requireAdmin,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products",requireAdmin,(req,res)=>{
 const name=clean(req.body.name,120),category=clean(req.body.category,60),description=clean(req.body.description,1000);
 const price=Math.round(Number(req.body.price)),stock=Math.floor(Number(req.body.stock));
 if(!name||!category||!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0)return res.status(400).json({error:"Enter a product name, category, valid UGX price and stock quantity."});
 const r=db.prepare("INSERT INTO products(name,category,description,price,stock,image) VALUES(?,?,?,?,?,?)").run(name,category,description,price,stock,clean(req.body.image,500));
 res.status(201).json({id:r.lastInsertRowid});
});
app.put("/api/admin/products/:id",requireAdmin,(req,res)=>{
 const name=clean(req.body.name,120),category=clean(req.body.category,60),description=clean(req.body.description,1000);
 const price=Math.round(Number(req.body.price)),stock=Math.floor(Number(req.body.stock));
 if(!name||!category||!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0)return res.status(400).json({error:"Check product name, category, price and stock."});
 const r=db.prepare("UPDATE products SET name=?,category=?,description=?,price=?,stock=?,image=?,active=? WHERE id=?")
 .run(name,category,description,price,stock,clean(req.body.image,500),req.body.active===false?0:1,Number(req.params.id));
 if(!r.changes)return res.status(404).json({error:"Product not found."});res.json({ok:true});
});
app.delete("/api/admin/products/:id",requireAdmin,(req,res)=>{
 db.prepare("UPDATE products SET active=0 WHERE id=?").run(Number(req.params.id));res.json({ok:true});
});
app.get("/api/admin/orders",requireAdmin,(req,res)=>{
 const rows=db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all().map(o=>({...o,items:JSON.parse(o.items_json)}));
 res.json(rows);
});
app.patch("/api/admin/orders/:id",requireAdmin,(req,res)=>{
 const allowed=["Received","Confirmed","Preparing","Dispatched","Delivered","Cancelled"];
 const status=clean(req.body.status,30);
 if(!allowed.includes(status))return res.status(400).json({error:"Invalid order status."});
 const r=db.prepare("UPDATE orders SET status=? WHERE id=?").run(status,Number(req.params.id));
 if(!r.changes)return res.status(404).json({error:"Order not found."});res.json({ok:true});
});
app.post("/api/admin/upload",requireAdmin,upload.single("image"),(req,res)=>{
 if(!req.file)return res.status(400).json({error:"Choose a JPG, PNG or WEBP image under 4MB."});
 res.json({url:"/uploads/"+req.file.filename});
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`SMILE GADGET SHOP running on port ${PORT}`));
