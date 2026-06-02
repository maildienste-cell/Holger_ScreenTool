const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
app.whenReady().then(async () => {
  const p = path.join(app.getPath('userData'), 'config.json');
  let data = JSON.parse(fs.readFileSync(p));
  let key = data.geminiApiKey;
  if (safeStorage.isEncryptionAvailable()) {
    try { key = safeStorage.decryptString(Buffer.from(key, 'base64')); } catch (e) {}
  }
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  app.quit();
});
