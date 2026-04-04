
import React, { useEffect, useState } from "react";
import logoUrl from "./assets/logo.png";

import {
  listRefuels, createRefuel, deleteRefuel as apiDeleteFill,
  listVehicles as apiListVehicles, listDrivers as apiListDrivers,
  createVehicle as apiCreateVehicle, createDriver as apiCreateDriver,
  deleteVehicle as apiDeleteVehicle, deleteDriver as apiDeleteDriver,
  updateVehicle as apiUpdateVehicle, updateDriver as apiUpdateDriver,
  updateRefuel,
  listWashes as apiListWashes,
  createWash as apiCreateWash,
  deleteWash as apiDeleteWash,
  updateWash as apiUpdateWash,
  apiLogin, apiLogout, getToken, clearToken
} from "./api";

import { socket, updateSocketAuth } from "./realtime";

/* ------------------ HELPERS ------------------ */
function askConfirm(message) {
  return window.confirm(message);
}

/* ---------------- THEME ICON ---------------- */
function ThemeIcon({ mode }){
  if(mode === "light"){
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
        <defs>
          <radialGradient id="sunGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff176" />
            <stop offset="50%" stopColor="#ffeb3b" />
            <stop offset="100%" stopColor="#fbc02d" />
          </radialGradient>
        </defs>
        <circle cx="12" cy="12" r="5" fill="url(#sunGradient)" />
        <g stroke="#fdd835" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke">
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
          <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
          <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
          <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
        </g>
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff">
      <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/>
    </svg>
  );
}

/* ---------------- AUTH / PRICE KEYS ---------------- */
const AUTH_KEY = "fuel-auth-users";
const SESSION_KEY = "fuel-auth-session";
const FUEL_PRICE_KEY = "fuel-price-map";
const FUEL_PRICE_HIST = "fuel-price-history";

function lsGet(key, fallback){
  try { 
    const raw = localStorage.getItem(key); 
    return raw ? JSON.parse(raw) : fallback;
  } catch(e) { 
    return fallback;
  }
}

function lsSet(key, val){ 
  try { 
    localStorage.setItem(key, JSON.stringify(val));
  } catch(e) {
    console.error("lsSet error:", e);
  }
}

function getPriceMap(){
  try {
    const raw = localStorage.getItem(FUEL_PRICE_KEY);
    if(raw) return JSON.parse(raw);
  } catch(e) {
    console.error("getPriceMap error:", e);
  }
  return { essence: 990, gasoil: 755 };
}

function setPriceMap(map){
  try { 
    localStorage.setItem(FUEL_PRICE_KEY, JSON.stringify(map));
  } catch(e) {
    console.error("setPriceMap error:", e);
  }
}

function pushPriceHistory(kind, value){
  try {
    const hist = JSON.parse(localStorage.getItem(FUEL_PRICE_HIST)||"[]");
    hist.unshift({ when: new Date().toISOString(), kind, value });
    localStorage.setItem(FUEL_PRICE_HIST, JSON.stringify(hist.slice(0,100)));
  } catch(e) {
    console.error("pushPriceHistory error:", e);
  }
}

/* ---------------- APP ---------------- */
export default function App(){
  const [theme,setTheme] = React.useState(()=> localStorage.getItem("fuel-theme") || "dark");
  
  React.useEffect(()=>{
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("fuel-theme", theme); } catch(e) {}
  }, [theme]);
  
  function toggleTheme(){ setTheme(t=> t==="light" ? "dark" : "light"); }

  const [session,setSession] = useState(()=> lsGet(SESSION_KEY, null));
  const [loginError, setLoginError] = useState("");

  // Écouter l'expiration du token
  useEffect(() => {
    const handleExpired = () => {
      console.log("Token expiré, déconnexion...");
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    };
    
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  // Vérifier si on a un token valide au démarrage
  useEffect(() => {
    const token = getToken();
    const savedSession = lsGet(SESSION_KEY, null);
    
    if (savedSession && !token) {
      // Session locale mais pas de token -> nettoyer
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    }
  }, []);

  async function login(username, password){
    setLoginError("");
    try {
      const result = await apiLogin(username, password);
      if (result.ok && result.user) {
        const s = { username: result.user.name, role: result.user.role };
        lsSet(SESSION_KEY, s);
        setSession(s);
        updateSocketAuth();
      } else {
        setLoginError("Identifiants invalides");
      }
    } catch(e) {
      console.error("Login error:", e);
      setLoginError(e.message || "Erreur de connexion");
    }
  }
  
  async function logout(){ 
    try {
      await apiLogout();
    } catch(e) {
      console.error("Logout error:", e);
    }
    localStorage.removeItem(SESSION_KEY);
    clearToken();
    setSession(null);
  }

  if(!session) return <Login onLogin={login} error={loginError} />;
  return <Shell session={session} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />;
}

function Login({onLogin, error}){
  const [u,setU] = useState("");
  const [p,setP] = useState("");
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async () => {
    if (!u.trim() || !p) return;
    setLoading(true);
    await onLogin(u.trim(), p);
    setLoading(false);
  };
  
  return (
    <div className="login">
      <div style={{display:"grid",placeItems:"center",marginBottom:12}}>
        <img src={logoUrl} alt="Fuel Manager Pro" className="login-logo" />
      </div>
      <h2>Connexion</h2>
      {error && <div style={{color:"#e53935",marginBottom:10,textAlign:"center"}}>{error}</div>}
      <div style={{display:"grid",gap:14}}>
        <input 
          placeholder="Nom utilisateur" 
          value={u} 
          onChange={e=> setU(e.target.value)}
          disabled={loading}
        />
        <input 
          placeholder="Mot de passe" 
          type="password" 
          value={p} 
          onChange={e=> setP(e.target.value)} 
          onKeyDown={e=>{ if(e.key==='Enter') handleSubmit(); }}
          disabled={loading}
        />
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- SHELL ---------------- */
const LS_KEY = "fuel-pro-v5_2_full_v2";
const uid = () => Math.random().toString(36).slice(2,10);
const money = n => typeof n==="number" ? n.toLocaleString(undefined,{maximumFractionDigits:0})+" CFA" : "-";


function Shell({session, onLogout, theme, toggleTheme}){
  const setThemeExplicit = (t) => { if(t !== theme) toggleTheme(); };
  const role = session.role;
  const [priceDraft, setPriceDraft] = React.useState(()=> getPriceMap());
  const [vehicles,setVehicles] = React.useState([]);
  const [drivers,setDrivers] = React.useState([]);
  const vehiclesRef = React.useRef([]);
  const driversRef = React.useRef([]);
  React.useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);
  React.useEffect(() => { driversRef.current = drivers; }, [drivers]);
  const [fills,setFills] = React.useState([]);
  const [trash,setTrash] = React.useState([]);

  const [washes, setWashes] = React.useState([]);
  const [wForm, setWForm] = React.useState({
    vehicleId:"", 
    driverId:"", 
    when: new Date().toISOString().slice(0,16),
    wash_type:"simple", 
    vendor:"", 
    note:"",
    amount:""
  });

  // --- MODALE D'ÉDITION PLEIN ---
  const [editingFill, setEditingFill] = React.useState(null);
  const [editForm, setEditForm] = React.useState({
    id: null,
    vehicleId: "",
    driverId: "",
    when: "",
    km: "",
    liters: "",
    price: "",
    fuel: "",
    station: "",
    note: ""
  });

  // --- MODALE D'ÉDITION LAVAGE / HUILE ---
  const [editingWash, setEditingWash] = React.useState(null);
  const [editWashForm, setEditWashForm] = React.useState({
    id: "",
    vehicleId: "",
    driverId: "",
    when: new Date().toISOString().slice(0,16),
    wash_type: "simple",
    amount: "",
    vendor: "",
    note: ""
  });

  // Persister local (sans les fills — ils viennent du serveur)
  React.useEffect(() => {
    lsSet(LS_KEY, { trash });
  }, [trash]);

  // 3) Synchroniser avec le serveur + temps réel
  async function fetchVehicles(){
    try {
      const r = await apiListVehicles();
      const rows = r.rows || [];
      vehiclesRef.current = rows;
      setVehicles(rows);
    } catch (e) {
      console.error("fetchVehicles failed", e);
    }
  }

  async function fetchDrivers(){
    try {
      const r = await apiListDrivers();
      const rows = r.rows || [];
      driversRef.current = rows;
      setDrivers(rows);
    } catch (e) {
      console.error("fetchDrivers failed", e);
    }
  }
  
  async function syncFromServer(){
    try {
      const { rows } = await listRefuels();
      const currentVehicles = vehiclesRef.current;
      const currentDrivers = driversRef.current;
      const mapped = rows.map(r => {
        const v = currentVehicles.find(v => v.immat === r.vehicle) || null;
        const d = currentDrivers.find(d => d.nom === r.driver) || null;
        return {
          id: r.id,
          vehicleId: v ? v.id : "",
          driverId: d ? d.id : "",
          when: new Date(r.date).toISOString(),
          km: Number(r.km || 0),
          liters: Number(r.liters || 0),
          price: Number(r.unit_price || 0),
          fuel: r.fuel_type,
          station: r.station || "",
          note: r.note || "",
          l100: (Number.isFinite(r.l100) ? Number(r.l100) : null),
          vLabel: r.vehicle,
          dLabel: r.driver
        };
      });
      setFills(mapped);
    } catch (e) {
      console.error("syncFromServer failed", e);
    }
  }
  
  async function fetchWashes(){
    try {
      const r = await apiListWashes();
      setWashes(r.rows || []);
    } catch(e) {
      console.error("fetchWashes failed", e);
    }
  }
  
  async function addWash(){
    const v = vehicles.find(x => x.id === wForm.vehicleId);
    const d = drivers.find(x => x.id === wForm.driverId);
    if(!v) return alert("Choisis un véhicule");

    try {
      await apiCreateWash({
        date: new Date(wForm.when).toISOString(),
        vehicle: v.immat,
        driver: d?.nom || "",
        wash_type: wForm.wash_type,
        vendor: wForm.vendor?.trim() || "",
        note: wForm.note?.trim() || "",
        amount: (wForm.amount !== "" ? Number(wForm.amount) : null)
      });
      setWForm(s => ({
        ...s,
        vendor:"",
        note:"",
        amount:"",
        when: new Date().toISOString().slice(0,16)
      }));
    } catch(e) {
      console.error("addWash failed", e);
      alert("Erreur création lavage");
    }
  }

  // ---- LAVAGES : suppression (admin) ----
  async function deleteWash(arg) {
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");

    const row = (typeof arg === "object") ? arg : washes.find(w => w.id === arg);
    if (!row) return alert("Lavage introuvable");

    if (!askConfirm("Supprimer ce lavage ?")) return;

    moveToTrash([{ type: "wash", data: row }]);

    try {
      await apiDeleteWash(row.id);
    } catch (e) {
      console.error("deleteWash failed", e);
      alert("Erreur suppression lavage");
    }
  }

  // ---- LAVAGES : ouverture de la modale d'édition ----
  function openEditWash(row) {
    if (role !== "admin") {
      alert("Accès refusé (Admin seulement)");
      return;
    }
    if (!row) return;

    try {
      const v = vehicles.find(v => v.immat === row.vehicle || v.immat === row.immat);
      const d = drivers.find(d => d.nom === row.driver  || d.nom === row.chauffeur);

      const rawDate  = row.date ? new Date(row.date) : new Date();
      const safeDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;
      const whenVal  = safeDate.toISOString().slice(0,16);

      setEditingWash(row);
      setEditWashForm({
        id: String(row.id ?? ""),
        vehicleId: v ? String(v.id) : "",
        driverId:  d ? String(d.id) : "",
        when: whenVal,
        wash_type: row.wash_type || "simple",
        amount:
          row.amount != null ? String(Number(row.amount)) :
          row.cost   != null ? String(Number(row.cost))   :
          "",
        vendor: row.vendor || "",
        note:   row.note   || ""
      });
    } catch (e) {
      console.error("openEditWash failed:", e);
      alert("Impossible d'ouvrir l'édition du lavage.");
    }
  }

  function closeEditWash() {
    setEditingWash(null);
  }

  // ---- LAVAGES : sauvegarde de la modif via l'API ----
  async function saveEditWash(e) {
    e?.preventDefault?.();
    if (role !== "admin") return;

    const v = vehicles.find(v => v.id === editWashForm.vehicleId);
    const d = drivers.find(d => d.id === editWashForm.driverId);

    if (!v) {
      alert("Véhicule requis");
      return;
    }

    const amountNum = Number(editWashForm.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      alert("Montant invalide");
      return;
    }

    const whenISO = new Date(editWashForm.when).toISOString();

    const payload = {
      id: String(editWashForm.id),
      date: whenISO,
      vehicle: v.immat,
      driver: d?.nom || "",
      wash_type: editWashForm.wash_type || "simple",
      amount: amountNum,
      vendor: (editWashForm.vendor || "").trim(),
      note:   (editWashForm.note   || "").trim()
    };

    try {
      await apiUpdateWash(editWashForm.id, payload);
      setEditingWash(null);
      await fetchWashes();
      alert("Lavage mis à jour");
    } catch (e) {
      console.error("saveEditWash failed:", e);
      alert("Erreur mise à jour lavage");
    }
  }


  function openEditFill(f) {
    try {
      console.log("[openEditFill] fill=", f, "drivers count=", drivers.length, "vehicles count=", vehicles.length);

      const rawDate = f?.when ? new Date(f.when) : null;
      const safeDate = rawDate && !isNaN(rawDate.getTime()) ? rawDate : new Date();
      const whenValue = safeDate.toISOString().slice(0, 16);

      // Toujours résoudre par label pour garantir un ID valide
      const matchedV = f?.vLabel ? vehicles.find(v => v.immat === f.vLabel) : null;
      const matchedD = f?.dLabel ? drivers.find(d => d.nom === f.dLabel) : null;
      const vid = matchedV ? matchedV.id : (f?.vehicleId ?? "");
      const did = matchedD ? matchedD.id : (f?.driverId ?? "");
      console.log("[openEditFill] vLabel=", f?.vLabel, "dLabel=", f?.dLabel, "=> vid=", vid, "did=", did);

      setEditingFill(f || {});
      setEditForm({
        id: String(f?.id ?? ""),
        vehicleId: String(vid),
        driverId:  String(did),
        when: whenValue,
        km: String(Number.isFinite(Number(f?.km)) ? Number(f.km) : ""),
        liters: String(Number.isFinite(Number(f?.liters)) ? Number(f.liters) : ""),
        price: String(Number.isFinite(Number(f?.price)) ? Number(f.price) : ""),
        fuel: (f?.fuel || "gasoil").toLowerCase(),
        station: f?.station || "",
        note: f?.note || ""
      });
    } catch (e) {
      console.error("openEditFill failed:", e);
      alert("Impossible d'ouvrir l'édition (voir console).");
    }
  }


  function closeEditFill() {
    setEditingFill(null);
  }

  async function saveEditFill(e){
    e?.preventDefault?.();

    const v = vehicles.find(x => x.id === editForm.vehicleId);
    const d = drivers.find(x => x.id === editForm.driverId);
    if(!v) return alert("Véhicule requis");

    const kmNum = Number(editForm.km);
    const lNum  = Number(editForm.liters);
    const puNum = Number(editForm.price);
    if(!Number.isFinite(kmNum)||kmNum<=0) return alert("Km invalide");
    if(!Number.isFinite(lNum) ||lNum <=0) return alert("Litres invalides");
    if(!Number.isFinite(puNum)||puNum<=0) return alert("Prix/L invalide");

    const whenISO = new Date(editForm.when).toISOString();

    // Recalcule du L/100
    let l100 = null;

    const sameVehicle = fills
      .filter(f => f.vehicleId === editForm.vehicleId && f.id !== editForm.id);

    const synthetic = [
      ...sameVehicle,
      { id: editForm.id, km: kmNum, liters: lNum }
    ].sort((a, b) => Number(a.km) - Number(b.km));

    const idx = synthetic.findIndex(f => f.id === editForm.id);

    if (idx > 0) {
      const firstKm = Number(synthetic[0].km || 0);
      const litersSlice = synthetic.slice(1, idx + 1);
      const totalLiters = litersSlice.reduce(
        (s, f) => s + Number(f.liters || 0),
        0
      );

      const dist = kmNum - firstKm;

      if (dist > 0 && totalLiters > 0) {
        l100 = Number(((totalLiters / dist) * 100).toFixed(2));
      }
    }

    const payload = {
      id: String(editForm.id),
      date: whenISO,
      vehicle: v.immat,
      driver: d?.nom || "",
      fuel_type: editForm.fuel,
      fuel: editForm.fuel,
      liters: lNum,
      unit_price: puNum,
      price: puNum,
      km: kmNum,
      l100,
      station: (editForm.station?.trim() || null),
      note: (editForm.note?.trim() || null)
    };

    try {
      console.log("[saveEditFill] PUT payload:", payload);
      await updateRefuel(editForm.id, payload);
      closeEditFill();
      await syncFromServer();
    } catch(err) {
      console.error("[saveEditFill] error:", err);
      alert("Échec modification plein (voir console Réseau).");
    }
  }

  // -- CHARGEMENT INITIAL + TEMPS RÉEL --
  React.useEffect(() => {
    // Charger vehicles/drivers d'abord, puis sync refuels/washes
    Promise.all([fetchVehicles(), fetchDrivers()]).then(() => {
      syncFromServer();
      fetchWashes();
    });

    const onRefuels  = () => { console.log("[socket] refuels:updated reçu");  syncFromServer(); };
    const onVehicles = () => { console.log("[socket] vehicles:updated reçu"); fetchVehicles();   };
    const onDrivers  = () => { console.log("[socket] drivers:updated reçu");  fetchDrivers();    };
    const onWashes   = () => { console.log("[socket] washes:updated reçu");   fetchWashes();     };

    socket.on("refuels:updated",  onRefuels);
    socket.on("vehicles:updated", onVehicles);
    socket.on("drivers:updated",  onDrivers);
    socket.on("washes:updated",   onWashes);

    const onConnect = () => {
      console.log("[socket] connect");
      Promise.all([fetchVehicles(), fetchDrivers()]).then(() => {
        syncFromServer();
        fetchWashes();
      });
    };
    socket.on("connect", onConnect);

    return () => {
      socket.off("refuels:updated",  onRefuels);
      socket.off("vehicles:updated", onVehicles);
      socket.off("drivers:updated",  onDrivers);
      socket.off("washes:updated",   onWashes);
      socket.off("connect", onConnect);
    };
  }, []);
  
  // Note: syncFromServer et fetchWashes sont appelés après fetchVehicles+fetchDrivers dans le useEffect initial
  
  // Synchroniser la carte des prix avec le serveur
  React.useEffect(() => {
    if (!fills.length) return;

    const latestByFuel = {};
    for (const f of fills) {
      const fuel = (f.fuel || "").toLowerCase();
      if (!fuel) continue;
      const when = new Date(f.when).getTime();
      const price = Number(f.price || 0);
      if (!Number.isFinite(price) || price <= 0) continue;

      if (!latestByFuel[fuel] || when > latestByFuel[fuel].when) {
        latestByFuel[fuel] = { when, price };
      }
    }

    const current = getPriceMap();
    const next = { ...current };
    let changed = false;

    for (const fuel of Object.keys(latestByFuel)) {
      const p = latestByFuel[fuel].price;
      if (Number.isFinite(p) && p > 0 && current[fuel] !== p) {
        next[fuel] = p;
        changed = true;
      }
    }

    if (!changed) return;

    setPriceMap(next);
    setPriceDraft(next);

    setPForm((s) => {
      if (!s.vehicleId) return s;
      const v = vehicles.find((v) => v.id === s.vehicleId);
      if (!v) return s;
      const newPrice = next[v.fuel];
      if (!newPrice || newPrice === s.price) return s;
      return { ...s, price: newPrice, fuel: v.fuel };
    });
  }, [fills, vehicles]);
 

  const [tab, setTab] = React.useState("plein");

  function tryOpenTab(next){
    if (role !== 'admin' && (next === "parametres" || next === "corbeille")) {
      alert("Acces reserve aux administrateurs");
      return;
    }
    setTab(next);
  }

  // forms
  const [vForm,setVForm] = React.useState({immat:"", marque:"", modele:"", fuel:"gasoil"});
  const [dForm,setDForm] = React.useState({nom:""});
  const [pForm,setPForm] = React.useState({vehicleId:"", driverId:"", when:new Date().toISOString().slice(0,16), km:"", liters:"", price:getPriceMap().gasoil, fuel:"gasoil", station:"", note:""});
  const [editingVehicleId, setEditingVehicleId] = React.useState(null);
  const [vEdit, setVEdit] = React.useState({ immat:"", marque:"", modele:"", fuel:"gasoil" });

  const [editingDriverId, setEditingDriverId] = React.useState(null);
  const [dEdit, setDEdit] = React.useState({ nom:"" });

  React.useEffect(()=>{
    if(!pForm.vehicleId) return;
    const v = vehicles.find(v=> v.id===pForm.vehicleId);
    if(!v) return;
    setPForm(s=> ({...s, fuel: v.fuel, price: getPriceMap()[v.fuel]}));
  },[pForm.vehicleId, vehicles]);

  async function addVehicle(){
    console.log("[addVehicle] start");
    const immat = vForm.immat?.trim();
    if(!immat){ alert("Immatriculation requise"); console.log("[addVehicle] no immat"); return; }

    const payload = {
      immat,
      marque: (vForm.marque?.trim() || null),
      modele: (vForm.modele?.trim() || null),
      fuel: (vForm.fuel || "gasoil")
    };
    console.log("[addVehicle] payload:", payload);

    try {
      const r = await apiCreateVehicle(payload);
      console.log("[addVehicle] API response:", r);
      setVForm({immat:"", marque:"", modele:"", fuel:"gasoil"});
      await fetchVehicles();
    } catch(e) {
      console.error("[addVehicle] failed:", e);
      alert("Erreur création véhicule");
    }
  }
  
  async function addDriver(){
    console.log("[addDriver] start");
    const nom = dForm.nom?.trim();
    if(!nom){ alert("Nom requis"); console.log("[addDriver] no name"); return; }

    try {
      const r = await apiCreateDriver({ nom });
      console.log("[addDriver] API response:", r);
      setDForm({ nom: "" });
      await fetchDrivers();
    } catch(e) {
      console.error("[addDriver] failed:", e);
      alert("Erreur création chauffeur");
    }
  }
  
  function startEditVehicle(v){
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");
    setEditingVehicleId(v.id);
    setVEdit({ immat: v.immat || "", marque: v.marque || "", modele: v.modele || "", fuel: v.fuel || "gasoil" });
  }

  async function saveEditVehicle(){
    if (role !== "admin") return;
    if(!vEdit.immat?.trim()) return alert("Immatriculation requise");
    try {
      await apiUpdateVehicle(editingVehicleId, {
        immat: vEdit.immat.trim(),
        marque: (vEdit.marque?.trim() || null),
        modele: (vEdit.modele?.trim() || null),
        fuel: vEdit.fuel || "gasoil"
      });
      setEditingVehicleId(null);
      await fetchVehicles();
      await syncFromServer();
    } catch(e){
      console.error(e);
      alert("Échec modification véhicule");
    }
  }

  function cancelEditVehicle(){
    setEditingVehicleId(null);
  }

  // --- MODIFICATION CHAUFFEUR ---
  function startEditDriver(d){
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");
    setEditingDriverId(d.id);
    setDEdit({ nom: d.nom || "" });
  }

  async function saveEditDriver(){
    if (role !== "admin") return;
    if(!dEdit.nom?.trim()) return alert("Nom requis");
    try {
      await apiUpdateDriver(editingDriverId, { nom: dEdit.nom.trim() });
      setEditingDriverId(null);
      await fetchDrivers();
      await syncFromServer();
    } catch(e){
      console.error(e);
      alert("Échec modification chauffeur");
    }
  }

  function cancelEditDriver(){
    setEditingDriverId(null);
  }
  
  async function addFill(){
    console.log("[addFill] start");
    const { vehicleId, driverId, km, liters } = pForm;

    if(!vehicleId){ alert("Choisis un véhicule"); console.log("[addFill] no vehicle"); return; }
    if(!driverId){ alert("Choisis un chauffeur"); console.log("[addFill] no driver"); return; }

    const v = vehicles.find(v => v.id === vehicleId);
    const d = drivers.find(d => d.id === driverId);
    if(!v){ alert("Véhicule introuvable"); console.log("[addFill] vehicle not found"); return; }

    const kmNum = Number(km);
    const lNum = Number(liters);
    if(!Number.isFinite(kmNum) || kmNum <= 0){ alert("Kilométrage invalide"); return; }
    if(!Number.isFinite(lNum) || lNum <= 0){ alert("Litres invalides"); return; }

    const history = [...fills]
      .filter(f => f.vehicleId === vehicleId)
      .sort((a, b) => a.km - b.km);

    const prev = history[history.length - 1] || null;

    if (prev && kmNum < prev.km) {
      alert("Odomètre inférieur au dernier plein (" + prev.km + ")");
      return;
    }

    const fuel = v.fuel;
    const price = (getPriceMap()[fuel] ?? getPriceMap()[fuel]);

    let l100 = null;
    if (history.length) {
      const firstKm = Number(history[0].km || 0);

      const totalLitersBefore = history
        .slice(1)
        .reduce((s, f) => s + Number(f.liters || 0), 0);

      const totalLiters = totalLitersBefore + lNum;
      const dist = kmNum - firstKm;

      if (dist > 0 && totalLiters > 0) {
        l100 = Number(((totalLiters / dist) * 100).toFixed(2));
      }
    }

    const payload = {
      date: new Date(pForm.when).toISOString(),
      vehicle: v.immat,
      driver: d?.nom || "",
      fuel_type: fuel,
      liters: lNum,
      unit_price: price,
      km: kmNum,
      l100,
      station: pForm.station?.trim() || "",
      note: pForm.note?.trim() || ""
    };
    console.log("[addFill] payload:", payload);

    try {
      const r = await createRefuel(payload);
      console.log("[addFill] API response:", r);

      setPForm(s => ({
        ...s,
        km: "",
        liters: "",
        price: (getPriceMap()[v.fuel] ?? 0),
        fuel: v.fuel,
        note: "",
        when: new Date().toISOString().slice(0, 16)
      }));

      await syncFromServer();
      console.log("[addFill] syncFromServer() done");

    } catch (e) {
      console.error("[addFill] failed:", e);
      alert("Erreur création plein");
    }
  }
  
  function moveToTrash(entries) {
    const now = Date.now();
    const pack = entries.map(e => ({
      ...e,
      _trashId: uid(),
      deletedAt: now,
    }));
    setTrash(prev => [...pack, ...prev]);
  }

  // Moyenne L/100 des 3 derniers pleins pour un véhicule
  function avgL100(vehicleId){
    const list = fills
      .filter(f=> f.vehicleId===vehicleId && Number.isFinite(f.l100))
      .sort((a,b)=> new Date(b.when)-new Date(a.when))
      .slice(0,3)
      .map(f=> f.l100);
    if(!list.length) return null;
    const avg = list.reduce((a,b)=> a+b, 0) / list.length;
    return Number(avg.toFixed(1));
  }
  
  function washLabel(t) {
    const x = (t || "").toLowerCase();
    if (x === "huile")   return "Huile";
    if (x === "simple")  return "Lavage simple";
    if (x === "complet") return "Lavage complet";
    return "Lavage";
  }
  
  function washClass(t){
    const x = (t || "").toLowerCase();
    if (x === "huile")   return "wash huile";
    if (x === "simple")  return "wash lavage-simple";
    if (x === "complet") return "wash lavage-complet";
    return "wash autres";
  }
  
  function escCSV(s){
    if (s == null) return "";
    const t = String(s).replaceAll('"','""');
    return '"' + t + '"';
  }

  function exportCSV(rows){
    const SEP   = ';';
    const nlRe  = /\r?\n/g;
    const lines = [];

    lines.push([
      "Type","Date","Véhicule","Chauffeur","Km","Litres",
      "Carb.","L/100","Prix/L","Coût","Centre","Note"
    ].join(SEP));

    rows.forEach(it => {
      const date = it.when instanceof Date ? it.when : new Date(it.when);
      const dateStr = date.toLocaleString();

      if (it.type === "fuel") {
        lines.push([
          "Plein",
          escCSV(dateStr),
          escCSV(it.immat || ""),
          escCSV(it.nom || ""),
          it.km ?? "",
          it.liters ?? "",
          (it.fuel || "").toUpperCase(),
          (Number.isFinite(it.l100) ? it.l100 : ""),
          it.unit_price ?? "",
          (Number(it.unit_price||0) * Number(it.liters||0)) || "",
          escCSV((it.station || "").replaceAll(SEP, " ")),
          escCSV((it.note || "").replace(nlRe, " ").replaceAll(SEP, " ")),
        ].join(SEP));

      } else {
        const label = washLabel(it.wash_type);
        lines.push([
          label,
          escCSV(dateStr),
          escCSV(it.immat || ""),
          escCSV(it.nom || ""),
          "",
          "",
          escCSV(label),
          "",
          "",
          it.cost ?? "",
          escCSV((it.vendor || "").replaceAll(SEP, " ")),
          escCSV((it.note   || "").replace(nlRe, " ").replaceAll(SEP, " ")),
        ].join(SEP));
      }
    });

    const bom  = "\ufeff";
    const blob = new Blob([bom + lines.join("\n")], {
      type: "text/csv;charset=utf-8;"
    });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "historique.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  
  async function deleteFill(id){
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");

    const f = fills.find(x => x.id === id);
    if (!f) return;

    const v = vehicles.find(x => x.id === f.vehicleId);
    const d = drivers.find(x => x.id === f.driverId);
    const veh = v?.immat || f.vLabel || "—";
    const drv = d?.nom   || f.dLabel || "—";
    const when = new Date(f.when).toLocaleString();

    const ok = askConfirm(
      `Supprimer ce plein ?\n\n` +
      `Date : ${when}\n` +
      `Véhicule : ${veh}\n` +
      `Chauffeur : ${drv}\n` +
      `Litres : ${f.liters}  |  Prix/L : ${f.price ?? ""}`
    );
    if (!ok) return;

    moveToTrash([{ type: "fill", data: f }]);

    try {
      await apiDeleteFill(id);
      await syncFromServer();
    } catch (e) {
      console.error(e);
      alert("Échec suppression plein");
    }
  }

  async function deleteVehicle(id){
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");

    const v = vehicles.find(x => x.id === id);
    if (!v) return;

    const ok = askConfirm(
      `Supprimer ce véhicule ?\n\n` +
      `Immat : ${v.immat || "—"}\n` +
      `Marque/Modèle : ${(v.marque || "—")} / ${(v.modele || "—")}\n` +
      `Carburant : ${v.fuel || "—"}`
    );
    if (!ok) return;

    moveToTrash([{ type: "vehicle", data: v }]);

    try {
      await apiDeleteVehicle(id);
      await fetchVehicles();
      await syncFromServer();
    } catch (e) {
      console.error(e);
      alert("Échec suppression véhicule");
    }
  }

  // =============================================
  // ⚠️ FONCTION MANQUANTE - CORRIGÉE ICI ⚠️
  // =============================================
  async function deleteDriver(id) {
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");

    const d = drivers.find(x => x.id === id);
    if (!d) return;

    const ok = askConfirm(
      `Supprimer ce chauffeur ?\n\nNom : ${d.nom || "—"}`
    );
    if (!ok) return;

    // Ajouter à la corbeille pour restauration possible
    moveToTrash([{ type: "driver", data: d }]);

    try {
      await apiDeleteDriver(id);
      await fetchDrivers();
      await syncFromServer();
    } catch (e) {
      console.error("deleteDriver failed:", e);
      alert("Échec suppression chauffeur");
    }
  }
  // =============================================

  async function restoreItem(trashId) {
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");

    const t = trash.find(x => x._trashId === trashId);
    if (!t) return;

    try {
      if (t.type === "vehicle") {
        await apiCreateVehicle({
          id:     t.data.id,
          immat:  t.data.immat,
          marque: t.data.marque || null,
          modele: t.data.modele || null,
          fuel:   t.data.fuel
        });
        await fetchVehicles();

      } else if (t.type === "driver") {
        await apiCreateDriver({
          id:  t.data.id,
          nom: t.data.nom
        });
        await fetchDrivers();

      } else if (t.type === "fill") {
        const v = vehicles.find(v => v.id === t.data.vehicleId);
        const d = drivers.find(d => d.id === t.data.driverId);

        await createRefuel({
          id: t.data.id,
          date: new Date(t.data.when).toISOString(),
          vehicle: v?.immat || t.data.vLabel || "",
          driver:  d?.nom   || t.data.dLabel || "",
          fuel_type:  t.data.fuel,
          liters:     Number(t.data.liters || 0),
          unit_price: Number(t.data.price  || 0),
          km:         Number(t.data.km     || 0),
          l100:       (Number.isFinite(t.data.l100) ? Number(t.data.l100) : null),
          station:    t.data.station || "",
          note:       t.data.note    || ""
        });

        await syncFromServer();

      } else if (t.type === "wash") {
        const dateStr = t.data.date || t.data.when;
        await apiCreateWash({
          id:        t.data.id,
          date:      new Date(dateStr).toISOString(),
          vehicle:   t.data.vehicle,
          driver:    t.data.driver || "",
          wash_type: t.data.wash_type,
          vendor:    t.data.vendor || "",
          note:      t.data.note   || "",
          amount:    t.data.amount != null ? Number(t.data.amount) : null
        });

        await fetchWashes();
      }

      setTrash(cur => cur.filter(x => x._trashId !== trashId));

    } catch (e) {
      console.error("restoreItem failed:", e);
      alert("Échec restauration (voir console).");
    }
  }

  function purgeItem(trashId){
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");
    if (!askConfirm("Supprimer définitivement cet élément de la corbeille ?")) return;
    setTrash(cur => cur.filter(x => x._trashId !== trashId));
  }

  function purgeAll(){
    if (role !== "admin") return alert("Accès refusé (Admin seulement)");
    if (!askConfirm("Vider toute la corbeille ? (définitif)")) return;
    setTrash([]);
  }


  // Filters & search
  const [search,setSearch] = React.useState("");
  const [fVehicleId,setFVehicleId] = React.useState("all");
  const [fDriverId,setFDriverId] = React.useState("all");
  const [fromDate,setFromDate] = React.useState("");
  const [toDate,setToDate] = React.useState("");
  const [checkedItems,setCheckedItems] = React.useState(new Set());
  const [manualAmounts,setManualAmounts] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("fuel-recap-manual") || "{}"); }
    catch { return {}; }
  });
  const updateManualAmount = (key, val) => {
    setManualAmounts(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem("fuel-recap-manual", JSON.stringify(next));
      return next;
    });
  };
  const [showMonthlyRecap,setShowMonthlyRecap] = React.useState(false);
  const [recapMonth,setRecapMonth] = React.useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  });

  const filteredHistoryAll = React.useMemo(() => {
    const fuelItems = fills.map(f => {
      const v = vehicles.find(v => v.id === f.vehicleId);
      const d = drivers.find(d => d.id === f.driverId);
      return {
        type: "fuel",
        id: f.id,
        when: new Date(f.when),
        vehicleId: f.vehicleId,
        driverId:  f.driverId,
        immat: v?.immat || f.vLabel || "",
        nom:   d?.nom   || f.dLabel || "",
        km:    f.km,
        liters: f.liters,
        fuel:  f.fuel,
        l100:  f.l100,
        unit_price: f.price,
        cost: Number(f.price||0) * Number(f.liters||0),
        station: f.station || "",
        note: f.note || ""
      };
    });

    const washItems = washes.map(w => {
      const v = vehicles.find(v => v.immat === w.vehicle);
      const d = drivers.find(d => d.nom === w.driver);
      return {
        type: "wash",
        id: w.id,
        when: new Date(w.date),
        vehicleId: v?.id || "",
        driverId:  d?.id || "",
        immat: v?.immat || w.vehicle || "",
        nom:   d?.nom   || w.driver  || "",
        km: null,
        liters: null,
        fuel: null,
        l100: null,
        unit_price: null,
        cost: Number(w.amount || 0),
        station: w.vendor || "",
        note: w.note || "",
        wash_type: (w.wash_type || "").toLowerCase()
      };
    });

    const q = search.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate) : null;
    const to   = toDate   ? new Date(new Date(toDate).getTime() + 86400000) : null;

    return [...fuelItems, ...washItems]
      .filter(it => {
        if (fVehicleId === "all") return true;
        if (it.vehicleId === fVehicleId) return true;
        // Fallback: match by immat text when vehicleId is unresolved (e.g. washes)
        const selV = vehicles.find(v => v.id === fVehicleId);
        return selV && it.immat === selV.immat;
      })
      .filter(it => {
        if (fDriverId === "all") return true;
        if (it.driverId === fDriverId) return true;
        // Fallback: match by name text when driverId is unresolved (e.g. washes)
        const selD = drivers.find(d => d.id === fDriverId);
        return selD && it.nom === selD.nom;
      })
      .filter(it => {
        if (!q) return true;
        return it.immat.toLowerCase().includes(q) || it.nom.toLowerCase().includes(q);
      })
      .filter(it => {
        if (from && it.when < from) return false;
        if (to   && it.when > to)   return false;
        return true;
      })
      .sort((a,b) => b.when - a.when);
  }, [fills, washes, vehicles, drivers, search, fVehicleId, fDriverId, fromDate, toDate]);

  const fmtPrice = (x)=> money(x);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand" style={{display:"flex",alignItems:"center",gap:14}}>
          <img src={logoUrl} alt="Fuel Manager Pro" className="brand-logo" />
          <h1 style={{margin:0}}>Fuel Manager Pro</h1>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <span className="small">Connecté : <b>{session.username}</b> ({role})</span>
          <button onClick={onLogout}>Se déconnecter</button>
          <div className="theme-logos" style={{display:"flex",gap:14,alignItems:"center"}}>
            <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"}>
              <ThemeIcon mode={theme} />
            </button>
          </div>
        </div>
      </div>

      {(() => {
        const litersTotal = fills.reduce((s,f)=> s + Number(f.liters||0), 0);
        const costFuels   = fills.reduce((s,f)=> s + (Number(f.price||0) * Number(f.liters||0)), 0);
        const costWashes  = washes.reduce((s,w)=> s + Number(w.amount||0), 0);
        const costTotal   = costFuels + costWashes;
        return (
          <div className="card small">
            Litres: {litersTotal.toFixed(1)}
            {" • "}Coût total: {money(costTotal)}
            {" • "}Pleins: {fills.length}
            {" • "}Lavages: {washes.length}
          </div>
        );
      })()}


      <div className="tabs">
        {(role==="admin"
          ? ["plein","vehicule","chauffeur","autres","historique","corbeille","parametres"]
          : ["plein","vehicule","chauffeur","autres","historique"]
        ).map(t => (
          <button key={t} onClick={()=> tryOpenTab(t)}>
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {tab==="plein" && (
        <div className="card">
          <h3>Saisie d'un plein</h3>
          <div className="ctrls">
            <select value={pForm.vehicleId} onChange={e=> { const vid = e.target.value; const vv = vehicles.find(v=> v.id===vid); const map = getPriceMap(); setPForm(s=> ({...s, vehicleId:vid, fuel: vv?.fuel || s.fuel, price: (vv ? (map[vv.fuel] ?? s.price) : s.price)})); }}>
              <option value="">-- Véhicule --</option>
              {vehicles.map(v=> <option key={v.id} value={v.id}>{v.immat} {v.modele? "• "+v.modele : ""}</option>)}
            </select>
            <select value={pForm.driverId} onChange={e=> setPForm(s=> ({...s, driverId:e.target.value}))}>
              <option value="">-- Chauffeur --</option>
              {drivers.map(d=> <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <input type="datetime-local" value={pForm.when} onChange={e=> setPForm(s=> ({...s, when:e.target.value}))} />
            <input placeholder="Odomètre (km)" type="number" value={pForm.km} onChange={e=> setPForm(s=> ({...s, km:e.target.value}))}/>
            <input placeholder="Litres" type="number" value={pForm.liters} onChange={e=> setPForm(s=> ({...s, liters:e.target.value}))}/>
            <input value={(pForm.fuel||"").toUpperCase()} disabled readOnly />
            <input placeholder="Prix/L (CFA)" type="number" value={pForm.price} disabled readOnly />
            <input placeholder="Station" value={pForm.station} onChange={e=> setPForm(s=> ({...s, station:e.target.value}))}/>
          </div>
          <textarea placeholder="Note" value={pForm.note} onChange={e=> setPForm(s=> ({...s, note:e.target.value}))} style={{width:"100%",marginTop:8}} />
          <div style={{marginTop:12}}><button onClick={addFill}>Enregistrer le plein</button></div>

          <div style={{marginTop:16}}>
            <h4>Derniers pleins</h4>
            <table>
              <thead><tr><th>Date</th><th>Véhicule</th><th>Chauffeur</th><th>Km</th><th>Litres</th><th>Carb.</th><th>L/100</th><th>Prix/L</th><th>Coût</th><th></th></tr></thead>
              <tbody>
                {[...fills].sort((a,b)=> new Date(b.when)-new Date(a.when)).slice(0,6).map(f=>{
                  const v = vehicles.find(x=>x.id===f.vehicleId);
                  const d = drivers.find(x=>x.id===f.driverId);
                  return (
                    <tr key={f.id}>
                      <td>{new Date(f.when).toLocaleString()}</td>
                      <td>{v?.immat || f.vLabel}</td>
                      <td>{d?.nom || f.dLabel}</td>
                      <td className="num">{f.km}</td>
                      <td className="num">{f.liters}</td>
                      <td><span className={`badge fuel ${f.fuel}`}>{f.fuel==="essence" ? "ESSENCE" : "GASOIL"}</span></td>
                      <td className="num">{Number.isFinite(f.l100) ? f.l100 : "—"}</td>
                      <td className="num">{f.price ?? ""}</td>
                      <td className="num">{fmtPrice(Number(f.liters||0) * Number(f.price||0))}</td>
                      <td>
                        {role === "admin" && (
                          <>
                            <button
                              onClick={() => openEditFill(f)}
                              style={{ padding: "2px 6px", fontSize: "0.85em" }}
                            >
                              ✏️ Modifier
                            </button>
                            <button
                              onClick={() => deleteFill(f.id)}
                              style={{ marginLeft: 4, padding: "2px 6px", fontSize: "0.85em" }}
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="vehicule" && (
        <div className="card">
          <h3>Véhicules</h3>
          <div className="ctrls">
            <input placeholder="Immatriculation" value={vForm.immat} onChange={e=> setVForm(s=> ({...s, immat:e.target.value}))} disabled={( !(role==="admin"||role==="user") )}/>
            <input placeholder="Marque" value={vForm.marque} onChange={e=> setVForm(s=> ({...s, marque:e.target.value}))} disabled={( !(role==="admin"||role==="user") )}/>
            <input placeholder="Modèle" value={vForm.modele} onChange={e=> setVForm(s=> ({...s, modele:e.target.value}))} disabled={( !(role==="admin"||role==="user") )}/>
            <select value={vForm.fuel} onChange={e=> setVForm(s=> ({...s, fuel:e.target.value}))} disabled={( !(role==="admin"||role==="user") )}>
              <option value="essence">Essence</option>
              <option value="gasoil">Gasoil</option>
            </select>
            {(role==="admin"||role==="user") && <button onClick={addVehicle}>Ajouter</button>}
          </div>
          <table>
            <thead>
              <tr>
                <th>Immat</th>
                <th>Marque</th>
                <th>Modèle</th>
                <th>Carburant</th>
                <th>Conso moy (L/100)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(v => (
                <tr key={v.id}>
                  {editingVehicleId === v.id ? (
                    <>
                      <td><input value={vEdit.immat}  onChange={e=>setVEdit(s=>({...s, immat:e.target.value}))} /></td>
                      <td><input value={vEdit.marque} onChange={e=>setVEdit(s=>({...s, marque:e.target.value}))} /></td>
                      <td><input value={vEdit.modele} onChange={e=>setVEdit(s=>({...s, modele:e.target.value}))} /></td>
                      <td>
                        <select value={vEdit.fuel} onChange={e=>setVEdit(s=>({...s, fuel:e.target.value}))}>
                          <option value="gasoil">Gasoil</option>
                          <option value="essence">Essence</option>
                        </select>
                      </td>
                      <td>—</td>
                      <td>
                        <button onClick={saveEditVehicle}>💾 Enregistrer</button>
                        <button onClick={cancelEditVehicle}>❌ Annuler</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{v.immat}</td>
                      <td>{v.marque}</td>
                      <td>{v.modele}</td>
                      <td><span className={`badge fuel ${v.fuel}`}>{v.fuel==="essence" ? "ESSENCE" : "GASOIL"}</span></td>
                      <td>{avgL100(v.id) ?? "—"}</td>
                      <td>
                        {role === "admin" && (
                          <>
                            <button onClick={()=>startEditVehicle(v)}>✏️ Modifier</button>
                            <button onClick={()=>deleteVehicle(v.id)} style={{marginLeft:8}}>Supprimer</button>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="chauffeur" && (
        <div className="card">
          <h3>Chauffeurs</h3>
          <div className="ctrls">
            <input 
              placeholder="Nom chauffeur" 
              value={dForm.nom} 
              onChange={e=> setDForm({nom:e.target.value})} 
              disabled={!(role==="admin"||role==="user")}
            />
            {(role==="admin"||role==="user") && <button onClick={addDriver}>Ajouter</button>}
          </div>

          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id}>
                  {editingDriverId === d.id ? (
                    <>
                      <td>
                        <input 
                          value={dEdit.nom} 
                          onChange={e=>setDEdit(s=>({...s, nom:e.target.value}))}
                        />
                      </td>
                      <td>
                        <button onClick={saveEditDriver}>💾 Enregistrer</button>
                        <button onClick={cancelEditDriver}>❌ Annuler</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{d.nom}</td>
                      <td>
                        {role === "admin" && (
                          <>
                            <button onClick={()=>startEditDriver(d)}>✏️ Modifier</button>
                            <button onClick={()=>deleteDriver(d.id)} style={{marginLeft:8}}>Supprimer</button>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="historique" && (
        <div className="card">
          <h3>Historique</h3>

          <div className="ctrls">
            <input
              placeholder="Recherche (immat / chauffeur)"
              value={search}
              onChange={e=> setSearch(e.target.value)}
            />
            <select value={fVehicleId} onChange={e=> setFVehicleId(e.target.value)}>
              <option value="all">Tous véhicules</option>
              {vehicles.map(v=> <option key={v.id} value={v.id}>{v.immat}</option>)}
            </select>
            <select value={fDriverId} onChange={e=> setFDriverId(e.target.value)}>
              <option value="all">Tous chauffeurs</option>
              {drivers.map(d=> <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={e=> setFromDate(e.target.value)} />
            <input type="date" value={toDate} onChange={e=> setToDate(e.target.value)} />
            <button
              disabled={!fromDate || !toDate}
              onClick={() => {
                const f = new Date(new Date(fromDate).getTime() - 86400000);
                const t = new Date(new Date(toDate).getTime() - 86400000);
                setFromDate(f.toISOString().slice(0,10));
                setToDate(t.toISOString().slice(0,10));
              }}
              title="Jour précédent"
            >◀ Jour préc.</button>
            <button
              disabled={!fromDate || !toDate}
              onClick={() => {
                const f = new Date(new Date(fromDate).getTime() + 86400000);
                const t = new Date(new Date(toDate).getTime() + 86400000);
                setFromDate(f.toISOString().slice(0,10));
                setToDate(t.toISOString().slice(0,10));
              }}
              title="Jour suivant"
            >Jour suiv. ▶</button>
            <button
              onClick={() => {
                const today = new Date().toISOString().slice(0,10);
                setFromDate(today);
                setToDate(today);
              }}
              title="Aujourd'hui"
            >Aujourd'hui</button>
            <button
              onClick={() => {
                setSearch("");
                setFVehicleId("all");
                setFDriverId("all");
                setFromDate("");
                setToDate("");
              }}
              title="Réinitialiser tous les filtres"
            >Réinitialiser</button>
          </div>

          <div style={{marginTop:8, display:"flex", gap:8, alignItems:"center"}}>
            <button onClick={()=>exportCSV(filteredHistoryAll)}>Exporter CSV</button>
          </div>

          {/* Summary banner */}
          {(() => {
            const fuels = filteredHistoryAll.filter(x => x.type === "fuel");
            const totLiters = fuels.reduce((s, x) => s + Number(x.liters || 0), 0);
            const weightedCost = fuels.reduce((s, x) => s + (Number(x.unit_price || 0) * Number(x.liters || 0)), 0);
            const avgPrice = totLiters ? (weightedCost / totLiters) : 0;
            const totCost = filteredHistoryAll.reduce((s, x) => s + Number(x.cost || 0), 0);
            return (
              <div style={{
                display:"flex", flexWrap:"wrap", gap:16, padding:"10px 14px",
                marginTop:8, background:"var(--card-bg, #f8f9fa)", borderRadius:8,
                border:"1px solid var(--border, #dee2e6)", fontWeight:500
              }}>
                <span>Litres : <b>{totLiters.toFixed(1)}</b></span>
                <span>Prix moy/L : <b>{avgPrice ? avgPrice.toFixed(1) : "—"}</b></span>
                <span>Coût total : <b>{money(totCost)}</b></span>
                <span>Entrées : <b>{filteredHistoryAll.length}</b></span>
                <span>Pointés : <b>{filteredHistoryAll.filter(x => checkedItems.has(`${x.type}-${x.id}`)).length}/{filteredHistoryAll.length}</b></span>
              </div>
            );
          })()}

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{textAlign:"center"}}>
                    <input
                      type="checkbox"
                      title="Tout pointer / dépointer"
                      checked={filteredHistoryAll.length > 0 && filteredHistoryAll.every(x => checkedItems.has(`${x.type}-${x.id}`))}
                      onChange={e => {
                        setCheckedItems(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            filteredHistoryAll.forEach(x => next.add(`${x.type}-${x.id}`));
                          } else {
                            filteredHistoryAll.forEach(x => next.delete(`${x.type}-${x.id}`));
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Véhicule</th>
                  <th>Chauffeur</th>
                  <th>Km</th>
                  <th>Litres</th>
                  <th>Carb.</th>
                  <th>L/100</th>
                  <th>Prix/L</th>
                  <th>Coût</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryAll.map(it => {
                  const itemKey = `${it.type}-${it.id}`;
                  const isChecked = checkedItems.has(itemKey);
                  return (
                  <tr key={itemKey} style={isChecked ? {background:"var(--checked-row, #d4edda)"} : {}}>
                    <td style={{textAlign:"center"}}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          setCheckedItems(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(itemKey);
                            else next.delete(itemKey);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>{it.type === "fuel" ? "Plein" : washLabel(it.wash_type)}</td>
                    <td>{it.when instanceof Date ? it.when.toLocaleString() : new Date(it.when).toLocaleString()}</td>
                    <td>{it.immat}</td>
                    <td>{it.nom || "—"}</td>
                    <td className="num">{it.type==="fuel" ? it.km : "—"}</td>
                    <td className="num">{it.type==="fuel" ? it.liters : "—"}</td>

                    <td>
                      {it.type === "fuel" ? (
                        <span className={`badge fuel ${it.fuel}`}>
                          {(it.fuel || "").toUpperCase()}
                        </span>
                      ) : (
                        <span
                          className={`badge wash ${
                            it.wash_type === "huile"
                              ? "huile"
                              : it.wash_type === "simple"
                              ? "lavage-simple"
                              : it.wash_type === "complet"
                              ? "lavage-complet"
                              : "autres"
                          }`}
                        >
                          {washLabel(it.wash_type)}
                        </span>
                      )}
                    </td>

                    <td className="num">{it.type==="fuel" && Number.isFinite(it.l100) ? it.l100 : "—"}</td>
                    <td className="num">{it.type==="fuel" ? (it.unit_price ?? "") : "—"}</td>
                    <td className="num">{money(it.cost || 0)}</td>
                    <td>{it.note ? it.note : "—"}</td>

                    <td>
                      {role === "admin" && (
                        it.type === "fuel" ? (
                          <>
                            <button
                              onClick={() => {
                                const f = fills.find(ff => ff.id === it.id);
                                if (f) openEditFill(f);
                                else alert("Impossible de modifier : plein introuvable.");
                              }}
                              style={{ padding: "2px 6px", fontSize: "0.85em" }}
                            >
                              ✏️ Modifier
                            </button>
                            <button
                              onClick={() => deleteFill(it.id)}
                              style={{ marginLeft: 4, padding: "2px 6px", fontSize: "0.85em" }}
                            >
                              Supprimer
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openEditWash(it)}
                              style={{ padding: "2px 6px", fontSize: "0.85em" }}
                            >
                              ✏️ Modifier
                            </button>
                            <button
                              onClick={() => deleteWash(it.id)}
                              style={{ marginLeft: 4, padding: "2px 6px", fontSize: "0.85em" }}
                            >
                              Supprimer
                            </button>
                          </>
                        )
                      )}
                    </td>
                  </tr>
                  );
                })}

                <tr className="total-row">
                  <td colSpan={6}><b>Totaux (filtrés)</b></td>
                  <td className="num">
                    <b>{filteredHistoryAll
                          .filter(x=>x.type==="fuel")
                          .reduce((s,x)=> s + Number(x.liters||0), 0)
                          .toFixed(1)}</b>
                  </td>
                  <td></td>
                  <td></td>
                  <td className="num">
                    <b>{
                      (() => {
                        const fuels = filteredHistoryAll.filter(x=>x.type==="fuel");
                        const totLit = fuels.reduce((s,x)=> s + Number(x.liters||0), 0);
                        const weighted = fuels.reduce((s,x)=> s + (Number(x.unit_price||0) * Number(x.liters||0)), 0);
                        return totLit ? (weighted / totLit).toFixed(1) : "—";
                      })()
                    }</b>
                  </td>
                  <td className="num">
                    <b>{money(filteredHistoryAll.reduce((s,x)=> s + Number(x.cost||0), 0))}</b>
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Monthly recap toggle */}
          <div style={{marginTop:16}}>
            <button onClick={() => setShowMonthlyRecap(s => !s)}>
              {showMonthlyRecap ? "Masquer récap mensuel" : "Récap mensuel"}
            </button>
          </div>

          {showMonthlyRecap && (() => {
            const [recapYear, recapMo] = recapMonth.split("-").map(Number);
            const daysInMonth = new Date(recapYear, recapMo, 0).getDate();

            // Build all items (fuel + washes) for the selected month
            const monthStart = new Date(recapYear, recapMo - 1, 1);
            const monthEnd = new Date(recapYear, recapMo, 1);

            const allItems = [
              ...fills.map(f => ({
                type: "fuel",
                when: new Date(f.when),
                liters: Number(f.liters || 0),
                cost: Number(f.price || 0) * Number(f.liters || 0)
              })),
              ...washes.map(w => ({
                type: "wash",
                when: new Date(w.date),
                liters: 0,
                cost: Number(w.amount || 0)
              }))
            ].filter(it => it.when >= monthStart && it.when < monthEnd);

            // Group by day
            const byDay = {};
            for (let d = 1; d <= daysInMonth; d++) byDay[d] = { fills: 0, washes: 0, liters: 0, cost: 0 };
            for (const it of allItems) {
              const day = it.when.getDate();
              if (it.type === "fuel") { byDay[day].fills++; byDay[day].liters += it.liters; }
              else byDay[day].washes++;
              byDay[day].cost += it.cost;
            }

            const totals = { fills: 0, washes: 0, liters: 0, cost: 0 };
            for (let d = 1; d <= daysInMonth; d++) {
              totals.fills += byDay[d].fills;
              totals.washes += byDay[d].washes;
              totals.liters += byDay[d].liters;
              totals.cost += byDay[d].cost;
            }

            return (
              <div style={{marginTop:12}}>
                <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                  <label><b>Mois :</b></label>
                  <input type="month" value={recapMonth} onChange={e => setRecapMonth(e.target.value)} />
                </div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Nb pleins</th>
                        <th>Nb lavages/autres</th>
                        <th>Total litres</th>
                        <th>Coût système</th>
                        <th>Montant réel</th>
                        <th>Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({length: daysInMonth}, (_, i) => i + 1).map(d => {
                        const row = byDay[d];
                        const hasData = row.fills || row.washes;
                        const dayKey = `${recapYear}-${String(recapMo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                        const manualVal = manualAmounts[dayKey] ?? "";
                        const manualNum = Number(manualVal) || 0;
                        const diff = manualVal !== "" ? manualNum - row.cost : null;
                        return (
                          <tr key={d} style={hasData ? {} : {opacity: 0.4}}>
                            <td>{String(d).padStart(2,"0")}/{String(recapMo).padStart(2,"0")}/{recapYear}</td>
                            <td className="num">{row.fills || "—"}</td>
                            <td className="num">{row.washes || "—"}</td>
                            <td className="num">{row.liters ? row.liters.toFixed(1) : "—"}</td>
                            <td className="num">{row.cost ? money(row.cost) : "—"}</td>
                            <td className="num">
                              <input
                                type="number"
                                value={manualVal}
                                placeholder="—"
                                onChange={e => updateManualAmount(dayKey, e.target.value)}
                                style={{width:90, textAlign:"right", padding:"2px 4px"}}
                              />
                            </td>
                            <td className="num" style={diff !== null ? {
                              color: diff === 0 ? "green" : "red",
                              fontWeight: diff !== 0 ? "bold" : "normal"
                            } : {}}>
                              {diff !== null ? (diff >= 0 ? "+" : "") + money(diff) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {(() => {
                        let totalManual = 0;
                        let hasAnyManual = false;
                        for (let d = 1; d <= daysInMonth; d++) {
                          const dayKey = `${recapYear}-${String(recapMo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                          const v = manualAmounts[dayKey];
                          if (v !== undefined && v !== "") { totalManual += Number(v) || 0; hasAnyManual = true; }
                        }
                        const totalDiff = hasAnyManual ? totalManual - totals.cost : null;
                        return (
                          <tr className="total-row">
                            <td><b>Total {String(recapMo).padStart(2,"0")}/{recapYear}</b></td>
                            <td className="num"><b>{totals.fills}</b></td>
                            <td className="num"><b>{totals.washes}</b></td>
                            <td className="num"><b>{totals.liters.toFixed(1)}</b></td>
                            <td className="num"><b>{money(totals.cost)}</b></td>
                            <td className="num"><b>{hasAnyManual ? money(totalManual) : "—"}</b></td>
                            <td className="num" style={totalDiff !== null ? {
                              color: totalDiff === 0 ? "green" : "red",
                              fontWeight: "bold"
                            } : {}}>
                              <b>{totalDiff !== null ? (totalDiff >= 0 ? "+" : "") + money(totalDiff) : "—"}</b>
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {tab==="autres" && (
        <div className="card">
          <h3>Autres</h3>

          <div className="ctrls">
            <select
              value={wForm.vehicleId}
              onChange={e => setWForm(s => ({ ...s, vehicleId: e.target.value }))}
            >
              <option value="">-- Véhicule --</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.immat} {v.modele ? "• " + v.modele : ""}
                </option>
              ))}
            </select>

            <select
              value={wForm.driverId}
              onChange={e => setWForm(s => ({ ...s, driverId: e.target.value }))}
            >
              <option value="">-- Chauffeur (optionnel) --</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.nom}</option>
              ))}
            </select>

            <input
              type="datetime-local"
              value={wForm.when}
              onChange={e => setWForm(s => ({ ...s, when: e.target.value }))}
            />

            <select
              value={wForm.wash_type}
              onChange={e => setWForm(s => ({ ...s, wash_type: e.target.value }))}
            >
              <option value="simple">Lavage simple</option>
              <option value="complet">Lavage complet</option>
              <option value="huile">Huile</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Montant (CFA)"
              value={wForm.amount}
              onChange={e => setWForm(s => ({ ...s, amount: e.target.value }))}
            />
            <input
              placeholder="Centre / Lieu (optionnel)"
              value={wForm.vendor}
              onChange={e => setWForm(s => ({ ...s, vendor: e.target.value }))}
            />

            <input
              placeholder="Note (optionnel)"
              value={wForm.note}
              onChange={e => setWForm(s => ({ ...s, note: e.target.value }))}
              style={{width: 220}}
            />

            <button onClick={addWash}>Enregistrer le lavage</button>
          </div>

          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Véhicule</th>
                <th>Chauffeur</th>
                <th>Type</th>
                <th>Montant</th>
                <th>Centre</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {washes.map(w => {
                const v = vehicles.find(x => x.immat === w.vehicle);
                const d = drivers.find(x => x.nom === w.driver);
                return (
                  <tr key={w.id}>
                    <td>{new Date(w.date).toLocaleString()}</td>
                    <td>{v?.immat || w.vehicle}</td>
                    <td>{d?.nom || w.driver || "—"}</td>
                    <td>
                      <span className={`badge ${washClass(w.wash_type)}`}>
                        {washLabel(w.wash_type)}
                      </span>
                    </td>
                    <td>{w.amount != null ? money(Number(w.amount)) : "—"}</td>
                    <td>{w.vendor || "—"}</td>
                    <td>{w.note || "—"}</td>
                    <td>
                      {role === "admin" && (
                        <>
                          <button onClick={() => openEditWash(w)}>
                            Modifier
                          </button>
                          <button
                            onClick={() => deleteWash(w)}
                            style={{ marginLeft: 6 }}
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {washes.length === 0 && (
                <tr>
                  <td colSpan="8" style={{textAlign:"center", opacity:0.7}}>
                    Aucun enregistrement
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab==="corbeille" && role==="admin" && (
        <div className="card">
          <h3>Corbeille</h3>
          <div className="ctrls">
            <button onClick={purgeAll}>Vider la corbeille</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Détails</th>
                <th>Supprimé</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {trash.map(t => {
                let details = "";
                if (t.type === "vehicle") {
                  details = t.data.immat;
                } else if (t.type === "driver") {
                  details = t.data.nom;
                } else if (t.type === "fill") {
                  const when = t.data.when || t.data.date;
                  details = `${t.data.liters} L • ${new Date(when).toLocaleString()}`;
                } else if (t.type === "wash") {
                  const when = t.data.when || t.data.date;
                  const label = t.data.wash_type === "huile"
                    ? "Huile"
                    : t.data.wash_type === "simple"
                    ? "Lavage simple"
                    : t.data.wash_type === "complet"
                    ? "Lavage complet"
                    : "Autres";
                  details = `${label} • ${t.data.vehicle || ""} • ${new Date(when).toLocaleString()}`;
                }

                return (
                  <tr key={t._trashId}>
                    <td>{t.type}</td>
                    <td>{details}</td>
                    <td>{new Date(t.deletedAt).toLocaleString()}</td>
                    <td>
                      <button onClick={() => restoreItem(t._trashId)}>Restaurer</button>
                      <button onClick={() => purgeItem(t._trashId)} style={{ marginLeft: 8 }}>
                        Supprimer déf.
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab==="parametres" && role==="admin" && (
        <div className="card">
          <h3>Paramètres</h3>
          <div className="small" style={{marginTop:8}}><b>Prix carburant (CFA/L)</b></div>
          <div className="ctrls">
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <label style={{marginRight:6}}>Essence :</label>
              <input
                type="number"
                value={priceDraft.essence}
                onChange={e=> setPriceDraft(s=> ({...s, essence: Number(e.target.value||0)}))}
                placeholder="Essence (CFA/L)"
              />
              <label style={{marginLeft:16,marginRight:6}}>Gasoil :</label>
              <input
                type="number"
                value={priceDraft.gasoil}
                onChange={e=> setPriceDraft(s=> ({...s, gasoil: Number(e.target.value||0)}))}
                placeholder="Gasoil (CFA/L)"
              />
            </div>
          </div>

          <div style={{marginTop:8}}>
            <button onClick={()=>{
              const cur = getPriceMap();
              const next = { essence: Number(priceDraft.essence||0), gasoil: Number(priceDraft.gasoil||0) };
              if(cur.essence !== next.essence) pushPriceHistory("essence", next.essence);
              if(cur.gasoil !== next.gasoil) pushPriceHistory("gasoil", next.gasoil);
              setPriceMap(next);
              setPForm(s=> ({...s, price: next[s.fuel]||s.price}));
              alert("Prix carburant mis à jour ✅");
            }}>Valider</button>
          </div>

          <div style={{marginTop:8}} className="small">Historique des prix (récent → ancien)</div>
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Prix</th></tr>
            </thead>
            <tbody>
              {(JSON.parse(localStorage.getItem(FUEL_PRICE_HIST)||"[]")).map((h,i)=> (
                <tr key={i}>
                  <td>{new Date(h.when).toLocaleString()}</td>
                  <td>{h.kind.toUpperCase()}</td>
                  <td>{money(h.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Bouton réinitialiser masqué (trop dangereux) */}
        </div>
      )}

      {/* === MODALE D'ÉDITION PLEIN === */}
      {editingFill && (
        <div
          className="modal-backdrop"
          onClick={closeEditFill}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 999999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "10vh",
            overflowY: "auto",
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme === "dark" ? "#1e1e1e" : "#fff",
              color: theme === "dark" ? "#fff" : "#000",
              padding: 24,
              borderRadius: 10,
              width: 440,
              maxWidth: "95vw",
              boxShadow: "0 8px 25px rgba(0,0,0,0.5)",
              position: "relative",
            }}
          >
            <h3 style={{marginBottom:10}}>Modifier le plein</h3>

            <form onSubmit={saveEditFill} style={{display:"grid", gap:10}}>
              <select
                value={editForm.vehicleId}
                onChange={(e) => setEditForm(s => ({ ...s, vehicleId: e.target.value }))}
              >
                <option value="">-- Véhicule --</option>
                {vehicles.map(v => <option key={v.id} value={String(v.id)}>{v.immat}</option>)}
              </select>

              <select
                value={editForm.driverId}
                onChange={(e) => setEditForm(s => ({ ...s, driverId: e.target.value }))}
              >
                <option value="">-- Chauffeur --</option>
                {drivers.map(d => <option key={d.id} value={String(d.id)}>{d.nom}</option>)}
              </select>

              <input
                type="datetime-local"
                value={editForm.when}
                onChange={(e) => setEditForm(s => ({ ...s, when: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Odomètre (km)"
                value={editForm.km}
                onChange={(e) => setEditForm(s => ({ ...s, km: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Litres"
                value={editForm.liters}
                onChange={(e) => setEditForm(s => ({ ...s, liters: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Prix/L (CFA)"
                value={editForm.price}
                onChange={(e) => setEditForm(s => ({ ...s, price: e.target.value }))}
              />

              <select
                value={editForm.fuel}
                onChange={(e) => setEditForm(s => ({ ...s, fuel: e.target.value }))}
              >
                <option value="gasoil">Gasoil</option>
                <option value="essence">Essence</option>
              </select>

              <input
                placeholder="Station"
                value={editForm.station}
                onChange={(e) => setEditForm(s => ({ ...s, station: e.target.value }))}
              />
              <textarea
                placeholder="Note"
                value={editForm.note}
                onChange={(e) => setEditForm(s => ({ ...s, note: e.target.value }))}
                style={{minHeight:70}}
              />

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="submit">💾 Enregistrer</button>
                <button type="button" onClick={closeEditFill}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === MODALE D'ÉDITION LAVAGE === */}
      {editingWash && (
        <div
          className="modal-backdrop"
          onClick={closeEditWash}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 999999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "10vh",
            overflowY: "auto",
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme === "dark" ? "#1e1e1e" : "#fff",
              color: theme === "dark" ? "#fff" : "#000",
              padding: 24,
              borderRadius: 10,
              width: 440,
              maxWidth: "95vw",
              boxShadow: "0 8px 25px rgba(0,0,0,0.5)",
              position: "relative",
            }}
          >
            <h3 style={{marginBottom:10}}>Modifier le lavage / huile</h3>

            <form onSubmit={saveEditWash} style={{display:"grid", gap:10}}>
              <select
                value={editWashForm.vehicleId}
                onChange={(e) =>
                  setEditWashForm(s => ({ ...s, vehicleId: e.target.value }))
                }
              >
                <option value="">-- Véhicule --</option>
                {vehicles.map(v => (
                  <option key={v.id} value={String(v.id)}>
                    {v.immat}
                  </option>
                ))}
              </select>

              <select
                value={editWashForm.driverId}
                onChange={(e) =>
                  setEditWashForm(s => ({ ...s, driverId: e.target.value }))
                }
              >
                <option value="">-- Chauffeur --</option>
                {drivers.map(d => (
                  <option key={d.id} value={String(d.id)}>
                    {d.nom}
                  </option>
                ))}
              </select>

              <input
                type="datetime-local"
                value={editWashForm.when}
                onChange={(e) =>
                  setEditWashForm(s => ({ ...s, when: e.target.value }))
                }
              />

              <select
                value={editWashForm.wash_type}
                onChange={(e) =>
                  setEditWashForm(s => ({ ...s, wash_type: e.target.value }))
                }
              >
                <option value="simple">Lavage simple</option>
                <option value="complet">Lavage complet</option>
                <option value="huile">Huile</option>
                <option value="autre">Autre</option>
              </select>

              <input
                type="number"
                min="0"
                step="0.01"
                value={editWashForm.amount}
                onChange={(e) =>
                  setEditWashForm(s => ({ ...s, amount: e.target.value }))
                }
                placeholder="Montant"
              />

              <input
                value={editWashForm.vendor}
                onChange={(e) =>
                  setEditWashForm(s => ({ ...s, vendor: e.target.value }))
                }
                placeholder="Centre / station / fournisseur"
              />

              <textarea
                rows={3}
                value={editWashForm.note}
                onChange={(e) =>
                  setEditWashForm(s => ({ ...s, note: e.target.value }))
                }
                placeholder="Note"
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button type="button" onClick={closeEditWash}>
                  Annuler
                </button>
                <button type="submit" className="primary">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
