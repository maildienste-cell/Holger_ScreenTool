# Smart/Dumbzone Heatmap & Context Handover

Diese Dokumentation beschreibt die technische Umsetzung der dynamischen "Heatmap"-Speicheranzeige und der automatischen LLM-Zusammenfassung (Context-Handover) im `DesktopMiniAgent`.

## 1. Übersicht

Das Feature löst das Problem des begrenzten Kontextfensters (aktuell hart auf 20 Nachrichten begrenzt in `sendQuery`). Anstatt den Chatverlauf beim Erreichen des Limits einfach abzuschneiden oder manuell komplett zu löschen, passiert Folgendes:

1. **Visuelles Feedback (Heatmap):** Ein Gehirn-Icon zeigt an, wie voll der Speicher ist (Grün = leer/smart, Rot = voll/dumb).
2. **Warnsystem (Puffer):** Bei Erreichen von 90% Kapazität (18 Nachrichten) erhält der Nutzer eine Warnung, dass der Speicher voll läuft.
3. **Smart Reset (Handover):** Klickt der Nutzer auf das Icon, fasst das LLM den bisherigen Chat im Hintergrund zusammen. Der Chatverlauf wird geleert und die Zusammenfassung wird als unsichtbarer "Start-Prompt" für den neuen Kontext genutzt.

---

## 2. Änderungen in der `index.html`

In der oberen Menüleiste (`.header-actions`) wurde das Gehirn-Icon vor dem Mülleimer-Icon (`#clear-chat-btn`) eingefügt:

```html
<span class="icon-btn" id="context-health-btn" title="Kontext Reset (Heatmap)" style="color: hsl(120, 100%, 50%); transition: color 0.3s;">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <!-- SVG Paths für Gehirn-Icon -->
  </svg>
</span>
```

---

## 3. Logik in der `renderer.js`

Die gesamte Logik für die Farbveränderung und den API-Aufruf zur Zusammenfassung liegt in der `renderer.js`.

### 3.1 Die `updateContextHeatmap()` Funktion

Diese Funktion berechnet die Farbe basierend auf der Länge des `chatHistory` Arrays:
- **Maximalwert:** 20 Nachrichten (entspricht einem Ratio von `1`).
- **Farbwert (HSL):** Der Hue-Wert verläuft von `120` (Grün) bis `0` (Rot). Die Sättigung bleibt bei 100%, die Helligkeit bei 50%.

```javascript
function updateContextHeatmap() {
  const btn = document.getElementById('context-health-btn');
  if (!btn) return;
  const ratio = Math.min(chatHistory.length / 20, 1); 
  const hue = 120 - (ratio * 120);
  btn.style.color = `hsl(${hue}, 100%, 50%)`;
}
```

*Wo wird sie aufgerufen?*
Jedes Mal, wenn sich `chatHistory` verändert (in `sendQuery`, beim manuellen Löschen des Chats und nach dem Context-Reset).

### 3.2 Das 10%-Puffer Warnsystem

Am Ende der `sendQuery` Funktion wurde ein Trigger eingebaut:
```javascript
if (chatHistory.length === 18) {
  addMessage("⚠️ System-Hinweis: Mein Kurzzeitgedächtnis ist fast voll...", "agent");
}
```
*Hinweis zur Weiterentwicklung:* Wenn das Limit von 20 Nachrichten jemals erhöht wird, muss dieser Trigger (z.B. auf 90% des neuen Limits) dynamisch angepasst werden.

### 3.3 Der "Smart Reset" (Click-Event)

Das Herzstück ist der EventListener für `#context-health-btn`.
Der Ablauf ist asynchron (`async`):
1. **Lade-Zustand:** UI-Sperre des Buttons, Einfügen einer *Lade-Nachricht* im UI.
2. **API-Call (Zusammenfassung):** 
   - Es wird ein hartcodierter `summaryPrompt` an das LLM gesendet.
   - **Wichtig:** Im Aufruf `window.electronAPI.processQuery` wird das Array `skills: []` übergeben. Dies verhindert, dass der Agent die Zusammenfassung z.B. im Jugendslang eines Influencers schreibt oder unerwünschte Persona-Muster anwendet. Die Zusammenfassung bleibt rein sachlich.
3. **Übergabe & UI-Reset:** 
   - Das UI wird mittels `document.getElementById('chat-area').innerHTML = '';` komplett geleert.
   - Der `chatHistory` Speicher wird mit dem neuen Start-Prompt (`[SYSTEM-ÜBERGABE: ...]`) überschrieben.
   - Eine hübsche Erfolgsbox zeigt die Zusammenfassung an.
   - Zuletzt wird `updateContextHeatmap()` aufgerufen, um das Icon wieder auf Grün zu setzen.

---

## 4. Ansatzpunkte für weitere Entwicklung

Wenn du dieses Feature ausbauen möchtest, hier die besten Ansatzpunkte:

1. **Dynamisches Nachrichten-Limit:** Anstatt die "20" hardzucodieren, könnte man in den Settings ein Feld für `Max Context Messages` hinzufügen und dieses in der UI abrufen.
2. **Kosten-Management:** Da die Zusammenfassung eines sehr langen Chats API-Kosten verursacht (weil die gesamten Tokens noch einmal gesendet werden), könnte man bei teuren Modellen (GPT-4o) überlegen, die Zusammenfassung über ein günstigeres Modell (z.B. `gpt-4o-mini` oder lokal) laufen zu lassen.
3. **Anpassbarer Handover-Prompt:** Der `summaryPrompt` könnte in den Einstellungen konfigurierbar gemacht werden, um dem Agenten spezifische Schwerpunkte für die Zusammenfassung (z.B. "Fokussiere dich nur auf Code-Snippets") vorzugeben.
