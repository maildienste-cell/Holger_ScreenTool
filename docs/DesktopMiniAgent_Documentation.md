# Desktop Mini Agent - Gesamtdokumentation

Willkommen zur vollständigen Dokumentation des **Desktop Mini Agents** (Antigravity). 
Dieses Projekt ist ein modularer, KI-gestützter Assistent auf Basis von Electron und Node.js, der aktiv das System steuern, Code schreiben, im Web recherchieren und Daten analysieren kann.

## 🗂 Inhaltsverzeichnis der Dokumentation

### 1. Kernsystem & Architektur
Hier wird der technische Aufbau der App, die IPC-Kommunikation zwischen Frontend (`renderer.js`) und Backend (`main.js`) sowie die Integration von lokalen und Cloud-basierten Modellen (OpenAI, Gemini, lokales Llama) beschrieben.
👉 **[Zur Architektur-Dokumentation](file:///Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent/docs/architecture.md)**

### 2. Werkzeuge & Tools (Function Calling)
Der Agent verfügt über mächtige System-Werkzeuge (z.B. Terminal-Ausführung, Dateisystem, Websuche, AppleScript). Hier sind alle definierten "Tools" und deren Funktionsweise aufgelistet.
👉 **[Zu den Agent-Tools](file:///Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent/docs/tools.md)**

### 3. Agenten-Skills (Fähigkeiten & Personas)
Die Fähigkeiten des Agenten sind in an- und abwählbare "Skills" unterteilt. Diese verändern den System-Prompt und geben dem Agenten Zugriff auf spezifische Werkzeuge. 
Zur besseren Übersicht sind die Skills in drei Kategorien unterteilt:

* 🤖 **[Automatisierung & System-Skills](file:///Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent/docs/skills/automation.md)** *(Maus/Tastatur, Terminal, Programmierer)*
* 🎭 **[Personas & Assistenten-Skills](file:///Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent/docs/skills/personas.md)** *(Texter, Influencer, Kompakt, Screenchat)*
* 📈 **[Trading & Recherche-Skills](file:///Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent/docs/skills/trading.md)** *(StockCheck, MiroFish, Mr. Billig, Deep Research)*

### 4. Spezifische Features
* 🔥 **[Smart/Dumbzone Heatmap & Handover](file:///Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent/docs/context_heatmap_handover.md)** *(Kontext-Management)*
