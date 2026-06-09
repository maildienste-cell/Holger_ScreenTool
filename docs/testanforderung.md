# Testanforderungen — Desktop Mini Agent

**Version:** 1.1.5  
**Bezug:** User Stories (`docs/userstories.md`), Features (`docs/features.md`)

---

## Testumfang nach Änderungsgröße

| Änderung | Pflicht-Tests |
|----------|---------------|
| Prompt/Skill-Tweak | TA des betroffenen Moduls |
| UI-Text/Layout | TA-UI-01 bis TA-UI-05 |
| Neues Tool / IPC | Vollständiger Lauf TA-CORE + TA-SEC + betroffenes Modul |
| Architektur / Build | **Alle TA** |

---

## Voraussetzungen (Test-Setup)

| # | Anforderung |
|---|-------------|
| TS-01 | macOS Apple Silicon |
| TS-02 | App installiert unter `/Applications/desktop-mini-agent.app` (nach `npm run build`) |
| TS-03 | Gültiger OpenAI API-Key in Einstellungen |
| TS-04 | Bildschirmaufnahme-Berechtigung erteilt |
| TS-05 | Bedienungshilfen-Berechtigung erteilt (für Assistenz-Tests) |
| TS-06 | Mikrofon-Berechtigung erteilt (für Voice-Tests) |
| TS-07 | Internetverbindung aktiv |
| TS-08 | Optional: MiroFish-Ordner + Backend auf :5001 (für TA-MF-*) |

### Deployment vor Test (nach Code-Änderung)

```bash
cd /Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent
npm install          # nur bei package.json-Änderung
npm run build
pkill -f "desktop-mini-agent" || true
cp -R release-builds/desktop-mini-agent-darwin-arm64/desktop-mini-agent.app /Applications/
open /Applications/desktop-mini-agent.app
```

---

## TA-CORE — Kernfunktionen

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-CORE-01 | App-Start | App aus Programme öffnen | Fenster erscheint unten rechts; Tray-Icon sichtbar | US-64 |
| TA-CORE-02 | Einfache Frage | „Was ist 2+2?" eingeben | Korrekte Antwort als Markdown | US-01 |
| TA-CORE-03 | Bubble-Modus | Minimieren-Button klicken | Fenster wird zu 64px Bubble | US-01 |
| TA-CORE-04 | Tray-Toggle | Tray-Icon klicken | Fenster ein-/ausblenden | US-65 |
| TA-CORE-05 | Single Instance | App zweimal starten | Nur eine Instanz aktiv | F-37 |
| TA-CORE-06 | Config-Persistenz | API-Key speichern, App neu starten | Key bleibt erhalten (entschlüsselt) | US-60 |
| TA-CORE-07 | Kosten-Anzeige | Query senden | `totalCost` steigt in Settings | US-62 |

---

## TA-UI — Benutzeroberfläche

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-UI-01 | Markdown-Code | Code-Block anfordern | Syntax als formatiertes HTML | US-05 |
| TA-UI-02 | Skill-Toggle | Skill aktivieren/deaktivieren | Badge ändert Zustand; Verhalten passt sich an | US-10 |
| TA-UI-03 | Settings-Panel | Einstellungen öffnen, Modell wechseln | Modell wird gespeichert und genutzt | US-61 |
| TA-UI-04 | Logs-Panel | Query mit Tool-Nutzung | Log-Einträge erscheinen live | US-63 |
| TA-UI-05 | Drag & Drop | PDF in Chat ziehen | Agent bezieht sich auf PDF-Inhalt | US-04 |

---

## TA-VIS — Bildschirm & Vision

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-VIS-01 | Screenchat | Skill `screenchat` aktiv; „Was sehe ich?" | Antwort beschreibt sichtbaren Bildschirminhalt | US-02 |
| TA-VIS-02 | Interactive Screenshot | Tray → Screenshot-Ausschnitt | Crop-Tool; Pfad wird übernommen | US-03 |
| TA-VIS-03 | HTTP Crop | `curl http://127.0.0.1:14111/crop` | Screenshot-Prozess startet | F-38 |
| TA-VIS-04 | Heatmap | 15+ Nachrichten senden | Brain-Icon wird rötlicher | US-06 |
| TA-VIS-05 | Handover | Brain-Icon bei vollem Kontext klicken | Zusammenfassung; History komprimiert | US-07 |

---

## TA-WEB — Recherche & Dokumente

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-WEB-01 | Websuche | Skill `web`; aktuelle Nachrichtenfrage | Agent nutzt `search_web`; aktuelle Infos | US-30 |
| TA-WEB-02 | Deep Research | Skill `deepresearch`; komplexes Thema | Mehrfach-Suche; Download-Dokument | US-31 |
| TA-WEB-03 | Dokument speichern | Download-Button klicken | Native Save-Dialog; Datei gespeichert | US-32 |
| TA-WEB-04 | URL öffnen | „Öffne google.de" | Browser öffnet URL | US-33 |
| TA-WEB-05 | Mr. Billig | Skill `mrbillig`; Produktpreis | HTML-Kacheln mit Bild, Preis, Link | US-15 |

---

## TA-SEC — Sicherheit & Approval

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-SEC-01 | Harmloser Befehl | „Liste Dateien im Home-Verzeichnis" | Terminal-Ausführung nach Approval (oder auto) | US-20 |
| TA-SEC-02 | Riskanter Befehl | `rm -rf /` anfordern | Firewall blockiert oder Modal warnt stark | US-21 |
| TA-SEC-03 | Approval ablehnen | Modal → Ablehnen | Befehl wird NICHT ausgeführt | US-21 |
| TA-SEC-04 | AppleScript-Block | Gefährliches AppleScript | Regex-Block; Fehlermeldung | F-19 |
| TA-SEC-05 | Datei-Edit Approval | Datei bearbeiten lassen | Modal erscheint vor Schreibzugriff | US-23 |

---

## TA-AUTO — Desktop-Automatisierung

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-AUTO-01 | Assistenz Move | Skill `assistenz`; „Bewege Maus in die Mitte" | Overlay zeigt Bewegung; Maus bewegt sich | US-24 |
| TA-AUTO-02 | Scratchpad | Assistenz-Aktion anfordern | Agent-Antwort enthält `<scratchpad>` vor Tool-Call | US-24 |
| TA-AUTO-03 | Guided-Modus | `assistRisk: guided`; Klick-Aktion | Jede Aktion erfordert Bestätigung | US-25 |
| TA-AUTO-04 | Auto-Modus | `assistRisk: auto`; harmlose Aktion | Keine Bestätigung bei low-risk | US-25 |

**Hilfsskript:** `node test_mouse.js` — nut.js Grundfunktion

---

## TA-SKILL — Skills & Personas

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-SKILL-01 | Influencer | Skill `influencer`; normale Frage | Antwort im Gen-Z-Slang-Stil | US-13 |
| TA-SKILL-02 | Kompakt | Skill `compact`; Erklärung anfordern | Kurze, direkte Antwort ohne Floskeln | US-13 |
| TA-SKILL-03 | Auto-Pilot | Skill `auto`; Trading-Frage | Router wählt Trading-Skills automatisch | US-11 |
| TA-SKILL-04 | Custom Skill | Eigenen Skill anlegen und aktivieren | Verhalten folgt Custom-Prompt | US-12 |
| TA-SKILL-05 | StockCheck | Skill `stockcheck` + Chart-Screenshot | Long/Short-Empfehlung mit CRV | US-14 |

---

## TA-VOICE — Sprache

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-VOICE-01 | Mikrofon-Input | Mikrofon-Button; sprechen | Text erscheint im Eingabefeld | US-50 |
| TA-VOICE-02 | TTS-Output | Voice aktiviert; Query senden | Antwort wird vorgelesen | US-51 |
| TA-VOICE-03 | Wake Word | Wake Word konfiguriert; „Hey Inge" sagen | App reagiert (falls aktiviert) | US-52 |

---

## TA-MF — MiroFish

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-MF-01 | MiroFish Lite | Skill `mirofish`; Aktienfrage | In-Chat Prognose-Bericht | US-40 |
| TA-MF-02 | MiroFish Full | Skill `mirofish_full`; Simulation starten | Animation; 5–10 Min.; Report | US-41 |
| TA-MF-03 | Backend offline | Full ohne Backend | Verständliche Fehlermeldung | US-41 |

**Voraussetzung TA-MF-02:** MiroFish-Ordner, Backend auf :5001

---

## TA-LOCAL — Lokales Modell

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-LOCAL-01 | Modell-Download | Lokales Modell wählen (falls UI) | Download-Overlay; Fortschritt | F-32 |
| TA-LOCAL-02 | Lokale Inferenz | Query mit lokalem Modell | Antwort ohne Cloud-API | F-31 |

**Hilfsskripte:** `node check_models.js`, `node test_models.js`

---

## TA-BUILD — Build & Deployment

| ID | Testfall | Schritte | Erwartetes Ergebnis | US-Ref |
|----|----------|----------|---------------------|--------|
| TA-BUILD-01 | npm run build | Build ausführen | `.app` in `release-builds/` | US-64 |
| TA-BUILD-02 | Programme-Install | App nach `/Applications/` kopieren | App startet aus Programme | US-64 |
| TA-BUILD-03 | Berechtigungen | Erster Start nach frischem Build | macOS fragt Berechtigungen an | — |
| TA-BUILD-04 | Config-Erhalt | Build + Install; App starten | Bestehende config.json unverändert | US-60 |

---

## Testprotokoll-Vorlage

```markdown
## Testlauf: [Datum]
**Änderung:** [Beschreibung]
**Tester:** [Name]
**App-Version:** 1.1.5
**Installationsort:** /Applications/desktop-mini-agent.app

| ID | Status | Anmerkung |
|----|--------|-----------|
| TA-CORE-01 | ✅/❌/⏭ | |
| ... | | |

**Gesamt:** X bestanden / Y fehlgeschlagen / Z übersprungen
```

---

## Automatisierbare Tests (aktuell)

| Skript | Prüft | Befehl |
|--------|-------|--------|
| `test_mouse.js` | nut.js Mausbewegung | `node test_mouse.js` |
| `test_models.js` | Lokale Modell-Inferenz | `node test_models.js` |
| `check_models.js` | Modell-Verfügbarkeit | `node check_models.js` |

*Vollständige UI-/IPC-Tests sind manuell in der installierten App durchzuführen.*
