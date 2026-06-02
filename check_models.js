const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const p = path.join(app.getPath('userData'), 'config.json');
    let data = JSON.parse(fs.readFileSync(p));
    let key = data.geminiApiKey;
    
    console.log("Encrypted key length:", key.length);
    if (safeStorage.isEncryptionAvailable()) {
      try { 
        key = safeStorage.decryptString(Buffer.from(key, 'base64')); 
        console.log("Decrypted key starts with:", key.substring(0, 5));
      } catch (e) {
        console.log("Decryption failed:", e);
      }
    }
  } catch (err) {
    console.error(err);
  }
  app.quit();
});
