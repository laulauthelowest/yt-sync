/**
 * YTSyncApp — GM-only control panel (Foundry v14 ApplicationV2).
 */

import { SocketHandler } from "./socket.mjs";
import { YTSyncPlayer } from "./player.mjs";

function extractVideoId(input) {
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1);
    return url.searchParams.get("v") ?? null;
  } catch {
    // Might already be a raw video ID (11 chars)
    if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
    return null;
  }
}

export class YTSyncApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "yt-sync-gm",
    classes: ["yt-sync-gm-app"],
    window: {
      title: "YT Sync — GM Control",
      resizable: false,
    },
    position: {
      width: 420,
      height: "auto",
    },
  };

  static openForGM() {
    const existing = Object.values(ui.windows).find(
      (w) => w.id === "yt-sync-gm"
    );
    if (existing) return existing.bringToTop();
    new YTSyncApp().render(true);
  }

  /** Render the inner HTML of the application */
  async _renderHTML(context, options) {
    const div = document.createElement("div");
    div.classList.add("yt-sync-gm-inner");
    div.innerHTML = `
      <div class="yt-field-row">
        <input
          type="text"
          id="yt-url-input"
          placeholder="YouTube URL or Video-ID einfügen…"
          autocomplete="off"
        />
        <button id="yt-load-btn" class="yt-btn primary">▶ Load</button>
      </div>

      <div class="yt-preview-row" id="yt-preview-row" style="display:none">
        <img id="yt-thumb" src="" alt="Thumbnail" />
        <div class="yt-meta">
          <div id="yt-title" class="yt-title"></div>
          <div id="yt-vid-id" class="yt-vid-id"></div>
        </div>
      </div>

      <div class="yt-controls-row">
        <button id="yt-play-btn"   class="yt-btn green"  disabled>▶ Play for all</button>
        <button id="yt-pause-btn"  class="yt-btn yellow" disabled>⏸ Pause</button>
        <button id="yt-resume-btn" class="yt-btn yellow" disabled>⏵ Resume</button>
        <button id="yt-stop-btn"   class="yt-btn red"    disabled>⏹ Stop</button>
      </div>

      <div class="yt-volume-row">
        <label>🔊 Volume for all players</label>
        <input type="range" id="yt-vol-all" min="0" max="100" value="50" />
        <span id="yt-vol-label">50</span>
      </div>

      <div class="yt-status" id="yt-status">Kein Video geladen.</div>
    `;
    return div;
  }

  /** Wire up event listeners after render */
  _onRender(context, options) {
    const el = this.element;
    let currentVideoId = null;

    const urlInput   = el.querySelector("#yt-url-input");
    const loadBtn    = el.querySelector("#yt-load-btn");
    const playBtn    = el.querySelector("#yt-play-btn");
    const pauseBtn   = el.querySelector("#yt-pause-btn");
    const resumeBtn  = el.querySelector("#yt-resume-btn");
    const stopBtn    = el.querySelector("#yt-stop-btn");
    const volSlider  = el.querySelector("#yt-vol-all");
    const volLabel   = el.querySelector("#yt-vol-label");
    const statusEl   = el.querySelector("#yt-status");
    const previewRow = el.querySelector("#yt-preview-row");
    const thumb      = el.querySelector("#yt-thumb");
    const titleEl    = el.querySelector("#yt-title");
    const vidIdEl    = el.querySelector("#yt-vid-id");

    function setStatus(msg) { statusEl.textContent = msg; }
    function enableControls(on) {
      playBtn.disabled = resumeBtn.disabled = pauseBtn.disabled = stopBtn.disabled = !on;
    }

    loadBtn.addEventListener("click", () => {
      const vid = extractVideoId(urlInput.value.trim());
      if (!vid) {
        return setStatus("⚠ Ungültige URL oder Video-ID.");
      }
      currentVideoId = vid;
      thumb.src = `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
      titleEl.textContent = "Video geladen";
      vidIdEl.textContent = `ID: ${vid}`;
      previewRow.style.display = "flex";
      enableControls(true);
      setStatus(`✓ Bereit: ${vid}`);
    });

    playBtn.addEventListener("click", () => {
      if (!currentVideoId) return;
      const vol = parseInt(volSlider.value);
      SocketHandler.emit("play", { videoId: currentVideoId, timestamp: 0, volume: vol });
      setStatus("▶ Spielt für alle Spieler…");
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
      currentVideoId = null;
      urlInput.value = "";
      setStatus("⏹ Gestoppt.");
    });

    volSlider.addEventListener("input", () => {
      const v = parseInt(volSlider.value);
      volLabel.textContent = v;
      SocketHandler.emit("volume", { volume: v });
    });
  }
}
