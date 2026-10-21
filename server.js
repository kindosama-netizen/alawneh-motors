import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import session from "express-session";
import multer from "multer";
import sharp from "sharp";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
const mediaDir = path.join(publicDir, "media");
const carsPath = path.join(dataDir, "cars.json");
const sitePath = path.join(dataDir, "site.json");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(root, ".env"));

const port = Number(process.env.PORT || 3080);
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "";

fs.mkdirSync(mediaDir, { recursive: true });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeCars(cars) {
  const temp = `${carsPath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(cars, null, 2));
  fs.renameSync(temp, carsPath);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).json({ error: "يلزم تسجيل الدخول" });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("يُقبل فقط JPG أو PNG أو WEBP"));
  }
});

async function storeImages(files) {
  const saved = [];
  for (const file of files || []) {
    const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`;
    await sharp(file.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(mediaDir, name));
    saved.push(`/media/${name}`);
  }
  return saved;
}

function removeMedia(url) {
  if (typeof url !== "string" || !url.startsWith("/media/")) return;
  const name = path.basename(url);
  if (!/^[\w.-]+\.jpg$/.test(name)) return;
  const full = path.join(mediaDir, name);
  if (fs.existsSync(full) && !["cover.jpg", "profile.jpg"].includes(name)) {
    fs.unlinkSync(full);
  }
}

function cleanCar(input, images) {
  const year = input.year === "" || input.year === null || input.year === undefined ? null : Number(input.year);
  const priceAmount = input.priceAmount === "" || input.priceAmount === null || input.priceAmount === undefined
    ? null
    : Number(input.priceAmount);
  const specs = Array.isArray(input.specs)
    ? input.specs.map((item) => String(item).trim()).filter(Boolean)
    : String(input.specs || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return {
    id: String(input.id || `car-${Date.now()}`).replace(/[^\w-]/g, "").slice(0, 80),
    title: String(input.title || "").trim(),
    brand: String(input.brand || "").trim(),
    model: String(input.model || "").trim(),
    year: Number.isFinite(year) ? year : null,
    mileage: String(input.mileage || "").trim(),
    color: String(input.color || "").trim(),
    fuel: String(input.fuel || "").trim(),
    status: input.status === "sold" ? "sold" : "check",
    priceAmount: Number.isFinite(priceAmount) ? priceAmount : null,
    offerNote: String(input.offerNote || "").trim(),
    source: String(input.source || "أُضيفت من لوحة الإدارة").trim(),
    specs,
    images
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(24).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 12 }
}));

app.get("/api/site", (_req, res) => res.json(readJson(sitePath)));
app.get("/api/cars", (_req, res) => res.json(readJson(carsPath)));
app.get("/api/cars/:id", (req, res) => {
  const car = readJson(carsPath).find((item) => item.id === req.params.id);
  if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });
  res.json(car);
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!adminPassword || !safeEqual(username || "", adminUser) || !safeEqual(password || "", adminPassword)) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  res.json({ admin: Boolean(req.session?.admin) });
});

app.post("/api/admin/cars", requireAdmin, upload.array("images", 12), async (req, res, next) => {
  try {
    const input = JSON.parse(req.body.payload || "{}");
    const images = await storeImages(req.files);
    const cars = readJson(carsPath);
    const car = cleanCar({ ...input, id: input.id || `car-${Date.now()}` }, images);
    if (!car.title) return res.status(400).json({ error: "اسم السيارة مطلوب" });
    if (cars.some((item) => item.id === car.id)) car.id = `${car.id}-${Date.now()}`;
    cars.unshift(car);
    writeCars(cars);
    res.json(car);
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/cars/:id", requireAdmin, upload.array("images", 12), async (req, res, next) => {
  try {
    const cars = readJson(carsPath);
    const index = cars.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "السيارة غير موجودة" });
    const input = JSON.parse(req.body.payload || "{}");
    const remove = new Set(Array.isArray(input.removeImages) ? input.removeImages : []);
    const kept = (cars[index].images || []).filter((url) => !remove.has(url));
    for (const url of remove) removeMedia(url);
    const added = await storeImages(req.files);
    const car = cleanCar({ ...cars[index], ...input, id: cars[index].id }, [...kept, ...added]);
    if (!car.title) return res.status(400).json({ error: "اسم السيارة مطلوب" });
    cars[index] = car;
    writeCars(cars);
    res.json(car);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/cars/:id", requireAdmin, (req, res) => {
  const cars = readJson(carsPath);
  const car = cars.find((item) => item.id === req.params.id);
  if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });
  for (const url of car.images || []) removeMedia(url);
  writeCars(cars.filter((item) => item.id !== req.params.id));
  res.json({ ok: true });
});

app.get("/cars/:id", (_req, res) => {
  res.sendFile(path.join(publicDir, "car.html"));
});

app.use(express.static(publicDir, { extensions: ["html"] }));

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message || "تعذر تنفيذ الطلب" });
});

app.listen(port, () => {
  console.log(`alawneh motors http://localhost:${port}`);
});
