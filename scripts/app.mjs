/**
 * YTSyncApp — GM Control Panel mit Suche, Playlists, Live-Queue und
 * Soundboard (Foundry v14)
 */

import { SocketHandler } from "./socket.mjs";
import { YTSyncPlayer } from "./player.mjs";
import { YouTubeSearch } from "./search.mjs";

const MODULE_ID = "yt-sync";

const SOUND_PALETTE = ["#2b6cb0", "#2f855a", "#b7791f", "#6b46c1", "#c53030", "#00838f", "#975a16", "#4a5568"];

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function extractVideoId(input) {
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1);
    return url.searchParams.get("v") ?? null;
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
    return null;
  }
}

function getPlaylists() { return game.settings.get(MODULE_ID, "playlists") ?? []; }
async function savePlaylists(list) { await game.settings.set(MODULE_ID, "playlists", list); }

function getSoundboard() { return game.settings.get(MODULE_ID, "soundboard") ?? []; }
async function saveSoundboard(list) { await game.settings.set(MODULE_ID, "soundboard", list); }

/**
 * Persistenter GM-Sitzungszustand — bewusst AUSSERHALB der Klasse, auf
 * Modul-Ebene. ApplicationV2-Instanzen (inkl. all ihrer lokalen Variablen
 * in _onRender) werden beim Schließen des Fensters zerstört; dieses Objekt
 * überlebt das, solange die Foundry-Seite nicht neu geladen wird — genau
 * wie YTSyncPlayer seinen eigenen Zustand modul-scoped hält.
 */
const gmState = {
  currentVideoId: null,
  currentLabel: null,
  currentThumb: null,
  mode: "video",
  volume: null,          // wird beim ersten Render aus defaultVolume befüllt
  ambienceVolume: null,  // dito
  playlistQueue: [],
  playlistIdx: 0,
  loopQueue: false,
  activeSoundId: null,
  playlistTimer: null,   // Interval-ID — nur EINE darf je aktiv sein
  seekTimer: null,       // dito
};

export class YTSyncApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "yt-sync-gm",
    classes: ["yt-sync-gm-app"],
    window: { title: "YT Sync — GM Control", resizable: true, draggable: true },
    position: { width: 480, height: 760 },
  };

  static openForGM() {
    const existing = foundry.applications.instances.get("yt-sync-gm");
    if (existing) {
      const el = existing.element;
      if (el) {
        el.style.display = "";
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = el.getBoundingClientRect();
        if (rect.left < 0 || rect.top < 0 || rect.right > vw || rect.bottom > vh) {
          existing.setPosition({ top: 60, left: Math.max(60, (vw - 480) / 2) });
        }
      }
      existing.bringToFront();
      return;
    }
    const left = Math.max(60, (window.innerWidth - 480) / 2);
    const top  = Math.max(60, (window.innerHeight - 760) / 2);
    const app  = new YTSyncApp();
    app.render(true);
    setTimeout(() => app.setPosition({ top, left }), 50);
  }

  async _renderHTML(_context, _options) {
    const playlists  = getPlaylists();
    const soundboard = getSoundboard();
    const hasKey = YouTubeSearch.hasKey();

    const div = document.createElement("div");
    div.classList.add("yt-sync-gm-inner");
    div.innerHTML = `

      <!-- Suche / URL -->
      <div class="yt-section-label">
        Video suchen oder laden
        <div class="yt-tab-switch">
          <button class="yt-tab active" data-tab="search">🔍 Suche</button>
          <button class="yt-tab" data-tab="url">🔗 URL / ID</button>
        </div>
      </div>

      <!-- Such-Tab -->
      <div id="yt-tab-search" class="yt-tab-panel">
        ${!hasKey ? `
          <div class="yt-no-key-hint">
            <span>⚠ Kein API Key.</span>
            <a href="#" id="yt-open-settings">Jetzt einrichten →</a>
          </div>
        ` : ""}
        <div class="yt-field-row">
          <input type="text" id="yt-search-input" placeholder="Suche auf YouTube…" autocomplete="off" ${!hasKey ? "disabled" : ""} />
          <button id="yt-search-btn" class="yt-btn primary" ${!hasKey ? "disabled" : ""}>Suchen</button>
        </div>
        <div id="yt-search-results" class="yt-search-results"></div>
      </div>

      <!-- URL-Tab -->
      <div id="yt-tab-url" class="yt-tab-panel" style="display:none">
        <div class="yt-field-row">
          <input type="text" id="yt-url-input" placeholder="YouTube URL oder Video-ID…" autocomplete="off" />
          <button id="yt-load-btn" class="yt-btn primary">Load</button>
        </div>
      </div>

      <!-- Vorschau -->
      <div class="yt-preview-row" id="yt-preview-row" style="display:none">
        <img id="yt-thumb" src="" alt="" />
        <div class="yt-meta">
          <div id="yt-title" class="yt-title"></div>
          <div id="yt-vid-id" class="yt-vid-id"></div>
          <div class="yt-save-row">
            <select id="yt-target-playlist" class="yt-select">
              <option value="">— Playlist wählen —</option>
              ${playlists.map((p, i) => `<option value="${i}">${p.name}</option>`).join("")}
            </select>
            <button id="yt-save-btn" class="yt-btn save">＋ Hinzufügen</button>
          </div>
        </div>
      </div>

      <!-- Modus -->
      <div class="yt-section-label" style="margin-top:10px">Übertragungsmodus</div>
      <div class="yt-mode-row">
        <label class="yt-mode-option">
          <input type="radio" name="yt-mode" value="video" checked />
          <span>🎬 Video + Ton</span>
        </label>
        <label class="yt-mode-option">
          <input type="radio" name="yt-mode" value="audio" />
          <span>🎵 Nur Ton</span>
        </label>
      </div>
      <div id="yt-mode-hint" class="yt-mode-hint">Spieler sehen das Video-Overlay.</div>

      <!-- Wiedergabe -->
      <div class="yt-section-label" style="margin-top:10px">Wiedergabe</div>
      <div class="yt-controls-row">
        <button id="yt-play-btn"   class="yt-btn green"  disabled>▶ Play für alle</button>
        <button id="yt-pause-btn"  class="yt-btn yellow" disabled>⏸ Pause</button>
        <button id="yt-resume-btn" class="yt-btn yellow" disabled>⏵ Weiter</button>
        <button id="yt-stop-btn"   class="yt-btn red"    disabled title="Schließt das Overlay bei allen Spielern">⏹ Schließen</button>
      </div>
      <div class="yt-seek-row">
        <label>⏩</label>
        <input type="range" id="yt-seek-bar" min="0" max="100" value="0" step="1" disabled />
        <span id="yt-seek-label">0:00</span>
      </div>
      <div class="yt-volume-row">
        <label>🔊</label>
        <input type="range" id="yt-vol-all" min="0" max="100" value="50" />
        <span id="yt-vol-label">50</span>
      </div>
      <div class="yt-status" id="yt-status">Kein Video geladen.</div>

      <!-- Live-Queue -->
      <div class="yt-section-label yt-queue-label" id="yt-queue-section" style="margin-top:10px; display:none">
        <span>Läuft gerade</span>
        <label class="yt-loop-toggle">
          <input type="checkbox" id="yt-loop-toggle" /> 🔁 Loop
        </label>
      </div>
      <div class="yt-controls-row" id="yt-queue-nav" style="display:none">
        <button id="yt-prev-btn" class="yt-btn primary small">⏮ Zurück</button>
        <button id="yt-next-btn" class="yt-btn primary small">⏭ Weiter</button>
      </div>
      <div id="yt-queue-list" class="yt-queue-list"></div>

      <!-- Playlists -->
      <div class="yt-section-label" style="margin-top:14px">
        Playlists
        <button id="yt-new-playlist-btn" class="yt-btn save small">＋ Neue Playlist</button>
      </div>
      <div id="yt-playlists-container">
        ${playlists.length === 0
          ? `<div class="yt-playlist-empty">Noch keine Playlist. Klicke "＋ Neue Playlist".</div>`
          : playlists.map((pl, i) => renderPlaylist(pl, i)).join("")}
      </div>

      <!-- Soundboard -->
      <div class="yt-section-label" style="margin-top:14px">
        🎧 Soundboard
        <button id="yt-new-sound-btn" class="yt-btn save small">＋ Sound hinzufügen</button>
      </div>
      <div class="yt-volume-row" style="margin-bottom:4px">
        <label>🔊 Atmo</label>
        <input type="range" id="yt-ambience-vol" min="0" max="100" value="50" />
        <span id="yt-ambience-vol-label">50</span>
      </div>
      <div id="yt-soundboard-grid" class="yt-soundboard-grid">
        ${renderSoundboard(soundboard)}
      </div>
    `;
    return div;
  }

  _replaceHTML(result, content, _options) { content.replaceChildren(result); }

  _onRender(_context, _options) {
    const el = this.element;

    const playBtn    = el.querySelector("#yt-play-btn");
    const pauseBtn   = el.querySelector("#yt-pause-btn");
    const resumeBtn  = el.querySelector("#yt-resume-btn");
    const stopBtn    = el.querySelector("#yt-stop-btn");
    const volSlider  = el.querySelector("#yt-vol-all");
    const volLabel   = el.querySelector("#yt-vol-label");
    const seekBar    = el.querySelector("#yt-seek-bar");
    const seekLabel  = el.querySelector("#yt-seek-label");
    const statusEl   = el.querySelector("#yt-status");
    const previewRow = el.querySelector("#yt-preview-row");
    const modeHint   = el.querySelector("#yt-mode-hint");
    const nextBtn    = el.querySelector("#yt-next-btn");
    const prevBtn    = el.querySelector("#yt-prev-btn");
    const loopToggle = el.querySelector("#yt-loop-toggle");
    const queueSection = el.querySelector("#yt-queue-section");
    const queueNav      = el.querySelector("#yt-queue-nav");
    const queueList      = el.querySelector("#yt-queue-list");
    const ambienceVol      = el.querySelector("#yt-ambience-vol");
    const ambienceVolLabel = el.querySelector("#yt-ambience-vol-label");
    const soundboardGrid = el.querySelector("#yt-soundboard-grid");

    const setStatus = (msg) => statusEl.textContent = msg;
    const enableControls = (on) => {
      playBtn.disabled = pauseBtn.disabled = resumeBtn.disabled = stopBtn.disabled = !on;
      if (seekBar) seekBar.disabled = !on;
    };
    const getMode = () => el.querySelector("input[name='yt-mode']:checked")?.value ?? "video";

    // ── Seek-Bar-Updater — nur EIN Timer darf laufen, überlebt Fenster-Reopen ──
    function startSeekUpdater() {
      if (gmState.seekTimer) return; // läuft schon, nicht doppelt starten
      gmState.seekTimer = setInterval(() => {
        const cur = YTSyncPlayer.getCurrentTime();
        const dur = YTSyncPlayer.getDuration();
        if (!dur) return;
        const bar = document.getElementById("yt-seek-bar");
        const lbl = document.getElementById("yt-seek-label");
        if (!bar || !lbl) return; // Panel gerade geschlossen — Timer läuft weiter, UI wird beim nächsten Öffnen aktualisiert
        bar.max = Math.floor(dur);
        bar.value = Math.floor(cur);
        lbl.textContent = formatTime(cur) + " / " + formatTime(dur);
      }, 1000);
    }
    function stopSeekUpdater() { clearInterval(gmState.seekTimer); gmState.seekTimer = null; }

    // ── Zustand wiederherstellen (Fenster geschlossen ≠ Wiedergabe gestoppt) ──
    if (gmState.volume === null) gmState.volume = game.settings.get(MODULE_ID, "defaultVolume") ?? 50;
    if (gmState.ambienceVolume === null) gmState.ambienceVolume = 50;

    volSlider.value = gmState.volume;
    volLabel.textContent = gmState.volume;
    ambienceVol.value = gmState.ambienceVolume;
    ambienceVolLabel.textContent = gmState.ambienceVolume;
    loopToggle.checked = gmState.loopQueue;
    const modeRadio = el.querySelector(`input[name='yt-mode'][value='${gmState.mode}']`);
    if (modeRadio) modeRadio.checked = true;
    modeHint.textContent = gmState.mode === "audio"
      ? "Spieler hören nur den Ton — kein Video-Overlay sichtbar."
      : "Spieler sehen das Video-Overlay.";

    if (gmState.currentVideoId) {
      el.querySelector("#yt-thumb").src = gmState.currentThumb ?? `https://img.youtube.com/vi/${gmState.currentVideoId}/mqdefault.jpg`;
      el.querySelector("#yt-title").textContent = gmState.currentLabel || gmState.currentVideoId;
      el.querySelector("#yt-vid-id").textContent = `ID: ${gmState.currentVideoId}`;
      previewRow.style.display = "flex";
      enableControls(true);
      const state = YTSyncPlayer.getPlayerState();
      setStatus(state === 2 ? "⏸ Pausiert" : state === 1 || state === 3 ? "▶ Läuft für alle…" : "✓ Bereit.");
      if (state === 1 || state === 3) startSeekUpdater();
    }

    if (gmState.activeSoundId) {
      soundboardGrid.querySelector(`.yt-sound-btn[data-id="${gmState.activeSoundId}"]`)?.classList.add("active");
    }

    // ── Tab Switch ──
    el.querySelectorAll(".yt-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        el.querySelectorAll(".yt-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        el.querySelectorAll(".yt-tab-panel").forEach(p => p.style.display = "none");
        el.querySelector(`#yt-tab-${tab.dataset.tab}`).style.display = "flex";
      });
    });

    // ── Modus ──
    el.querySelectorAll("input[name='yt-mode']").forEach(r => {
      r.addEventListener("change", () => {
        gmState.mode = getMode();
        modeHint.textContent = gmState.mode === "audio"
          ? "Spieler hören nur den Ton — kein Video-Overlay sichtbar."
          : "Spieler sehen das Video-Overlay.";
      });
    });

    // ── Video in Vorschau laden ──
    const loadVideo = (vid, label, thumbUrl) => {
      gmState.currentVideoId = vid;
      gmState.currentLabel = label;
      gmState.currentThumb = thumbUrl ?? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
      el.querySelector("#yt-thumb").src = gmState.currentThumb;
      el.querySelector("#yt-title").textContent = label || "Video geladen";
      el.querySelector("#yt-vid-id").textContent = `ID: ${vid}`;
      previewRow.style.display = "flex";
      enableControls(true);
      setStatus(`✓ Bereit: ${label || vid}`);
    };

    // ── URL / ID Tab ──
    el.querySelector("#yt-load-btn")?.addEventListener("click", () => {
      const input = el.querySelector("#yt-url-input");
      const vid = extractVideoId(input.value.trim());
      if (!vid) return setStatus("⚠ Ungültige URL oder Video-ID.");
      loadVideo(vid, null);
    });

    // ── Suche ──
    const searchInput   = el.querySelector("#yt-search-input");
    const searchBtn     = el.querySelector("#yt-search-btn");
    const searchResults = el.querySelector("#yt-search-results");

    const doSearch = async () => {
      const q = searchInput?.value.trim();
      if (!q) return;
      searchResults.innerHTML = `<div class="yt-search-loading">Suche läuft…</div>`;
      try {
        const results = await YouTubeSearch.search(q);
        if (results.length === 0) {
          searchResults.innerHTML = `<div class="yt-search-loading">Keine Ergebnisse.</div>`;
          return;
        }
        searchResults.innerHTML = results.map(r => `
          <div class="yt-search-item" data-id="${r.id}" data-title="${r.title.replace(/"/g,'&quot;')}" data-thumb="${r.thumb}">
            <img src="${r.thumb}" alt="" />
            <div class="yt-search-item-info">
              <div class="yt-search-item-title">${r.title}</div>
              <div class="yt-search-item-channel">${r.channel}</div>
            </div>
            <button class="yt-btn green small yt-search-select">▶ Laden</button>
          </div>
        `).join("");
      } catch(e) {
        searchResults.innerHTML = `<div class="yt-search-loading" style="color:#f88">Fehler: ${e.message}</div>`;
      }
    };

    searchBtn?.addEventListener("click", doSearch);
    searchInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

    searchResults?.addEventListener("click", (e) => {
      const item = e.target.closest(".yt-search-item");
      if (!item || !e.target.closest(".yt-search-select")) return;
      loadVideo(item.dataset.id, item.dataset.title, item.dataset.thumb);
      searchResults.querySelectorAll(".yt-search-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
    });

    // ── Settings Link ──
    el.querySelector("#yt-open-settings")?.addEventListener("click", (e) => {
      e.preventDefault();
      new SettingsConfig().render(true);
    });

    // ── Playlist hinzufügen ──
    el.querySelector("#yt-save-btn").addEventListener("click", async () => {
      if (!gmState.currentVideoId) return;
      const playlists = getPlaylists();
      const idx = parseInt(el.querySelector("#yt-target-playlist").value);
      if (isNaN(idx) || !playlists[idx]) return setStatus("⚠ Bitte zuerst eine Playlist wählen.");
      const label = prompt(`Name für dieses Video in "${playlists[idx].name}" (optional):`, el.querySelector("#yt-title").textContent) ?? "";
      if (playlists[idx].videos.find(v => v.id === gmState.currentVideoId)) return setStatus("⚠ Video bereits in dieser Playlist.");
      playlists[idx].videos.push({ id: gmState.currentVideoId, label: label || gmState.currentVideoId, thumb: el.querySelector("#yt-thumb").src });
      await savePlaylists(playlists);
      refreshPlaylists(el);
      setStatus(`✓ Video zu "${playlists[idx].name}" hinzugefügt.`);
    });

    // ── Neue Playlist ──
    el.querySelector("#yt-new-playlist-btn").addEventListener("click", async () => {
      const name = prompt("Name der neuen Playlist:", "Neue Playlist");
      if (!name) return;
      const playlists = getPlaylists();
      playlists.push({ name, videos: [] });
      await savePlaylists(playlists);
      refreshPlaylists(el);
    });

    // ── Live-Queue: rendern (liest/schreibt gmState, nicht lokale Variablen) ──
    function renderQueue() {
      const liveQueueList = document.getElementById("yt-queue-list");
      const liveQueueSection = document.getElementById("yt-queue-section");
      const liveQueueNav = document.getElementById("yt-queue-nav");
      if (!liveQueueList || !liveQueueSection || !liveQueueNav) return; // Panel gerade zu

      if (!gmState.playlistQueue.length) {
        liveQueueSection.style.display = "none";
        liveQueueNav.style.display = "none";
        liveQueueList.innerHTML = "";
        return;
      }
      liveQueueSection.style.display = "flex";
      liveQueueNav.style.display = "flex";
      const pb = document.getElementById("yt-prev-btn");
      if (pb) pb.disabled = gmState.playlistIdx <= 0;
      liveQueueList.innerHTML = gmState.playlistQueue.map((v, i) => `
        <div class="yt-queue-item ${i === gmState.playlistIdx ? "now-playing" : ""}" data-idx="${i}">
          <img src="${v.thumb}" alt="" />
          <div class="yt-queue-item-label">${i === gmState.playlistIdx ? "▶ " : ""}${v.label}</div>
          ${i > gmState.playlistIdx ? `<button class="yt-btn red small yt-queue-remove" data-idx="${i}" title="Aus Queue entfernen">✕</button>` : ""}
        </div>
      `).join("");
    }

    // Nur EIN Watcher darf gleichzeitig laufen — sonst springen Tracks bei
    // mehrfachem Fenster-Öffnen/Schließen unerwartet vor.
    function startQueueWatcher() {
      if (gmState.playlistTimer) return;
      gmState.playlistTimer = setInterval(() => {
        if (!gmState.playlistQueue.length) return stopQueueWatcher();
        const state = YTSyncPlayer.getPlayerState();
        if (state === 0) advanceQueue(); // ENDED
      }, 2000);
    }

    function stopQueueWatcher() {
      clearInterval(gmState.playlistTimer);
      gmState.playlistTimer = null;
    }

    function playQueueIndex(i) {
      if (i < 0 || i >= gmState.playlistQueue.length) return;
      gmState.playlistIdx = i;
      const track = gmState.playlistQueue[i];
      loadVideo(track.id, track.label, track.thumb);
      const audioOnly = getMode() === "audio";
      const vol = gmState.volume;
      SocketHandler.emit("play", { videoId: track.id, timestamp: 0, volume: vol, audioOnly });
      setStatus(`▶ [${i + 1}/${gmState.playlistQueue.length}] ${track.label}`);
      startSeekUpdater();
      renderQueue();
    }

    function advanceQueue() {
      const next = gmState.playlistIdx + 1;
      if (next >= gmState.playlistQueue.length) {
        if (gmState.loopQueue) { playQueueIndex(0); return; }
        stopQueueWatcher();
        setStatus("✓ Playlist beendet.");
        return;
      }
      playQueueIndex(next);
    }

    loopToggle.addEventListener("change", () => { gmState.loopQueue = loopToggle.checked; });

    prevBtn.addEventListener("click", () => playQueueIndex(gmState.playlistIdx - 1));
    nextBtn.addEventListener("click", () => advanceQueue());

    queueList.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".yt-queue-remove");
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.idx);
        gmState.playlistQueue.splice(idx, 1);
        renderQueue();
        return;
      }
      const item = e.target.closest(".yt-queue-item");
      if (item) playQueueIndex(parseInt(item.dataset.idx));
    });

    renderQueue(); // Zustand aus gmState sofort sichtbar machen

    // ── Wiedergabe ──
    playBtn.addEventListener("click", () => {
      if (!gmState.currentVideoId) return;
      // Einzelnes Video außerhalb einer Queue gestartet — Queue verlassen.
      stopQueueWatcher();
      gmState.playlistQueue = [];
      renderQueue();
      const audioOnly = getMode() === "audio";
      SocketHandler.emit("play", { videoId: gmState.currentVideoId, timestamp: 0, volume: gmState.volume, audioOnly });
      setStatus(audioOnly ? "🎵 Ton läuft für alle…" : "▶ Video läuft für alle…");
      startSeekUpdater();
    });

    pauseBtn.addEventListener("click", () => {
      const ts = YTSyncPlayer.getCurrentTime();
      SocketHandler.emit("pause", { timestamp: ts });
      setStatus(`⏸ Pausiert bei ${ts.toFixed(1)}s`);
    });

    resumeBtn.addEventListener("click", () => {
      const ts = YTSyncPlayer.getCurrentTime();
      SocketHandler.emit("resume", { timestamp: ts });
      setStatus("⏵ Fortgesetzt");
    });

    stopBtn.addEventListener("click", () => {
      SocketHandler.emit("stop");
      enableControls(false);
      previewRow.style.display = "none";
      gmState.currentVideoId = null;
      gmState.currentLabel = null;
      gmState.currentThumb = null;
      setStatus("⏹ Overlay geschlossen bei allen Spielern.");
      stopQueueWatcher();
      gmState.playlistQueue = [];
      renderQueue();
      stopSeekUpdater();
      if (seekBar) { seekBar.value = 0; seekBar.disabled = true; }
      if (seekLabel) seekLabel.textContent = "0:00";
    });

    seekBar.addEventListener("change", () => {
      const ts = parseInt(seekBar.value);
      SocketHandler.emit("seek", { timestamp: ts });
      setStatus(`⏩ Gesprungen zu ${formatTime(ts)}`);
    });

    volSlider.addEventListener("input", () => {
      const v = parseInt(volSlider.value);
      gmState.volume = v;
      volLabel.textContent = v;
      SocketHandler.emit("volume", { volume: v });
    });

    // ── Playlist-Aktionen ──
    el.querySelector("#yt-playlists-container").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const { action, pIdx, vIdx } = btn.dataset;
      const playlists = getPlaylists();

      if (action === "play-playlist") {
        const pl = playlists[pIdx];
        if (!pl.videos.length) return setStatus("⚠ Playlist ist leer.");
        gmState.playlistQueue = [...pl.videos];
        playQueueIndex(0);
        startQueueWatcher();

      } else if (action === "play-video") {
        stopQueueWatcher();
        gmState.playlistQueue = [];
        renderQueue();
        const v = playlists[pIdx].videos[vIdx];
        loadVideo(v.id, v.label, v.thumb);
      } else if (action === "delete-video") {
        playlists[pIdx].videos.splice(vIdx, 1);
        await savePlaylists(playlists);
        refreshPlaylists(el);
      } else if (action === "delete-playlist") {
        if (!confirm(`Playlist "${playlists[pIdx].name}" wirklich löschen?`)) return;
        playlists.splice(pIdx, 1);
        await savePlaylists(playlists);
        refreshPlaylists(el);
      } else if (action === "toggle-playlist") {
        const body  = el.querySelector(`#yt-playlist-body-${pIdx}`);
        const arrow = btn.querySelector(".yt-arrow");
        if (body) {
          const open = body.style.display !== "none";
          body.style.display = open ? "none" : "flex";
          if (arrow) arrow.textContent = open ? "▶" : "▼";
        }
      }
    });

    // Falls eine Queue schon vor dem (Wieder-)Öffnen lief, Watcher sicherstellen.
    if (gmState.playlistQueue.length) startQueueWatcher();

    // ── Soundboard ──
    ambienceVol.addEventListener("input", () => {
      const v = parseInt(ambienceVol.value);
      gmState.ambienceVolume = v;
      ambienceVolLabel.textContent = v;
      if (gmState.activeSoundId) SocketHandler.emit("ambience-volume", { volume: v });
    });

    el.querySelector("#yt-new-sound-btn").addEventListener("click", async () => {
      const label = prompt("Name für diesen Sound (z.B. „Regen“, „Taverne“):");
      if (!label) return;
      const urlOrId = prompt("YouTube-URL oder Video-ID:");
      if (!urlOrId) return;
      const videoId = extractVideoId(urlOrId.trim());
      if (!videoId) return setStatus("⚠ Ungültige URL oder Video-ID.");
      const soundboard = getSoundboard();
      const color = SOUND_PALETTE[soundboard.length % SOUND_PALETTE.length];
      soundboard.push({ id: `sb-${Date.now()}-${Math.floor(Math.random() * 1000)}`, label, videoId, color });
      await saveSoundboard(soundboard);
      refreshSoundboard(el);
    });

    soundboardGrid.addEventListener("click", async (e) => {
      const removeBtn = e.target.closest(".yt-sound-remove");
      if (removeBtn) {
        e.stopPropagation();
        const id = removeBtn.dataset.id;
        const soundboard = getSoundboard().filter(s => s.id !== id);
        await saveSoundboard(soundboard);
        if (gmState.activeSoundId === id) gmState.activeSoundId = null;
        refreshSoundboard(el);
        return;
      }

      const tile = e.target.closest(".yt-sound-btn");
      if (!tile) return;
      const id = tile.dataset.id;
      const soundboard = getSoundboard();
      const sound = soundboard.find(s => s.id === id);
      if (!sound) return;

      if (gmState.activeSoundId === id) {
        SocketHandler.emit("ambience-stop");
        gmState.activeSoundId = null;
      } else {
        SocketHandler.emit("ambience-play", { videoId: sound.videoId, volume: gmState.ambienceVolume });
        gmState.activeSoundId = id;
      }
      soundboardGrid.querySelectorAll(".yt-sound-btn").forEach(b => b.classList.toggle("active", b.dataset.id === gmState.activeSoundId));
    });
  }
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function renderPlaylist(pl, pIdx) {
  return `
    <div class="yt-playlist-group">
      <div class="yt-playlist-header">
        <button class="yt-playlist-toggle" data-action="toggle-playlist" data-p-idx="${pIdx}">
          <span class="yt-arrow">▼</span>
          <span class="yt-playlist-name">${pl.name}</span>
          <span class="yt-playlist-count">${pl.videos.length} Videos</span>
        </button>
        <button class="yt-btn green small" data-action="play-playlist" data-p-idx="${pIdx}" title="Playlist abspielen">▶ Alle</button>
        <button class="yt-btn red small" data-action="delete-playlist" data-p-idx="${pIdx}" title="Playlist löschen">✕</button>
      </div>
      <div class="yt-playlist-body" id="yt-playlist-body-${pIdx}">
        ${pl.videos.length === 0
          ? `<div class="yt-playlist-empty-small">Noch keine Videos.</div>`
          : pl.videos.map((v, vIdx) => renderVideoItem(v, pIdx, vIdx)).join("")}
      </div>
    </div>
  `;
}

function renderVideoItem(v, pIdx, vIdx) {
  return `
    <div class="yt-playlist-item">
      <img src="${v.thumb}" alt="" />
      <div class="yt-playlist-item-label" title="${v.id}">${v.label}</div>
      <div class="yt-playlist-item-actions">
        <button class="yt-btn green small" data-action="play-video"   data-p-idx="${pIdx}" data-v-idx="${vIdx}" title="Laden">▶</button>
        <button class="yt-btn red small"   data-action="delete-video" data-p-idx="${pIdx}" data-v-idx="${vIdx}" title="Entfernen">✕</button>
      </div>
    </div>
  `;
}

function renderSoundboard(soundboard) {
  if (!soundboard.length) {
    return `<div class="yt-playlist-empty">Noch keine Sounds. Klicke "＋ Sound hinzufügen".</div>`;
  }
  return soundboard.map(s => `
    <button class="yt-sound-btn" data-id="${s.id}" style="--sound-color:${s.color}; --sound-bg:${hexToRgba(s.color, 0.28)}">
      <span class="yt-sound-remove" data-id="${s.id}" title="Entfernen">✕</span>
      <span class="yt-sound-icon">🎧</span>
      <span class="yt-sound-label">${s.label}</span>
    </button>
  `).join("");
}

function refreshPlaylists(el) {
  const playlists = getPlaylists();
  el.querySelector("#yt-playlists-container").innerHTML = playlists.length === 0
    ? `<div class="yt-playlist-empty">Noch keine Playlist.</div>`
    : playlists.map((pl, i) => renderPlaylist(pl, i)).join("");
  const sel = el.querySelector("#yt-target-playlist");
  if (sel) {
    sel.innerHTML = `<option value="">— Playlist wählen —</option>` +
      playlists.map((p, i) => `<option value="${i}">${p.name}</option>`).join("");
  }
}

function refreshSoundboard(el) {
  const soundboard = getSoundboard();
  el.querySelector("#yt-soundboard-grid").innerHTML = renderSoundboard(soundboard);
}
