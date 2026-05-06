let currentScreenshot = '';
let chatHistory = [];
let activeSkills = new Set(['screenchat']);
let attachedFiles = [];
let customSkillsList = [];

// Voice Recognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'de-DE';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const speechResult = event.results[0][0].transcript;
    document.getElementById('query-input').value = speechResult;
    sendQuery();
  };
  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
  };
  recognition.onend = () => {
    document.getElementById('mic-btn').style.color = '#aaa';
  };
}

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

// Modal Logic
window.electronAPI.onShowApproval((data) => {
  document.getElementById('approval-command').textContent = data.command;
  document.getElementById('approval-assessment').innerHTML = data.assessment.replace(/\n/g, '<br>');
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
  window.electronAPI.closeWindow();
});

document.getElementById('clear-chat-btn').addEventListener('click', () => {
  document.getElementById('chat-area').innerHTML = '<div class="message agent">Ich sehe deinen Bildschirm. Was möchtest du wissen?</div>';
  chatHistory = [];
  attachedFiles = [];
  currentScreenshot = '';
  renderScreenshotBadge();
  renderAttachedFiles();
});

document.getElementById('hide-btn').addEventListener('click', () => {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('settings-view').style.display = 'none';
  document.getElementById('logs-view').style.display = 'none';
  document.getElementById('bubble-view').style.display = 'flex';
  window.electronAPI.setWindowMode('bubble');
});

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

function updateCostUI(totalCost) {
  const costStr = `$${(totalCost || 0).toFixed(4)}`;
  document.getElementById('cost-badge').textContent = costStr;
  document.getElementById('settings-total-cost').textContent = costStr;
}

// ---- Settings Logic ----
async function openSettings() {
  const config = await window.electronAPI.getConfig();
  document.getElementById('cfg-apikey').value = config.apiKey || '';
  document.getElementById('cfg-geminikey').value = config.geminiApiKey || '';
  document.getElementById('cfg-model').value = config.model || 'gpt-4o';
  document.getElementById('cfg-quality').value = config.imageQuality || 'standard';
  document.getElementById('cfg-actions').checked = config.allowActions || false;
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
  const allowActions = document.getElementById('cfg-actions').checked;
  const systemPrompt = document.getElementById('cfg-prompt').value.trim();
  const temperature = parseFloat(document.getElementById('cfg-temperature').value);
  const customSkills = customSkillsList.filter(s => s.id && s.name && s.prompt);
  
  await window.electronAPI.saveConfig({ apiKey, geminiApiKey, model, imageQuality, allowActions, systemPrompt, temperature, customSkills });
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
      console.error("Error in init then:", err);
    }
  }).catch(err => {
    console.error("Error getting config:", err);
  });
}

function addMessage(text, sender) {
  const chatArea = document.getElementById('chat-area');
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  if (sender === 'user') {
    msg.textContent = text;
  } else {
    try {
      const rawHtml = marked.parse(text);
      msg.innerHTML = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['data-path', 'data-filename'] });
    } catch (e) {
      msg.textContent = text;
    }
  }
  chatArea.appendChild(msg);
  chatArea.scrollTop = chatArea.scrollHeight;
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
    
    chatHistory.push({ role: 'user', content: query });
    chatHistory.push({ role: 'assistant', content: response.text });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  }
  
  if (response.totalCost !== undefined) {
    updateCostUI(response.totalCost);
  }
}

document.getElementById('submit-btn').addEventListener('click', sendQuery);
document.getElementById('query-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendQuery();
});

document.getElementById('mic-btn').addEventListener('click', () => {
  if (recognition) {
    document.getElementById('mic-btn').style.color = '#ff3b30';
    recognition.start();
  } else {
    alert("Spracherkennung wird in diesem Browser/System nicht unterstützt.");
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
