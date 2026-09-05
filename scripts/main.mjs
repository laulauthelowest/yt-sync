/**
 * YT Sync — YouTube synchronization module for Foundry VTT v14
 */

import { YTSyncApp } from "./app.mjs";
import { SocketHandler } from "./socket.mjs";

const MODULE_ID = "yt-sync";

Hooks.once("init", () => {
  console.log("YT Sync | Initializing");

  game.settings.register(MODULE_ID, "defaultVolume", {
    name: "Default Volume",
    scope: "client", config: true, type: Number,
    range: { min: 0, max: 100, step: 5 }, default: 50,
  });

  game.settings.register(MODULE_ID, "allowPlayerControl", {
    name: "Allow Player Volume Control",
    scope: "world", config: true, type: Boolean, default: true,
  });

  game.settings.register(MODULE_ID, "playlists", {
    name: "YT Sync Playlists",
    scope: "world", config: false, type: Array, default: [],
  });

  game.settings.register(MODULE_ID, "soundboard", {
    name: "YT Sync Soundboard",
    scope: "world", config: false, type: Array, default: [],
  });

  game.settings.register(MODULE_ID, "apiKey", {
    name: "YouTube API Key",
    hint: 'Google API Key mit YouTube Data API v3. Kostenlos unter console.cloud.google.com. Ohne Key funktioniert nur URL/ID-Eingabe.',
    scope: "world", config: true, type: String, default: "",
  });
});

function onGMClick() {
  const overlay = document.getElementById("yt-sync-overlay");
  console.log("YT Sync | GM click, overlay display:", overlay?.style.display);
  if (overlay) overlay.style.display = "flex";
  YTSyncApp.openForGM();
}

Hooks.once("ready", () => {
  SocketHandler.init();

  if (game.user.isGM) {
    injectSidebarButton({ label: "YT Sync", onClick: () => YTSyncApp.openForGM() });
    Hooks.on("renderPlaylistDirectory", () => {
      document.getElementById("yt-sync-playlist-btn")?.remove();
      injectSidebarButton({ label: "YT Sync", onClick: () => YTSyncApp.openForGM() });
    });
  } else {
    const playerBtn = () => {
      document.getElementById("yt-sync-playlist-btn")?.remove();
      injectSidebarButton({
        label: "🔊 YT",
        title: "YT Sync Overlay wiederherstellen",
        onClick: () => {
          const overlay = document.getElementById("yt-sync-overlay");
          if (overlay) overlay.style.display = "flex";
          else ui.notifications.info("YT Sync: Warte auf ein Video vom GM.");
        },
      });
    };
    playerBtn();
    Hooks.on("renderPlaylistDirectory", playerBtn);
  }
});

function injectSidebarButton({ label, title, onClick }) {
  if (document.getElementById("yt-sync-playlist-btn")) return;
  const header =
    document.querySelector("#playlists .directory-header .action-buttons") ??
    document.querySelector(".playlists-sidebar .directory-header .action-buttons") ??
    document.querySelector("[data-tab='playlists'] .action-buttons") ??
    document.querySelector("#playlists .header-actions");
  if (!header) { setTimeout(() => injectSidebarButton({ label, title, onClick }), 500); return; }

  const btn = document.createElement("button");
  btn.id = "yt-sync-playlist-btn";
  btn.title = title ?? "YT Sync öffnen";
  btn.innerHTML = `<i class="fab fa-youtube"></i> ${label}`;
  btn.style.cssText = `
    background:#1a1a1a;border:1px solid #ff4444;border-radius:4px;
    color:#ff4444;cursor:pointer;font-size:11px;font-weight:700;
    padding:3px 8px;display:flex;align-items:center;gap:4px;white-space:nowrap;
  `;
  btn.addEventListener("click", onClick);
  header.prepend(btn);
}
