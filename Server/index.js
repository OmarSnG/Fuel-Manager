// index.js — Fuel API + Front static (ESM)
// - CRUD refuels/vehicles/drivers/washes
// - Socket.IO realtime events
// - Serves React build from ./public

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import http from "http";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import Database from "better-sqlite3";
import { Server } from "socket.io";
import { customAlphabet } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

// ---- Config ----
const PORT = Number(process.env.PORT || 4000);
const HOST = "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH  = process.env.DB_PATH || path.join(DATA_DIR, "fuel.db");
const LAN_ORIGIN = process.env.LAN_ORIGIN || "http://192.168.1.46";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- Sessions en memoire ----
const sessions = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24h

// ---- Rate limiting login (par IP) ----
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 min

function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  record.count++;
  return record.count <= MAX_LOGIN_ATTEMPTS;
}

// ---- Hachage de mots de passe (crypto.scrypt) ----
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function makeUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { username, hash: hashPassword(password, salt), salt, role };
}

const USERS = [
  makeUser("admin", process.env.ADMIN_PASSWORD || "1997", "admin"),
  makeUser("user",  process.env.USER_PASSWORD  || "1234", "user")
];

function verifyPassword(password, user) {
  const attempt = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(attempt, "hex"), Buffer.from(user.hash, "hex"));
}

// ---- DB ----
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Tables
db.prepare(`
CREATE TABLE IF NOT EXISTS refuels (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  date TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  driver TEXT,
  fuel_type TEXT NOT NULL,
  liters REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL,
  station TEXT,
  note TEXT,
  km REAL,
  l100 REAL
);`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  immat TEXT NOT NULL,
  marque TEXT,
  modele TEXT,
  fuel TEXT NOT NULL
);`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL
);`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS washes (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  date TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  driver TEXT,
  wash_type TEXT NOT NULL,
  vendor TEXT,
  note TEXT,
  amount REAL
);`).run();

// Migration: ajout colonne amount si absente
try {
  const cols = db.prepare("PRAGMA table_info(washes)").all().map(c => c.name);
  if (!cols.includes("amount")) {
    db.prepare("ALTER TABLE washes ADD COLUMN amount REAL").run();
    console.log("✅ Colonne 'amount' ajoutée dans la table washes");
  }
} catch (e) {
  console.warn("⚠️ ALTER TABLE washes ADD COLUMN amount a échoué :", e.message);
}

// ---- Index et contraintes ----
try {
  db.prepare("CREATE INDEX IF NOT EXISTS idx_refuels_vehicle ON refuels(vehicle)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_refuels_ts ON refuels(ts)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_washes_vehicle ON washes(vehicle)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_washes_ts ON washes(ts)").run();
  db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_immat ON vehicles(immat)").run();
  db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_nom ON drivers(nom)").run();
} catch (e) {
  console.warn("Creation d'index echouee:", e.message);
}

// ---- App / HTTP / Socket ----
const app = express();

const allowedOrigins = [
  `${LAN_ORIGIN}:${PORT}`,
  `${LAN_ORIGIN}:5173`,
  "http://localhost:5173",
  "http://localhost:4000",
];

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true }
});

// Socket.IO : verifier le token avant la connexion
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Token requis"));
  const session = sessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    return next(new Error("Session invalide"));
  }
  socket.user = session.user;
  next();
});

io.on("connection", s => {
  console.log("Client connecte:", s.id, s.user?.name);
});

// Notifications temps réel via Socket.IO
const notify = {
  refuels:  () => io.emit("refuels:updated",  { at: Date.now() }),
  vehicles: () => io.emit("vehicles:updated", { at: Date.now() }),
  drivers:  () => io.emit("drivers:updated",  { at: Date.now() }),
  washes:   () => io.emit("washes:updated",   { at: Date.now() }),
};

// ---- Middleware d'authentification ----
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ ok: false, error: "Token requis" });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Session invalide ou expiree" });
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, error: "Session expiree" });
  }

  req.user = session.user;
  next();
}

// Middleware admin seulement
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ ok: false, error: "Accès admin requis" });
  }
  next();
}

// ---- Helpers de validation ----
function sanitizeString(str, maxLen = 255) {
  if (str == null) return null;
  return String(str).trim().slice(0, maxLen);
}

function validateNumber(val, min = null, max = null) {
  const num = Number(val);
  if (!Number.isFinite(num)) return null;
  if (min !== null && num < min) return null;
  if (max !== null && num > max) return null;
  return num;
}

function validateDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ---- Auth ----
app.post("/api/login", (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: "Trop de tentatives, reessayez dans 15 minutes" });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "username et password requis" });
  }

  const user = USERS.find(u => u.username === username);

  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ ok: false, error: "bad_credentials" });
  }

  const token = nanoid() + "-" + nanoid();
  const session = {
    user: { name: user.username, role: user.role },
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION
  };

  sessions.set(token, session);

  // Nettoyer les sessions expirees periodiquement
  if (sessions.size > 50) {
    const now = Date.now();
    for (const [t, s] of sessions) {
      if (now > s.expiresAt) sessions.delete(t);
    }
  }

  return res.json({
    ok: true,
    user: session.user,
    token
  });
});

app.post("/api/logout", (req, res) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  if (token) {
    sessions.delete(token);
  }
  res.json({ ok: true });
});

// ---- Health (public) ----
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: Date.now() });
});

// ---- REFUELS ----
app.get("/api/refuels", authMiddleware, (req, res) => {
  try {
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 500));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rows = db.prepare("SELECT * FROM refuels ORDER BY ts DESC LIMIT ? OFFSET ?").all(limit, offset);
    res.json({ rows, limit, offset });
  } catch (e) {
    console.error("GET /api/refuels failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.post("/api/refuels", authMiddleware, (req, res) => {
  try {
    const { id: bodyId, date, vehicle, driver, fuel_type, liters, unit_price, km, l100, station, note } = req.body || {};
    
    // Validation
    const dateVal = validateDate(date);
    const vehicleVal = sanitizeString(vehicle, 50);
    const fuelTypeVal = sanitizeString(fuel_type, 20);
    const litersVal = validateNumber(liters, 0.1, 9999);
    const priceVal = validateNumber(unit_price, 0, 99999);
    const kmVal = validateNumber(km, 0, 9999999);
    
    if (!dateVal || !vehicleVal || !fuelTypeVal || litersVal === null || priceVal === null || kmVal === null) {
      return res.status(400).json({ 
        error: "Champs invalides: date, vehicle, fuel_type, liters, unit_price, km requis et valides" 
      });
    }

    // ID (on garde l'ID fourni si c'est une restauration)
    const id = bodyId ? sanitizeString(bodyId, 36) : nanoid();
    const ts = Date.now();

    // Calcul total
    const total = litersVal * priceVal;

    // Calcul L/100 côté serveur si non fourni
    let l100Computed = null;
    if (l100 != null && Number.isFinite(Number(l100))) {
      l100Computed = Number(l100);
    } else {
      // On prend le dernier plein de CE véhicule, le plus récent
      const prev = db.prepare("SELECT km FROM refuels WHERE vehicle = ? ORDER BY ts DESC LIMIT 1").get(vehicleVal);
      if (prev && prev.km != null) {
        const dist = kmVal - Number(prev.km);
        if (dist > 0 && litersVal > 0) {
          l100Computed = Number(((litersVal / dist) * 100).toFixed(2));
        }
      }
    }

    // Insert (OR REPLACE pour gerer la restauration depuis la corbeille)
    db.prepare(`INSERT OR REPLACE INTO refuels
      (id, ts, date, vehicle, driver, fuel_type, liters, unit_price, total, station, note, km, l100)
      VALUES (@id, @ts, @date, @vehicle, @driver, @fuel_type, @liters, @unit_price, @total, @station, @note, @km, @l100)`)
      .run({
        id, ts, 
        date: dateVal, 
        vehicle: vehicleVal,
        driver: sanitizeString(driver, 100),
        fuel_type: fuelTypeVal,
        liters: litersVal,
        unit_price: priceVal,
        total,
        station: sanitizeString(station, 100),
        note: sanitizeString(note, 500),
        km: kmVal,
        l100: l100Computed
      });

    notify.refuels();
    return res.status(201).json({ id, ts, total, l100: l100Computed });
  } catch (e) {
    console.error("POST /api/refuels failed:", e);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.put("/api/refuels/:id", authMiddleware, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    const old = db.prepare("SELECT * FROM refuels WHERE id=?").get(id);
    if (!old) return res.status(404).json({ error: "not found" });

    // Fusionne ancien + nouveau
    const p = { ...old, ...req.body };

    // Validations
    const dateVal = validateDate(p.date);
    const vehicleVal = sanitizeString(p.vehicle, 50);
    const fuelTypeVal = sanitizeString(p.fuel_type, 20);
    
    if (!dateVal || !vehicleVal || !fuelTypeVal) {
      return res.status(400).json({ error: "date, vehicle, fuel_type required" });
    }
    
    const liters = validateNumber(p.liters, 0.1, 9999);
    const price = validateNumber(p.unit_price, 0, 99999);
    const km = validateNumber(p.km, 0, 9999999);
    
    if (liters === null || price === null || km === null) {
      return res.status(400).json({ error: "liters, unit_price, km required and valid" });
    }

    const total = liters * price;

    // l/100 : si non fourni, on le recalcule
    let l100 = (p.l100 != null && Number.isFinite(Number(p.l100))) ? Number(p.l100) : null;
    if (l100 == null) {
      const prev = db.prepare(
        "SELECT km FROM refuels WHERE vehicle=? AND id<>? ORDER BY ts DESC LIMIT 1"
      ).get(vehicleVal, id);

      if (prev && prev.km != null) {
        const dist = km - Number(prev.km);
        if (dist > 0 && liters > 0) {
          l100 = Number(((liters / dist) * 100).toFixed(2));
        }
      }
    }

    // Mise à jour
    db.prepare(`
      UPDATE refuels SET
        date        = @date,
        vehicle     = @vehicle,
        driver      = @driver,
        fuel_type   = @fuel_type,
        liters      = @liters,
        unit_price  = @unit_price,
        total       = @total,
        station     = @station,
        note        = @note,
        km          = @km,
        l100        = @l100
      WHERE id = @id
    `).run({
      id,
      date: dateVal,
      vehicle: vehicleVal,
      driver: sanitizeString(p.driver, 100),
      fuel_type: fuelTypeVal,
      liters,
      unit_price: price,
      total,
      station: sanitizeString(p.station, 100),
      note: sanitizeString(p.note, 500),
      km,
      l100
    });

    notify.refuels();

    const updated = db.prepare("SELECT * FROM refuels WHERE id=?").get(id);
    return res.json(updated);
  } catch (e) {
    console.error("PUT /api/refuels/:id failed:", e);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.delete("/api/refuels/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    db.prepare("DELETE FROM refuels WHERE id=?").run(id);
    notify.refuels();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/refuels/:id failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// ---- VEHICLES ----
app.get("/api/vehicles", authMiddleware, (_req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM vehicles ORDER BY immat").all();
    res.json({ rows });
  } catch (e) {
    console.error("GET /api/vehicles failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.post("/api/vehicles", authMiddleware, (req, res) => {
  try {
    const { id, immat, marque, modele, fuel } = req.body || {};
    
    const immatVal = sanitizeString(immat, 20);
    const fuelVal = sanitizeString(fuel, 20);
    
    if (!immatVal || !fuelVal) {
      return res.status(400).json({ error: "immat & fuel requis" });
    }
    
    const _id = id ? sanitizeString(id, 36) : nanoid();
    
    db.prepare("INSERT OR REPLACE INTO vehicles (id, immat, marque, modele, fuel) VALUES (@id,@immat,@marque,@modele,@fuel)")
      .run({ 
        id: _id, 
        immat: immatVal, 
        marque: sanitizeString(marque, 50), 
        modele: sanitizeString(modele, 50), 
        fuel: fuelVal 
      });
    
    notify.vehicles();
    res.status(201).json({ id: _id });
  } catch (e) {
    console.error("POST /api/vehicles failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.put("/api/vehicles/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    const existing = db.prepare("SELECT * FROM vehicles WHERE id=?").get(id);
    if (!existing) return res.status(404).json({ error: "not found" });

    const p = { ...existing, ...req.body };
    
    const immatVal = sanitizeString(p.immat, 20);
    const fuelVal = sanitizeString(p.fuel, 20);
    
    if (!immatVal || !fuelVal) {
      return res.status(400).json({ error: "immat & fuel requis" });
    }
    
    db.prepare("UPDATE vehicles SET immat=@immat, marque=@marque, modele=@modele, fuel=@fuel WHERE id=@id").run({
      id,
      immat: immatVal,
      marque: sanitizeString(p.marque, 50),
      modele: sanitizeString(p.modele, 50),
      fuel: fuelVal
    });

    // Met à jour tous les pleins avec la nouvelle immat
    db.prepare(`UPDATE refuels SET vehicle=@immat WHERE vehicle=@oldImmat`).run({
      immat: immatVal,
      oldImmat: existing.immat
    });
    
    // Met à jour tous les lavages aussi
    db.prepare(`UPDATE washes SET vehicle=@immat WHERE vehicle=@oldImmat`).run({
      immat: immatVal,
      oldImmat: existing.immat
    });

    notify.vehicles();
    notify.refuels();
    notify.washes();
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/vehicles/:id failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.delete("/api/vehicles/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    db.prepare("DELETE FROM vehicles WHERE id=?").run(id);
    notify.vehicles();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/vehicles/:id failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// ---- DRIVERS ----
app.get("/api/drivers", authMiddleware, (_req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM drivers ORDER BY nom").all();
    res.json({ rows });
  } catch (e) {
    console.error("GET /api/drivers failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.post("/api/drivers", authMiddleware, (req, res) => {
  try {
    const { id, nom } = req.body || {};
    
    const nomVal = sanitizeString(nom, 100);
    if (!nomVal) {
      return res.status(400).json({ error: "nom requis" });
    }
    
    const _id = id ? sanitizeString(id, 36) : nanoid();
    db.prepare("INSERT OR REPLACE INTO drivers (id, nom) VALUES (?, ?)").run(_id, nomVal);
    notify.drivers();
    res.status(201).json({ id: _id });
  } catch (e) {
    console.error("POST /api/drivers failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.put("/api/drivers/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    const existing = db.prepare("SELECT * FROM drivers WHERE id=?").get(id);
    if (!existing) return res.status(404).json({ error: "not found" });

    const p = { ...existing, ...req.body };
    
    const nomVal = sanitizeString(p.nom, 100);
    if (!nomVal) {
      return res.status(400).json({ error: "nom requis" });
    }
    
    db.prepare("UPDATE drivers SET nom=@nom WHERE id=@id").run({ id, nom: nomVal });

    // Met à jour tous les pleins avec le nouveau nom de chauffeur
    db.prepare(`UPDATE refuels SET driver=@nom WHERE driver=@oldNom`).run({
      nom: nomVal,
      oldNom: existing.nom
    });
    
    // Met à jour tous les lavages aussi
    db.prepare(`UPDATE washes SET driver=@nom WHERE driver=@oldNom`).run({
      nom: nomVal,
      oldNom: existing.nom
    });

    notify.drivers();
    notify.refuels();
    notify.washes();
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/drivers/:id failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.delete("/api/drivers/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    db.prepare("DELETE FROM drivers WHERE id=?").run(id);
    notify.drivers();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/drivers/:id failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// ---- WASHES ----
app.get("/api/washes", authMiddleware, (req, res) => {
  try {
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 500));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rows = db.prepare("SELECT * FROM washes ORDER BY ts DESC LIMIT ? OFFSET ?").all(limit, offset);
    res.json({ rows, limit, offset });
  } catch (e) {
    console.error("GET /api/washes failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.post("/api/washes", authMiddleware, (req, res) => {
  try {
    const { id: bodyId, date, vehicle, driver, wash_type, vendor, note, amount } = req.body || {};
    
    const dateVal = validateDate(date);
    const vehicleVal = sanitizeString(vehicle, 50);
    const washTypeVal = sanitizeString(wash_type, 20);
    
    if (!dateVal || !vehicleVal || !washTypeVal) {
      return res.status(400).json({ error: "Missing: date, vehicle, wash_type" });
    }
    
    const id = bodyId ? sanitizeString(bodyId, 36) : nanoid();
    const ts = Date.now();
    
    db.prepare(`INSERT OR REPLACE INTO washes
      (id, ts, date, vehicle, driver, wash_type, vendor, note, amount)
      VALUES (@id, @ts, @date, @vehicle, @driver, @wash_type, @vendor, @note, @amount)`)
      .run({
        id, ts, 
        date: dateVal, 
        vehicle: vehicleVal,
        driver: sanitizeString(driver, 100),
        wash_type: washTypeVal,
        vendor: sanitizeString(vendor, 100),
        note: sanitizeString(note, 500),
        amount: amount != null ? validateNumber(amount, 0, 9999999) : null
      });
    
    notify.washes();
    res.status(201).json({ id, ts });
  } catch (e) {
    console.error("POST /api/washes failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.put("/api/washes/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    const existing = db.prepare("SELECT * FROM washes WHERE id=?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "not found" });
    }

    const p = { ...existing, ...req.body };
    
    const dateVal = validateDate(p.date);
    const vehicleVal = sanitizeString(p.vehicle, 50);
    const washTypeVal = sanitizeString(p.wash_type, 20);
    
    if (!dateVal || !vehicleVal || !washTypeVal) {
      return res.status(400).json({ error: "date, vehicle, wash_type required" });
    }

    db.prepare(`
      UPDATE washes SET
        date      = @date,
        vehicle   = @vehicle,
        driver    = @driver,
        wash_type = @wash_type,
        vendor    = @vendor,
        note      = @note,
        amount    = @amount
      WHERE id = @id
    `).run({
      id,
      date: dateVal,
      vehicle: vehicleVal,
      driver: sanitizeString(p.driver, 100),
      wash_type: washTypeVal,
      vendor: sanitizeString(p.vendor, 100),
      note: sanitizeString(p.note, 500),
      amount: p.amount != null ? validateNumber(p.amount, 0, 9999999) : null
    });

    notify.washes();

    const updated = db.prepare("SELECT * FROM washes WHERE id=?").get(id);
    return res.json(updated);
  } catch (e) {
    console.error("PUT /api/washes/:id failed:", e);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.delete("/api/washes/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 36);
    db.prepare("DELETE FROM washes WHERE id=?").run(id);
    notify.washes();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/washes/:id failed:", e);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// ---- Serve front (build Vite in ./public) ----
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- Start ----
server.listen(PORT, HOST, () => {
  console.log(`✅ Fuel API + Front ready on http://${HOST}:${PORT}`);
  console.log(`DB file: ${DB_PATH}`);
});
