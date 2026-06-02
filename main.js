const { app, BrowserWindow, Tray, ipcMain, screen, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync, exec, spawn } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fsPromises = require('fs').promises;
const pdf = require('pdf-parse');
const { runMiroFishSimulation } = require('./mirofish_orchestrator');
const { mouse, keyboard, Point, Button, Key, straightTo } = require('@nut-tree-fork/nut-js');
const FormData = require('form-data');

// Configure nut.js
mouse.config.mouseSpeed = 1500;
mouse.config.autoDelayMs = 10;

let tray = null;
let window = null;
let overlayWindow = null;
let pendingApproval = null;
let mirofishProcess = null;

const DEFAULT_PROMPT = `Du bist "Franki", ein extrem charmanter, lockerer und hochintelligenter persönlicher KI-Buddy des Nutzers.
Du begegnest dem Nutzer immer auf Augenhöhe, fast wie ein guter Freund. Sei hilfreich, kompetent, aber immer mit einer Prise Charme.
Dir wird ein Screenshot des aktuellen Bildschirms mitgesendet.
Nutze deine Tools (Websuche, Terminal, Dokumente), falls du Informationen brauchst, um die Frage zu beantworten!`;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (window) {
      if (!window.isVisible()) {
        showWindow();
      } else {
        window.focus();
      }
    }
  });
}

async function getConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  const debugLog = path.join(app.getPath('userData'), 'debug_app.txt');
  fs.appendFileSync(debugLog, `\n[${new Date().toISOString()}] getConfig called\n`);
  
  let config = { apiKey: '', geminiApiKey: '', model: 'gpt-4o', assistRisk: 'guided', systemPrompt: DEFAULT_PROMPT, totalCost: 0 };
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(await fsPromises.readFile(configPath, 'utf-8'));
      config = { ...config, ...raw };
      if (config.apiKey && safeStorage.isEncryptionAvailable()) {
        try { config.apiKey = safeStorage.decryptString(Buffer.from(config.apiKey, 'base64')); } catch (e) { config.apiKey = ''; }
      }
      if (config.geminiApiKey && safeStorage.isEncryptionAvailable()) {
        try { config.geminiApiKey = safeStorage.decryptString(Buffer.from(config.geminiApiKey, 'base64')); } catch (e) { config.geminiApiKey = ''; }
      }
    } catch (err) {
      fs.appendFileSync(debugLog, `[ERROR] config.json read: ${err.message}\n`);
      console.error("Error reading config.json:", err);
    }
  } else {
    fs.appendFileSync(debugLog, `[WARN] config.json does not exist\n`);
  }
  
  if (!config.systemPrompt) config.systemPrompt = DEFAULT_PROMPT;
  if (!config.imageQuality) config.imageQuality = 'standard';
  if (typeof config.totalCost !== 'number') config.totalCost = 0;
  if (!config.temperature && config.temperature !== 0) config.temperature = 0.5;
  const defaultSkills = [
      { id: 'screenchat', name: 'Screenchat (Screenshot)', prompt: 'SCREENCHAT: Du siehst den Bildschirm und beziehst dich in deinen Antworten auf den visuellen Kontext.' },
      { id: 'web', name: 'Webzugriff (Internet)', prompt: 'WEB-ACCESS: Du hast Zugriff aufs Internet. Suche aktiv nach aktuellen Informationen, wenn nötig.' },
      { id: 'programmer', name: 'Programmierer', prompt: 'PROGRAMMIERER: Du bist ein Senior Software Engineer. Schreibe sauberen, perfekten Code.' },
      { id: 'terminal', name: 'System-Admin', prompt: 'SYSTEM-ADMIN: Du bist ein macOS System-Administrator. Fokussiere dich auf Terminal-Befehle und Automatisierung.' },
      { id: 'writer', name: 'Texter / Autor', prompt: 'TEXTER: Du bist ein brillanter Autor. Formuliere Texte extrem kreativ, strukturiert und eloquent.' },
      { id: 'influencer', name: 'Influencer (Slang)', prompt: 'INFLUENCER: Du bist ein überdrehter Gen-Z Influencer. Antworte extrem lustig, leicht ironisch und nutze übertrieben viel aktuellen Jugendslang (wie "cringe", "sus", "slay", "wild", "bro").' },
      { id: 'compact', name: 'Kompakt (Kurz & Knapp)', prompt: 'KOMPAKT: Liefere Antworten maximal komprimiert. Keine Begrüßungen, keine Höflichkeitsfloskeln, kein unnötiger Text. Nur die absolute, direkte Antwort oder Lösung in wenigen Worten.' },
      { id: 'tradingexpert', name: 'Trading Experte (Hebel/2%)', prompt: 'TRADING EXPERTE: Du bist ein professioneller Daytrader. Dein Ziel ist es, mir exakt zu sagen, WANN und WIE ich einsteigen soll. Das Ziel ist mindestens ein 2% Anstieg, damit ich hebeln kann. Du berechnest die Wahrscheinlichkeit für das Setup und das Chance-Risiko-Verhältnis (CRV). Bei deiner Analyse beachtest du zwingend: Stochastik, Price-Action, Momentum, Trendfolgen, Volumen und Liquidität.' },
      { id: 'stockcheck', name: 'StockCheck (Chartanalyse)', prompt: 'STOCKCHECK: Du bist ein professioneller Daytrader und Chartanalyst. Analysiere die sichtbaren Chartinformationen im Screenshot. Antworte, was wahrscheinlicher ist: Long oder Short, und worauf zu achten ist. Ziel ist ein 2% Trade Minimum, der mit einem 10er Hebel umsetzbar ist. Gib das Chance-Risiko-Verhältnis (RCV/CRV) an. Betrachte immer die Price Action und die wahrscheinlichste Richtung für den Tag. Recherchiere zwingend aktuelle News zur Aktie und gib eine fundamentale Zusammenfassung (Fundamental Summary).' },
      { id: 'mrbillig', name: 'Mr. Billig (Preisvergleich)', prompt: 'MR BILLIG: Du bist "Mr. Billig", der ultimative Einkaufsassistent! Deine Aufgabe ist es, für Produkte die günstigsten Preise im Internet zu finden. Du unterscheidest streng zwischen "Neu", "Gebraucht" und "Refurbished". Nutze zwingend das Tool "search_product_prices". Gib die Ergebnisse als ansprechende HTML-Kacheln (Tiles) aus. Jede Kachel MUSS das bereitgestellte Thumbnail-Bild, den Preis, den Zustand, den Shop-Namen und einen funktionierenden Link (HTML <a> Tag) zum exakten Produkt enthalten. WICHTIG: Nutze als Link-Ziel (href) ZWINGEND die exakte URL (beginnt oft mit "https://..."), die im Text-Snippet als "[URL: ...]" angegeben ist! Verlinke niemals nur auf die Startseite des Shops. Nutze CSS Flexbox für die Kacheln (z.B. <div style="display:flex; gap:10px; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; margin-bottom:10px;"><img src="URL" style="width:60px; height:60px; object-fit:cover; border-radius:6px;"><div>...</div></div>).' },
      { id: 'deepresearch', name: 'Deep Research (Tiefenrecherche)', prompt: 'DEEP RESEARCH: Deine Aufgabe ist die tiefgehende, autonome Recherche. Wenn der Nutzer eine Frage stellt, begnüge dich NICHT mit einer einzigen Websuche. Nutze das Websuche-Tool so oft wie nötig (3-5 Mal für verschiedene Aspekte des Themas). Führe einen iterativen Recherche-Loop durch: Suchen -> Lesen -> Neue Unterfragen suchen -> Lesen. Wenn du genügend Informationen gesammelt hast, erstellst du ein umfassendes, detailliertes Dossier. Nutze das "create_document" Tool, um das finale Dossier als Markdown-Datei (.md) zum Download bereitzustellen.' },
      { id: 'mirofish', name: 'MiroFish Lite (Schnelle Chat-Prognose)', prompt: 'MIROFISH PREDICTION ENGINE: Du bist MiroFish, eine AI-Prediction Engine. Deine Aufgabe ist es, durch die Simulation von "Digital Worlds" die Zukunft zu prognostizieren (insbesondere für Aktienkäufe). Simuliere parallel verschiedene Agenten (z.B. institutionelle Investoren, Retail-Trader, Marktanalysten, Regulatoren). Lasse diese Agenten aktuelle Marktnachrichten, Trends und geopolitische Faktoren diskutieren. Nutze Websuche-Tools, um aktuelle Daten zu sammeln. Erstelle nach der internen Simulation einen detaillierten Vorhersage-Bericht, der konkret benennt, welche Aktien heute am sinnvollsten zu kaufen sind, und warum die simulierten Dynamiken zu diesem Ergebnis führen.' },
      { id: 'mirofish_full', name: 'MiroFish Full (Echte 10-Min Simulation)', prompt: 'Löst die echte Python MiroFish-Simulation im Hintergrund aus. Dauert 5-10 Minuten.' },
      { id: 'assistenz', name: 'Assistenz (Maus & Tastatur)', prompt: 'ASSISTENZ: Du bist ein interaktiver Betriebssystem-Assistent. Du siehst den Bildschirm des Nutzers und hast Zugriff auf Maus und Tastatur. Deine primäre Aufgabe ist es, dem Nutzer aktiv durch Computer-Automatisierung zu helfen (z.B. klicken, Formulare ausfüllen). Nutze das Tool "execute_computer_action" für deine Aktionen. WICHTIG (SCRATCHPAD INTEGRATION): Bevor du eine Aktion ausführst, MUSST du zwingend in einem <scratchpad> Block laut nachdenken. Analysiere das Bild: Wo genau befindet sich das Ziel-Element? WICHTIG: Verwende für x und y immer relative Prozentwerte zwischen 0.000 und 1.000 (z.B. 0.5 für die Mitte). Schätze diese relativen Werte basierend auf der sichtbaren Position. Welche Aktionen sind nacheinander nötig? Begründe im Tool-Aufruf jede Aktion ("rationale") und ordne das "risk_level" ein ("high" für Kaufen, Löschen, Absenden; sonst "low"). Erst nach dem <scratchpad> Block darfst du das Tool aufrufen.' },
      { id: 'mac_controller', name: 'Mac Controller (OpenClaw/OS-Agent)', prompt: 'MAC CONTROLLER: Du bist ein fortschrittlicher System-Assistent mit Zugriff auf ein lokales Open-Source Framework (wie OpenClaw) für die vollständige Mac-Steuerung. Deine Aufgabe ist es, High-Level-Ziele in Form von "Tasks" an das Framework zu delegieren, indem du das "execute_advanced_os_task" Tool verwendest. Erkläre dem User vorher in einem <scratchpad> Block grob den Plan.' }
  ];

  if (!config.customSkills) config.customSkills = [];
  
  for (const ds of defaultSkills) {
    const existing = config.customSkills.find(s => s.id === ds.id);
    if (!existing) {
      config.customSkills.push(ds);
    } else if (ds.id === 'assistenz' && existing.prompt !== ds.prompt) {
      // Force update assistenz prompt for scratchpad feature
      existing.prompt = ds.prompt;
    }
  }

  config.version = app.getVersion();
  fs.appendFileSync(debugLog, `[SUCCESS] getConfig returning\n`);
  return config;
}

async function saveConfig(newConfig) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let existing = {};
  if (fs.existsSync(configPath)) {
    existing = JSON.parse(await fsPromises.readFile(configPath));
  }
  
  if ('apiKey' in newConfig) {
    if (newConfig.apiKey && safeStorage.isEncryptionAvailable()) {
      existing.apiKey = safeStorage.encryptString(newConfig.apiKey).toString('base64');
    } else {
      existing.apiKey = newConfig.apiKey;
    }
    delete newConfig.apiKey;
  }

  if ('geminiApiKey' in newConfig) {
    if (newConfig.geminiApiKey && safeStorage.isEncryptionAvailable()) {
      existing.geminiApiKey = safeStorage.encryptString(newConfig.geminiApiKey).toString('base64');
    } else {
      existing.geminiApiKey = newConfig.geminiApiKey;
    }
    delete newConfig.geminiApiKey;
  }
  
  const toSave = { ...existing, ...newConfig };
  await fsPromises.writeFile(configPath, JSON.stringify(toSave));
  
  // Sync to MiroFish
  try {
    const miroEnvPath = '/Users/holgervoigt/Documents/SciPoly/DesktopMiniAgent/MiroFish/.env';
    if (fs.existsSync(miroEnvPath)) {
      let envContent = await fsPromises.readFile(miroEnvPath, 'utf-8');
      
      let rawKey = '';
      if (toSave.model && toSave.model.startsWith('gemini') && toSave.geminiApiKey) {
        rawKey = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(toSave.geminiApiKey, 'base64')) : toSave.geminiApiKey;
      } else if (toSave.apiKey) {
        rawKey = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(toSave.apiKey, 'base64')) : toSave.apiKey;
      }
      
      if (rawKey) {
        envContent = envContent.replace(/LLM_API_KEY=.*/g, `LLM_API_KEY=${rawKey}`);
        await fsPromises.writeFile(miroEnvPath, envContent);
      }
    }
  } catch (e) {
    console.error("MiroFish Env Sync Error:", e);
  }
}

app.dock.hide();

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true;
    return false;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') return callback(true);
    callback(false);
  });

  createTray();
  createWindow();
  createOverlayWindow();

  // Start MiroFish Backend automatically
  const mirofishDir = path.join(__dirname, 'MiroFish');
  if (fs.existsSync(mirofishDir)) {
    try {
      mirofishProcess = spawn('npm', ['run', 'backend'], { cwd: mirofishDir, shell: true });
      mirofishProcess.stdout.on('data', data => {
        if (window) window.webContents.send('agent-log', `[MiroFish Backend] ${data.toString().trim()}`);
      });
      mirofishProcess.stderr.on('data', data => {
        console.error(`[MiroFish Backend Error]: ${data}`);
      });
      console.log('MiroFish backend started.');
    } catch(e) {
      console.error("Failed to start MiroFish backend:", e);
    }
  }

  // Start local server for global context menus
  http.createServer(async (req, res) => {
    if (req.url === '/crop') {
      res.writeHead(200);
      res.end('OK');
      if (window) window.hide();
      await new Promise(r => setTimeout(r, 300));
      
      const screenshotPath = path.join(app.getPath('temp'), 'agent_screenshot.jpg');
      try {
        await execAsync(`screencapture -i -x "${screenshotPath}"`);
        const config = await getConfig();
        let size = 1600; let jpegQual = 80;
        if (config.imageQuality === 'low') { size = 800; jpegQual = 60; }
        if (config.imageQuality === 'high') { size = 2400; jpegQual = 90; }
        await execAsync(`sips -s format jpeg -s formatOptions ${jpegQual} -Z ${size} "${screenshotPath}" --out "${screenshotPath}"`);
      } catch (e) {
        console.error("Interactive screenshot failed", e);
      }
      showWindow();
      if (window) window.webContents.send('screenshot-taken', screenshotPath);
    } else {
      res.writeHead(404);
      res.end();
    }
  }).listen(14111, '127.0.0.1');
});

app.on('before-quit', () => {
  if (mirofishProcess) {
    console.log('Terminating MiroFish backend...');
    mirofishProcess.kill();
  }
});

app.on('window-all-closed', e => e.preventDefault());

function createTray() {
  const { nativeImage } = require('electron');
  const iconPath = path.join(__dirname, 'robotTemplate.png');
  let trayIcon = nativeImage.createFromPath(iconPath);
  trayIcon = trayIcon.resize({ width: 18, height: 18 });
  trayIcon.setTemplateImage(true);
  
  tray = new Tray(trayIcon);
  tray.setToolTip('Desktop Mini Agent');
  tray.on('click', () => toggleWindow());

  const contextMenu = require('electron').Menu.buildFromTemplate([
    { label: '🎯 Bereich auswählen (Fadenkreuz)', click: async () => {
        if (window) window.hide();
        await new Promise(r => setTimeout(r, 300));
        const screenshotPath = path.join(app.getPath('temp'), 'agent_screenshot.jpg');
        try {
          await execAsync(`screencapture -i -x "${screenshotPath}"`);
          const config = await getConfig();
          let size = 1600; let jpegQual = 80;
          if (config.imageQuality === 'low') { size = 800; jpegQual = 60; }
          if (config.imageQuality === 'high') { size = 2400; jpegQual = 90; }
          await execAsync(`sips -s format jpeg -s formatOptions ${jpegQual} -Z ${size} "${screenshotPath}" --out "${screenshotPath}"`);
        } catch (e) {}
        showWindow();
        if (window) window.webContents.send('screenshot-taken', screenshotPath);
    }},
    { type: 'separator' },
    { label: 'Beenden', click: () => { app.quit(); } }
  ]);
  
  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu);
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.maximize();
  overlayWindow.loadFile('overlay.html');
}
function createWindow() {
  window = new BrowserWindow({
    width: 480,
    height: 780,
    show: false, frame: false, transparent: true, resizable: false, hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  
  // Zwingt das Fenster über ALLES (auch macOS Fullscreen Apps und Spiele)
  window.setAlwaysOnTop(true, 'screen-saver', 1);
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  window.loadFile('index.html');
  
  window.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function toggleWindow() {
  if (window.isVisible()) window.hide();
  else showWindow();
}

async function showWindow() {
  const config = await getConfig();
  
  const { width, height, x, y } = screen.getPrimaryDisplay().workArea;
  const winWidth = 480;
  const winHeight = 780;
  const padding = 20;
  
  // Set position to bottom right corner
  const newX = Math.round(x + width - winWidth - padding);
  const newY = Math.round(y + height - winHeight - padding);
  
  window.setBounds({ x: newX, y: newY, width: winWidth, height: winHeight });
  window.show();
  window.focus();
  window.webContents.send('force-expanded-mode');
}

// Websuche via DuckDuckGo HTML
async function performWebSearch(query) {
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `q=${encodeURIComponent(query)}&kl=&dt=`
    });
    const html = await res.text();
    let results = [];
    
    const blocks = html.split('<td valign="top">').slice(1);
    for (const block of blocks) {
      if (results.length >= 5) break;
      const urlMatch = block.match(/<a[^>]*href=['"]([^'"]+)['"][^>]*class=['"]result-link['"]/);
      const snippetMatch = block.match(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/);
      
      if (urlMatch && snippetMatch) {
        let url = urlMatch[1];
        if (url.includes('y.js?ad_domain')) continue; // Skip sponsored
        if (url.startsWith('//')) url = 'https:' + url;
        else if (url.startsWith('/')) url = 'https://duckduckgo.com' + url;
        if (url.includes('uddg=')) {
          try { url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]); } catch(e){}
        }
        const text = snippetMatch[1].replace(/<[^>]*>?/gm, '').trim();
        results.push(`[URL: ${url}]\n${text}`);
      }
    }
    
    if (results.length === 0) return "Keine Suchergebnisse gefunden.";
    return results.join('\n\n');
  } catch (e) {
    return "Fehler bei der Websuche: " + e.message;
  }
}

// Produktsuche Tool (Mr. Billig)
async function searchProductPrices(query) {
  try {
    const textSnippets = await performWebSearch(query + " preis kaufen ebay amazon");
    
    let imageUrl = "";
    try {
      const vqdRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
      });
      const vqdHtml = await vqdRes.text();
      const vqdMatch = vqdHtml.match(/vqd="([^"]+)"/);
      if (vqdMatch) {
        const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqdMatch[1]}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        });
        const imgData = await imgRes.json();
        if (imgData.results && imgData.results.length > 0) {
          imageUrl = imgData.results[0].image;
        }
      }
    } catch(e) {}
    
    return JSON.stringify({
       info: "Hier sind Snippets aus dem Web mit Preisen. Erstelle daraus Produkt-Kacheln mit dem mitgelieferten Bild.",
       web_results: textSnippets,
       product_image_url: imageUrl || "https://dummyimage.com/200x200/cccccc/ffffff&text=Kein+Bild"
    });
  } catch (e) {
    return "Fehler bei Produktsuche: " + e.message;
  }
}

// Firewall API Check
async function checkWithFirewall(command, apiKey) {
  if (!apiKey) return "⚠️ Firewall Warnung: Konnte nicht geprüft werden (Kein OpenAI Key vorhanden).";
  const prompt = `Du bist eine strenge Cybersecurity-Firewall. 
Der Agent möchte folgenden Bash-Terminal-Befehl auf dem Mac des Nutzers ausführen:
\`\`\`bash
${command}
\`\`\`
Bewerte das Risiko (HOCH, MITTEL, NIEDRIG). 
Prüfe auf versteckte Malware-Downloads, bösartige Payloads, rm -rf Befehle, Data Exfiltration oder kritische Systemänderungen.
Antworte in 2-3 sehr kurzen Sätzen auf Deutsch und sage exakt, was dieser Befehl WIRKLICH tut.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 150
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    return "⚠️ Firewall-Fehler: Konnte Risiko nicht bewerten.";
  }
}

// ==== LOKALE MODELLE (Gemma) ====
let localLlamaInstance = null;
let localLlamaModel = null;
let localLlamaContext = null;
let LlamaChatSessionClass = null;
let isLocalModelLoading = false;

function downloadModelFile(url, dest, event) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadModelFile(response.headers.location, dest, event).then(resolve).catch(reject);
      }
      const len = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;
      let lastReport = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (len) {
          const progress = Math.round((downloaded / len) * 100);
          if (progress > lastReport && progress % 5 === 0) {
            event.sender.send('model-download-progress', { progress, mb: (downloaded/1024/1024).toFixed(1) });
            event.sender.send('agent-log', `[LOKAL] Download: ${progress}% (${(downloaded/1024/1024).toFixed(1)} MB)`);
            lastReport = progress;
          }
        }
      });
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function initLocalModel(event) {
  if (localLlamaModel) return true;
  if (isLocalModelLoading) {
    while (isLocalModelLoading) await new Promise(r => setTimeout(r, 500));
    return true;
  }
  isLocalModelLoading = true;
  try {
    event.sender.send('agent-log', '[LOKAL] Lade Llama Engine...');
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
    LlamaChatSessionClass = LlamaChatSession;
    localLlamaInstance = await getLlama();
    
    const modelDir = path.join(app.getPath('userData'), 'models');
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    
    // Gemma 2 2B Instruct (Q4_K_M) - klein und effizient (~1.6 GB)
    const modelName = 'gemma-2-2b-it-Q4_K_M.gguf';
    const modelPath = path.join(modelDir, modelName);

    if (!fs.existsSync(modelPath)) {
      event.sender.send('model-download-required');
      isLocalModelLoading = false;
      return false;
    }

    event.sender.send('agent-log', '[LOKAL] Lade Modell in den Arbeitsspeicher (Metal/GPU)...');
    localLlamaModel = await localLlamaInstance.loadModel({ modelPath });
    localLlamaContext = await localLlamaModel.createContext();
    event.sender.send('agent-log', '[LOKAL] Modell ist einsatzbereit!');
  } catch (error) {
    event.sender.send('agent-log', `[FEHLER] Lokales Modell konnte nicht geladen werden: ${error.message}`);
    isLocalModelLoading = false;
    throw error;
  }
  isLocalModelLoading = false;
  return true;
}
// ================================

// IPC Modal Approval
ipcMain.handle('approve-command', (event, { approved }) => {
  if (pendingApproval) {
    pendingApproval(approved);
    pendingApproval = null;
  }
});

ipcMain.handle('process-query', async (event, { query, screenshotPath, history = [], skills = [], files = [] }) => {
  try {
    const config = await getConfig();
    const selectedModel = config.model || 'gpt-4o';
    const isGemini = selectedModel.startsWith('gemini');
    const isLocal = selectedModel.startsWith('local-');

    if (skills.includes('mirofish_full')) {
      return await runMiroFishSimulation(query, event);
    }

    if (!isGemini && !isLocal && !config.apiKey) return { error: 'Kein OpenAI API Key gefunden. Bitte in den Einstellungen eintragen.' };
    if (isGemini && !config.geminiApiKey) return { error: 'Kein Gemini API Key gefunden. Bitte in den Einstellungen eintragen.' };

    let finalSkills = [...skills];
    if (finalSkills.includes('auto')) {
      finalSkills = finalSkills.filter(s => s !== 'auto');
      const skillOptions = config.customSkills.map(s => `- ${s.id}: ${s.name}`).join("\n");
      const routerPrompt = `Du bist ein Router. Wähle die nötigen Skills für diese Nutzerfrage: "${query}"\nVerfügbare Skills:\n${skillOptions}\nAntworte NUR mit einer kommagetrennten Liste der IDs (z.B. "web,programmer"). Wenn nichts passt, antworte "none".`;
      
      event.sender.send('agent-log', '[AUTO-PILOT] Analysiere nötige Skills...');
      try {
        let routerResponse = "";
        if (isGemini) {
          const req = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: routerPrompt }] }] })
          });
          const d = await req.json();
          routerResponse = d.candidates[0].content.parts[0].text;
        } else if (!isLocal) {
          const req = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: routerPrompt }] })
          });
          const d = await req.json();
          routerResponse = d.choices[0].message.content;
        }
        
        const chosen = routerResponse.split(',').map(s => s.trim().replace(/[^a-z0-9-]/gi, '').toLowerCase()).filter(s => s && s !== 'none');
        event.sender.send('agent-log', `[AUTO-PILOT] Aktivierte Skills: ${chosen.join(', ') || 'Keine (Standard-Chat)'}`);
        for (const c of chosen) {
           if (!finalSkills.includes(c)) finalSkills.push(c);
        }
      } catch (e) {
        event.sender.send('agent-log', '[AUTO-PILOT FEHLER] ' + e.message);
      }
    }
    skills = finalSkills;

    const useScreenshot = (skills.includes('screenchat') || skills.includes('assistenz')) && config.imageQuality !== 'none';
    let base64Image = '';
    
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      base64Image = fs.readFileSync(screenshotPath).toString('base64');
      fs.unlinkSync(screenshotPath);
    } else if (useScreenshot) {
      const { systemPreferences } = require('electron');
      if (systemPreferences.getMediaAccessStatus) {
        const access = systemPreferences.getMediaAccessStatus('screen');
        if (access !== 'granted') {
          event.sender.send('agent-log', `[FEHLER] macOS blockiert den Screenshot! (Datenschutz). Erlaube die Bildschirmaufnahme in den macOS Systemeinstellungen.`);
        }
      }

      const currentScreenshotPath = path.join(app.getPath('temp'), 'agent_current_screenshot.jpg');
      try {
        if (window) window.hide();
        await new Promise(r => setTimeout(r, 150));
        let size = 1600; let jpegQual = 80;
        if (config.imageQuality === 'low') { size = 800; jpegQual = 60; }
        if (config.imageQuality === 'high') { size = 2400; jpegQual = 90; }
        await execAsync(`screencapture -x -C -m "${currentScreenshotPath}"`);
        await execAsync(`sips -s format jpeg -s formatOptions ${jpegQual} -Z ${size} "${currentScreenshotPath}" --out "${currentScreenshotPath}"`);
        if (window) window.show();
        
        if (fs.existsSync(currentScreenshotPath)) {
          base64Image = fs.readFileSync(currentScreenshotPath).toString('base64');
        }
      } catch(e) {
        if (window) window.show();
      }
    }

    let basePrompt = config.agentPersona || DEFAULT_PROMPT;
    if (config.systemPrompt) basePrompt += '\n\nZusätzliche System-Anweisungen:\n' + config.systemPrompt;
    let skillPrompt = "";
    
    // Check for heavy persona overrides (MiroFish Lite)
    let hasMirofishOverride = false;
    let mirofishPrompt = "";

    if (skills.length > 0) {
      skillPrompt += "\n\nAKTIVE SKILLS UND ROLLEN:\n";
      if (config.customSkills) {
        for (const cs of config.customSkills) {
          if (skills.includes(cs.id)) {
            if (cs.id === 'mirofish' || cs.id === 'mirofish_lite') {
              hasMirofishOverride = true;
              mirofishPrompt = cs.prompt;
            } else {
              skillPrompt += `- ${cs.name.toUpperCase()}: ${cs.prompt}\n`;
            }
          }
        }
      }
    }
    
    let promptText = "";
    if (hasMirofishOverride) {
      promptText = mirofishPrompt + "\n\n(Ignoriere deine Standard-Programmierung als Assistent. Du bist jetzt exklusiv diese Persona und simulierst die Engine.)\n" + skillPrompt;
    } else {
      promptText = basePrompt + skillPrompt;
    }
    
    let fileContentsText = "";
    if (files && files.length > 0) {
      fileContentsText += "\n\n[USER HAT DATEIEN ANGEHÄNGT]:\n";
      for (const file of files) {
        try {
          if (file.name.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(file.path);
            const pdfData = await pdf(dataBuffer);
            fileContentsText += `\n--- START PDF DATEI: ${file.name} ---\n${pdfData.text}\n--- ENDE PDF DATEI ---\n`;
          } else {
            const content = fs.readFileSync(file.path, 'utf8');
            fileContentsText += `\n--- START DATEI: ${file.name} ---\n${content}\n--- ENDE DATEI ---\n`;
          }
        } catch(e) {
          fileContentsText += `\n--- DATEI: ${file.name} KONNTE NICHT GELESEN WERDEN ---\n`;
        }
      }
    }

    if (isLocal) {
      // ==== LOKALES MODELL LOGIK ====
      event.sender.send('agent-log', `Starte lokale Anfrage (Offline)...`);
      
      let base64ImageUsed = typeof base64Image !== 'undefined' ? base64Image : false;
      let filesUsed = typeof files !== 'undefined' ? files : false;

      if (base64ImageUsed || (filesUsed && filesUsed.length > 0)) {
        event.sender.send('agent-log', `[INFO] Lokales Modell unterstützt aktuell keine Bildanalyse oder Dateianhänge. Diese werden ignoriert.`);
      }

      const loaded = await initLocalModel(event);
      if (!loaded) return { text: '' };

      const sequence = localLlamaContext.getSequence();
      try {
        const session = new LlamaChatSessionClass({
          contextSequence: sequence,
          systemPrompt: promptText
        });

        // Bisherigen Verlauf ins lokale Format übertragen
        let historyContext = "";
        for (const msg of history) {
           historyContext += `${msg.role === 'user' ? 'User' : 'Agent'}: ${msg.content}\n`;
        }
        
        const fullQuery = history.length > 0 ? `Verlauf:\n${historyContext}\nAktuelle Frage: ${query}` : query;

        event.sender.send('agent-log', `Generiere Antwort...`);
        const responseText = await session.prompt(fullQuery);
        
        return { text: responseText, totalCost: config.totalCost };
      } finally {
        sequence.dispose();
      }

    } else if (isGemini) {
      // ==== GOOGLE GEMINI LOGIC ====
      event.sender.send('agent-log', `Sende Anfrage an Gemini (${selectedModel})...`);
      const contents = [];
      for (const msg of history) {
        contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
      }
      
      let currentParts = [];
      let finalQuery = query + fileContentsText;
      currentParts.push({ text: `${promptText}\n\nFrage des Nutzers: ${finalQuery}` });
      if (base64Image) {
        currentParts.push({ inline_data: { mime_type: "image/jpeg", data: base64Image } });
      }
      contents.push({ role: 'user', parts: currentParts });

      const requestBody = { 
        contents,
        generationConfig: { temperature: config.temperature }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${config.geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const messageText = data.candidates[0].content.parts[0].text;
      
      let queryCost = 0;
      if (data.usageMetadata) {
        if (selectedModel.includes('flash')) {
           queryCost = (data.usageMetadata.promptTokenCount * 0.000000075) + (data.usageMetadata.candidatesTokenCount * 0.0000003);
        } else {
           queryCost = (data.usageMetadata.promptTokenCount * 0.00000125) + (data.usageMetadata.candidatesTokenCount * 0.000005);
        }
        config.totalCost = (config.totalCost || 0) + queryCost;
        await saveConfig({ totalCost: config.totalCost });
      }
      return { text: messageText, totalCost: config.totalCost };

    } else {
      // ==== OPENAI LOGIC WITH MULTI-TURN INTERNET SEARCH AND HISTORY ====
      event.sender.send('agent-log', `Sende Anfrage an OpenAI (${selectedModel})...`);
      let messages = [];
      if (promptText) messages.push({ role: 'system', content: promptText });
      
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }

      let finalQuery = query + fileContentsText;
      let userContent = [{ type: 'text', text: finalQuery }];
      if (base64Image) {
        userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'high' } });
      }
      messages.push({ role: 'user', content: userContent });

      let tools = [];
      if (skills.includes('web') || skills.includes('stockcheck') || skills.includes('tradingexpert') || skills.includes('deepresearch') || skills.includes('mirofish')) {
        tools.push(
          {
            type: "function",
            function: {
              name: "search_web",
              description: "Sucht im echten Internet nach aktuellen Informationen und liefert kurze Text-Snippets von Webseiten.",
              parameters: {
                type: "object",
                properties: { search_query: { type: "string", description: "Der Suchbegriff für die Google/DuckDuckGo Websuche" } },
                required: ["search_query"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "open_website",
              description: "Öffnet eine URL sichtbar im Browser des Nutzers.",
              parameters: {
                type: "object",
                properties: { url: { type: "string", description: "Die URL" } },
                required: ["url"]
              }
            }
          }
        );
      }

      if (skills.includes('mrbillig')) {
        tools.push(
          {
            type: "function",
            function: {
              name: "search_product_prices",
              description: "Sucht im Internet nach aktuellen Preisen für ein Produkt und liefert Text-Snippets sowie eine passende Bild-URL für das Produkt zurück.",
              parameters: {
                type: "object",
                properties: { search_query: { type: "string", description: "Der exakte Name des Produkts (z.B. 'iPhone 13 128GB')" } },
                required: ["search_query"]
              }
            }
          }
        );
      }

      tools.push(
        {
          type: "function",
          function: {
            name: "create_document",
            description: "WICHTIG: Erzeugt ein neues Dokument (z.B. RTF, Markdown, TXT, Code) und stellt es zum Download bereit. WICHTIG ZUR TOKEN-ERSPARNIS: Wenn der Nutzer ein Dokument verlangt, schreibe den Inhalt NIEMALS zuerst in den normalen Chat-Verlauf! Nutze sofort und ausschließlich dieses Tool, um den Text direkt in die Datei zu schreiben.",
            parameters: {
              type: "object",
              properties: { 
                filename: { type: "string", description: "Der gewünschte Dateiname inklusive Dateiendung (z.B. 'konzept.rtf', 'brief.md' oder 'script.py')" },
                content: { type: "string", description: "Der komplette, finale Inhalt der Datei (bei .rtf ggf. formatiert, ansonsten Markdown/Text)." }
              },
              required: ["filename", "content"]
            }
          }
        }
      );

      if (true) {
        tools.push(
          {
            type: "function",
            function: {
              name: "execute_applescript",
              description: "Führt natives AppleScript aus, um macOS-Systemfunktionen oder Apps (wie Lautstärke, Spotify, Erinnerungen) zu steuern.",
              parameters: {
                type: "object",
                properties: { script: { type: "string", description: "Der auszuführende AppleScript Code." } },
                required: ["script"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "execute_terminal_command",
              description: "Führt einen raw Bash/Zsh Befehl im Terminal des Nutzers aus (z.B. zum Installieren von Paketen, Klonen von Repos, File System Operationen). Nutze es nur, wenn der Nutzer explizit danach fragt.",
              parameters: {
                type: "object",
                properties: { command: { type: "string", description: "Der Bash-Befehl." } },
                required: ["command"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "edit_file",
              description: "Bearbeitet eine Textdatei auf dem System. Wenn search_string und replacement_string angegeben sind, wird nur dieser Teil ersetzt. Wenn nur content angegeben ist, wird die Datei komplett überschrieben.",
              parameters: {
                type: "object",
                properties: { 
                  file_path: { type: "string", description: "Absoluter Pfad zur Datei." },
                  search_string: { type: "string", description: "Text, der gesucht werden soll." },
                  replacement_string: { type: "string", description: "Text, der eingefügt werden soll." },
                  content: { type: "string", description: "Kompletter Datei-Inhalt bei Überschreiben." }
                },
                required: ["file_path"]
              }
            }
          }
        );
      }

      if (skills.includes('assistenz')) {
        tools.push(
          {
            type: "function",
            function: {
              name: "execute_computer_action",
              description: "Führt eine Serie von Maus- und Tastaturaktionen auf dem Computer aus. Nutze dies, um UI-Elemente zu bedienen.",
              parameters: {
                type: "object",
                properties: { 
                  actions: { 
                    type: "array", 
                    description: "Eine Liste von Aktionen, die nacheinander ausgeführt werden.",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string", description: "Typ der Aktion: 'move' (Maus bewegen), 'click' (Maus klicken), 'type' (Text tippen)." },
                        x: { type: "number", description: "Relative X-Koordinate als Prozentwert zwischen 0.000 und 1.000 (nur für 'move')" },
                        y: { type: "number", description: "Relative Y-Koordinate als Prozentwert zwischen 0.000 und 1.000 (nur für 'move')" },
                        button: { type: "string", description: "Maustaste: 'left', 'right' oder 'double' (nur für 'click', standard ist 'left')" },
                        text: { type: "string", description: "Der zu tippende Text (nur für 'type')" },
                        press_enter: { type: "boolean", description: "Soll am Ende Enter gedrückt werden? (nur für 'type')" },
                        rationale: { type: "string", description: "Kurze Begründung für diese Aktion (wird im Audit-Log gespeichert)" },
                        risk_level: { type: "string", enum: ["low", "high"], description: "Klassifiziere die Aktion. 'high' für Kaufen, Löschen, Absenden; sonst 'low'" }
                      },
                      required: ["action", "rationale", "risk_level"]
                    }
                  }
                },
                required: ["actions"]
              }
            }
          }
        );
      }

      if (skills.includes('mac_controller')) {
        tools.push(
          {
            type: "function",
            function: {
              name: "execute_advanced_os_task",
              description: "Delegiert eine komplexe Aufgabe an ein externes Open-Source Framework (wie OpenClaw/OS-Copilot) zur Mac-Steuerung. Das Framework wird autonom versuchen, die Aufgabe auf dem Desktop zu lösen.",
              parameters: {
                type: "object",
                properties: { 
                  task_description: { type: "string", description: "Die genaue Beschreibung der Aufgabe, die das Framework lösen soll (z.B. 'Öffne Systemeinstellungen und setze den Darkmode')." },
                  rationale: { type: "string", description: "Kurze Begründung, warum dieses Framework für die Aufgabe benötigt wird." }
                },
                required: ["task_description", "rationale"]
              }
            }
          }
        );
      }

      if (tools.length === 0) tools = undefined;

      const requestBody = {
        model: selectedModel,
        messages: messages,
        max_completion_tokens: 2000,
        temperature: config.temperature
      };
      
      if (tools) requestBody.tools = tools;

      let response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      let data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      let usage = data.usage;
      let totalQueryCost = 0;

      function addCost(usageData, isMini = false) {
        if (!usageData) return;
        let c = 0;
        if (selectedModel === 'gpt-4o-mini' || isMini) {
          c = (usageData.prompt_tokens * 0.00000015) + (usageData.completion_tokens * 0.0000006);
        } else {
          c = (usageData.prompt_tokens * 0.000005) + (usageData.completion_tokens * 0.000015);
        }
        totalQueryCost += c;
      }
      
      addCost(usage);

      let message = data.choices[0].message;

      // MULTI-TURN SCHLEIFE
      let toolResultsHtml = "";
      while (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message); 

        for (const toolCall of message.tool_calls) {
          event.sender.send('agent-log', `Nutze Tool: ${toolCall.function.name}`);
          
          if (toolCall.function.name === 'open_website') {
            const args = JSON.parse(toolCall.function.arguments);
            event.sender.send('agent-log', `Öffne URL: ${args.url}`);
            shell.openExternal(args.url);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: "Website wurde erfolgreich geöffnet."
            });
            toolResultsHtml += `<br><span style="opacity:0.6; font-size:11px;">*(Aktion: Website ${args.url} geöffnet)*</span>`;
          } 
          else if (toolCall.function.name === 'search_web') {
            const args = JSON.parse(toolCall.function.arguments);
            event.sender.send('agent-log', `Websuche nach: "${args.search_query}"`);
            const searchResults = await performWebSearch(args.search_query);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: searchResults
            });
            toolResultsHtml += `<br><span style="opacity:0.6; font-size:11px;">*(Aktion: Websuche nach "${args.search_query}")*</span>`;
          }
          else if (toolCall.function.name === 'search_product_prices') {
            const args = JSON.parse(toolCall.function.arguments);
            event.sender.send('agent-log', `Produktsuche nach: "${args.search_query}"`);
            const searchResults = await searchProductPrices(args.search_query);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: searchResults
            });
            toolResultsHtml += `<br><span style="opacity:0.6; font-size:11px;">*(Aktion: Preisvergleich für "${args.search_query}")*</span>`;
          }
          else if (toolCall.function.name === 'create_document') {
            const args = JSON.parse(toolCall.function.arguments);
            const tempPath = path.join(app.getPath('temp'), args.filename);
            fs.writeFileSync(tempPath, args.content);
            event.sender.send('agent-log', `Dokument erstellt: ${args.filename}`);
            
            toolResultsHtml += `<br><div class="download-btn" data-path="${tempPath}" data-filename="${args.filename}" style="margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              <span style="font-size: 12px; font-family: monospace; color: #ddd; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${args.filename}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>`;
            
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Das Dokument wurde erfolgreich erstellt und dem Nutzer als Download angeboten.`
            });
          }
          else if (toolCall.function.name === 'execute_applescript') {
            const args = JSON.parse(toolCall.function.arguments);
            event.sender.send('agent-log', `AppleScript Ausführung:\n${args.script}`);
            let asResult = "";
            const scriptLower = args.script.toLowerCase();
            
            const forbidden = ['do shell script', 'rm ', 'sudo ', 'delete ', 'erase ', 'killall '];
            const isUnsafe = forbidden.some(word => scriptLower.includes(word));

            if (isUnsafe) {
              const matchedWord = forbidden.find(w => scriptLower.includes(w));
              event.sender.send('agent-log', `[BLOCKIERT] Skript enthielt verbotenen Befehl: ${matchedWord}`);
              asResult = `Fehler: Die Ausführung wurde vom lokalen Sicherheits-Layer blockiert.`;
              toolResultsHtml += `<br><span style="color:#ff4444; font-size:11px;">*(Sicherheit: Gefährliches Script blockiert)*</span>`;
            } else {
              try {
                const res = execSync(`osascript`, { input: args.script });
                asResult = res.toString().trim() || "AppleScript erfolgreich ausgeführt.";
                event.sender.send('agent-log', `[ERFOLG] ${asResult}`);
                toolResultsHtml += `<br><span style="opacity:0.6; font-size:11px;">*(Aktion: AppleScript ausgeführt)*</span>`;
              } catch (err) {
                asResult = `Fehler bei AppleScript: ${err.message}`;
                event.sender.send('agent-log', `[FEHLER] ${err.message}`);
                toolResultsHtml += `<br><span style="opacity:0.6; font-size:11px;">*(Fehler bei AppleScript)*</span>`;
              }
            }
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: asResult
            });
          }
          else if (toolCall.function.name === 'execute_terminal_command') {
            const args = JSON.parse(toolCall.function.arguments);
            event.sender.send('agent-log', `[FIREWALL] Analysiere Bash-Befehl...\n${args.command}`);
            
            // Firewall API Check
            const assessment = await checkWithFirewall(args.command, config.apiKey);
            event.sender.send('agent-log', `[FIREWALL RESULTAT] ${assessment}`);
            
            // Zeige Popup im Frontend und warte auf User-Antwort
            event.sender.send('show-approval-popup', { command: args.command, assessment });
            
            const isApproved = await new Promise((resolve) => {
              pendingApproval = resolve;
            });

            let cmdResult = "";
            if (isApproved) {
              event.sender.send('agent-log', `[ERLAUBT] Führe Befehl aus: ${args.command}`);
              try {
                // Timeout 30s
                const { stdout } = await execAsync(args.command, { timeout: 30000, maxBuffer: 1024 * 1024 * 5 });
                cmdResult = stdout.toString().trim() || "Befehl erfolgreich ausgeführt (kein Output).";
                event.sender.send('agent-log', `[ERFOLG] ${cmdResult}`);
              } catch (err) {
                cmdResult = `Fehler bei Ausführung:\nSTDOUT: ${err.stdout?.toString()}\nSTDERR: ${err.stderr?.toString()}\nERROR: ${err.message}`;
                event.sender.send('agent-log', `[FEHLER] ${cmdResult}`);
              }
              toolResultsHtml += `<br><span style="color:#34c759; font-size:11px;">*(Aktion: Terminal-Befehl vom Nutzer freigegeben und ausgeführt)*</span>`;
            } else {
              event.sender.send('agent-log', `[ABGELEHNT] Befehl durch Nutzer blockiert.`);
              cmdResult = "Der Nutzer hat die Ausführung dieses Befehls aus Sicherheitsgründen abgelehnt. Brich ab oder frage nach einer sichereren Alternative.";
              toolResultsHtml += `<br><span style="color:#ff3b30; font-size:11px;">*(Aktion: Terminal-Befehl vom Nutzer blockiert)*</span>`;
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: cmdResult
            });
          }
          else if (toolCall.function.name === 'edit_file') {
            const args = JSON.parse(toolCall.function.arguments);
            event.sender.send('agent-log', `Datei-Änderung an: ${args.file_path}`);
            let editResult = "";
            
            event.sender.send('show-approval-popup', { command: `EDIT FILE: ${args.file_path}\n${args.search_string ? 'Replace part' : 'Overwrite'}`, assessment: "Der Agent möchte eine lokale Datei modifizieren." });
            const isApproved = await new Promise((resolve) => pendingApproval = resolve);
            
            if (isApproved) {
              try {
                if (args.search_string && args.replacement_string) {
                  let fc = fs.readFileSync(args.file_path, 'utf8');
                  fc = fc.replace(args.search_string, args.replacement_string);
                  fs.writeFileSync(args.file_path, fc);
                  editResult = "Datei erfolgreich geändert.";
                } else if (args.content) {
                  fs.writeFileSync(args.file_path, args.content);
                  editResult = "Datei erfolgreich überschrieben.";
                } else {
                  editResult = "Fehler: Weder search_string noch content angegeben.";
                }
                event.sender.send('agent-log', `[ERFOLG] ${editResult}`);
                toolResultsHtml += `<br><span style="color:#34c759; font-size:11px;">*(Aktion: Datei bearbeitet)*</span>`;
              } catch(e) {
                editResult = `Fehler: ${e.message}`;
                event.sender.send('agent-log', `[FEHLER] ${editResult}`);
                toolResultsHtml += `<br><span style="color:#ff3b30; font-size:11px;">*(Aktion: Datei bearbeiten fehlgeschlagen)*</span>`;
              }
            } else {
               event.sender.send('agent-log', `[ABGELEHNT] Dateiänderung durch Nutzer blockiert.`);
               editResult = "Nutzer hat Dateiänderung abgelehnt.";
               toolResultsHtml += `<br><span style="color:#ff3b30; font-size:11px;">*(Aktion: Datei bearbeiten blockiert)*</span>`;
            }
            
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: editResult });
          }
          else if (toolCall.function.name === 'execute_computer_action') {
            const args = JSON.parse(toolCall.function.arguments);
            const actions = args.actions || [];
            let resultLog = [];
            let blocked = false;
            
            for (let act of actions) {
              if (blocked) break;
              
              // Coordinate scaling for Retina
              let targetX = act.x;
              let targetY = act.y;
              if (act.action === 'move' && act.x !== undefined && act.y !== undefined) {
                if (act.x <= 1.0 && act.y <= 1.0) {
                  const bounds = screen.getPrimaryDisplay().bounds;
                  targetX = Math.round(act.x * bounds.width);
                  targetY = Math.round(act.y * bounds.height);
                }
              }
              
              let needsApproval = false;
              if (config.assistRisk === 'guided') needsApproval = true;
              else if (config.assistRisk === 'assist' && act.risk_level === 'high') needsApproval = true;
              
              let desc = "";
              if (act.action === 'move') desc = `Maus zu X:${targetX}, Y:${targetY}`;
              else if (act.action === 'click') desc = `Mausklick (${act.button || 'left'})`;
              else if (act.action === 'type') desc = `Tippen: "${act.text}"` + (act.press_enter ? ' + Enter' : '');
              
              let shortDesc = desc;
              if (act.rationale) desc += `\nGrund: ${act.rationale}`;

              event.sender.send('agent-log', `[ASSISTENZ] Führe aus: ${desc}`);
              
              try {
                 const logLine = `${new Date().toISOString()} | ${act.action} | Risk: ${act.risk_level || 'low'} | Rationale: ${act.rationale || 'none'}\n`;
                 require('fs').appendFileSync(path.join(app.getPath('userData'), 'audit.log'), logLine);
              } catch(e) {}
              
              if (overlayWindow) overlayWindow.webContents.send('set-status', `⚙️ Ausführen: ${shortDesc}`);

              if (overlayWindow && (act.action === 'move' || targetX !== undefined)) {
                let px = targetX || 0;
                let py = targetY || 0;
                if (act.action !== 'move') {
                   try {
                     const p = await mouse.getPosition();
                     px = p.x; py = p.y;
                   } catch(e) {}
                }
                overlayWindow.webContents.send('draw-pointer', { x: px, y: py, label: shortDesc });
              }
              
              if (needsApproval) {
                if (overlayWindow) overlayWindow.webContents.send('set-status', `⚠️ Warten auf Bestätigung`);
                event.sender.send('show-approval-popup', { command: `Aktion ausführen:\n${desc}`, assessment: `Risikolevel: ${act.risk_level || 'low'}` });
                const isApproved = await new Promise((resolve) => pendingApproval = resolve);
                if (!isApproved) {
                  blocked = true;
                  resultLog.push(`${shortDesc} -> BLOCKIERT`);
                  toolResultsHtml += `<br><span style="color:#ff3b30; font-size:11px;">*(Aktion blockiert)*</span>`;
                  if (overlayWindow) overlayWindow.webContents.send('set-status', `❌ Aktion blockiert`);
                  break;
                }
              }

              try {
                if (act.action === 'move') {
                  await mouse.move(straightTo(new Point(targetX, targetY)));
                } else if (act.action === 'click') {
                  if (overlayWindow) {
                     const p = await mouse.getPosition();
                     overlayWindow.webContents.send('trigger-ripple', {x: p.x, y: p.y});
                  }
                  if (act.button === 'right') await mouse.click(Button.RIGHT);
                  else if (act.button === 'double') await mouse.doubleClick(Button.LEFT);
                  else await mouse.click(Button.LEFT);
                } else if (act.action === 'type') {
                  await keyboard.type(act.text);
                  if (act.press_enter) await keyboard.type(Key.Enter);
                }
                resultLog.push(`${shortDesc} -> ERFOLG`);
                toolResultsHtml += `<br><span style="color:#34c759; font-size:11px;">*(Aktion: ${shortDesc})*</span>`;
              } catch(e) {
                resultLog.push(`${shortDesc} -> FEHLER: ${e.message}`);
              }
            }
            
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultLog.join('\n') });
            
            // Auto-Screenshot Feedback Loop
            try {
              event.sender.send('agent-log', `[ASSISTENZ] Erfasse neuen Bildschirmzustand...`);
              const tmpShot = path.join(app.getPath('temp'), 'auto_screenshot.jpg');
              await execAsync(`screencapture -x "${tmpShot}"`);
              await execAsync(`sips -s format jpeg -s formatOptions 60 -Z 1600 "${tmpShot}" --out "${tmpShot}"`);
              const b64 = require('fs').readFileSync(tmpShot, {encoding: 'base64'});
              messages.push({
                role: 'user',
                content: [
                  { type: 'text', text: "Das ist der neue Bildschirmzustand nach deiner letzten Aktion. Wenn die Aufgabe noch nicht abgeschlossen ist, plane die nächsten Schritte. Wenn sie abgeschlossen ist, antworte dem Nutzer." },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
                ]
              });
            } catch(e) {
              console.error("Auto-Screenshot failed", e);
            }
          }
          else if (toolCall.function.name === 'execute_advanced_os_task') {
            const args = JSON.parse(toolCall.function.arguments);
            const task_description = args.task_description;
            const rationale = args.rationale;
            
            event.sender.send('agent-log', `[MAC CONTROLLER] Plane Task: ${task_description}`);
            if (overlayWindow) overlayWindow.webContents.send('set-status', `⚙️ OpenClaw Task: ${task_description.substring(0, 30)}...`);
            
            let blocked = false;
            let resultMessage = "";
            
            // Immer Approval einholen (Kontrollierte Ausführung!)
            if (overlayWindow) overlayWindow.webContents.send('set-status', `⚠️ Warten auf Bestätigung`);
            event.sender.send('show-approval-popup', { 
              command: `OpenClaw / OS-Copilot Task ausführen:\n${task_description}`, 
              assessment: `Begründung: ${rationale}\nAchtung: Das Framework agiert autonom und übernimmt die Maus!` 
            });
            const isApproved = await new Promise((resolve) => pendingApproval = resolve);
            
            if (!isApproved) {
              blocked = true;
              resultMessage = "Der Nutzer hat die Ausführung des Tasks durch das Framework blockiert.";
              toolResultsHtml += `<br><span style="color:#ff3b30; font-size:11px;">*(OpenClaw Task blockiert)*</span>`;
              if (overlayWindow) overlayWindow.webContents.send('set-status', `❌ Aktion blockiert`);
            } else {
              try {
                event.sender.send('agent-log', `[MAC CONTROLLER] Starte Framework für Task... Dies kann einige Minuten dauern.`);
                const execPromise = require('util').promisify(require('child_process').exec);
                // Wir wrappen OpenClaw via npx (kann bei Bedarf auf ein lokales Python-Script wie OS-Copilot angepasst werden)
                // Hier simulieren/integrieren wir OpenClaw als Standardausführung
                const cmd = `npx --yes openclaw prompt "${task_description.replace(/"/g, '\\"')}"`; 
                const { stdout, stderr } = await execPromise(cmd, { timeout: 300000 }); // 5 min timeout
                
                resultMessage = `Framework Ausführung erfolgreich:\\nSTDOUT:\\n${stdout}\\nSTDERR:\\n${stderr}`;
                toolResultsHtml += `<br><span style="color:#34c759; font-size:11px;">*(OpenClaw Task beendet)*</span>`;
                if (overlayWindow) overlayWindow.webContents.send('set-status', `✅ OpenClaw Task beendet`);
              } catch (e) {
                resultMessage = `Fehler bei der Framework-Ausführung: ${e.message}`;
                toolResultsHtml += `<br><span style="color:#ffcc00; font-size:11px;">*(OpenClaw Fehler: ${e.message})*</span>`;
                if (overlayWindow) overlayWindow.webContents.send('set-status', `❌ OpenClaw Fehler`);
              }
            }
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultMessage });
          }
        }

        // 2. Request an OpenAI mit den Tool-Ergebnissen
        event.sender.send('agent-log', `Sende Tool-Ergebnisse zurück an KI...`);
        requestBody.messages = messages;
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        addCost(data.usage);
        message = data.choices[0].message;
      }
      
      config.totalCost = (config.totalCost || 0) + totalQueryCost;
      await saveConfig({ totalCost: config.totalCost });

      return { text: toolResultsHtml + "\n\n" + (message.content || ""), totalCost: config.totalCost };
    }
  } catch (err) {
    event.sender.send('agent-log', `[FEHLER] ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle('save-config', async (event, config) => {
  await saveConfig(config);
  return true;
});

ipcMain.handle('get-config', async (event) => {
  return await getConfig();
});

ipcMain.handle('save-document', async (event, { path: tempPath, filename }) => {
  const { dialog } = require('electron');
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    buttonLabel: 'Speichern'
  });
  if (filePath) {
    fs.copyFileSync(tempPath, filePath);
    return true;
  }
  return false;
});

ipcMain.on('close-window', () => window.hide());

ipcMain.on('set-window-mode', (event, mode) => {
  const bounds = window.getBounds();
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  if (mode === 'bubble') {
    const newWidth = 80;
    const newHeight = 80;
    window.setBounds({ x: right - newWidth, y: bottom - newHeight, width: newWidth, height: newHeight }, true);
  } else if (mode === 'expanded') {
    const newWidth = 480;
    const newHeight = 780;
    window.setBounds({ x: right - newWidth, y: bottom - newHeight, width: newWidth, height: newHeight }, true);
  }
});

ipcMain.handle('take-interactive-screenshot', async (event) => {
  if (window) window.hide();
  await new Promise(r => setTimeout(r, 300)); // Warten bis Fenster versteckt ist
  
  const screenshotPath = path.join(app.getPath('temp'), 'agent_screenshot.jpg');
  try {
    await execAsync(`screencapture -i -x "${screenshotPath}"`);
    const config = await getConfig();
    let size = 1600; let jpegQual = 80;
    if (config.imageQuality === 'low') { size = 800; jpegQual = 60; }
    if (config.imageQuality === 'high') { size = 2400; jpegQual = 90; }
    await execAsync(`sips -s format jpeg -s formatOptions ${jpegQual} -Z ${size} "${screenshotPath}" --out "${screenshotPath}"`);
  } catch (e) {
    console.error("Interactive screenshot failed", e);
  }
  
  showWindow();
  if (window) window.webContents.send('screenshot-taken', screenshotPath);
  return true;
});

ipcMain.handle('transcribe-audio', async (event, arrayBuffer) => {
  const config = await getConfig();
  if (!config.apiKey) throw new Error("OpenAI API Key fehlt für Sprachsteuerung.");
  
  const buffer = Buffer.from(arrayBuffer);
  const formData = new FormData();
  formData.append('file', buffer, { filename: 'audio.webm', contentType: 'audio/webm' });
  formData.append('model', 'whisper-1');
  formData.append('language', 'de');
  
  const fetch = require('node-fetch');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      ...formData.getHeaders()
    },
    body: formData
  });
  
  if (!res.ok) {
    const err = await res.text();
    console.error("Whisper Error:", err);
    throw new Error("Whisper API: " + err);
  }
  
  const data = await res.json();
  return data.text;
});

ipcMain.handle('synthesize-speech', async (event, text) => {
  const config = await getConfig();
  if (!config.apiKey) return null;
  
  const fetch = require('node-fetch');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'nova'
    })
  });
  
  if (!res.ok) {
    console.error("TTS Error:", await res.text());
    return null;
  }
  
  const arrayBuffer = await res.arrayBuffer();
  return arrayBuffer;
});

ipcMain.on('start-model-download', async (event) => {
  const modelDir = path.join(app.getPath('userData'), 'models');
  const modelName = 'gemma-2-2b-it-Q4_K_M.gguf';
  const modelPath = path.join(modelDir, modelName);
  try {
    event.sender.send('model-download-progress', { progress: 0, mb: '0.0' });
    event.sender.send('agent-log', `[LOKAL] Modell wird manuell heruntergeladen...`);
    await downloadModelFile(`https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/${modelName}`, modelPath, event);
    event.sender.send('agent-log', '[LOKAL] Download abgeschlossen!');
    event.sender.send('model-download-progress', { progress: 100, mb: '1600' });
  } catch (e) {
    event.sender.send('agent-log', '[FEHLER] Download fehlgeschlagen: ' + e.message);
  }
});
