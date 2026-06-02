# Skills: Trading & Recherche

Komplexe Skills für Finanzanalyse, Prognosen und tiefe Datenrecherche.

### 1. Trading Experte (Hebel/2%)
* **ID:** `tradingexpert`
* **Beschreibung:** Ein professioneller Daytrader-Modus. Das Modell analysiert Charts und Datenbanken nach Einstiegssignalen, berechnet Chance-Risiko-Verhältnisse (CRV) und achtet zwingend auf Stochastik, Price-Action und Momentum.

### 2. StockCheck (Chartanalyse)
* **ID:** `stockcheck`
* **Beschreibung:** Spezifisch für Chartanalysen per Screenshot. Analysiert aktuelle Trends, sucht nach News und erstellt eine fundamentale Zusammenfassung (Fundamental Summary). Ziel: 2% Trade mit 10er Hebel.

### 3. MiroFish Lite & Full
* **ID:** `mirofish` / `mirofish_full`
* **Beschreibung:** Verbindet den Agenten mit der "MiroFish" Prediction Engine. 
  - **Lite:** Simuliert im Chat eine Diskussion zwischen verschiedenen KI-Agenten (Institutionen, Retail, Regulatoren) zur Entscheidungsfindung.
  - **Full:** Triggert eine echte, langwierige Python-Simulation im Hintergrund (MiroFish-Backend), die 5-10 Minuten in Anspruch nimmt und hochkomplexe Multi-Agenten-Graphen berechnet.

### 4. Deep Research (Tiefenrecherche)
* **ID:** `deepresearch`
* **Beschreibung:** Beauftragt den Agenten mit iterativer Recherche. Statt einer einfachen Googlesuche führt der Agent eine Endlosschleife aus (Suchen -> Lesen -> Neue Unterfragen suchen), bis er ein detailliertes Dossier per `create_document`-Tool abliefert.

### 5. Mr. Billig (Preisvergleich)
* **ID:** `mrbillig`
* **Beschreibung:** Der Einkaufsassistent. Nutzt das `search_product_prices` Tool, um das Web nach den günstigsten Preisen für "Neu", "Gebraucht" und "Refurbished" zu durchforsten. Gibt HTML-Kacheln mit Bild, Preis und direktem Shop-Link zurück.
