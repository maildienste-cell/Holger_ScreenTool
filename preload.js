const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  processQuery: (data) => ipcRenderer.invoke('process-query', data),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfig: () => ipcRenderer.invoke('get-config'),
  closeWindow: () => ipcRenderer.send('close-window'),
  setWindowMode: (mode) => ipcRenderer.send('set-window-mode', mode),
  onForceExpandedMode: (callback) => ipcRenderer.on('force-expanded-mode', callback),
  onScreenshotTaken: (callback) => ipcRenderer.on('screenshot-taken', (_event, path) => callback(path)),
  onAgentLog: (callback) => ipcRenderer.on('agent-log', (_event, msg) => callback(msg)),
  onShowApproval: (callback) => ipcRenderer.on('show-approval-popup', (_event, data) => callback(data)),
  sendApprovalResult: (approved) => ipcRenderer.invoke('approve-command', { approved }),
  takeInteractiveScreenshot: () => ipcRenderer.invoke('take-interactive-screenshot'),
  onModelDownloadRequired: (callback) => ipcRenderer.on('model-download-required', callback),
  onModelDownloadProgress: (callback) => ipcRenderer.on('model-download-progress', (_event, data) => callback(data)),
  startModelDownload: () => ipcRenderer.send('start-model-download'),
  saveDocument: (path, filename) => ipcRenderer.invoke('save-document', { path, filename }),
  onSimulationStart: (callback) => ipcRenderer.on('simulation-start', callback),
  onSimulationEnd: (callback) => ipcRenderer.on('simulation-end', callback),
  transcribeAudio: (buffer) => ipcRenderer.invoke('transcribe-audio', buffer),
  synthesizeSpeech: (text) => ipcRenderer.invoke('synthesize-speech', text)
});
