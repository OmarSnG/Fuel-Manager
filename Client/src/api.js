// api.js — Appels API avec gestion du token d'authentification
// CORRIGÉ: URL du backend configurée correctement

// ---- Configuration de l'URL du backend ----
// En développement (Vite), on pointe vers le serveur backend
// En production (build servi par le backend), on utilise la même origine
const API_BASE = import.meta.env.DEV 
  ? "http://192.168.1.44:4000"  // URL du backend en développement
  : "http://192.168.1.44:4000";   // PROD = absolute URL (client servi separement)

// ---- Gestion du token ----
const TOKEN_KEY = "fuel-auth-token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (e) {
    console.error("setToken error:", e);
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.error("clearToken error:", e);
  }
}

// ---- Helper fetch avec auth ----
async function apiFetch(url, options = {}) {
  const token = getToken();
  
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  let response;
  try {
    response = await fetch(API_BASE + url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    console.error("Network error:", networkError);
    throw new Error("Impossible de contacter le serveur. Vérifiez que le backend est démarré.");
  }
  
  // Si 401, le token est invalide/expiré
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent("auth:expired"));
    throw new Error("Session expirée");
  }
  
  // Lire le corps de la réponse
  const text = await response.text();
  
  // Essayer de parser en JSON
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (parseError) {
    console.error("JSON parse error:", parseError, "Response text:", text);
    throw new Error("Réponse invalide du serveur");
  }
  
  if (!response.ok) {
    const error = new Error(data.error || `Erreur HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  
  return data;
}

// ---- Auth ----
export async function apiLogin(username, password) {
  let response;
  try {
    response = await fetch(API_BASE + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch (networkError) {
    console.error("Login network error:", networkError);
    throw new Error("Impossible de contacter le serveur. Vérifiez que le backend est démarré sur le port 4000.");
  }
  
  // Lire le corps de la réponse
  const text = await response.text();
  
  // Essayer de parser en JSON
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (parseError) {
    console.error("Login JSON parse error:", parseError, "Response text:", text);
    throw new Error("Réponse invalide du serveur");
  }
  
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Identifiants invalides");
  }
  
  // Stocker le token
  if (data.token) {
    setToken(data.token);
  }
  
  return data;
}

export async function apiLogout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch (e) {
    // Ignorer les erreurs de logout
  }
  clearToken();
}

// ---- REFUELS ----
export async function listRefuels(limit = 500, offset = 0) {
  return apiFetch(`/api/refuels?limit=${limit}&offset=${offset}`);
}

export async function createRefuel(data) {
  return apiFetch("/api/refuels", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRefuel(id, data) {
  return apiFetch(`/api/refuels/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteRefuel(id) {
  return apiFetch(`/api/refuels/${id}`, {
    method: "DELETE",
  });
}

// ---- VEHICLES ----
export async function listVehicles() {
  return apiFetch("/api/vehicles");
}

export async function createVehicle(data) {
  return apiFetch("/api/vehicles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateVehicle(id, data) {
  return apiFetch(`/api/vehicles/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteVehicle(id) {
  return apiFetch(`/api/vehicles/${id}`, {
    method: "DELETE",
  });
}

// ---- DRIVERS ----
export async function listDrivers() {
  return apiFetch("/api/drivers");
}

export async function createDriver(data) {
  return apiFetch("/api/drivers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateDriver(id, data) {
  return apiFetch(`/api/drivers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteDriver(id) {
  return apiFetch(`/api/drivers/${id}`, {
    method: "DELETE",
  });
}

// ---- WASHES ----
export async function listWashes(limit = 500, offset = 0) {
  return apiFetch(`/api/washes?limit=${limit}&offset=${offset}`);
}

export async function createWash(data) {
  return apiFetch("/api/washes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateWash(id, data) {
  return apiFetch(`/api/washes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteWash(id) {
  return apiFetch(`/api/washes/${id}`, {
    method: "DELETE",
  });
}

// ---- HEALTH ----
export async function checkHealth() {
  try {
    const res = await fetch(API_BASE + "/api/health");
    return res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
