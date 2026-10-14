import { deleteApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const configForm = $("config-form");
const connectButton = $("connect-button");
const signInButton = $("signin-button");
const signOutButton = $("signout-button");
const verifyButton = $("verify-button");
const configStatus = $("config-status");
const signInStatus = $("signin-status");
const verifyStatus = $("verify-status");
const accountSummary = $("account-summary");
const result = $("result");

let firebaseApp;
let auth;
let currentUser;
let apiOrigin;

function setStatus(element, message, state = "neutral") {
  element.textContent = message;
  element.dataset.state = state;
}

function showResult(message, data) {
  result.textContent = data === undefined
    ? message
    : message + "\n" + JSON.stringify(data, null, 2);
}

function readConfig() {
  const value = (id) => $(id).value.trim();
  const config = {
    apiKey: value("api-key"),
    authDomain: value("auth-domain"),
    projectId: value("project-id"),
    appId: value("app-id")
  };
  apiOrigin = value("api-origin").replace(/\/$/, "");
  let parsedOrigin;
  try {
    const parsed = new URL(apiOrigin);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error("API origin must be an origin only, without path/query.");
    }
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost)) {
      throw new Error("Use HTTPS; HTTP is allowed only for localhost development.");
    }
    parsedOrigin = parsed.origin;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid API origin.");
  }
  apiOrigin = parsedOrigin;
  for (const [key, field] of Object.entries({
    apiKey: "Web API key",
    authDomain: "Auth domain",
    projectId: "Project ID",
    appId: "App ID"
  })) {
    if (!config[key]) throw new Error(field + " wajib diisi.");
  }
  if (config.projectId !== config.projectId.trim()) {
    throw new Error("Project ID tidak valid.");
  }
  return config;
}

function setSignedInState() {
  const signedIn = Boolean(currentUser && auth);
  signInButton.disabled = !auth || signedIn;
  signOutButton.disabled = !signedIn;
  verifyButton.disabled = !signedIn;
  accountSummary.hidden = !signedIn;
  if (signedIn) {
    accountSummary.textContent = "Masuk sebagai " + (currentUser.displayName || currentUser.email || "akun Google") +
      ". ID token tidak ditampilkan dan tidak disimpan oleh halaman ini.";
  } else {
    accountSummary.textContent = "";
  }
}

configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  connectButton.disabled = true;
  try {
    const config = readConfig();
    if (firebaseApp) {
      await signOut(auth).catch(() => undefined);
      await deleteApp(firebaseApp).catch(() => undefined);
    }
    firebaseApp = initializeApp(config, "beelka-staging-smoke");
    auth = getAuth(firebaseApp);
    await setPersistence(auth, inMemoryPersistence);
    currentUser = null;
    setSignedInState();
    setStatus(configStatus, "Konfigurasi valid secara sintaks; belum menguji kredensial Google.", "success");
    setStatus(signInStatus, "Siap untuk Google sign-in.");
    setStatus(verifyStatus, "Login lebih dulu untuk menguji backend.");
    showResult("Konfigurasi disiapkan. Klik “Masuk dengan Google”.");
  } catch (error) {
    auth = undefined;
    currentUser = undefined;
    setSignedInState();
    setStatus(configStatus, error instanceof Error ? error.message : "Konfigurasi tidak valid.", "error");
  } finally {
    connectButton.disabled = false;
  }
});

signInButton.addEventListener("click", async () => {
  if (!auth) return;
  signInButton.disabled = true;
  setStatus(signInStatus, "Menunggu autentikasi Google…");
  try {
    const credential = await signInWithPopup(auth, new GoogleAuthProvider());
    currentUser = credential.user;
    setSignedInState();
    setStatus(signInStatus, "Google sign-in berhasil.", "success");
    setStatus(verifyStatus, "Siap memverifikasi ID token ke API.");
    showResult("Google sign-in berhasil. ID token tetap disembunyikan.");
  } catch (error) {
    setStatus(signInStatus, error instanceof Error ? error.message : "Google sign-in gagal.", "error");
    showResult("Google sign-in gagal.");
  } finally {
    setSignedInState();
  }
});

signOutButton.addEventListener("click", async () => {
  if (!auth) return;
  try {
    await signOut(auth);
    currentUser = null;
    setSignedInState();
    setStatus(signInStatus, "Sesi pengujian telah ditutup.", "success");
    setStatus(verifyStatus, "Login lebih dulu untuk menguji backend.");
    showResult("Keluar berhasil. Token tidak disimpan oleh halaman.");
  } catch {
    setStatus(signInStatus, "Keluar gagal. Tutup tab setelah mengamankan sesi.", "error");
  }
});

verifyButton.addEventListener("click", async () => {
  if (!currentUser || !apiOrigin) return;
  verifyButton.disabled = true;
  setStatus(verifyStatus, "Memverifikasi token dengan API Beelka…");
  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(apiOrigin + "/api/v1/auth/me", {
      method: "GET",
      headers: { Authorization: "Bearer " + idToken },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.authenticated === true) {
      setStatus(verifyStatus, "LULUS — API memverifikasi ID token.", "success");
      showResult("Backend authentication verified.", {
        httpStatus: response.status,
        authenticated: true,
        requestId: body.requestId ?? response.headers.get("x-request-id") ?? null
      });
    } else {
      setStatus(verifyStatus, "GAGAL — API menolak autentikasi atau konfigurasinya belum lengkap.", "error");
      showResult("Backend authentication failed.", {
        httpStatus: response.status,
        errorCode: body?.error?.code ?? "INVALID_RESPONSE",
        message: body?.error?.message ?? "No usable JSON error was returned.",
        corsHint: response.status === 0
          ? "Periksa BEELKA_CORS_ORIGINS dan origin halaman ini."
          : undefined
      });
    }
  } catch (error) {
    setStatus(verifyStatus, "Tidak dapat mencapai API.", "error");
    showResult(error instanceof Error ? error.message : "Request failed.", {
      hint: "Pastikan API aktif, project ID dan ADC benar, HTTPS digunakan di staging, dan origin halaman masuk dalam BEELKA_CORS_ORIGINS."
    });
  } finally {
    setSignedInState();
  }
});

setSignedInState();
