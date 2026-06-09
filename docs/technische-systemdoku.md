# Technische Systemdokumentation — Desktop Mini Agent

**Projekt:** Desktop Mini Agent (Antigravity)  
**Version:** 1.1.5  
**Autor:** Holger  
**Plattform:** macOS Apple Silicon (darwin arm64)

---

## 1. Systemüberblick

Der Desktop Mini Agent ist eine **Electron 33** Desktop-Anwendung mit dem Codenamen **Antigravity**. Die KI-Persona heißt **Franki**. Die App läuft als schwebendes Overlay-Fenster und verbindet multimodale LLM-Anfragen mit macOS-Systemzugriff über ein Tool-Calling-Framework.

### Kernprinzipien

- **Prozess-Trennung:** Privilegierte Operationen nur im Main-Prozess
- **Sandbox Renderer:** `contextIsolation: true`, API nur über `preload.js`
- **Human-in-the-Loop:** Riskante Aktionen erfordern Nutzer-Approval
- **Modularität:** Verhalten über Skills (Prompt-Modifier) steuerbar

---

## 2. Architektur

### 2.1 Prozessmodell

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                          │
├──────────────────────┬──────────────────────────────────┤
│   Main Process       │   Renderer Process               │
│   main.js            │   index.html + renderer.js       │
│                      │   (Chromium, sandboxed)          │
│   - IPC handlers     │                                  │
│   - LLM calls        │   preload.js (contextBridge)     │
│   - Tool execution   │        ↕ electronAPI           │
│   - File system      │                                  │
│   - child_process    │                                  │
├──────────────────────┴──────────────────────────────────┤
│   Overlay Window (overlay.html) — Automation-Feedback    │
│   Tray Icon — Hintergrund-Steuerung                      │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Dateistruktur

| Datei | Rolle |
|-------|-------|
| `main.js` | Electron Main: IPC, LLM, Tools, Security, Tray, Overlay |
| `renderer.js` | UI-Logik: Chat, Skills, Settings, Voice, Handover |
| `preload.js` | Sichere IPC-Brücke (`window.electronAPI`) |
| `index.html` | Haupt-UI (Chat, Settings, Logs, Modal, Bubble) |
| `overlay.html` | Transparenter Vollbild-Overlay für Maus-Feedback |
| `mirofish_orchestrator.js` | MiroFish Full API-Client (7-Schritt-Pipeline) |
| `package.json` | Dependencies, Build-Script |
| `Info.plist` | Mikrofon-Berechtigungstext für Bundle |

### 2.3 Datenfluss (Query)

1. Nutzer sendet Query (`renderer.js`)
2. Optional: Screenshot, Dateien, aktive Skills sammeln
3. IPC `process-query` → `main.js`
4. Optional: Auto-Pilot wählt Skills (Router-LLM)
5. Prompt-Assembly: Persona + Skills + Dateien + Screenshot
6. LLM-Aufruf (OpenAI mit Tool-Loop / Gemini text-only / lokal)
7. Tool-Calls ausführen (mit Firewall + Approval)
8. Ergebnis-Loop bis keine Tools mehr
9. Antwort `{ text, totalCost }` → Renderer → Markdown-Render

---

## 3. Technologie-Stack

| Schicht | Technologie | Version |
|---------|-------------|---------|
| Runtime | Electron | ^33.0.0 |
| Packaging | electron-packager | ^17.1.2 |
| Frontend | Vanilla HTML/CSS/JS | — |
| Markdown | marked | ^18.0.2 |
| Sanitize | DOMPurify | ^3.4.1 |
| HTTP Client | node-fetch | ^2.7.0 |
| PDF | pdf-parse | ^1.1.1 |
| Automation | @nut-tree-fork/nut-js | ^4.2.6 |
| Local LLM | node-llama-cpp | ^3.1.1 |
| OS Agent | openclaw | ^2026.5.28 |
| Code Agent | @earendil-works/pi-coding-agent | ^0.78.0 |

---

## 4. LLM-Integration

### 4.1 Provider-Routing

| Modell-Präfix | Provider | Tool-Calling |
|---------------|----------|--------------|
| `gpt-*` | OpenAI API | ✅ Multi-Turn Loop |
| `gemini-*` | Google Generative Language API | ❌ Text only |
| `local-*` | node-llama-cpp (GGUF) | Eingeschränkt |
| Andere + `localApiUrl` | Ollama/LM Studio (OpenAI-compat) | Abhängig vom Server |

### 4.2 Tool-Calling-Loop (OpenAI)

```
LLM Response → tool_calls?
  ├─ Ja → execute tools → append results → recall LLM (repeat)
  └─ Nein → return final text
```

Maximale Iterationen und Kosten-Tracking in `main.js`.

### 4.3 Spezialpfad: MiroFish Full

Bei aktivem Skill `mirofish_full` wird der normale LLM-Pfad umgangen. `runMiroFishSimulation()` in `mirofish_orchestrator.js` führt die 7-Schritt-API-Pipeline aus.

---

## 5. Sicherheitsarchitektur

### 5.1 Schichten

| Schicht | Mechanismus |
|---------|-------------|
| Renderer-Sandbox | Kein direkter Node/fs/child_process Zugriff |
| AppleScript-Blocklist | Regex auf `do shell script`, `rm`, `sudo`, `killall` |
| KI-Firewall | `gpt-4o-mini` bewertet Terminal-Befehle |
| Approval-Modal | UI-Bestätigung für Terminal, Datei, Automation, Agents |
| Assist-Risk | `guided` / `assist` / `auto` steuert Bestätigungshäufigkeit |
| Key-Verschlüsselung | `safeStorage` (macOS Keychain) |

### 5.2 Approval-Typen

- Terminal-Befehl (nach Firewall)
- Datei-Bearbeitung
- Desktop-Automation (`execute_computer_action`)
- OpenClaw-Task
- Pi Coding Agent-Delegation

---

## 6. Skill-System

Skills sind Prompt-Modifier in `config.customSkills`. Beim Start werden Default-Skills gemerged (`getConfig()`).

**Default-Skills:** screenchat, web, programmer, terminal, writer, influencer, compact, tradingexpert, stockcheck, mrbillig, deepresearch, mirofish, mirofish_full, assistenz, mac_controller

**Auto-Skill (`auto`):** Nicht in Defaults, aber in UI — Router wählt passende Skills.

**Tool-Gating:** Tools werden dem LLM nur angeboten, wenn der passende Skill aktiv ist (siehe `docs/schnittstellen.md`).

---

## 7. Persistenz

| Daten | Speicherort |
|-------|-------------|
| Konfiguration | `~/Library/Application Support/desktop-mini-agent/config.json` |
| Debug-Log | `.../debug_app.txt` |
| Lokales GGUF-Modell | `.../models/` |
| Temp-Dokumente | System-Temp (via `create_document`) |
| Screenshots | Temp-Pfade (screencapture) |

MiroFish-Key-Sync: Bei `saveConfig()` → Schreiben in `MiroFish/.env` (falls vorhanden).

---

## 8. macOS-Integration

### 8.1 Berechtigungen (TCC)

| Berechtigung | Zweck |
|--------------|-------|
| Bildschirmaufnahme | Screenshots für Vision |
| Bedienungshilfen | nut.js Maus/Tastatur |
| Mikrofon | Voice Input, Wake Word |

Build-Script: `tccutil reset Accessibility com.electron.desktop-mini-agent`

### 8.2 Systembefehle

- `screencapture -x` — stiller Screenshot
- `screencapture -i` — interaktiver Ausschnitt
- `sips` — JPEG-Komprimierung, Größenanpassung
- `osascript -e` — AppleScript

### 8.3 Fenster-Verhalten

- `alwaysOnTop: true`
- `frame: false`, `transparent: true`
- `vibrancy: 'under-window'`
- Dock versteckt (`app.dock.hide()`)
- Single-Instance Lock

---

## 9. Build & Deployment

### 9.1 Entwicklung

```bash
npm install
npm start    # electron .
```

### 9.2 Production Build

```bash
npm run build
```

Erzeugt: `release-builds/desktop-mini-agent-darwin-arm64/desktop-mini-agent.app`

**Build-Script:** `build-app.js` (Fallback-Builder, da `extract-zip` unter Node 24 mit `electron-packager` nicht zuverlässig läuft). Legacy: `npm run build:packager`.

**Bundle-Konfiguration:**
- Platform: `darwin`, Arch: `arm64`
- Extend-Info: `Info.plist` (Mikrofon-Description)
- Bundle-ID: `com.electron.desktop-mini-agent`

### 9.3 Installation unter Programme

```bash
pkill -f "desktop-mini-agent" || true
cp -R release-builds/desktop-mini-agent-darwin-arm64/desktop-mini-agent.app /Applications/
open /Applications/desktop-mini-agent.app
```

**Wichtig:** Nach jeder Code-Änderung Build + Kopie nach `/Applications/` (siehe `docs/workflow.md`).

### 9.4 Externe Abhängigkeit: MiroFish Full

- Separater Ordner `MiroFish/` (gitignored)
- Backend auf Port `5001`
- Auto-Spawn bei App-Start wenn Ordner existiert
- Manuell: `cd MiroFish && npm run backend`

---

## 10. Bekannte Einschränkungen

| Thema | Details |
|-------|---------|
| Plattform | Nur macOS (screencapture, osascript, TCC) |
| Gemini | Kein Tool-Calling-Loop |
| MiroFish Full | Externes Setup erforderlich |
| Bundle-ID | Generischer electron-packager Default |
| Kein OTA-Update | Manuelles Kopieren nach Programme |
| Hardcoded MiroFish-Pfad | `/Users/holgervoigt/.../MiroFish/.env` |

---

## 11. Erweiterungspunkte

| Bereich | Datei | Hinweis |
|---------|-------|---------|
| Neues Tool | `main.js` | Schema + Executor + Skill-Gate |
| Neuer Skill | `getConfig()` defaultSkills | + `docs/skills/*.md` |
| Neue IPC-Methode | `main.js` + `preload.js` + `renderer.js` | |
| Neuer LLM-Provider | `main.js` Provider-Branch | |
| Pi-Skills | `.pi/skills/*.md` | Für Pi Coding Agent |

---

## 12. Referenz-Dokumentation

| Dokument | Inhalt |
|----------|--------|
| `docs/architecture.md` | Kurzarchitektur |
| `docs/schnittstellen.md` | IPC, APIs, Tools |
| `docs/features.md` | Feature-Matrix |
| `docs/userstories.md` | User Stories |
| `docs/testanforderung.md` | Testfälle |
| `docs/workflow.md` | Entwicklungsworkflow |
| `docs/tools.md` | Tool-Beschreibungen |
| `docs/skills/*.md` | Skill-Kategorien |
