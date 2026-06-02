# Agent Tools & API

Der Agent kann über LLM "Function Calling" reale Aktionen auf dem Computer des Nutzers ausführen. Folgende Tools sind in der `main.js` definiert:

## System-Tools
* **`execute_terminal_command(command)`**
  * Führt rohe Bash/Zsh-Befehle aus (z.B. Git-Befehle, npm install, Dateiverwaltung).
  * *Sicherheitslayer:* Wird durch die KI-Firewall geprüft.
* **`execute_applescript(script)`**
  * Führt natives AppleScript über `osascript` aus.
  * *Sicherheitslayer:* Verbotene Befehle (z.B. `rm`, `killall`) werden via Regex geblockt.
* **`edit_file(file_path, search_string, replacement_string, content)`**
  * Bearbeitet lokale Dateien oder überschreibt sie komplett.
* **`create_document(filename, content)`**
  * Erstellt ein Dokument im Temp-Ordner und stellt es in der UI direkt als Download-Button zur Verfügung. Nützlich um Token im normalen Chat zu sparen.

## Websuche-Tools
* **`search_web(search_query)`**
  * Durchsucht das Internet (via DuckDuckGo Lite HTML Parser) nach aktuellen Informationen.
* **`search_product_prices(search_query)`**
  * Sucht speziell nach Preisen und Produkt-Bildern, um diese in der UI als Kacheln darzustellen (genutzt durch "Mr. Billig").
* **`open_website(url)`**
  * Öffnet eine URL sichtbar im Standardbrowser des Nutzers.

## UI & Automatisierung
* **`execute_computer_action(actions)`**
  * Nutzt `@nut-tree-fork/nut-js`, um physische Maus- und Tastatureingaben zu simulieren.
  * Unterstützt: `move` (Maus bewegen), `click` (Klicken), `type` (Tastatureingaben).
  * Arbeitet mit relativen Koordinaten (0.000 bis 1.000), die der Agent aus den Screenshots schätzt.
  * Erfordert eine ausführliche Rationale (Begründung) im Tool-Aufruf.
