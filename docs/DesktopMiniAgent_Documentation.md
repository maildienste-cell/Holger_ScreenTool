# Desktop Mini Agent - Gesamtdokumentation

Willkommen zur vollständigen Dokumentation des **Desktop Mini Agents** (Antigravity). 
Dieses Projekt ist ein modularer, KI-gestützter Assistent auf Basis von Electron und Node.js, der aktiv das System steuern, Code schreiben, im Web recherchieren und Daten analysieren kann.

**Version:** 1.1.5 | **Persona:** Franki | **Plattform:** macOS Apple Silicon

---

## Entwicklungsworkflow

Jede Änderung folgt dem festen Ablauf: Promptreview → Promptoptimierung → Implementierungsplan → Umsetzung → Testung → Dokuerweiterung → Build & Deployment unter Programme.

👉 **[Entwicklungsworkflow](workflow.md)**

---

## Übersichtsdokumente

| Dokument | Inhalt |
|----------|--------|
| 👤 **[User Stories](userstories.md)** | Nutzeranforderungen als Epics und Stories mit Priorität |
| ⚡ **[Feature-Übersicht](features.md)** | Alle Features mit Status, Kategorien und Abhängigkeiten |
| 🔌 **[Schnittstellenübersicht](schnittstellen.md)** | IPC, APIs, Tools, Konfiguration, externe Dienste |
| 🏗 **[Technische Systemdoku](technische-systemdoku.md)** | Architektur, Stack, Sicherheit, Build & Deployment |
| ✅ **[Testanforderungen](testanforderung.md)** | Testfälle (TA-xx) mit Setup und Protokoll-Vorlage |

---

## 🗂 Detaildokumentation

### 1. Kernsystem & Architektur
Hier wird der technische Aufbau der App, die IPC-Kommunikation zwischen Frontend (`renderer.js`) und Backend (`main.js`) sowie die Integration von lokalen und Cloud-basierten Modellen (OpenAI, Gemini, lokales Llama) beschrieben.
👉 **[Zur Architektur-Dokumentation](architecture.md)**

### 2. Werkzeuge & Tools (Function Calling)
Der Agent verfügt über mächtige System-Werkzeuge (z.B. Terminal-Ausführung, Dateisystem, Websuche, AppleScript). Hier sind alle definierten "Tools" und deren Funktionsweise aufgelistet.
👉 **[Zu den Agent-Tools](tools.md)**

### 3. Agenten-Skills (Fähigkeiten & Personas)
Die Fähigkeiten des Agenten sind in an- und abwählbare "Skills" unterteilt. Diese verändern den System-Prompt und geben dem Agenten Zugriff auf spezifische Werkzeuge. 
Zur besseren Übersicht sind die Skills in drei Kategorien unterteilt:

* 🤖 **[Automatisierung & System-Skills](skills/automation.md)** *(Maus/Tastatur, Terminal, Programmierer)*
* 🎭 **[Personas & Assistenten-Skills](skills/personas.md)** *(Texter, Influencer, Kompakt, Screenchat)*
* 📈 **[Trading & Recherche-Skills](skills/trading.md)** *(StockCheck, MiroFish, Mr. Billig, Deep Research)*

### 4. Spezifische Features
* 🔥 **[Smart/Dumbzone Heatmap & Handover](context_heatmap_handover.md)** *(Kontext-Management)*
* 🔮 **[Desktop Interaction Skill (Konzept)](CONCEPT_DesktopInteractionSkill.md)** *(Zukunft: Observe→Think→Act→Verify)*

---

## Schnellstart

```bash
# Entwicklung
npm install && npm start

# Production Build + Programme
npm run build
cp -R release-builds/desktop-mini-agent-darwin-arm64/desktop-mini-agent.app /Applications/
open /Applications/desktop-mini-agent.app
```
