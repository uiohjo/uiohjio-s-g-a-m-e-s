'use strict';

const el = (id) => document.getElementById(id);

const toast    = el("toast");
const titleEl  = el("toast-title");
const subEl    = el("toast-sub");
const imgEl    = el("toast-img");
const controls = el("toast-controls");
const hotspot  = el("toast-hotspot");

const bgA = document.getElementById("bgA");
const bgB = document.getElementById("bgB");

let lastTrackId = null;
let lastToastData = null;
let timer;
let hideAfterHoverTimer = null;
let bgFlip = false;

/* =========================================
   Ambient site music (fallback when no Spotify)
   ========================================= */
const AMBIENT_TRACKS = [
  // TODO: replace with your files/paths
  "audio/Wii_U_Menu_Music_-_Mii Maker_(Part 2).mp3",
  "audio/03_-_System_Music_-_First_Time_Setup_(TV).mp3",
   "audio/Transfer_Menu.mp3", 
   "audio/eShop_Menu_(Track 1).mp3",
   "audio/WiiU_Chat_Lobby_(TV).mp3",
   "audio/eShop_Menu_(Track 6).mp3",
   "audio/Registration_Method_(Gamepad).mp3"
];
const AMBIENT_PREF_KEY = "ambient_pref"; // "on" | "off"
const AMBIENT_VOL_KEY  = "ambient_vol";  // "0.0".."1.0"

const ambient = {
  audio: null,
  idx: 0,
  fadeTimer: null,
  ui: null,
  isEnabled: true,     // default: ON (user can toggle)
  isVisible: false,    // button visible only when Spotify is NOT connected
  volume: 0.35,

  ensureUIButton() {
    // try to find existing button; if not, create one next to spotify button
    let btn = document.getElementById('ambient-toggle');
    if (!btn) {
      const sibling = document.getElementById('spotify-connect');
      btn = document.createElement('button');
      btn.id = 'ambient-toggle';
      btn.hidden = true;
      btn.textContent = "🔈 Site Music";
      // place right after the spotify button if we can
      sibling?.parentNode?.insertBefore(btn, sibling.nextSibling);
    }
    return btn;
  },

  init(){
    this.ui = this.ensureUIButton();
    if (!this.ui) return;

    // restore prefs
    const pref = localStorage.getItem(AMBIENT_PREF_KEY);
    if (pref) this.isEnabled = pref === "on";
    const v = parseFloat(localStorage.getItem(AMBIENT_VOL_KEY) || "0.35");
    if (!Number.isNaN(v)) this.volume = Math.min(1, Math.max(0, v));

    // prepare audio element
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.volume = 0;
    this.audio.addEventListener("ended", () => this.next());
    this.pickSource();

    // UI wiring
    this.ui.addEventListener("click", () => {
      if (!this.isEnabled) {
        this.isEnabled = true;
        localStorage.setItem(AMBIENT_PREF_KEY, "on");
        this.playWithGesture();
      } else {
        this.isEnabled = false;
        localStorage.setItem(AMBIENT_PREF_KEY, "off");
        this.fadeOut(220);
      }
      this.updateUI();
    });

    // first-gesture bootstrap (for autoplay policies)
    const oneTimeStart = () => {
      if (this.isVisible && this.isEnabled && this.audio?.paused) {
        this.playWithGesture();
      }
      window.removeEventListener("pointerdown", oneTimeStart, {capture:true});
      window.removeEventListener("keydown", oneTimeStart, {capture:true});
    };
    window.addEventListener("pointerdown", oneTimeStart, {capture:true, once:true});
    window.addEventListener("keydown", oneTimeStart, {capture:true, once:true});

    this.updateUI();
  },

  setVisible(show){
    this.isVisible = !!show;
    if (!this.ui) return;
    this.ui.hidden = !show;
    if (!show) {
      this.fadeOut(200);
    } else {
      this.updateUI();
    }
  },

  updateUI(){
    if (!this.ui) return;
    this.ui.setAttribute("aria-pressed", String(this.isEnabled));
    this.ui.textContent = this.isEnabled ? "🔊 Site Music" : "🔈 Site Music";
  },

  pickSource(){
    if (!AMBIENT_TRACKS.length || !this.audio) return;
    if (this.idx >= AMBIENT_TRACKS.length) this.idx = 0;
    this.audio.src = AMBIENT_TRACKS[this.idx];
  },

  next(){
    this.idx = (this.idx + 1) % AMBIENT_TRACKS.length;
    this.pickSource();
    if (this.isEnabled) this.safePlay();
  },

  async playWithGesture(){
    await this.safePlay();
    this.fadeTo(this.volume, 250);
  },

  async safePlay(){
    try { await this.audio.play(); } catch { /* blocked until next gesture */ }
  },

  fadeTo(target, ms=250){
    if (!this.audio) return;
    clearInterval(this.fadeTimer);
    const start = this.audio.volume;
    const delta = target - start;
    const steps = Math.max(1, Math.round(ms / 16));
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      const v = start + (delta * (i/steps));
      this.audio.volume = Math.min(1, Math.max(0, v));
      if (i >= steps) clearInterval(this.fadeTimer);
    }, 16);
  },

  fadeOut(ms=200){
    this.fadeTo(0, ms);
    setTimeout(() => { try { this.audio.pause(); } catch {} }, ms + 20);
  }
};

/* ===== Idle / Screensaver handles ===== */
const idleOverlay = el('idle-overlay');
const idleArt     = el('idle-art');
const idleTitle   = el('idle-title');
const idleArtist  = el('idle-artist');

let idleTimer = null;
const IDLE_TIMEOUT_MS = 60000;

function updateIdleOverlayFromTrack(title, artistsCsv, artUrl) {
  if (idleTitle)  idleTitle.textContent  = title || 'Nothing playing';
  if (idleArtist) idleArtist.textContent = artistsCsv || '—';
  if (idleArt && artUrl) idleArt.src = artUrl;
}
function enterIdle() {
  if (document.body.classList.contains('idle')) return;
  if (lastToastData) {
    updateIdleOverlayFromTrack(lastToastData.title, lastToastData.artists, lastToastData.art);
  }
  document.body.classList.add('idle');
  idleOverlay?.classList.add('is-visible');
}
function exitIdle() {
  if (!document.body.classList.contains('idle')) return;
  document.body.classList.remove('idle');
  idleOverlay?.classList.remove('is-visible');
}
function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const iframe = document.getElementById('game-iframe');
    const overGame = iframe && iframe.offsetParent !== null && document.activeElement === iframe;
    if (!overGame) enterIdle();
  }, IDLE_TIMEOUT_MS);
}
function resetIdle() {
  exitIdle();
  scheduleIdle();
}

/* -------------------------------
   Jamie Page motif logic (robust)
-------------------------------- */
const JAMIE_PAGE_TITLES = new Set([
  "dyad","not quite there","rot for clout","i wish that i could fall",
  "cadmium colors","breeze blows","liaison","object of affection","clouddrop",
  "my darling my companion","machine love","birdbrain","shiny chariot",
  "strawberry","manifesto","dance delightful"
]);
const JAMIE_MOTIF =
  "baby do you know what you wanna hear, cause you can hear the word make it oh so clear";

function norm(s){ return (s||"").toLowerCase().trim(); }

function isJamieArtist(artistsArr){
  return (artistsArr || []).some(a => /\bjamie\s+pa(i)?ge\b/i.test(a?.name || ""));
}
function isJamieTrack(spotifyItem){
  const title = norm(spotifyItem?.name);
  return isJamieArtist(spotifyItem?.artists) && JAMIE_PAGE_TITLES.has(title);
}
function setPlayHeading(motifOn){
  const playH2 = document.querySelector('.card__header .card__title');
  if(!playH2) return;
  if (!playH2.dataset.defaultText) playH2.dataset.defaultText = playH2.textContent;
  playH2.textContent = motifOn ? JAMIE_MOTIF : playH2.dataset.defaultText;
  playH2.classList.toggle('motif', !!motifOn);
}
function applyMotifFromNowPlayingItem(item){
  setPlayHeading(!!item && isJamieTrack(item));
}
/* -------------------------------
   Spotify token refresher (PKCE)
-------------------------------- */
async function getAccessToken() {
  const exp = +localStorage.getItem("sp_expires_at") || 0;
  if (Date.now() < exp) return localStorage.getItem("sp_access_token");

  const refresh = localStorage.getItem("sp_refresh_token");
  if (!refresh) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: "f5792dc487ef45d2a16dc2e21dbf427e"
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) return null;

  const tok = await r.json();
  localStorage.setItem("sp_access_token", tok.access_token);
  localStorage.setItem("sp_expires_at", String(Date.now() + (tok.expires_in - 60) * 1000));
  return tok.access_token;
}

/* -------------------------------
   Background helpers
-------------------------------- */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function setBgLayer(elm, url) {
  const x = rand(20, 80);
  const y = rand(20, 80);
  elm.style.backgroundImage = `url("${url}")`;
  elm.style.backgroundPosition = `${x}% ${y}%`;
}
function updateBackground(artUrl) {
  if (!artUrl || !(bgA && bgB)) return;
  const img = new Image();
  img.onload = () => {
    const next = bgFlip ? bgA : bgB;
    const prev = bgFlip ? bgB : bgA;
    setBgLayer(next, artUrl);
    next.classList.remove("hidden");
    prev.classList.add("hidden");
    bgFlip = !bgFlip;
  };
  img.src = artUrl;
}

/* -------------------------------
   Spotify polling + toast
-------------------------------- */
async function poll() {
  const token = await getAccessToken();
  if (!token) return;

  const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (r.status === 204) { setPlayHeading(false); return; }
  if (!r.ok) return;

  const data = await r.json();
  if (!data?.item || !data.is_playing) { setPlayHeading(false); return; }

  applyMotifFromNowPlayingItem(data.item);

  const id = data.item.id;
  const isNewTrack = id !== lastTrackId;

  if (isNewTrack) {
    lastTrackId = id;
    showToast({
      title: data.item.name,
      artists: data.item.artists.map(a => a.name).join(", "),
      art: data.item.album.images?.[0]?.url || ""
    });
    if (typeof musicMode !== 'undefined' && musicMode.active) musicMode.refresh();
  }
}

function showToast({ title, artists, art }) {
  lastToastData = { title, artists, art };

  updateIdleOverlayFromTrack(title, artists, art);

  applyMotifFromNowPlayingItem({
    name: title,
    artists: (artists || "").split(", ").map(n => ({ name: n }))
  });

  titleEl.textContent = title;
  subEl.textContent = artists;
  imgEl.src = art;
  updateBackground(art);

  toast.style.display = "flex";
  toast.style.opacity = 0;
  controls.style.display = "none";
  toast.animate(
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 180, fill: "forwards" }
  );
  clearTimeout(timer);
  timer = setTimeout(() => {
    toast
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" })
      .onfinish = () => (toast.style.display = "none");
  }, 5000);
}

function forceShowToast(data) {
  if (!data) return;

  updateIdleOverlayFromTrack(data.title, data.artists, data.art || "");

  titleEl.textContent = data.title;
  subEl.textContent = data.artists;
  imgEl.src = data.art || "";
  updateBackground(data.art);

  applyMotifFromNowPlayingItem({
    name: data.title,
    artists: (data.artists || "").split(", ").map(n => ({ name:n }))
  });

  toast.style.display = "flex";
  toast.style.opacity = 0;
  toast.animate(
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 150, fill: "forwards" }
  );
  controls.style.display = "flex";
}

/* hover-to-recall behavior */
if (hotspot) {
  hotspot.addEventListener("mouseenter", () => {
    if (lastToastData) forceShowToast(lastToastData);
  });
}
if (toast) {
  toast.addEventListener("mouseenter", () => {
    clearTimeout(hideAfterHoverTimer);
    controls.style.display = "flex";
  });
  toast.addEventListener("mouseleave", () => {
    hideAfterHoverTimer = setTimeout(() => {
      controls.style.display = "none";
      toast.style.display = "none";
    }, 600);
  });
}

setInterval(poll, 1500);

/* -------------------------------
   Spotify playback controls
-------------------------------- */
async function spotifyControl(endpoint, method = "POST", query = "") {
  const token = await getAccessToken();
  if (!token) return false;
  const url = `https://api.spotify.com/v1/me/player/${endpoint}${query}`;
  const r = await fetch(url, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
  });
  return r.ok;
}

async function restartTrack()     { return spotifyControl("seek", "PUT", "?position_ms=0"); }
async function nextTrack()        { return spotifyControl("next", "POST"); }
async function togglePlayPause() {
  const token = await getAccessToken();
  if (!token) return false;
  const stateRes = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!stateRes.ok) return false;
  const data = await stateRes.json();
  return data && data.is_playing
    ? spotifyControl("pause", "PUT")
    : spotifyControl("play", "PUT");
}

el("btn-restart")?.addEventListener("click", restartTrack);
el("btn-playpause")?.addEventListener("click", togglePlayPause);
el("btn-next")?.addEventListener("click", nextTrack);

/* -------------------------------
   PKCE auth (Connect Spotify)
-------------------------------- */
const CLIENT_ID = "f5792dc487ef45d2a16dc2e21dbf427e";
const REDIRECT_URI = "https://uiohjo.github.io/uiohjio-s-g-a-m-e-s/callback/";
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-recently-played",
  "user-top-read",
  "playlist-read-private",
  "playlist-read-collaborative"
].join(" ");

const connectBtn = el("spotify-connect");
connectBtn?.addEventListener("click", async () => {
  // hide ambient immediately (polish)
  ambient.setVisible(false);

  const verifier  = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("sp_redirect_uri", REDIRECT_URI);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  location.href = authUrl.toString();
});

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}

// === On-load init: if connected & playing, show toast immediately ===
async function initSpotifyOnLoad() {
  const token = await getAccessToken();

  // show/hide ambient based on connection state
  if (!token) {
    ambient.setVisible(true);
    return; // nothing else to do (no Spotify yet)
  } else {
    ambient.setVisible(false);
  }

  const btn = el('spotify-connect');
  if (btn) {
    btn.textContent = 'Spotify Connected';
    btn.disabled = true;
    btn.style.opacity = '0.85';
    btn.style.cursor = 'default';
  }

  const panelBtn = el('sp-panel-open');
  if (panelBtn) panelBtn.style.display = 'block';

  const musicBtn = el('music-mode-btn');
  if (musicBtn) musicBtn.style.display = 'block';

  try {
    const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 204 || !r.ok) { setPlayHeading(false); return; }

    const data = await r.json();
    if (data?.item && data.is_playing) {
      applyMotifFromNowPlayingItem(data.item);

      updateIdleOverlayFromTrack(
        data.item.name,
        data.item.artists.map(a => a.name).join(", "),
        data.item.album.images?.[0]?.url || ""
      );

      lastTrackId = data.item.id;

      showToast({
        title: data.item.name,
        artists: data.item.artists.map(a => a.name).join(", "),
        art: data.item.album.images?.[0]?.url || ""
      });
    } else {
      setPlayHeading(false);
    }
  } catch (_) {
    // ignore; polling will catch up
  }
}

/* -------------------------------
   Gold title + (optional) Oliver
-------------------------------- */
function setGoldState(isGold) {
  const title  = el('title');
  const rarity = el('rarity');
  if (!title || !rarity) return;
  if (isGold) {
    title.classList.add('title--gold');
    title.textContent = 'GOLDEN Plumet Tournament';
    rarity.style.display = 'block';
  } else {
    title.classList.remove('title--gold');
    title.textContent = 'Plumet Tournament';
    rarity.style.display = 'none';
  }
}

function spinNameOnce(target, finalText) {
  if (!target || target.dataset.spun === 'true') return;

  const pool = ['Olivi~r', 'Oliver', 'Ol1ver', 'Olivia', '0liver', 'O-L-I-V-E-R', 'Revilo', 'O.G.', 'Oll—', 'Olive?', 'Oli..', 'Oliver Oil'];
  const duration = 2500;
  const interval = 70;
  let i = 0;

  target.classList.add('slotting');
  target.dataset.spun = 'true';

  const t = setInterval(() => { target.textContent = pool[i++ % pool.length]; }, interval);

  setTimeout(() => {
    clearInterval(t);
    target.textContent = finalText;
    target.classList.remove('slotting');
    target.classList.add('slot-complete');
    target.setAttribute('aria-label', finalText);
  }, duration);
}

/* -------------------------------
   DOM Ready
-------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  ambient.init();          // 🌊 init ambient music toggle

  initSpotifyOnLoad();
  const isGold = Math.floor(Math.random() * 50) === 0;
  setGoldState(isGold);

  const oliver = el('player-oliver');
  if (oliver) {
    oliver.addEventListener('click', () => spinNameOnce(oliver, 'Ollie G'));
    oliver.setAttribute('tabindex', '0');
    oliver.setAttribute('role', 'button');
    oliver.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        spinNameOnce(oliver, 'Ollie G');
      }
    });
  }

  /* --- Idle mode activity listeners --- */
  const activityEvents = ['pointerdown','mousemove','keydown','wheel','touchstart','scroll'];
  activityEvents.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }));
  scheduleIdle();
});

/* -------------------------------
   Local single-file game player
-------------------------------- */
let activeGameObjectUrl = null;
const gameObjectUrls = new Set();

function revokeGameObjectUrl(url) {
  if (!url || !gameObjectUrls.has(url)) return;
  URL.revokeObjectURL(url);
  gameObjectUrls.delete(url);
}

function openGameFilePicker() {
  el("game-file-input")?.click();
}

function prepareInlineRuffleGame(file, html, baseUrl) {
  const hasInlineRuffle = /\bRufflePlayer\b/i.test(html) &&
    !/<script\b[^>]*\bsrc\s*=\s*["'][^"']*ruffle/i.test(html);
  const rewritesDocument = /\bdocument\.write\s*\(/i.test(html);
  if (!hasInlineRuffle) return file;

  const addBaseTag = source => {
    const firstScript = /<script\b[^>]*>/i.exec(source);
    const markupEnd = firstScript ? firstScript.index : source.length;
    const markup = source.slice(0, markupEnd);
    if (/<base\b/i.test(markup)) return source;
    const tag = `<base href=${JSON.stringify(baseUrl)}>`;
    const head = /<head\b[^>]*>/i.exec(markup);
    if (head) {
      const insertAt = head.index + head[0].length;
      return source.slice(0, insertAt) + tag + source.slice(insertAt);
    }
    const html = /<html\b[^>]*>/i.exec(markup);
    if (html) {
      const insertAt = html.index + html[0].length;
      return source.slice(0, insertAt) + `<head>${tag}</head>` + source.slice(insertAt);
    }
    const doctype = /<!doctype\b[^>]*>/i.exec(markup);
    const insertAt = doctype ? doctype.index + doctype[0].length : 0;
    return source.slice(0, insertAt) + `<head>${tag}</head>` + source.slice(insertAt);
  };

  let preparedHtml = addBaseTag(html);
  if (rewritesDocument) {
    const shim = `<script>(function(){
    const originalWrite = Document.prototype.write;
    const baseTag = '<base href=' + JSON.stringify(${JSON.stringify(baseUrl)}) + '>';
    const addBaseTag = source => {
      const firstScript = /<script\\b[^>]*>/i.exec(source);
      const markupEnd = firstScript ? firstScript.index : source.length;
      const markup = source.slice(0, markupEnd);
      if (/<base\\b/i.test(markup)) return source;
      const head = /<head\\b[^>]*>/i.exec(markup);
      if (head) {
        const insertAt = head.index + head[0].length;
        return source.slice(0, insertAt) + baseTag + source.slice(insertAt);
      }
      const html = /<html\\b[^>]*>/i.exec(markup);
      if (html) {
        const insertAt = html.index + html[0].length;
        return source.slice(0, insertAt) + '<head>' + baseTag + '</head>' + source.slice(insertAt);
      }
      return '<head>' + baseTag + '</head>' + source;
    };
    Document.prototype.write = function(...parts) {
      parts = parts.map(part => {
        if (typeof part !== 'string') return part;
        return addBaseTag(part);
      });
      return originalWrite.apply(this, parts);
    };
  })();</scr` + `ipt>`;

    // Some bundled games replace their document with document.write(). Keep
    // the base in that generated document too, before its inline Ruffle runs.
    const firstScript = /<script\b[^>]*>/i.exec(preparedHtml);
    preparedHtml = firstScript
      ? preparedHtml.slice(0, firstScript.index) + shim + preparedHtml.slice(firstScript.index)
      : shim + preparedHtml;
  }

  // Inline Ruffle derives a relative runtime URL from document.baseURI. A
  // blob: URL cannot be used as that relative base, so give the in-memory
  // game document a normal site-relative base without changing the source file.
  return new Blob([preparedHtml], { type: "text/html;charset=utf-8" });
}

function wireLocalGamePlayer() {
  const fileInput = el("game-file-input");
  const iframe = el("game-iframe");
  const emptyState = el("game-empty-state");
  const toolbar = el("game-player-toolbar");
  const filename = el("game-file-name");
  const error = el("game-load-error");
  if (!fileInput || !iframe || !emptyState || !toolbar || !filename || !error) return;

  el("load-game-btn")?.addEventListener("click", openGameFilePicker);
  el("replace-game-btn")?.addEventListener("click", openGameFilePicker);

  let selectionVersion = 0;
  fileInput.addEventListener("change", async () => {
    const thisSelection = ++selectionVersion;
    const file = fileInput.files?.[0];
    fileInput.value = ""; // Let the same file be selected again later.
    if (!file) return;

    error.hidden = true;
    if (!/\.html$/i.test(file.name)) {
      error.textContent = "Choose a self-contained .html game file.";
      error.hidden = false;
      return;
    }

    let nextUrl;
    try {
      const html = await file.text();
      if (thisSelection !== selectionVersion) return;
      const baseUrl = new URL("./", window.location.href).href;
      const gameFile = prepareInlineRuffleGame(file, html, baseUrl);
      nextUrl = URL.createObjectURL(gameFile);
    } catch (e) {
      if (thisSelection !== selectionVersion) return;
      error.textContent = "This file could not be opened in the game player.";
      error.hidden = false;
      return;
    }

    const previousUrl = activeGameObjectUrl;
    activeGameObjectUrl = nextUrl;
    gameObjectUrls.add(nextUrl);
    iframe.addEventListener("load", () => revokeGameObjectUrl(previousUrl), { once: true });
    iframe.src = nextUrl;
    iframe.hidden = false;
    emptyState.hidden = true;
    toolbar.hidden = false;
    filename.textContent = file.name;
    filename.title = file.name;
  });

  window.addEventListener("pagehide", () => {
    selectionVersion += 1;
    for (const url of gameObjectUrls) URL.revokeObjectURL(url);
    gameObjectUrls.clear();
    activeGameObjectUrl = null;
  }, { once: true });
}

window.addEventListener("DOMContentLoaded", wireLocalGamePlayer, { once: true });

/* Deliberate title multi-click Easter egg trigger. */
window.addEventListener("DOMContentLoaded", () => {
  const title = el("title");
  if (!title) return;
  let clicks = 0;
  let resetTimer = null;
  title.addEventListener("click", () => {
    if (clicks === 0) {
      resetTimer = setTimeout(() => { clicks = 0; resetTimer = null; }, 1800);
    }
    clicks += 1;
    if (clicks >= 5) {
      clearTimeout(resetTimer);
      resetTimer = null;
      clicks = 0;
      triggerMcQueenCurse();
      return;
    }
  });
}, { once: true });

/* ============================================================
   MEJIRO MCQUEEN CURSE — You searched for this. You did this.
   ============================================================ */
function triggerMcQueenCurse() {
  const overlay = el("mcqueen-overlay");
  const loader  = el("mcqueen-loader");
  const videoWrap = el("mcqueen-video-wrap");
  const video   = el("mcqueen-video");
  if (!overlay || !video) return;

  // Handlers we'll need to remove later
  const killKey     = e => {
    const blocked = ["Escape","F11","F12"];
    const devTools = (e.ctrlKey || e.metaKey) && e.shiftKey && ["I","J","C","U"].includes(e.key.toUpperCase());
    const ctrlU    = (e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "U";
    if (blocked.includes(e.key) || devTools || ctrlU) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  };
  const killContext = e => e.preventDefault();
  const reFullscreen = () => {
    if (!document.fullscreenElement && overlay.style.display !== "none") {
      overlay.requestFullscreen().catch(() => {});
    }
  };

  // Show overlay
  overlay.style.display = "flex";
  loader.style.display  = "flex";
  videoWrap.style.display = "none";

  // Lock everything down
  document.addEventListener("keydown",       killKey,     true);
  document.addEventListener("contextmenu",   killContext, true);
  document.addEventListener("fullscreenchange", reFullscreen);

  // Fake loading screen — fills for ~4 seconds, then boom
  const bar = el("mcqueen-bar");
  const statusText = el("mcqueen-status");
  const fakeSteps = [
    [300,  5,  "Initializing search index..."],
    [700,  20, "Fetching game catalog..."],
    [500,  38, "Resolving query..."],
    [600,  55, "Cross-referencing database..."],
    [400,  72, "Almost there..."],
    [500,  89, "Loading results..."],
    [600,  100,"Done!"],
  ];
  let stepIdx = 0;
  function runStep() {
    if (stepIdx >= fakeSteps.length) {
      // Switch to video
      setTimeout(() => {
        loader.style.display    = "none";
        videoWrap.style.display = "flex";
        overlay.requestFullscreen().catch(() => {});
        // iframe autoplays via Google Drive preview — no .play() needed

        // Clean up after 11:04 (664 seconds)
        setTimeout(() => {
          document.removeEventListener("keydown",          killKey,      true);
          document.removeEventListener("contextmenu",      killContext,  true);
          document.removeEventListener("fullscreenchange", reFullscreen);
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          overlay.style.display = "none";
        }, 664000);
      }, 300);
      return;
    }
    const [delay, pct, msg] = fakeSteps[stepIdx++];
    setTimeout(() => {
      bar.style.width    = pct + "%";
      statusText.textContent = msg;
      runStep();
    }, delay);
  }
  runStep();

}

/* ============================================================
   SPOTIFY PANEL — append this to the bottom of script.js
   Also update your SCOPES constant (around line 436) to:

   const SCOPES = [
     "user-read-currently-playing",
     "user-read-playback-state",
     "user-modify-playback-state",
     "user-read-recently-played",
     "user-top-read",
     "playlist-read-private",
     "playlist-read-collaborative"
   ].join(" ");

   Users who already connected will need to hit "Reconnect Spotify"
   once to grant the new scopes.
   ============================================================ */

/* -------------------------------
   Spotify Panel
-------------------------------- */
const spotifyPanel = {
  isOpen: false,
  loaded: false,

  async open() {
    const panel    = el('sp-panel');
    const backdrop = el('sp-panel-backdrop');
    if (!panel) return;
    panel.classList.add('is-open');
    backdrop?.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
    this.isOpen = true;
    if (!this.loaded) await this.loadAll();
    else await this.loadNowPlaying(await getAccessToken()); // refresh NP on re-open
  },

  close() {
    const panel    = el('sp-panel');
    const backdrop = el('sp-panel-backdrop');
    panel?.classList.remove('is-open');
    backdrop?.classList.remove('is-visible');
    panel?.setAttribute('aria-hidden', 'true');
    this.isOpen = false;
  },

  async loadAll() {
    this.loaded = true;
    const token = await getAccessToken();
    if (!token) {
      ['sp-now-playing','sp-recent','sp-playlists','sp-top-artists'].forEach(id => {
        const s = el(id); if (s) s.innerHTML = '<p class="sp-empty">Not connected to Spotify.</p>';
      });
      return;
    }
    await Promise.allSettled([
      this.loadNowPlaying(token),
      this.loadRecentlyPlayed(token),
      this.loadPlaylists(token),
      this.loadTopArtists(token),
    ]);
  },

  async loadNowPlaying(token) {
    const section = el('sp-now-playing');
    if (!section || !token) return;
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.status === 204 || !r.ok) {
        section.innerHTML = '<p class="sp-empty">Nothing playing right now.</p>';
        return;
      }
      const data = await r.json();
      if (!data?.item) { section.innerHTML = '<p class="sp-empty">Nothing playing right now.</p>'; return; }

      const item     = data.item;
      const art      = item.album.images?.[1]?.url || item.album.images?.[0]?.url || '';
      const progress = data.progress_ms || 0;
      const duration = item.duration_ms || 1;
      const pct      = Math.round((progress / duration) * 100);
      const fmt      = ms => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

      section.innerHTML = `
        <div class="sp-now-card">
          <img class="sp-now-art" src="${art}" alt="${escHtml(item.name)}" />
          <div class="sp-now-info">
            <div class="sp-now-title">${escHtml(item.name)}</div>
            <div class="sp-now-artist">${escHtml(item.artists.map(a => a.name).join(', '))}</div>
            <div class="sp-now-album">${escHtml(item.album.name)}</div>
            <div class="sp-progress-bar"><div class="sp-progress-fill" style="width:${pct}%"></div></div>
            <div class="sp-progress-time"><span>${fmt(progress)}</span><span>${fmt(duration)}</span></div>
          </div>
        </div>`;
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async loadRecentlyPlayed(token) {
    const section = el('sp-recent');
    if (!section) return;
    section.innerHTML = Array(4).fill(`<div class="sp-skeleton"><div class="sp-skeleton-art"></div><div class="sp-skeleton-lines"><div class="sp-skeleton-line"></div><div class="sp-skeleton-line sp-skeleton-line--short"></div></div></div>`).join('');
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=8', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { this.handleScopeError(r, section, 'recently played'); return; }
      const data = await r.json();

      // dedupe by track id
      const seen = new Set();
      const tracks = data.items.filter(i => {
        if (seen.has(i.track.id)) return false;
        seen.add(i.track.id); return true;
      });

      section.innerHTML = tracks.map(i => {
        const t   = i.track;
        const art = t.album.images?.[2]?.url || t.album.images?.[0]?.url || '';
        return `<div class="sp-track-row">
          ${art ? `<img class="sp-track-art" src="${art}" alt="" />` : '<div class="sp-track-art sp-art-placeholder"></div>'}
          <div class="sp-track-info">
            <div class="sp-track-name">${escHtml(t.name)}</div>
            <div class="sp-track-sub">${escHtml(t.artists.map(a => a.name).join(', '))}</div>
          </div>
          <button class="sp-play-btn" data-uri="${t.uri}" aria-label="Play ${escHtml(t.name)}">▶</button>
        </div>`;
      }).join('');

      section.querySelectorAll('.sp-play-btn').forEach(btn =>
        btn.addEventListener('click', e => { e.stopPropagation(); this.playUri(btn.dataset.uri); })
      );
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async loadPlaylists(token) {
    const section = el('sp-playlists');
    if (!section) return;
    section.innerHTML = Array(4).fill(`<div class="sp-skeleton"><div class="sp-skeleton-art"></div><div class="sp-skeleton-lines"><div class="sp-skeleton-line"></div><div class="sp-skeleton-line sp-skeleton-line--short"></div></div></div>`).join('');
    try {
      const r = await fetch('https://api.spotify.com/v1/me/playlists?limit=12', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { this.handleScopeError(r, section, 'playlists'); return; }
      const data = await r.json();

      section.innerHTML = data.items.map(p => {
        const art = p.images?.[0]?.url || '';
        return `<div class="sp-track-row">
          ${art ? `<img class="sp-track-art" src="${art}" alt="" />` : '<div class="sp-track-art sp-art-placeholder"></div>'}
          <div class="sp-track-info">
            <div class="sp-track-name">${escHtml(p.name)}</div>
            <div class="sp-track-sub">${p.tracks.total} tracks</div>
          </div>
          <button class="sp-play-btn" data-context="${p.uri}" aria-label="Play ${escHtml(p.name)}">▶</button>
        </div>`;
      }).join('');

      section.querySelectorAll('.sp-play-btn').forEach(btn =>
        btn.addEventListener('click', e => { e.stopPropagation(); this.playUri(null, btn.dataset.context); })
      );
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async loadTopArtists(token) {
    const section = el('sp-top-artists');
    if (!section) return;
    section.innerHTML = Array(4).fill(`<div class="sp-skeleton"><div class="sp-skeleton-art" style="border-radius:50%"></div><div class="sp-skeleton-lines"><div class="sp-skeleton-line"></div><div class="sp-skeleton-line sp-skeleton-line--short"></div></div></div>`).join('');
    try {
      const r = await fetch('https://api.spotify.com/v1/me/top/artists?limit=6&time_range=short_term', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { this.handleScopeError(r, section, 'top artists'); return; }
      const data = await r.json();

      section.innerHTML = data.items.map(a => {
        const art = a.images?.[2]?.url || a.images?.[0]?.url || '';
        return `<div class="sp-track-row sp-track-row--no-btn">
          ${art ? `<img class="sp-track-art sp-track-art--circle" src="${art}" alt="" />` : '<div class="sp-track-art sp-track-art--circle sp-art-placeholder"></div>'}
          <div class="sp-track-info">
            <div class="sp-track-name">${escHtml(a.name)}</div>
            <div class="sp-track-sub">${escHtml(a.genres.slice(0, 2).join(', ') || 'Artist')}</div>
          </div>
        </div>`;
      }).join('');
    } catch {
      section.innerHTML = '<p class="sp-empty">Could not load.</p>';
    }
  },

  async playUri(trackUri, contextUri) {
    const token = await getAccessToken();
    if (!token) return;
    const body = contextUri ? { context_uri: contextUri } : { uris: [trackUri] };
    const r = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 403) alert('Spotify Premium is required to control playback remotely.');
    if (r.status === 404) alert('No active Spotify device found. Open Spotify on any device first.');
  },

  handleScopeError(r, section, label) {
    if (r.status === 401 || r.status === 403) {
      section.innerHTML = `<p class="sp-empty">
        New permissions needed for ${label}.<br/>
        <button class="sp-reauth-btn" id="sp-reauth-${label.replace(/\s/g,'-')}">Reconnect Spotify</button>
      </p>`;
      section.querySelector('.sp-reauth-btn')?.addEventListener('click', () => {
        ['sp_access_token','sp_refresh_token','sp_expires_at'].forEach(k => localStorage.removeItem(k));
        el('spotify-connect')?.click();
      });
    } else {
      section.innerHTML = `<p class="sp-empty">Could not load ${label}.</p>`;
    }
  }
};

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* Wire up panel open/close */
window.addEventListener('DOMContentLoaded', () => {
  el('sp-panel-open')?.addEventListener('click', () => spotifyPanel.open());
  el('sp-panel-close')?.addEventListener('click', () => spotifyPanel.close());
  el('sp-panel-backdrop')?.addEventListener('click', () => spotifyPanel.close());

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && spotifyPanel.isOpen) spotifyPanel.close();
  });
});


/* ============================================================
   MUSIC MODE
   ============================================================ */
const musicMode = {
  active: false,
  progressTimer: null,
  currentState: null, // last fetched player state

  // Elements
  el: {
    overlay:    () => el('music-overlay'),
    art:        () => el('music-art'),
    title:      () => el('music-title'),
    artist:     () => el('music-artist'),
    album:      () => el('music-album'),
    fill:       () => el('music-progress-fill'),
    timeCur:    () => el('music-time-cur'),
    timeDur:    () => el('music-time-dur'),
    playpause:  () => el('music-btn-playpause'),
    queueList:  () => el('music-queue-list'),
    btn:        () => el('music-mode-btn'),
  },

  fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  async open() {
    const overlay = this.el.overlay();
    if (!overlay) return;
    this.active = true;
    overlay.style.cssText = 'display:grid !important; opacity:0;';
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.style.transition = 'opacity .4s ease';
    });
    document.body.style.overflow = 'hidden';
    await this.refresh();
    this.startProgress();
  },

  close() {
    const overlay = this.el.overlay();
    if (!overlay) return;
    this.active = false;
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
    document.body.style.overflow = '';
    this.stopProgress();
  },

  async refresh() {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) return;
      const data = await r.json();
      this.currentState = data;
      this.updateNowPlaying(data);
      await this.loadQueue(token);
    } catch {}
  },

  updateNowPlaying(data) {
    if (!data?.item) return;
    const item = data.item;
    const art  = item.album?.images?.[0]?.url || '';

    // Swap art with fade
    const artEl = this.el.art();
    if (artEl && artEl.src !== art) {
      artEl.classList.add('swapping');
      setTimeout(() => {
        artEl.src = art;
        artEl.onload = () => artEl.classList.remove('swapping');
      }, 200);
    }

    // Background
    this.el.overlay().style.setProperty('--music-art-url', `url("${art}")`);

    this.el.title().textContent  = item.name || '';
    this.el.artist().textContent = item.artists?.map(a => a.name).join(', ') || '';
    this.el.album().textContent  = item.album?.name || '';

    // Progress
    const pct = ((data.progress_ms || 0) / (item.duration_ms || 1)) * 100;
    this.el.fill().style.width    = pct + '%';
    this.el.timeCur().textContent = this.fmt(data.progress_ms || 0);
    this.el.timeDur().textContent = this.fmt(item.duration_ms || 0);

    // Play/pause icon
    this.el.playpause().textContent = data.is_playing ? '⏸' : '▶';

    // Shuffle / repeat state
    el('music-btn-shuffle')?.classList.toggle('music-btn--active', !!data.shuffle_state);
    const repeatMap = { 'off': false, 'context': true, 'track': true };
    el('music-btn-repeat')?.classList.toggle('music-btn--active', !!repeatMap[data.repeat_state]);
  },

  startProgress() {
    this.stopProgress();
    this.progressTimer = setInterval(async () => {
      if (!this.active) return;
      const token = await getAccessToken();
      if (!token) return;
      try {
        const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.status === 204 || !r.ok) return;
        const data = await r.json();
        if (!data?.item) return;

        // If track changed, do a full refresh (updates queue too)
        if (data.item.id !== this.currentState?.item?.id) {
          this.currentState = data;
          await this.refresh();
          return;
        }

        this.currentState = { ...this.currentState, ...data };
        const pct = ((data.progress_ms || 0) / (data.item.duration_ms || 1)) * 100;
        this.el.fill().style.width    = pct + '%';
        this.el.timeCur().textContent = this.fmt(data.progress_ms || 0);
        this.el.playpause().textContent = data.is_playing ? '⏸' : '▶';
      } catch {}
    }, 1500);
  },

  stopProgress() {
    clearInterval(this.progressTimer);
    this.progressTimer = null;
  },

  async loadQueue(token) {
    const list = this.el.queueList();
    if (!list) return;
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/queue', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) { list.innerHTML = '<div class="music-queue-empty">Queue unavailable.</div>'; return; }
      const data = await r.json();

      const rows = [];

      // Currently playing
      if (data.currently_playing) {
        const t = data.currently_playing;
        const art = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || '';
        rows.push(`<div class="music-queue-row music-queue-row--current">
          ${art ? `<img class="music-queue-art" src="${art}" alt="" />` : '<div class="music-queue-art" style="background:rgba(255,255,255,.08)"></div>'}
          <div class="music-queue-info">
            <div class="music-queue-name">${escHtml(t.name)}</div>
            <div class="music-queue-sub">${escHtml(t.artists?.map(a=>a.name).join(', ') || '')}</div>
          </div>
          <div class="music-queue-dur">${this.fmt(t.duration_ms || 0)}</div>
        </div>`);
      }

      // Upcoming
      (data.queue || []).slice(0, 20).forEach(t => {
        const art = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || '';
        rows.push(`<div class="music-queue-row">
          ${art ? `<img class="music-queue-art" src="${art}" alt="" />` : '<div class="music-queue-art" style="background:rgba(255,255,255,.08)"></div>'}
          <div class="music-queue-info">
            <div class="music-queue-name">${escHtml(t.name)}</div>
            <div class="music-queue-sub">${escHtml(t.artists?.map(a=>a.name).join(', ') || '')}</div>
          </div>
          <div class="music-queue-dur">${this.fmt(t.duration_ms || 0)}</div>
        </div>`);
      });

      list.innerHTML = rows.length ? rows.join('') : '<div class="music-queue-empty">Queue is empty.</div>';
    } catch {
      list.innerHTML = '<div class="music-queue-empty">Could not load queue.</div>';
    }
  },

  async toggleShuffle() {
    const token = await getAccessToken();
    if (!token) return;
    const current = !!this.currentState?.shuffle_state;
    await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${!current}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    setTimeout(() => this.refresh(), 400);
  },

  async toggleRepeat() {
    const token = await getAccessToken();
    if (!token) return;
    const current = this.currentState?.repeat_state || 'off';
    const next = current === 'off' ? 'context' : current === 'context' ? 'track' : 'off';
    await fetch(`https://api.spotify.com/v1/me/player/repeat?state=${next}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    setTimeout(() => this.refresh(), 400);
  },

  async prevTrack() {
    const token = await getAccessToken();
    if (!token) return;
    await fetch('https://api.spotify.com/v1/me/player/previous', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    setTimeout(() => this.refresh(), 600);
  },
};

/* Wire music mode buttons */
window.addEventListener('DOMContentLoaded', () => {
  // Show button reliably once token confirmed
  const showMusicBtn = () => {
    const mmBtn = el('music-mode-btn');
    if (mmBtn) mmBtn.style.display = 'block';
  };
  getAccessToken().then(token => { if (token) showMusicBtn(); });
  // Also check after a short delay in case token refresh takes a moment
  setTimeout(() => getAccessToken().then(token => { if (token) showMusicBtn(); }), 1500);

  el('music-mode-btn')?.addEventListener('click', () => musicMode.open());
  el('music-exit')?.addEventListener('click',     () => musicMode.close());

  // Controls
  el('music-btn-playpause')?.addEventListener('click', async () => {
    await togglePlayPause();
    setTimeout(() => musicMode.refresh(), 400);
  });
  el('music-btn-next')?.addEventListener('click', async () => {
    await nextTrack();
    setTimeout(() => musicMode.refresh(), 600);
  });
  el('music-btn-prev')?.addEventListener('click',    () => musicMode.prevTrack());
  el('music-btn-restart')?.addEventListener('click', async () => {
    await restartTrack();
    setTimeout(() => musicMode.refresh(), 400);
  });
  el('music-btn-shuffle')?.addEventListener('click', () => musicMode.toggleShuffle());
  el('music-btn-repeat')?.addEventListener('click',  () => musicMode.toggleRepeat());

  // Seek on progress bar click
  el('music-progress-bar')?.addEventListener('click', async (e) => {
    const dur = musicMode.currentState?.item?.duration_ms;
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    const ms   = Math.round(pct * dur);
    const token = await getAccessToken();
    if (!token) return;
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${ms}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    setTimeout(() => musicMode.refresh(), 300);
  });

  // Escape key to exit
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && musicMode.active) musicMode.close();
  });

  // Keep music mode in sync when a new track is detected by the main poller
  const _origShowToast = showToast;
  window._musicModeTrackUpdate = () => { if (musicMode.active) musicMode.refresh(); };
});

