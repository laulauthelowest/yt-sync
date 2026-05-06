/**
 * YTSyncPlayer — wraps the YouTube IFrame API.
 * Injected into every client (GM + players) to render the video overlay.
 */

let _player = null;
let _container = null;
let _apiReady = false;

function ensureAPI() {
  return new Promise((resolve) => {
    if (_apiReady) return resolve();
    if (window.YT && window.YT.Player) {
      _apiReady = true;
      return resolve();
    }

    // Load YouTube IFrame API
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      _apiReady = true;
      resolve();
    };
  });
}

function buildContainer() {
  if (_container) return;

  _container = document.createElement("div");
  _container.id = "yt-sync-overlay";
  _container.innerHTML = `
    <div id="yt-sync-drag-handle">
      <span>▶ YT Sync</span>
      <button id="yt-sync-close" title="Close">✕</button>
    </div>
    <div id="yt-sync-iframe-wrap">
      <div id="yt-sync-player-target"></div>
    </div>
    <div id="yt-sync-vol-bar">
      <span>🔊</span>
      <input type="range" id="yt-sync-volume" min="0" max="100" value="50" />
    </div>
  `;
  document.body.appendChild(_container);

  // Close button (local only — doesn't affect other players)
  document.getElementById("yt-sync-close").addEventListener("click", () => {
    _container.style.display = "none";
  });

  // Local volume slider
  const volSlider = document.getElementById("yt-sync-volume");
  volSlider.addEventListener("input", () => {
    if (_player) _player.setVolume(parseInt(volSlider.value));
  });

  // Make draggable
  makeDraggable(_container, document.getElementById("yt-sync-drag-handle"));
}

function makeDraggable(el, handle) {
  let ox = 0, oy = 0, sx = 0, sy = 0;
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    sx = e.clientX - el.offsetLeft;
    sy = e.clientY - el.offsetTop;
    document.onmousemove = (e2) => {
      el.style.left = (e2.clientX - sx) + "px";
      el.style.top  = (e2.clientY - sy) + "px";
    };
    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
    };
  });
}

export class YTSyncPlayer {
  static async play(videoId, startSeconds = 0, volume = 50) {
    await ensureAPI();
    buildContainer();
    _container.style.display = "flex";

    const vol = game.settings.get("yt-sync", "defaultVolume") ?? volume;
    document.getElementById("yt-sync-volume").value = vol;

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
          controls: game.user.isGM ? 1 : 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            e.target.setVolume(vol);
            e.target.playVideo();
          },
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
    if (!_player) return;
    _player.seekTo(timestamp, true);
  }

  static stop() {
    if (_player) {
      _player.stopVideo();
      _player.destroy();
      _player = null;
    }
    if (_container) {
      _container.style.display = "none";
    }
  }

  static setVolume(volume) {
    if (_player) _player.setVolume(volume);
    const slider = document.getElementById("yt-sync-volume");
    if (slider) slider.value = volume;
  }

  static getCurrentTime() {
    return _player ? _player.getCurrentTime() : 0;
  }
}
