/**
 * YT Sync — YouTube synchronization module for Foundry VTT v14
 * Lets the GM play YouTube videos synced to all connected players.
 */

import { YTSyncApp } from "./app.mjs";
import { SocketHandler } from "./socket.mjs";

const MODULE_ID = "yt-sync";

Hooks.once("init", () => {
  console.log("YT Sync | Initializing");

  // Register module settings
  game.settings.register(MODULE_ID, "defaultVolume", {
    name: "Default Volume",
    hint: "Default volume for synced videos (0–100).",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 100, step: 5 },
    default: 50,
  });

  game.settings.register(MODULE_ID, "allowPlayerControl", {
    name: "Allow Player Volume Control",
    hint: "Players can adjust their own local volume.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
});

Hooks.once("ready", () => {
  // Initialize socket handler for all clients
  SocketHandler.init();

  // Only GMs get the control UI
  if (game.user.isGM) {
    // Add a button to the Scene Controls (media category)
    Hooks.on("getSceneControlButtons", (controls) => {
      const bar = controls.find((c) => c.name === "token");
      if (bar) {
        bar.tools.push({
          name: "yt-sync",
          title: game.i18n.localize("YTSYNC.OpenControl"),
          icon: "fab fa-youtube",
          button: true,
          onClick: () => YTSyncApp.openForGM(),
        });
      }
    });
  }
});
