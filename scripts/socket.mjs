/**
 * SocketHandler — manages real-time sync between GM and players.
 *
 * Message types:
 *   play    { videoId, timestamp, volume }
 *   pause   { timestamp }
 *   resume  { timestamp }
 *   seek    { timestamp }
 *   stop    {}
 *   volume  { volume }
 */

import { YTSyncPlayer } from "./player.mjs";

const SOCKET_NAME = "module.yt-sync";

export class SocketHandler {
  static init() {
    game.socket.on(SOCKET_NAME, (data) => {
      // Only non-GM clients react to incoming commands
      if (game.user.isGM) return;
      SocketHandler._handleMessage(data);
    });
  }

  /** GM sends a command to all players */
  static emit(type, payload = {}) {
    if (!game.user.isGM) return;
    const message = { type, ...payload };
    game.socket.emit(SOCKET_NAME, message);
    // Also apply locally so GM sees the same thing
    SocketHandler._handleMessage(message);
  }

  static _handleMessage({ type, ...data }) {
    switch (type) {
      case "play":
        YTSyncPlayer.play(data.videoId, data.timestamp ?? 0, data.volume ?? 50);
        break;
      case "pause":
        YTSyncPlayer.pause(data.timestamp);
        break;
      case "resume":
        YTSyncPlayer.resume(data.timestamp);
        break;
      case "seek":
        YTSyncPlayer.seek(data.timestamp);
        break;
      case "stop":
        YTSyncPlayer.stop();
        break;
      case "volume":
        YTSyncPlayer.setVolume(data.volume);
        break;
    }
  }
}
