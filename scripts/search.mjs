/**
 * YouTubeSearch — wraps YouTube Data API v3 search
 * Requires a Google API Key with YouTube Data API v3 enabled.
 */

const MODULE_ID = "yt-sync";
const API_BASE  = "https://www.googleapis.com/youtube/v3/search";

export class YouTubeSearch {
  static getKey() {
    return game.settings.get(MODULE_ID, "apiKey")?.trim() ?? "";
  }

  static hasKey() {
    return this.getKey().length > 0;
  }

  /**
   * Search YouTube for videos.
   * @param {string} query
   * @param {number} maxResults
   * @returns {Promise<Array>} array of { id, title, thumb, channel }
   */
  static async search(query, maxResults = 8) {
    const key = this.getKey();
    if (!key) throw new Error("Kein API Key konfiguriert.");

    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      maxResults,
      key,
    });

    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    return (data.items ?? []).map(item => ({
      id:      item.id.videoId,
      title:   item.snippet.title,
      thumb:   item.snippet.thumbnails?.medium?.url ?? `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
      channel: item.snippet.channelTitle,
    }));
  }
}
