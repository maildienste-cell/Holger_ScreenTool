# Skills: Automatisierung & System

Diese Skills befähigen den Agenten, aktiv in das Betriebssystem und die Codebasis einzugreifen.

### 1. Assistenz (Maus & Tastatur)
* **ID:** `assistenz`
* **Beschreibung:** Verwandelt den Agenten in einen interaktiven OS-Assistenten. Er erhält Zugriff auf das Tool `execute_computer_action`.
* **Besonderheit (Scratchpad):** Der Prompt zwingt das LLM, vor jeder Mausbewegung in einem `<scratchpad>`-Block laut nachzudenken und die genauen x/y-Koordinaten des UI-Elements auf dem Screenshot zu schätzen.

### 2. System-Admin
* **ID:** `terminal`
* **Beschreibung:** Fokus auf Terminal-Befehle und Systemautomatisierung. Der Agent wird zum macOS System-Administrator, der primär Bash und AppleScript für Problemlösungen nutzt.

### 3. Programmierer
* **ID:** `programmer`
* **Beschreibung:** Versetzt den Agenten in die Rolle eines Senior Software Engineers. Zwingt das Modell, extrem sauberen, effizienten und fehlerfreien Code zu schreiben.

### 4. Auto-Pilot (Meta-Skill)
* **ID:** `auto`
* **Beschreibung:** Eine Router-Logik. Wenn dieser Skill aktiv ist, analysiert ein kleines Hintergrund-LLM die Frage des Nutzers und wählt automatisch die passenden Skills für die Beantwortung aus, bevor die eigentliche Anfrage an das Hauptmodell gesendet wird.
