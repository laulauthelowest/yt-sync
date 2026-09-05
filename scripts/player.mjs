/**
 * YTSyncPlayer — wraps the YouTube IFrame API.
 * Players cannot control playback — only the GM can.
 */

let _player = null;
let _container = null;
let _apiReady = false;

let _ambiencePlayer = null;
let _ambienceContainer = null;

function ensureAPI() {
  return new Promise((resolve) => {
    if (_apiReady) return resolve();
    if (window.YT && window.YT.Player) { _apiReady = true; return resolve(); }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => { _apiReady = true; resolve(); };
  });
}

function buildAmbienceContainer() {
  if (_ambienceContainer) return;
  _ambienceContainer = document.createElement("div");
  _ambienceContainer.id = "yt-sync-ambience-target";
  // Hörbar, aber unsichtbar — gleicher Trick wie der Audio-only-Modus des Hauptplayers.
  _ambienceContainer.style.cssText =
    "position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(_ambienceContainer);
}

function buildContainer(isGM) {
  if (_container) return;

  _container = document.createElement("div");
  _container.id = "yt-sync-overlay";
  _container.innerHTML = `
    <div id="yt-sync-drag-handle">
      <span id="yt-sync-mode-label">▶ YT Sync</span>
      <button id="yt-sync-close" title="Schließen (nur lokal)">✕</button>
    </div>
    <div id="yt-sync-iframe-wrap">
      <div id="yt-sync-player-target"></div>
      <div id="yt-sync-click-block"></div>
    </div>
    <div id="yt-sync-vol-bar">
      <span>🔊</span>
      <input type="range" id="yt-sync-volume" min="0" max="100" value="50" />
    </div>
  `;
  document.body.appendChild(_container);

  document.getElementById("yt-sync-close").addEventListener("click", () => {
    _container.style.display = "none";
  });

  document.getElementById("yt-sync-volume").addEventListener("input", (e) => {
    if (_player) _player.setVolume(parseInt(e.target.value));
  });

  makeDraggable(_container, document.getElementById("yt-sync-drag-handle"));
}

function makeDraggable(el, handle) {
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    // Switch from bottom/right anchoring to top/left so drag works freely
    const rect = el.getBoundingClientRect();
    el.style.bottom = "auto";
    el.style.right  = "auto";
    el.style.top    = rect.top + "px";
    el.style.left   = rect.left + "px";

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const onMove = (e2) => {
      el.style.left = Math.max(0, e2.clientX - sx) + "px";
      el.style.top  = Math.max(0, e2.clientY - sy) + "px";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", () => document.removeEventListener("mousemove", onMove), { once: true });
  });
}

export class YTSyncPlayer {
  static async play(videoId, startSeconds = 0, volume = 50, audioOnly = false) {
    const isGM = game.user.isGM;

    await ensureAPI();
    buildContainer(isGM);

    // Audio-only: iframe-wrap auf 1px — Video lädt aber ist unsichtbar, Ton bleibt
    const wrap = document.getElementById("yt-sync-iframe-wrap");
    const modeLabel = document.getElementById("yt-sync-mode-label");
    const blocker = document.getElementById("yt-sync-click-block");

    if (audioOnly) {
      wrap.style.height = "1px";
      wrap.style.overflow = "hidden";
      wrap.style.opacity = "0";
      wrap.style.pointerEvents = "none";
      _container.style.width = "240px";
      if (modeLabel) modeLabel.textContent = "🎵 YT Sync — Nur Ton";
    } else {
      wrap.style.height = "";
      wrap.style.overflow = "";
      wrap.style.opacity = "1";
      wrap.style.pointerEvents = "";
      _container.style.width = "480px";
      if (modeLabel) modeLabel.textContent = "▶ YT Sync";
    }

    // Click-Blocker: GM sieht Controls, Spieler nicht
    if (blocker) {
      blocker.style.display = isGM ? "none" : "block";
    }

    _container.style.display = "flex";

    // Der vom GM gesendete Wert gilt — defaultVolume ist nur der Startwert
    // beim allerersten Öffnen (siehe app.mjs), nicht bei jedem Trackwechsel.
    const vol = volume;
    const volSlider = document.getElementById("yt-sync-volume");
    if (volSlider) volSlider.value = vol;

    if (_player) {
      _player.loadVideoById({ videoId, startSeconds });
      _player.setVolume(vol);
    } else {
      _player = new YT.Player("yt-sync-player-target", {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          autoplay: 1,
          start: Math.floor(startSeconds),
          controls: 0,        // Immer aus — GM steuert über das Panel
          modestbranding: 1,
          rel: 0,
          disablekb: 1,       // Keine Tastatursteuerung
          fs: 0,              // Kein Vollbild-Button
          iv_load_policy: 3,  // Keine Annotations
        },
        events: {
          onReady: (e) => { e.target.setVolume(vol); e.target.playVideo(); },
        },
      });
    }
  }

  static pause(timestamp) {
    if (!_player) return;
    if (timestamp !== undefined) _player.seekTo(timestamp, true);
    _player.pauseVideo();
  }

  static resume(timestamp) {
    if (!_player) return;
    if (timestamp !== undefined) _player.seekTo(timestamp, true);
    _player.playVideo();
  }

  static seek(timestamp) {
    if (_player) _player.seekTo(timestamp, true);
  }

  static stop() {
    if (_player) { _player.stopVideo(); _player.destroy(); _player = null; }
    if (_container) { _container.style.display = "none"; }
  }

  static setVolume(volume) {
    if (_player) _player.setVolume(volume);
    const slider = document.getElementById("yt-sync-volume");
    if (slider) slider.value = volume;
  }

  static getCurrentTime() {
    return _player ? _player.getCurrentTime() : 0;
  }

  static getDuration() {
    return _player ? _player.getDuration() : 0;
  }

  // Returns YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
  static getPlayerState() {
    return _player ? _player.getPlayerState() : -1;
  }

  // ── Soundboard / Ambience — eigener, unabhängiger Audiokanal ──────────
  // Bewusste Design-Entscheidung: nur EIN Ambience-Sound gleichzeitig, kein
  // echtes Mehrspur-Layering. Ein neuer Sound stoppt den vorherigen.
  // Läuft parallel zum Hauptplayer (Musik + Atmo gleichzeitig hörbar).

  static async playAmbience(videoId, volume = 50) {
    await ensureAPI();
    buildAmbienceContainer();

    if (_ambiencePlayer) {
      // loop:1 + playlist:[videoId] ist der offizielle YT-IFrame-API-Trick,
      // um ein einzelnes Video endlos zu wiederholen.
      _ambiencePlayer.loadPlaylist({ playlist: [videoId], index: 0, loopPlaylist: true });
      _ambiencePlayer.setVolume(volume);
      _ambiencePlayer.playVideo();
    } else {
      _ambiencePlayer = new YT.Player("yt-sync-ambience-target", {
        width: "1",
        height: "1",
        videoId,
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: videoId,
          controls: 0,
          disablekb: 1,
          fs: 0,
        },
        events: {
          onReady: (e) => { e.target.setVolume(volume); e.target.playVideo(); },
        },
      });
    }
  }

  static stopAmbience() {
    if (_ambiencePlayer) _ambiencePlayer.stopVideo();
  }

  static setAmbienceVolume(volume) {
    if (_ambiencePlayer) _ambiencePlayer.setVolume(volume);
  }

  static getAmbienceState() {
    return _ambiencePlayer ? _ambiencePlayer.getPlayerState() : -1;
  }
}
