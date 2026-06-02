let currentScreenshot = '';
let chatHistory = [];
let activeSkills = new Set(['screenchat', 'influencer', 'auto']);
let attachedFiles = [];
let customSkillsList = [];

// Voice Recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

window.electronAPI.onScreenshotTaken((path) => {
  currentScreenshot = path;
  renderScreenshotBadge();
  document.getElementById('query-input').focus();
});

function renderScreenshotBadge() {
  const container = document.getElementById('screenshot-preview-container');
  if (!container) return;
  if (!currentScreenshot) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = 'flex';
  const timestamp = new Date().getTime();
  container.innerHTML = `
    <div class="file-badge" style="padding: 2px 8px 2px 2px;">
      <img src="file://${currentScreenshot}?t=${timestamp}" style="width: 24px; height: 24px; object-fit: cover; border-radius: 4px; margin-right: 4px;">
      <span id="remove-screenshot-btn" style="cursor: pointer; opacity: 0.6; font-size: 14px; font-weight: bold; margin-left: 2px;">&times;</span>
    </div>
  `;
  document.getElementById('remove-screenshot-btn').addEventListener('click', () => {
    currentScreenshot = '';
    renderScreenshotBadge();
  });
}

window.electronAPI.onAgentLog((msg) => {
  const logContent = document.getElementById('log-content');
  const time = new Date().toLocaleTimeString();
  logContent.innerHTML += `\n\n<span style="color:#aaa;">[${time}]</span> ${msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;
  logContent.scrollTop = logContent.scrollHeight;
});

window.electronAPI.onSimulationStart(() => {
  document.getElementById('simulation-animation').style.display = 'flex';
});

window.electronAPI.onSimulationEnd(() => {
  document.getElementById('simulation-animation').style.display = 'none';
});

// Modal Logic
window.electronAPI.onShowApproval((data) => {
  document.getElementById('approval-command').textContent = data.command;
  document.getElementById('approval-assessment').innerHTML = data.assessment.replace(/\n/g, '<br>');
  
  const indicator = document.getElementById('risk-indicator');
  if (indicator) {
     const text = data.assessment.toLowerCase();
     if (text.includes('high') || text.includes('hoch') || text.includes('kritisch')) {
       indicator.style.background = '#ff3b30';
       indicator.style.boxShadow = '0 0 8px #ff3b30';
     } else if (text.includes('medium') || text.includes('mittel') || text.includes('warnung')) {
       indicator.style.background = '#ffcc00';
       indicator.style.boxShadow = '0 0 8px #ffcc00';
     } else {
       indicator.style.background = '#34c759';
       indicator.style.boxShadow = '0 0 8px #34c759';
     }
  }
  
  document.getElementById('approval-modal').style.display = 'flex';
});

document.getElementById('btn-approve').addEventListener('click', () => {
  document.getElementById('approval-modal').style.display = 'none';
  window.electronAPI.sendApprovalResult(true);
});

document.getElementById('btn-decline').addEventListener('click', () => {
  document.getElementById('approval-modal').style.display = 'none';
  window.electronAPI.sendApprovalResult(false);
});

document.getElementById('close-btn').addEventListener('click', () => {
  // Chat leeren
  document.getElementById('chat-area').innerHTML = '<div class="message agent">Ich sehe deinen Bildschirm. Was möchtest du wissen?</div>';
  chatHistory = [];
  currentScreenshot = '';
  renderScreenshotBadge();
  if (typeof updateContextHeatmap === 'function') updateContextHeatmap();
  window.electronAPI.closeWindow();
});

document.getElementById('clear-chat-btn').addEventListener('click', () => {
  document.getElementById('chat-area').innerHTML = '<div class="message agent">Ich sehe deinen Bildschirm. Was möchtest du wissen?</div>';
  chatHistory = [];
  attachedFiles = [];
  currentScreenshot = '';
  renderScreenshotBadge();
  renderAttachedFiles();
  if (typeof updateContextHeatmap === 'function') updateContextHeatmap();
});

function updateContextHeatmap() {
  const btn = document.getElementById('context-health-btn');
  if (!btn) return;
  // Maximum size tracked is 20. Map chatHistory length from 0 to 20 to hue from 120 (green) to 0 (red).
  const ratio = Math.min(chatHistory.length / 20, 1); 
  const hue = 120 - (ratio * 120);
  btn.style.color = `hsl(${hue}, 100%, 50%)`;
}

document.getElementById('context-health-btn').addEventListener('click', async () => {
  if (chatHistory.length === 0) return;
  
  const btn = document.getElementById('context-health-btn');
  btn.style.opacity = '0.5';
  btn.style.pointerEvents = 'none';
  
  const loadingMsg = document.createElement('div');
  loadingMsg.className = 'message agent';
  loadingMsg.innerHTML = '<i>🧠 Fasse aktuellen Kontext für die Übergabe zusammen...</i>';
  document.getElementById('chat-area').appendChild(loadingMsg);
  loadingMsg.scrollIntoView({ behavior: 'smooth' });
  
  const summaryPrompt = "Bitte fasse unseren kompletten bisherigen Chatverlauf sehr detailliert und präzise zusammen. Diese Zusammenfassung dient als exakte Übergabe (Handover) an deinen Nachfolger-Kontext, da der Speicher geleert wird. Nenne alle Fakten, getroffenen Entscheidungen, den aktuellen Stand und das, woran wir gerade gearbeitet haben. Antworte direkt und ausschließlich mit der Zusammenfassung.";
  
  try {
    const response = await window.electronAPI.processQuery({ 
      query: summaryPrompt, 
      screenshotPath: '',
      history: chatHistory,
      skills: [], // Keine Skills übergeben, damit die Zusammenfassung rein sachlich bleibt
      files: []
    });
    
    loadingMsg.remove();
    
    if (response.error) {
      addMessage("Fehler bei der Zusammenfassung: " + response.error, "agent");
    } else {
      const resetPrompt = `[SYSTEM-ÜBERGABE: Der Kontext wurde soeben geleert, um Token zu sparen. Hier ist die detaillierte Zusammenfassung unserer bisherigen Arbeit. Bitte nutze dieses Wissen und mache nahtlos an diesem Punkt weiter:]\n\n${response.text}`;
      
      chatHistory = [{ role: 'user', content: resetPrompt }];
      
      // UI komplett leeren, damit der alte Chat auch visuell verschwindet
      document.getElementById('chat-area').innerHTML = '';
      
      addMessage(`🧠 <b>Kontext-Reset & Übergabe erfolgreich!</b><br><br><div style="font-size:12px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); margin-top:8px;"><i>${response.text.replace(/\\n/g, '<br>')}</i></div>`, "agent");
      
      if (response.totalCost !== undefined) updateCostUI(response.totalCost);
    }
  } catch(e) {
    loadingMsg.remove();
    addMessage("Konnte Kontext nicht zusammenfassen: " + e.message, "agent");
  }
  
  btn.style.opacity = '1';
  btn.style.pointerEvents = 'auto';
  updateContextHeatmap();
});

document.getElementById('hide-btn').addEventListener('click', () => {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('settings-view').style.display = 'none';
  document.getElementById('logs-view').style.display = 'none';
  document.getElementById('bubble-view').style.display = 'flex';
  document.body.style.padding = '0'; // Remove padding for bubble mode
  window.electronAPI.setWindowMode('bubble');
});

if (window.electronAPI.onForceExpandedMode) {
  window.electronAPI.onForceExpandedMode(() => {
    document.body.style.padding = '50px 50px 80px 50px'; // Restore padding
    document.getElementById('bubble-view').style.display = 'none';
    document.getElementById('settings-view').style.display = 'none';
    document.getElementById('logs-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'flex';
    init(); // Re-initialize config whenever window is opened
  });
}

document.getElementById('bubble-click').addEventListener('click', () => {
  document.getElementById('bubble-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'flex';
  window.electronAPI.setWindowMode('expanded');
  document.getElementById('query-input').focus();
});

window.electronAPI.onForceExpandedMode(() => {
  document.getElementById('bubble-view').style.display = 'none';
  document.getElementById('settings-view').style.display = 'none';
  document.getElementById('logs-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'flex';
  document.getElementById('query-input').focus();
});

function updateCostUI(cost) {
  const badge = document.getElementById('cost-badge');
  if (badge) badge.textContent = '$' + parseFloat(cost).toFixed(3);
  
  const settingsBadge = document.getElementById('settings-total-cost');
  if (settingsBadge) settingsBadge.textContent = '$' + parseFloat(cost).toFixed(3);
}

// ---- Settings Logic ----
async function openSettings() {
  const config = await window.electronAPI.getConfig();
  document.getElementById('cfg-apikey').value = config.apiKey || '';
  document.getElementById('cfg-geminikey').value = config.geminiApiKey || '';
  document.getElementById('cfg-model').value = config.model || 'gpt-4o';
  document.getElementById('cfg-quality').value = config.imageQuality || 'standard';
  document.getElementById('cfg-assist-risk').value = config.assistRisk || 'guided';
  document.getElementById('cfg-voice').value = config.voiceMode || 'openai';
  document.getElementById('config-persona').value = config.agentPersona || '';
  document.getElementById('cfg-prompt').value = config.systemPrompt || '';
  document.getElementById('cfg-temperature').value = config.temperature ?? 0.5;
  document.getElementById('temp-val').textContent = document.getElementById('cfg-temperature').value;
  document.getElementById('app-version').textContent = `v${config.version || '1.0.0'}`;
  updateCostUI(config.totalCost);
  
  customSkillsList = config.customSkills || [];
  renderCustomSkillsList();
  
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('logs-view').style.display = 'none';
  document.getElementById('settings-view').style.display = 'flex';
}

document.getElementById('cfg-temperature').addEventListener('input', (e) => {
  document.getElementById('temp-val').textContent = e.target.value;
});

function renderCustomSkillsList() {
  const container = document.getElementById('custom-skills-list');
  container.innerHTML = '';
  customSkillsList.forEach((skill, index) => {
    const div = document.createElement('div');
    div.style = "background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); position: relative;";
    div.innerHTML = `
      <input type="text" placeholder="Skill ID" value="${skill.id}" readonly class="skill-id-input" data-index="${index}" style="width: 100%; background: transparent; border: none; color: rgba(255,159,10,0.6); font-weight: bold; font-size: 11px; outline: none; margin-bottom: 4px; cursor: default;">
      <input type="text" placeholder="Anzeigename" value="${skill.name}" class="skill-name-input" data-index="${index}" style="width: 100%; background: transparent; border: none; color: white; font-size: 13px; outline: none; margin-bottom: 4px;">
      <textarea placeholder="System Prompt" class="skill-prompt-input" data-index="${index}" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #ccc; font-size: 11px; border-radius: 4px; padding: 4px; min-height: 40px;">${skill.prompt}</textarea>
      <button class="remove-custom-skill" data-index="${index}" style="position: absolute; top: 4px; right: 4px; background: transparent; color: #ff3b30; border: none; cursor: pointer; font-size: 14px;">&times;</button>
    `;
    container.appendChild(div);
  });
  

  document.querySelectorAll('.skill-name-input').forEach(el => el.addEventListener('change', e => customSkillsList[e.target.dataset.index].name = e.target.value));
  document.querySelectorAll('.skill-prompt-input').forEach(el => el.addEventListener('change', e => customSkillsList[e.target.dataset.index].prompt = e.target.value));
  document.querySelectorAll('.remove-custom-skill').forEach(el => el.addEventListener('click', e => {
    customSkillsList.splice(e.target.dataset.index, 1);
    renderCustomSkillsList();
  }));
}

document.getElementById('add-custom-skill-btn').addEventListener('click', () => {
  const newId = 'custom_' + Math.random().toString(36).substr(2, 9);
  customSkillsList.push({ id: newId, name: 'Neuer Skill', prompt: 'Du bist ein KI-Assistent.' });
  renderCustomSkillsList();
});

function closeSettings() {
  document.getElementById('settings-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'flex';
  document.getElementById('query-input').focus();
}

document.getElementById('open-settings-btn').addEventListener('click', openSettings);
document.getElementById('cancel-settings-btn').addEventListener('click', closeSettings);

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('cfg-apikey').value.trim();
  const geminiApiKey = document.getElementById('cfg-geminikey').value.trim();
  const model = document.getElementById('cfg-model').value;
  const imageQuality = document.getElementById('cfg-quality').value;
  const assistRisk = document.getElementById('cfg-assist-risk').value;
  const voiceMode = document.getElementById('cfg-voice').value;
  const systemPrompt = document.getElementById('cfg-prompt').value.trim();
  const agentPersona = document.getElementById('config-persona').value.trim();
  const temperature = parseFloat(document.getElementById('cfg-temperature').value);
  const customSkills = customSkillsList.filter(s => s.id && s.name && s.prompt);
  
  await window.electronAPI.saveConfig({ apiKey, geminiApiKey, model, imageQuality, assistRisk, voiceMode, systemPrompt, agentPersona, temperature, customSkills });
  closeSettings();
  init(); // Reload skills UI
});

document.getElementById('reset-cost-btn').addEventListener('click', async () => {
  if(confirm('Kosten wirklich auf $0.00 zurücksetzen?')) {
    await window.electronAPI.saveConfig({ totalCost: 0 });
    updateCostUI(0);
  }
});

// ---- Logs Logic ----
document.getElementById('open-logs-btn').addEventListener('click', () => {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('settings-view').style.display = 'none';
  document.getElementById('logs-view').style.display = 'flex';
});
document.getElementById('close-logs-btn').addEventListener('click', () => {
  document.getElementById('logs-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'flex';
  document.getElementById('query-input').focus();
});


function init() {
  window.electronAPI.getConfig().then(config => {
    try {
      customSkillsList = config.customSkills || [];
      renderSkills();
      updateCostUI(config.totalCost);
      if (!config.apiKey && !config.geminiApiKey) {
        openSettings();
      }
    } catch (err) {
      document.getElementById('chat-area').innerHTML += `<div style="color:red">INIT ERROR: ${err.message}</div>`;
    }
  }).catch(err => {
    document.getElementById('chat-area').innerHTML += `<div style="color:red">GETCONFIG ERROR: ${err.message}</div>`;
  });
}

function addMessage(text, sender) {
  const chatArea = document.getElementById('chat-area');
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  if (sender === 'user') {
    msg.innerHTML = text; // Erlaubt HTML für angehängte Dateien im Text
  } else {
    try {
      const rawHtml = marked.parse(text);
      msg.innerHTML = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['data-path', 'data-filename'] });
    } catch (e) {
      msg.textContent = text;
    }
  }
  
  msg.addEventListener('click', (e) => {
    if (window.getSelection().toString().length > 0) return;
    if (e.target.tagName !== 'A' && e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
      msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  chatArea.appendChild(msg);
  
  // Custom scroll behavior based on sender
  if (sender === 'agent') {
    // Scroll to the top of the newly added agent message
    msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

document.getElementById('chat-area').addEventListener('click', (e) => {
  const btn = e.target.closest('.download-btn');
  if (btn) {
    const path = btn.getAttribute('data-path');
    const filename = btn.getAttribute('data-filename');
    window.electronAPI.saveDocument(path, filename);
  }
});

function renderSkills() {
  const container = document.getElementById('active-skills-container');
  container.innerHTML = '';
  let skillNames = {};
  
  // Add custom skills to the selector dynamically
  const selector = document.getElementById('skill-selector');
  // Keep only the first disabled option 'Skill hinzufügen...'
  while(selector.options.length > 1) { selector.remove(1); }
  
  skillNames['auto'] = '🤖 Auto-Pilot';
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = '🤖 Auto-Pilot (KI wählt Skills)';
  selector.appendChild(autoOpt);

  customSkillsList.forEach(s => {
    skillNames[s.id] = s.name;
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name}`;
    selector.appendChild(opt);
  });
  
  activeSkills.forEach(skill => {
    const badge = document.createElement('div');
    badge.className = 'skill-badge';
    badge.innerHTML = `${skillNames[skill]} <span class="remove-skill" data-skill="${skill}" style="cursor: pointer; opacity: 0.6; margin-left: 6px; font-size: 12px; font-weight: bold;">&times;</span>`;
    container.appendChild(badge);
  });

  document.querySelectorAll('.remove-skill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeSkills.delete(e.target.dataset.skill);
      renderSkills();
    });
  });
}

document.getElementById('skill-selector').addEventListener('change', (e) => {
  const select = e.target;
  if (select.value) {
    activeSkills.add(select.value);
    select.value = ''; // Reset select
    renderSkills();
  }
});

async function sendQuery() {
  const input = document.getElementById('query-input');
  const query = input.value.trim();
  
  if (!query && attachedFiles.length === 0) return;

  let displayQuery = query;
  if (attachedFiles.length > 0) {
    displayQuery += `<br><span style="font-size:11px; opacity:0.8;">[Angehängte Dateien: ${attachedFiles.map(f => f.name).join(', ')}]</span>`;
  }

  addMessage(displayQuery || "Analysiere Datei...", 'user');
  input.value = '';
  
  const filesToSend = [...attachedFiles];
  attachedFiles = [];
  renderAttachedFiles();
  
  const sentScreenshot = currentScreenshot;
  currentScreenshot = ''; // clear it for next prompt!
  renderScreenshotBadge();
  
  const typingMsg = document.createElement('div');
  typingMsg.className = 'message agent';
  typingMsg.textContent = 'Agent denkt nach...';
  document.getElementById('chat-area').appendChild(typingMsg);

  let response;
  try {
    response = await window.electronAPI.processQuery({ 
      query, 
      screenshotPath: sentScreenshot, 
      history: chatHistory,
      skills: Array.from(activeSkills),
      files: filesToSend
    });
  } catch (err) {
    console.error("IPC Error:", err);
    response = { error: "Interner Kommunikationsfehler: " + (err.message || err.toString()) };
  }

  typingMsg.remove();
  
  if (response.error) {
    addMessage(`Fehler: ${response.error}`, 'agent');
  } else {
    addMessage(response.text, 'agent');
    speakText(response.text);
    
    chatHistory.push({ role: 'user', content: query });
    chatHistory.push({ role: 'assistant', content: response.text });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
    if (typeof updateContextHeatmap === 'function') updateContextHeatmap();
    
    if (chatHistory.length === 18) {
      addMessage("⚠️ <span style='opacity: 0.8; font-size: 13px;'><i>System-Hinweis: Mein Kurzzeitgedächtnis ist fast voll (noch 10% Puffer übrig). Bitte klicke demnächst auf das rote Gehirn-Icon oben links, um eine nahtlose Übergabe in einen neuen Kontext zu starten.</i></span>", "agent");
    }
  }
  
  if (response.totalCost !== undefined) {
    updateCostUI(response.totalCost);
  }
}

async function speakText(text) {
  const config = await window.electronAPI.getConfig();
  const mode = config.voiceMode || 'openai';
  
  if (mode === 'none' || !text) return;
  
  const cleanText = text.replace(/\*/g, '').replace(/<[^>]+>/g, '').trim();
  if (!cleanText) return;
  
  if (mode === 'local') {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
  } else if (mode === 'openai') {
    try {
      const buffer = await window.electronAPI.synthesizeSpeech(cleanText);
      if (buffer) {
        const blob = new Blob([buffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      }
    } catch (e) {
      console.error("OpenAI TTS Failed", e);
    }
  }
}

document.getElementById('submit-btn').addEventListener('click', sendQuery);
document.getElementById('query-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendQuery();
});

document.getElementById('mic-btn').addEventListener('click', async () => {
  const micBtn = document.getElementById('mic-btn');
  const queryInput = document.getElementById('query-input');

  if (isRecording) {
    mediaRecorder.stop();
    micBtn.classList.remove('recording');
    isRecording = false;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      queryInput.placeholder = "Transkribiere Audio...";
      try {
        const transcript = await window.electronAPI.transcribeAudio(arrayBuffer);
        if (transcript) {
          queryInput.value = (queryInput.value + (queryInput.value ? ' ' : '') + transcript).trim() + ' ';
          sendQuery(); // Auto-send
        }
      } catch (err) {
        console.error("Transcription error:", err);
        alert("Fehler bei der Audio-Transkription:\\n" + (err.message || err));
      }
      queryInput.placeholder = "Frag mich was...";
    };

    mediaRecorder.start();
    micBtn.classList.add('recording');
    isRecording = true;
  } catch (error) {
    console.error("Microphone access denied or error:", error);
    alert("Konnte nicht auf das Mikrofon zugreifen. Bitte Berechtigungen prüfen.");
  }
});

document.getElementById('crop-btn').addEventListener('click', async () => {
  document.getElementById('crop-btn').style.color = '#ff3b30';
  await window.electronAPI.takeInteractiveScreenshot();
  document.getElementById('crop-btn').style.color = '#aaa';
});

// Drag and Drop Logic
function renderAttachedFiles() {
  const container = document.getElementById('attached-files-container');
  container.innerHTML = '';
  attachedFiles.forEach((file, index) => {
    const badge = document.createElement('div');
    badge.className = 'file-badge';
    badge.innerHTML = `📄 ${file.name} <span class="remove-file" data-index="${index}" style="cursor: pointer; opacity: 0.6; font-size: 12px; font-weight: bold;">&times;</span>`;
    container.appendChild(badge);
  });
  document.querySelectorAll('.remove-file').forEach(btn => {
    btn.addEventListener('click', (e) => {
      attachedFiles.splice(e.target.dataset.index, 1);
      renderAttachedFiles();
    });
  });
}

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (document.getElementById('main-view').style.display !== 'none') {
    document.getElementById('drop-overlay').style.display = 'flex';
  }
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.target === document.getElementById('drop-overlay')) {
    document.getElementById('drop-overlay').style.display = 'none';
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('drop-overlay').style.display = 'none';
  
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    for (const f of e.dataTransfer.files) {
      attachedFiles.push({ name: f.name, path: f.path });
    }
    renderAttachedFiles();
  }
});

// Setup Overlay Logic
const setupOverlay = document.getElementById('setup-overlay');
const btnDownloadModel = document.getElementById('btn-download-model');
const progressContainer = document.getElementById('download-progress-container');
const progressBar = document.getElementById('download-progress-bar');
const progressText = document.getElementById('download-status-text');

if (window.electronAPI && window.electronAPI.onModelDownloadRequired) {
  window.electronAPI.onModelDownloadRequired(() => {
    setupOverlay.style.display = 'flex';
    btnDownloadModel.style.display = 'block';
    progressContainer.style.display = 'none';
  });

  window.electronAPI.onModelDownloadProgress((data) => {
    setupOverlay.style.display = 'flex';
    btnDownloadModel.style.display = 'none';
    progressContainer.style.display = 'block';
    progressBar.style.width = data.progress + '%';
    progressText.innerText = data.progress + '% (' + data.mb + ' MB)';
    
    if (data.progress === 100) {
      setTimeout(() => {
         setupOverlay.style.display = 'none';
         addMessage('Modell erfolgreich installiert! Du kannst nun offline chatten.', 'agent');
      }, 1500);
    }
  });

  btnDownloadModel.addEventListener('click', () => {
    btnDownloadModel.style.display = 'none';
    progressContainer.style.display = 'block';
    window.electronAPI.startModelDownload();
  });
}

init();
