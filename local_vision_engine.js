/**
 * Eingebettete lokale Vision-Engine via Ollama.
 */
const fetch = require('node-fetch');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const OLLAMA_CANDIDATE_PATHS = [
  '/Applications/Ollama.app/Contents/Resources/ollama',
  '/usr/local/bin/ollama',
  '/opt/homebrew/bin/ollama',
  path.join(process.env.HOME || '', '.ollama', 'bin', 'ollama'),
];
const DEFAULT_VISION_MODEL = 'moondream';
const VISION_FALLBACK_CHAIN = ['moondream', 'minicpm-v', 'llava', 'bakllava', 'llama3.2-vision'];
const PULL_SIZE_ESTIMATES = {
  moondream: 1.7e9,
  'minicpm-v': 5.5e9,
  llava: 4.7e9,
  bakllava: 4.7e9,
  'llama3.2-vision': 7.8e9,
};
let expectedPullBytes = PULL_SIZE_ESTIMATES[DEFAULT_VISION_MODEL];

let status = {
  state: 'idle',
  model: null,
  message: '',
  progress: 0,
};

let initPromise = null;
let blobMonitorTimer = null;

function getStatus() {
  return { ...status };
}

function broadcast(eventSender, channel, data) {
  if (eventSender && eventSender.send) eventSender.send(channel, data);
}

function resolveOllamaBinary() {
  if (process.env.OLLAMA_BINARY && fs.existsSync(process.env.OLLAMA_BINARY)) {
    return process.env.OLLAMA_BINARY;
  }
  for (const candidate of OLLAMA_CANDIDATE_PATHS) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findMainPartialBlob() {
  const blobsDir = path.join(process.env.HOME || '', '.ollama', 'models', 'blobs');
  if (!fs.existsSync(blobsDir)) return null;
  let best = null;
  for (const name of fs.readdirSync(blobsDir)) {
    if (!name.endsWith('-partial') || /-partial-\d+$/.test(name)) continue;
    try {
      const size = fs.statSync(path.join(blobsDir, name)).size;
      if (!best || size > best.size) best = { size };
    } catch (_) { /* ignore */ }
  }
  return best;
}

function isOllamaPullRunning() {
  try {
    const out = execSync('pgrep -f "ollama pull" 2>/dev/null || true', { encoding: 'utf8' }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

function updateProgressFromBlob(modelName, progressFn) {
  const partial = findMainPartialBlob();
  if (!partial || partial.size < 1e6) return 0;
  const pct = Math.min(99, Math.round((partial.size / expectedPullBytes) * 100));
  const gb = (partial.size / 1e9).toFixed(1);
  const msg = `Lade ${modelName}… ${pct}% (${gb} / 7.8 GB)`;
  if (pct >= (status.progress || 0)) {
    status = { ...status, progress: pct, message: msg };
    progressFn({ progress: pct, message: msg });
  }
  return pct;
}

function startBlobMonitor(modelName, progressFn) {
  stopBlobMonitor();
  updateProgressFromBlob(modelName, progressFn);
  blobMonitorTimer = setInterval(() => {
    updateProgressFromBlob(modelName, progressFn);
  }, 2000);
}

function stopBlobMonitor() {
  if (blobMonitorTimer) {
    clearInterval(blobMonitorTimer);
    blobMonitorTimer = null;
  }
}

async function ollamaReachable() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    return res.ok;
  } catch {
    return false;
  }
}

async function getOllamaVersion() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/version`, { timeout: 3000 });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}

async function listModelsDetailed() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!res.ok) throw new Error('Ollama API nicht erreichbar');
  const data = await res.json();
  return data.models || [];
}

async function listModels() {
  return (await listModelsDetailed()).map((m) => m.name);
}

function hasVisionCapability(modelEntry) {
  return (modelEntry.capabilities || []).includes('vision');
}

function isKnownIncompatible(modelName, ollamaVersion) {
  const base = modelName.split(':')[0];
  if (base !== 'llama3.2-vision' || !ollamaVersion) return false;
  const parts = ollamaVersion.split('.').map((n) => parseInt(n, 10) || 0);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  // Ollama 0.30.x: mllama/llama3.2-vision vorübergehend nicht ladbar
  return major === 0 && minor >= 30;
}

async function probeModel(modelName) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: 'Antworte nur: ok' }],
      stream: false,
      keep_alive: '5m',
    }),
    timeout: 180000,
  });
  const data = await res.json();
  if (data.error) {
    const err = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    return { ok: false, error: err };
  }
  return { ok: true };
}

async function resolveWorkingVisionModel(config, logFn) {
  const userPref = (config.embeddedLocalModel || DEFAULT_VISION_MODEL).split(':')[0];
  const ollamaVersion = await getOllamaVersion();
  const installed = await listModelsDetailed();
  const installedNames = installed.map((m) => m.name);
  const visionInstalled = installed.filter(hasVisionCapability).map((m) => m.name.split(':')[0]);

  const candidates = [];
  const add = (name) => {
    const base = name.split(':')[0];
    if (!candidates.includes(base)) candidates.push(base);
  };
  add(userPref);
  for (const m of VISION_FALLBACK_CHAIN) add(m);
  for (const m of visionInstalled) add(m);

  logFn(`[LOKAL] Ollama ${ollamaVersion || '?'} — prüfe Vision-Modelle…`);

  for (const base of candidates) {
    if (isKnownIncompatible(base, ollamaVersion)) {
      logFn(`[LOKAL] ⏭ ${base} inkompatibel mit Ollama ${ollamaVersion} (mllama)`);
      continue;
    }
    const tag = resolveModelTag(installedNames, base);
    if (!modelInstalled(installedNames, base)) continue;

    logFn(`[LOKAL] Teste ${tag}…`);
    const probe = await probeModel(tag);
    if (probe.ok) {
      if (base !== userPref) {
        logFn(`[LOKAL] Nutze ${tag} (${userPref} nicht kompatibel mit dieser Ollama-Version)`);
      }
      expectedPullBytes = PULL_SIZE_ESTIMATES[base] || 2e9;
      return tag;
    }
    logFn(`[LOKAL] ❌ ${tag}: ${probe.error}`);
  }

  for (const base of VISION_FALLBACK_CHAIN) {
    if (isKnownIncompatible(base, ollamaVersion)) continue;
    if (modelInstalled(installedNames, base)) continue;
    logFn(`[LOKAL] Lade kompatibles Modell ${base}…`);
    expectedPullBytes = PULL_SIZE_ESTIMATES[base] || 2e9;
    return base;
  }

  throw new Error(
    `Kein Vision-Modell nutzbar. Ollama ${ollamaVersion}: bitte „ollama pull moondream“ ausführen.`
  );
}

function modelInstalled(models, name) {
  const base = name.split(':')[0];
  return models.some((m) => m === name || m === `${base}:latest` || m.startsWith(`${base}:`));
}

function resolveModelTag(models, name) {
  const base = name.split(':')[0];
  const hit = models.find((m) => m === name || m === `${base}:latest` || m.startsWith(`${base}:`));
  return hit || name;
}

async function pullModelViaApi(modelName, logFn, progressFn) {
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
  });
  if (!res.ok) throw new Error(`Ollama API pull: ${res.status}`);

  await new Promise((resolve, reject) => {
    let buffer = '';
    res.body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.total && obj.completed) {
            const pct = Math.min(99, Math.round((obj.completed / obj.total) * 100));
            const gb = (obj.completed / 1e9).toFixed(1);
            const totalGb = (obj.total / 1e9).toFixed(1);
            const msg = `Lade ${modelName}… ${pct}% (${gb} / ${totalGb} GB)`;
            status = { ...status, progress: pct, message: msg };
            progressFn({ progress: pct, message: msg });
          } else if (obj.status) {
            logFn(`[LOKAL] ${obj.status}`);
            progressFn({ progress: status.progress, message: obj.status });
          }
        } catch (_) { /* ignore */ }
      }
    });
    res.body.on('end', resolve);
    res.body.on('error', reject);
  });
}

function waitForModelInstall(modelName, logFn, progressFn, resumePull = false) {
  return new Promise((resolve, reject) => {
    logFn('[LOKAL] Überwache laufenden Download…');
    status = { ...status, state: 'downloading', message: `Lade ${modelName}…` };
    startBlobMonitor(modelName, progressFn);

    let stallChecks = 0;
    let lastBlobPct = status.progress || 0;

    const poll = setInterval(async () => {
      try {
        const models = await listModels();
        if (modelInstalled(models, modelName)) {
          clearInterval(poll);
          stopBlobMonitor();
          progressFn({ progress: 100, message: 'Download abgeschlossen.' });
          resolve();
          return;
        }

        const pct = updateProgressFromBlob(modelName, progressFn);
        if (pct <= lastBlobPct) stallChecks++;
        else { stallChecks = 0; lastBlobPct = pct; }

        if (stallChecks > 90) {
          clearInterval(poll);
          stopBlobMonitor();
          reject(new Error(
            `Download scheint hängen (${pct}%). Terminal: ollama pull ${modelName}`
          ));
        }
      } catch (e) {
        logFn(`[LOKAL] Poll-Fehler: ${e.message}`);
      }
    }, 2000);

    if (resumePull) {
      pullModelViaApi(modelName, logFn, progressFn)
        .then(() => { /* poll loop detects install */ })
        .catch((e) => logFn(`[LOKAL] API-Pull: ${e.message}`));
    }

    setTimeout(() => {
      clearInterval(poll);
      stopBlobMonitor();
      reject(new Error(`Download-Timeout. Terminal: ollama pull ${modelName}`));
    }, 3600000);
  });
}

async function pullModel(modelName, logFn, progressFn) {
  logFn(`[LOKAL] Lade Vision-Modell „${modelName}" (~7,8 GB)…`);
  status = { ...status, state: 'downloading', message: `Lade ${modelName}…`, progress: 0 };
  progressFn({ progress: 0, message: `Lade ${modelName}…` });

  const partial = findMainPartialBlob();
  const pullRunning = isOllamaPullRunning();

  if (pullRunning || (partial && partial.size > 100 * 1024 * 1024)) {
    return waitForModelInstall(modelName, logFn, progressFn, !pullRunning);
  }

  startBlobMonitor(modelName, progressFn);
  try {
    await pullModelViaApi(modelName, logFn, progressFn);
  } finally {
    stopBlobMonitor();
  }
}

function parseWarmupError(raw) {
  const text = raw || '';
  if (text.includes('mllama')) {
    return 'llama3.2-vision ist mit deiner Ollama-Version nicht kompatibel. Bitte „moondream“ in den Einstellungen wählen oder Ollama aktualisieren.';
  }
  if (text.includes('not found')) {
    return 'Vision-Modell nicht gefunden. Terminal: ollama pull moondream';
  }
  return `Warmup fehlgeschlagen: ${text}`;
}

async function warmupModel(modelName, logFn, progressFn) {
  logFn(`[LOKAL] Lade Modell in den Arbeitsspeicher…`);
  status = { ...status, state: 'warming', message: 'Modell wird in den RAM geladen…', progress: 100 };
  if (progressFn) progressFn({ progress: 100, message: status.message });

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: 'Antworte nur mit: bereit' }],
      stream: false,
      keep_alive: -1,
    }),
    timeout: 300000,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(parseWarmupError(err));
  }
  const data = await res.json();
  if (data.error) throw new Error(parseWarmupError(JSON.stringify(data.error)));
}

async function _doInit(config, eventSender) {
  const logFn = (msg) => broadcast(eventSender, 'agent-log', msg);
  const progressFn = (data) => {
    status = { ...status, progress: data.progress ?? status.progress, message: data.message || status.message };
    broadcast(eventSender, 'local-model-progress', data);
    broadcast(eventSender, 'local-model-status', getStatus());
  };

  const preferredModel = config.embeddedLocalModel || DEFAULT_VISION_MODEL;
  status = { state: 'loading', model: preferredModel, message: 'Verbinde mit Ollama…', progress: 0 };
  broadcast(eventSender, 'local-model-status', getStatus());

  if (!await ollamaReachable()) {
    status = {
      state: 'error',
      model: preferredModel,
      message: 'Ollama nicht erreichbar. Bitte Ollama.app öffnen.',
      progress: 0,
    };
    broadcast(eventSender, 'local-model-status', getStatus());
    return false;
  }

  let modelName = preferredModel;
  try {
    let models = await listModels();
    let resolvedModel = resolveModelTag(models, modelName);

    if (modelInstalled(models, modelName)) {
      const probe = await probeModel(resolvedModel);
      if (!probe.ok) {
        logFn(`[LOKAL] ${resolvedModel} nicht ladbar — suche Alternative…`);
        resolvedModel = await resolveWorkingVisionModel(config, logFn);
        modelName = resolvedModel.split(':')[0];
      }
    } else {
      modelName = (await resolveWorkingVisionModel(config, logFn)).split(':')[0];
      resolvedModel = modelName;
    }

    models = await listModels();
    if (!modelInstalled(models, modelName)) {
      await pullModel(modelName, logFn, progressFn);
      models = await listModels();
      resolvedModel = resolveModelTag(models, modelName);
      if (!modelInstalled(models, modelName)) {
        throw new Error(`Modell „${modelName}" nach Download nicht gefunden.`);
      }
    }

    const finalProbe = await probeModel(resolvedModel);
    if (!finalProbe.ok) {
      throw new Error(parseWarmupError(finalProbe.error));
    }

    status.model = resolvedModel;
    await warmupModel(resolvedModel, logFn, progressFn);

    status = {
      state: 'ready',
      model: resolvedModel,
      message: 'Lokales Vision-Modell bereit.',
      progress: 100,
    };
    broadcast(eventSender, 'local-model-status', getStatus());
    logFn(`[LOKAL] ✅ ${resolvedModel} ist geladen.`);
    return true;
  } catch (err) {
    status = {
      state: 'error',
      model: modelName,
      message: err.message,
      progress: status.progress || 0,
    };
    broadcast(eventSender, 'local-model-status', getStatus());
    logFn(`[LOKAL] ❌ ${err.message}`);
    return false;
  } finally {
    stopBlobMonitor();
    initPromise = null;
  }
}

function initEmbeddedLocalEngine(config, eventSender) {
  if (status.state === 'ready') return Promise.resolve(true);
  if (initPromise) return initPromise;
  initPromise = _doInit(config, eventSender);
  return initPromise;
}

function isReady() {
  return status.state === 'ready';
}

function isLoading() {
  return ['loading', 'downloading', 'warming'].includes(status.state);
}

const MOONDREAM_VISION_PROMPT =
  'Look at this computer screenshot. Describe all visible application windows, text, buttons, menus, dialogs, and UI elements in detail.';
const DEFAULT_TEXT_MODEL = 'llama3';

function isMoondreamModel(model) {
  return String(model || '').toLowerCase().includes('moondream');
}

function isWeakVisionResponse(text) {
  const t = (text || '').trim();
  if (!t || t.length < 20) return true;
  if (/^[\?\.\!"'\s…]+$/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && t.length < 50) return true;
  return false;
}

function extractImageMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.images?.[0]) return { image: m.images[0], userContent: m.content || '' };
  }
  return null;
}

function getSystemPrompt(messages) {
  return messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
}

async function ollamaChat(model, messages, timeout = 120000) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, keep_alive: -1 }),
    timeout,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  }
  return data.message?.content?.trim() || '';
}

async function synthesizeAnswerFromScreen(systemPrompt, screenDescription, userQuery, textModel) {
  const userContent = `Bildschirm-Analyse (automatisch erkannt):\n${screenDescription}\n\nNutzerfrage: ${userQuery}`;
  const textMessages = [];
  if (systemPrompt) textMessages.push({ role: 'system', content: systemPrompt });
  textMessages.push({ role: 'user', content: userContent });
  const model = textModel || DEFAULT_TEXT_MODEL;
  try {
    const answer = await ollamaChat(model, textMessages, 120000);
    if (!isWeakVisionResponse(answer)) return answer;
  } catch (_) { /* use fallback */ }
  return `Ich sehe auf deinem Bildschirm:\n\n${screenDescription}`;
}

async function analyzeImage(base64Jpeg, prompt, modelOverride) {
  if (!isReady()) {
    if (isLoading()) throw new Error(`Modell lädt noch… ${status.message}`);
    throw new Error(status.message || 'Lokales Modell ist nicht bereit.');
  }
  const model = modelOverride || status.model || DEFAULT_VISION_MODEL;

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt, images: [base64Jpeg] }],
      stream: false,
      keep_alive: -1,
    }),
    timeout: 120000,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision-Anfrage fehlgeschlagen: ${err}`);
  }

  const data = await res.json();
  return data.message?.content?.trim() || '';
}

async function chatWithImage(messages, modelOverride) {
  if (!isReady()) {
    if (isLoading()) throw new Error(`Modell lädt noch… ${status.message}`);
    throw new Error(status.message || 'Lokales Modell ist nicht bereit.');
  }
  const model = modelOverride || status.model || DEFAULT_VISION_MODEL;
  const imgMsg = extractImageMessage(messages);
  const systemPrompt = getSystemPrompt(messages);

  // moondream versteht deutsche Vision-Prompts kaum — zweistufig: EN-Bildanalyse, DE-Antwort via llama3
  if (imgMsg && isMoondreamModel(model)) {
    const description = await analyzeImage(imgMsg.image, MOONDREAM_VISION_PROMPT, model);
    if (isWeakVisionResponse(description)) {
      throw new Error('Vision-Modell konnte den Bildschirm nicht lesen. Bitte erneut versuchen.');
    }
    return synthesizeAnswerFromScreen(systemPrompt, description, imgMsg.userContent);
  }

  let result = await ollamaChat(model, messages);
  if (imgMsg && isWeakVisionResponse(result)) {
    const description = await analyzeImage(imgMsg.image, MOONDREAM_VISION_PROMPT, model);
    if (!isWeakVisionResponse(description)) {
      return synthesizeAnswerFromScreen(systemPrompt, description, imgMsg.userContent);
    }
    throw new Error('Keine brauchbare Antwort vom Vision-Modell.');
  }
  if (!result) {
    throw new Error('Leere Antwort vom lokalen Modell.');
  }
  return result;
}

module.exports = {
  initEmbeddedLocalEngine,
  analyzeImage,
  chatWithImage,
  isReady,
  isLoading,
  getStatus,
  DEFAULT_VISION_MODEL,
  VISION_FALLBACK_CHAIN,
};
