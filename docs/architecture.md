# Architektur & Kernsystem

Der Desktop Mini Agent ist als **Electron-App** konzipiert. Er teilt sich in zwei Hauptprozesse: den Main-Prozess (`main.js`) für Systemzugriffe und den Renderer-Prozess (`renderer.js` / `index.html`) für die Benutzeroberfläche.

## Aufbau

1. **Frontend (`index.html` & `renderer.js`)**
   - Transparente, schwebende Benutzeroberfläche (ähnlich Spotlight / Raycast).
   - Chat-Historie und Skill-Auswahl.
   - Lokales Audio-Recording und Spracherkennung (Voice).
   - "Bubble Mode" zur Minimierung als kleines Icon am Bildschirmrand.

2. **Backend (`main.js`)**
   - Verwaltung der LLM-API-Aufrufe (OpenAI, Gemini).
   - Integration lokaler Modelle via `node-llama-cpp` (z.B. Gemma-2-2b).
   - Screenshot-Erstellung via `screencapture` und Bildkomprimierung mit `sips`.
   - Apple-Script und Shell-Befehl-Ausführung.

## Datenfluss einer Anfrage
1. Nutzer tippt eine Frage ein oder nutzt das Mikrofon.
2. Der Renderer erfasst ggf. einen Screenshot und die aktiven `skills`.
3. Der IPC-Aufruf `process-query` sendet alles an den Main-Prozess.
4. Der Main-Prozess assembliert den dynamischen Prompt (Basis-Persona + aktive Skills).
5. Das Modell (OpenAI / Gemini) wird aufgerufen.
6. Gibt das Modell *Tool-Calls* zurück, werden diese im Main-Prozess ausgeführt (z.B. Terminal-Befehl). Das Ergebnis wird wieder an das Modell geschickt.
7. Die finale Antwort wird als Markdown an den Renderer gesendet.

## Sicherheit (Firewall & Risk Management)
- Systemeingriffe (Terminal, Dateibearbeitung) werden bei aktivierter Sicherheit durch ein Mini-LLM im Hintergrund ("Firewall") bewertet.
- Bei hohem Risiko erscheint ein Bestätigungs-Popup in der UI, bevor der Befehl auf dem Mac ausgeführt wird.
