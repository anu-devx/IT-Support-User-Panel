import { PORTAL } from "./portal";

// Where the backend lives.
//  - Empty VITE_API_BASE_URL: same origin (/api). Used in local development
//    (Vite proxies /api to the backend) or when hosting rewrites /api.
//  - Set VITE_API_BASE_URL (e.g. https://it-support-api.onrender.com) when the
//    panel and the backend are deployed separately on different domains.
// Only a real http(s) URL is accepted. Anything else (empty, a placeholder, or
// a mis-parsed .env line such as 'VITE_DEV_API_TARGET="..."') falls back to
// same-origin /api, which the Vite dev proxy forwards to the backend.
function cleanBaseUrl(value) {
  const v = String(value || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  if (/^https?:\/\/[^\s"']+$/i.test(v) && !/YOUR-BACKEND-URL/.test(v)) return v;
  if (v) console.warn(`Ignoring invalid VITE_API_BASE_URL "${v}"; using same-origin /api.`);
  return "";
}
export const API_BASE_URL = cleanBaseUrl(import.meta.env.VITE_API_BASE_URL);
export const apiUrl = (path) => API_BASE_URL + "/api" + path;

// Cross-domain deployments use a bearer token instead of cookies, because
// browsers block third-party cookies (Safari always, Chrome increasingly).
const CROSS_ORIGIN = (() => {
  if (!API_BASE_URL) return false;
  try {
    return new URL(API_BASE_URL).origin !== window.location.origin;
  } catch {
    return true;
  }
})();
// Token mode needs no cookies, so cross-domain requests omit credentials
// (simpler CORS, works with any proxy or emulator in front of the API).
export const CREDENTIALS = CROSS_ORIGIN ? "omit" : "include";
const TOKEN_KEY = `it-support-${PORTAL}-session`;
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable: the session lasts until the page is closed.
  }
}

// Headers every API request needs (also used for the admin live stream).
export function authHeaders() {
  const headers = {
    // Tells the server which panel's session to use, so the user and admin
    // panels stay signed in/out independently.
    "X-Portal": PORTAL,
  };
  if (CROSS_ORIGIN) {
    headers["X-Auth-Mode"] = "token";
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
  }
  return headers;
}

// Credential endpoints return 401/403 for wrong passwords; those must not be
// treated as "your session expired".
const CREDENTIAL_PATHS = ["/auth/login", "/auth/signup", "/auth/forgot-password", "/auth/reset-password", "/auth/logout"];

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(apiUrl(path), {
      credentials: CREDENTIALS,
      ...options,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers },
    });
  } catch {
    throw new Error("Cannot reach the server. Check your connection or the API URL (VITE_API_BASE_URL).");
  }
  const data = await res.json().catch(() => ({}));
  if (path === "/auth/logout") setToken(null);
  if (!res.ok) {
    const credentialCall = CREDENTIAL_PATHS.includes(path);
    const lostAdmin = PORTAL === "admin" && res.status === 403 && data.message === "Administrator access required";
    if (!credentialCall && (res.status === 401 || lostAdmin)) {
      setToken(null);
      window.dispatchEvent(new Event("session-expired"));
    }
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  if (data.token) setToken(data.token);
  return data;
}
