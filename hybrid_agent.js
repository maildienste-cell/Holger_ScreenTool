/**
 * Hybrid-Router: Vision lokal (Ollama), Tools lokal (Qwen/Llama), Cloud nur bei Bedarf.
 */
const fetch = require('node-fetch');

const OLLAMA_BASE = 'http://127.0.0.1:11434';

const SCREEN_PROMPT =
  'Look at this computer screenshot. Describe visible apps, windows, text, buttons, menus, and form fields in detail.';
const SCREEN_ASSIST_PROMPT =
  `${SCREEN_PROMPT} For each interactive element (buttons, inputs, links), estimate center position as relative coordinates x and y between 0.0 and 1.0.`;

function analyzeNeeds(query, skills) {
  const q = (query || '').toLowerCase();
  const needsVision =
    skills.includes('screenchat') ||
    skills.includes('assistenz') ||
    skills.includes('stockcheck') ||
    /bildschirm|screen|siehst|formular|klick|fenster|was steht|button|ui|zeig/.test(q);
  const needsTools =
    skills.includes('assistenz') ||
    skills.includes('web') ||
    skills.includes('terminal') ||
    skills.includes('mac_controller') ||
    skills.includes('programmer') ||
    skills.includes('deepresearch') ||
    skills.includes('mrbillig') ||
    skills.includes('stockcheck') ||
    skills.includes('tradingexpert') ||
    /klick|öffne|füll|terminal|suche|steuer|ausfüll|tipp|maus/.test(q);
  const needsPi =
    skills.includes('programmer') &&
    /code|programm|react|typescript|implement|refactor|npm|git|datei|ordner|repo/.test(q);
  const needsOpenClaw =
    skills.includes('mac_controller') ||
    /systemeinstellung|dark\s*mode|einstellung|openclaw/.test(q);
  const forceCloud =
    skills.includes('deepresearch') ||
    skills.includes('mirofish_full') ||
    (skills.includes('mirofish') && /simul|prognos|aktie/.test(q));
  return { needsVision, needsTools, needsPi, needsOpenClaw, forceCloud };
}

function planQuery({ query, skills, config }) {
  const needs = analyzeNeeds(query, skills);
  const hasCloud = !!config.apiKey;
  const preferLocal = config.hybridPreferLocal !== false;

  if (needs.forceCloud && hasCloud) {
    return {
      tier: 'cloud',
      cloudModel: config.hybridCloudVisionModel || 'gpt-4o',
      needsVision: needs.needsVision,
      needsTools: true,
      injectVisionAsText: false,
      escalateOnFailure: false,
      logMessage: 'Komplexe Recherche/Simulation → Cloud',
      ...needs,
    };
  }

  if (needs.needsPi && preferLocal) {
    return {
      tier: 'local',
      needsVision: needs.needsVision,
      needsTools: true,
      injectVisionAsText: true,
      escalateOnFailure: hasCloud,
      cloudModel: config.hybridCloudVisionModel || 'gpt-4o',
      logMessage: 'Coding → lokal (Qwen/Llama + Pi-Agent)',
      ...needs,
    };
  }

  if (needs.needsOpenClaw && preferLocal) {
    return {
      tier: 'local',
      needsVision: needs.needsVision,
      needsTools: true,
      injectVisionAsText: true,
      escalateOnFailure: hasCloud,
      cloudModel: config.hybridCloudVisionModel || 'gpt-4o',
      logMessage: 'OS-Steuerung → lokal + OpenClaw-Tool',
      ...needs,
    };
  }

  if (skills.includes('assistenz') || (needs.needsTools && needs.needsVision)) {
    return {
      tier: 'local',
      needsVision: true,
      needsTools: true,
      injectVisionAsText: true,
      escalateOnFailure: hasCloud,
      cloudModel: config.hybridCloudVisionModel || 'gpt-4o',
      logMessage: 'Bildschirm + Aktionen → lokal, Cloud-Fallback bei Fehler',
      ...needs,
    };
  }

  if (needs.needsVision && !needs.needsTools) {
    return {
      tier: 'vision_only',
      needsVision: true,
      needsTools: false,
      injectVisionAsText: true,
      escalateOnFailure: hasCloud,
      cloudModel: config.hybridCloudModel || 'gpt-4o-mini',
      logMessage: 'Bildschirm-Frage → lokal (Vision kostenlos)',
      ...needs,
    };
  }

  if (needs.needsTools && preferLocal) {
    return {
      tier: 'local',
      needsVision: needs.needsVision,
      needsTools: true,
      injectVisionAsText: needs.needsVision,
      escalateOnFailure: hasCloud,
      cloudModel: config.hybridCloudModel || 'gpt-4o-mini',
      logMessage: 'Tools → lokales Modell',
      ...needs,
    };
  }

  if (preferLocal && (config.hybridLocalTextModel || config.localApiModel)) {
    return {
      tier: 'local',
      needsVision: false,
      needsTools: needs.needsTools,
      injectVisionAsText: false,
      escalateOnFailure: hasCloud,
      cloudModel: config.hybridCloudModel || 'gpt-4o-mini',
      logMessage: 'Chat → lokal (kostenlos)',
      ...needs,
    };
  }

  if (hasCloud) {
    return {
      tier: 'cloud',
      cloudModel: needs.needsVision
        ? config.hybridCloudVisionModel || 'gpt-4o'
        : config.hybridCloudModel || 'gpt-4o-mini',
      needsVision: needs.needsVision,
      needsTools: needs.needsTools,
      injectVisionAsText: false,
      escalateOnFailure: false,
      logMessage: 'Cloud-Modus',
      ...needs,
    };
  }

  return {
    tier: 'local',
    needsVision: needs.needsVision,
    needsTools: needs.needsTools,
    injectVisionAsText: needs.needsVision,
    escalateOnFailure: false,
    logMessage: 'Offline → nur lokale Modelle',
    ...needs,
  };
}

async function buildScreenContext(base64Image, embeddedEngine, forAssistenz = false) {
  if (!base64Image) return '';
  const prompt = forAssistenz ? SCREEN_ASSIST_PROMPT : SCREEN_PROMPT;
  return embeddedEngine.analyzeImage(base64Image, prompt);
}

function wrapQueryWithScreen(query, screenContext, fileContentsText = '') {
  if (!screenContext) return `${query}${fileContentsText}`;
  return `[AKTUELLER BILDSCHIRM — lokal analysiert]\n${screenContext}\n\n[NUTZERFRAGE]\n${query}${fileContentsText}`;
}

function isWeakResponse(text) {
  const t = (text || '').trim();
  return !t || t.length < 12;
}

function shouldEscalateToCloud(hybridPlan, data, message) {
  if (!hybridPlan?.escalateOnFailure) return false;
  if (data?.error) return true;
  if (!message) return true;
  if (hybridPlan.needsTools && !message.tool_calls?.length && isWeakResponse(message.content)) {
    return true;
  }
  return false;
}

function getLocalTextModel(config) {
  return config.hybridLocalTextModel || config.localApiModel || 'qwen2.5:14b';
}

module.exports = {
  analyzeNeeds,
  planQuery,
  buildScreenContext,
  wrapQueryWithScreen,
  isWeakResponse,
  shouldEscalateToCloud,
  getLocalTextModel,
  SCREEN_ASSIST_PROMPT,
};
