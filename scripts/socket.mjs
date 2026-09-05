/**
 * SocketHandler — GM-to-player sync.
 * play now includes audioOnly flag.
 */

import { YTSyncPlayer } from "./player.mjs";

const SOCKET_NAME = "module.yt-sync";

export class SocketHandler {
  static init() {
    game.socket.on(SOCKET_NAME, (data) => {
      if (game.user.isGM) return;
      SocketHandler._handleMessage(data);
    });
  }

  static emit(type, payload = {}) {
    if (!game.user.isGM) return;
    const message = { type, ...payload };
    game.socket.emit(SOCKET_NAME, message);
    SocketHandler._handleMessage(message);
  }

  static _handleMessage({ type, ...data }) {
    switch (type) {
      case "play":
        YTSyncPlayer.play(data.videoId, data.timestamp ?? 0, data.volume ?? 50, data.audioOnly ?? false);
        break;
      case "pause":   YTSyncPlayer.pause(data.timestamp); break;
      case "resume":  YTSyncPlayer.resume(data.timestamp); break;
      case "seek":    YTSyncPlayer.seek(data.timestamp); break;
      case "stop":    YTSyncPlayer.stop(); break;
      case "volume":  YTSyncPlayer.setVolume(data.volume); break;

      case "ambience-play":   YTSyncPlayer.playAmbience(data.videoId, data.volume ?? 50); break;
      case "ambience-stop":   YTSyncPlayer.stopAmbience(); break;
      case "ambience-volume": YTSyncPlayer.setAmbienceVolume(data.volume); break;
    }
  }
}
