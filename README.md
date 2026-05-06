# YT Sync — YouTube für den Spieltisch

Ein Foundry VTT v14-Modul, das dem GM erlaubt, YouTube-Videos für alle verbundenen Spieler synchron abzuspielen.

[![Release](https://img.shields.io/github/v/release/laulauthelowest/yt-sync)](https://github.com/laulauthelowest/yt-sync/releases/latest)
[![Foundry v14](https://img.shields.io/badge/Foundry-v14-green)](https://foundryvtt.com)

## Features

- 🎬 YouTube-URL oder Video-ID einfach einfügen
- ▶ Play / ⏸ Pause / ⏵ Resume / ⏹ Stop — synchron für alle Spieler
- 🔊 Globale Lautstärkeregelung vom GM aus
- 🖱 Verschiebbares Video-Overlay (per Drag & Drop)
- 🔕 Spieler können ihre lokale Lautstärke anpassen (optional abschaltbar)
- 🌐 Deutsch & Englisch

---

## Installation via Foundry (empfohlen)

In Foundry VTT → **Add-on-Module installieren** → Manifest-URL einfügen:

```
https://raw.githubusercontent.com/laulauthelowest/yt-sync/main/module.json
```

## Manuell

1. Zip von [Releases](https://github.com/laulauthelowest/yt-sync/releases/latest) herunterladen
2. Entpacken nach `<FoundryUserData>/modules/yt-sync/`
3. Foundry starten → **Add-on-Module** → `YT Sync` aktivieren
4. Welt neu laden.

---

## Verwendung

1. Als **GM** klicke auf das YouTube-Symbol in der Token-Werkzeugleiste.
2. YouTube-URL oder Video-ID einfügen → **Load** klicken.
3. **▶ Play for all** startet das Video bei allen Spielern gleichzeitig.

---

## Neuen Release veröffentlichen

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions baut automatisch die ZIP und erstellt einen Release.

---

## Technischer Hintergrund

Das Modul nutzt:
- **Foundry Socket API** (`game.socket`) für Echtzeit-Befehle GM → Spieler
- **YouTube IFrame Player API** für die Videowiedergabe
- **ApplicationV2** (Foundry v14 native) für das GM-Kontrollfeld

## Dateistruktur

```
yt-sync/
├── module.json
├── .github/
│   └── workflows/
│       └── release.yml   # Automatischer Release per git tag
├── scripts/
│   ├── main.mjs          # Einstiegspunkt, Hooks
│   ├── socket.mjs        # Socket-Kommunikation
│   ├── player.mjs        # YouTube IFrame API Wrapper
│   └── app.mjs           # GM Control Panel (ApplicationV2)
├── styles/
│   └── yt-sync.css
└── lang/
    ├── en.json
    └── de.json
```

## Bekannte Einschränkungen

- YouTube erfordert eine Internetverbindung für alle Spieler.
- Einige Videos sind eingebettet gesperrt (Embedding disabled) — hier erscheint ein YT-Fehler.
- Die Sync-Genauigkeit hängt von der Netzwerklatenz ab (~0.5–2s Versatz möglich).
