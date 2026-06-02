# Technisches Konzept: DesktopInteractionSkill für den Desktop-Agenten

## 1. Zielbild

Der Desktop-Agent soll nicht nur chatten, sondern aktiv am Computer helfen.

Er soll:

* den Bildschirm live beobachten
* Anwendungen erkennen
* Maus und Tastatur sichtbar bedienen
* Formulare ausfüllen
* Einstellungen ändern
* Citrix-/Remote-Desktop-Anwendungen bedienen
* nach jeder Aktion prüfen, ob sie erfolgreich war
* den Nutzer bei kritischen Aktionen um Freigabe bitten

Der Agent arbeitet nicht blind über feste Pixelkoordinaten, sondern über eine kontinuierliche Rückkopplungsschleife:

Observe → Think → Act → Verify

---

## 2. Grundprinzip

Der Agent bekommt eine Aufgabe wie:

> „Öffne Outlook und schreibe eine neue Mail.“

Dann arbeitet er schrittweise:

1. Screenshot aufnehmen
2. Aktive App und sichtbare UI erkennen
3. Nächsten sicheren Schritt planen
4. Maus sichtbar bewegen oder Tastatur nutzen
5. Aktion ausführen
6. Neuen Screenshot aufnehmen
7. Ergebnis prüfen
8. Nächsten Schritt entscheiden

Wichtig:

Pixelkoordinaten dürfen nur temporäre Zielpunkte aus dem aktuellen Screenshot sein.

Keine festen Klickkoordinaten aus alten Zuständen.

---

## 3. Architekturübersicht

```text
Desktop Agent
│
├── User Interface / Chat
│
├── Orchestrator
│   ├── Intent Detection
│   ├── Skill Routing
│   ├── Policy Check
│   └── Execution State
│
├── DesktopInteractionSkill
│   ├── Screen Capture
│   ├── Accessibility Reader
│   ├── Vision Parser
│   ├── Action Planner
│   ├── Mouse Controller
│   ├── Keyboard Controller
│   ├── Verification Engine
│   └── Audit Logger
│
├── BrowserSkill
│   ├── Playwright
│   └── Browser Use / Skyvern optional
│
├── LocalAutomationSkill
│   ├── AppleScript
│   ├── Shortcuts
│   ├── Shell
│   └── Open Interpreter optional
│
└── Safety Layer
    ├── Risk Classification
    ├── Human Confirmation
    ├── Stop Button
    └── Permission Boundaries
```

---

## 4. Technologiestack

### Desktop-GUI-Agent

Geeignete Open-Source-Bausteine:

* UI-TARS Desktop / Agent TARS für multimodale GUI-Agenten
* OmniParser für Screen Parsing und UI-Element-Erkennung
* Open Interpreter für lokale Computerfähigkeiten
* Browser Use oder Skyvern für Browser-Automation
* Playwright für robuste Websteuerung
* macOS Accessibility API für native App-Steuerung

UI-TARS Desktop beschreibt sich als Open-Source-Multimodal-Agent-Stack für Terminal, Computer, Browser und Produkte. OmniParser ist ein Screen-Parsing-Werkzeug für visionbasierte GUI-Agenten. Open Interpreter bietet eine lokale Natural-Language-Schnittstelle zu Computerfähigkeiten. Browser Use und Skyvern sind Open-Source-Ansätze für Browser-Automation.

---

## 5. Steuerungslogik

Der Agent nutzt eine feste Schleife:

```text
while task_not_done:
    observe_screen()
    parse_ui()
    plan_next_action()
    classify_risk()
    if confirmation_required:
        ask_user()
    execute_action()
    verify_result()
    log_action()
```

---

## 6. Aktionspriorität

Der Agent wählt immer die stabilste Methode zuerst.

### Priorität 1: Accessibility API

Für native macOS-Apps:

* Buttons erkennen
* Menüs auslesen
* Fenster fokussieren
* Eingabefelder erkennen

### Priorität 2: App-/Browser-APIs

Beispiele:

* Playwright für Webseiten
* Outlook-/Mail-Integration
* Kalender-/Kontakt-APIs
* Shortcuts

### Priorität 3: Vision-basierte Bedienung

Für:

* Citrix
* Remote Desktop
* SAP GUI
* Legacy-Software
* Anwendungen ohne API

### Priorität 4: Pixelklick

Nur als letzter Ausweg.

Regel:

Ein Pixelklick ist nur erlaubt, wenn der Zielpunkt unmittelbar aus dem aktuellen Screenshot erkannt wurde.

---

## 7. Live-Verhalten wie Scratchpad

Der Nutzer soll sehen:

* Maus bewegt sich sichtbar
* Zielbereich wird markiert
* Klick wird hervorgehoben
* Agent erklärt den nächsten Schritt
* Nach jedem Schritt wird neu geprüft

Beispiel:

```text
Agent:
„Ich sehe Outlook noch nicht. Ich öffne es über Spotlight.“

Aktion:
Cmd + Space
Eingabe: Outlook
Enter

Verify:
Screenshot prüfen

Agent:
„Outlook ist geöffnet. Ich erstelle jetzt eine neue Mail.“
```

---

## 8. Sicherheitsmodell

### Grüne Aktionen

Darf der Agent automatisch ausführen:

* Fenster öffnen
* Navigation
* Texte vorbereiten
* Formulare ausfüllen
* Einstellungen ansehen
* Dateien suchen

### Gelbe Aktionen

Bestätigung empfohlen:

* E-Mail-Entwurf erstellen
* Datei herunterladen
* Datei hochladen
* Formular abspeichern

### Rote Aktionen

Immer Bestätigung erforderlich:

* E-Mail senden
* Kaufen
* Bezahlen
* Überweisen
* Verträge abschließen
* Daten löschen
* Adminrechte vergeben
* Aktien kaufen/verkaufen
* Passwörter ändern

---

## 9. Human-in-the-Loop

Der Agent braucht drei Modi:

### Modus A: Nur zeigen

Agent erklärt nur:

> „Klicke hier.“

### Modus B: Geführt

Agent fragt vor jedem Schritt:

> „Soll ich jetzt auf Weiter klicken?“

### Modus C: Assistiert

Agent arbeitet selbstständig, stoppt aber bei gelben/roten Aktionen.

---

## 10. Overlay

Das Desktop-Overlay zeigt dauerhaft:

```text
Status: Beobachten / Denken / Ausführen / Warten
Aktuelle App: Outlook
Nächster Schritt: Neue Mail öffnen
Risiko: Grün
Stop: jederzeit abbrechen
```

Zusätzlich:

* Maus-Halo
* Klick-Ring
* Zielmarkierung
* kleiner Erklärungstext

---

## 11. Audit Log

Jede Aktion wird gespeichert:

```json
{
  "timestamp": "2026-05-29T10:00:00",
  "app": "Outlook",
  "mode": "assistiert",
  "action": "click",
  "target": "Neue E-Mail",
  "method": "accessibility",
  "risk": "green",
  "verified": true
}
```

Ziel:

* Nachvollziehbarkeit
* Debugging
* Vertrauen
* spätere Prozessautomatisierung

---

## 12. Fehlerbehandlung

Wenn eine Aktion fehlschlägt:

1. Screenshot neu prüfen
2. Fehlermeldung erkennen
3. Alternativen wählen
4. Nicht stumpf wiederholt auf dieselbe Koordinate klicken

Beispiel Outlook:

```text
AppleScript fehlgeschlagen.

Alternative 1:
Outlook über Accessibility fokussieren.

Alternative 2:
Outlook über Spotlight öffnen.

Alternative 3:
Outlook im Dock visuell erkennen und klicken.

Alternative 4:
Web-Outlook im Browser öffnen.

Alternative 5:
Nutzer um kurze Freigabe bitten.
```

---

## 13. Citrix-Modus

Citrix wird als visuelle Oberfläche behandelt.

Keine Annahme über DOM, API oder App-Struktur.

Der Agent nutzt:

* Screenshot
* OCR
* UI-Erkennung
* Tastatur
* Maus

Wichtig:

Citrix-Aktionen müssen langsamer laufen, weil Latenz und Bildaufbau schwanken können.

---

## 14. MVP

### MVP-Ziel

Ein funktionsfähiger DesktopInteractionSkill für macOS.

### MVP-Funktionen

* Screenshot aufnehmen
* aktive App erkennen
* UI-Elemente visuell erkennen
* Maus sichtbar bewegen
* Tastatur bedienen
* nach jeder Aktion Screenshot prüfen
* Formularfelder ausfüllen
* Outlook öffnen
* Browserformular ausfüllen
* Citrix-Fenster bedienen
* Stop-Button
* Audit Log

### MVP-Nichtziel

Noch keine vollautonomen Käufe, Zahlungen, Vertragsabschlüsse oder Adminaktionen.

---

## 15. Empfohlene Implementierungsreihenfolge

### Phase 1: Beobachten

* Screenshot Capture
* App-/Fenstererkennung
* UI-Beschreibung
* Overlay

### Phase 2: Geführte Maus

* Maus sichtbar bewegen
* Klicks ausführen
* Klickziel markieren
* Verify nach jedem Schritt

### Phase 3: Formulare

* Eingabefelder erkennen
* Text eintragen
* Checkboxen setzen
* Dropdowns bedienen

### Phase 4: Native Apps

* Outlook
* Finder
* Systemeinstellungen
* Safari/Chrome

### Phase 5: Citrix/Legacy

* OCR
* Vision Parsing
* langsame stabile Aktionsschritte
* Fehlererkennung

### Phase 6: Lernmodus

* wiederkehrende Abläufe erkennen
* Prozessschritte speichern
* Nutzer zur Automatisierung fragen

---

## 16. Definition of Done

Das Feature gilt als fertig, wenn der Agent:

* eine Aufgabe in kleine Schritte zerlegt
* den aktuellen Bildschirm versteht
* keine blinden Koordinatenklicks ausführt
* Mausbewegungen sichtbar macht
* nach jedem Schritt prüft
* bei Fehlern Alternativen versucht
* bei kritischen Aktionen stoppt
* ein vollständiges Audit Log schreibt

---

## 17. Beispiel-Use-Case

Aufgabe:

> „Öffne Outlook und schreibe eine neue Mail an Max mit dem Betreff Termin.“

Ablauf:

1. Agent prüft aktuellen Bildschirm
2. Erkennt: Outlook nicht aktiv
3. Öffnet Outlook über Spotlight
4. Prüft, ob Outlook sichtbar ist
5. Öffnet neue Mail
6. Trägt Empfänger ein
7. Trägt Betreff ein
8. Schreibt Mailtext
9. Stoppt vor „Senden“
10. Fragt Nutzer:

> „Die Mail ist vorbereitet. Soll ich sie senden?“

---

## 18. Strategisches Ziel

Der Desktop-Agent wird vom Chatbot zum echten digitalen Assistenten.

Er erklärt nicht nur die Computerwelt, sondern bedient sie sichtbar im Auftrag des Nutzers.

Besonders wertvoll für:

* ältere Menschen
* technisch unsichere Nutzer
* Sachbearbeitung
* Citrix-/SAP-Prozesse
* wiederkehrende Büroaufgaben
* persönliche Assistenz
