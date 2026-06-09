/**
 * Fallback build script — uses system unzip instead of extract-zip (Node 24 compat).
 */
const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'release-builds');
const APP_NAME = 'desktop-mini-agent';
const ELECTRON_VERSION = require('electron/package.json').version;
const ZIP = path.join(
  process.env.HOME,
  'Library/Caches/electron',
  '4b092cc678b6ff8448c5ab35fabca1710dccc91cfbff065280601a184126b0fe',
  `electron-v${ELECTRON_VERSION}-darwin-arm64.zip`
);

async function main() {
  const finalDir = path.join(OUT, `${APP_NAME}-darwin-arm64`);
  const appPath = path.join(finalDir, `${APP_NAME}.app`);

  console.log('Electron', ELECTRON_VERSION);
  console.log('ZIP:', ZIP);
  if (!fs.existsSync(ZIP)) throw new Error(`Electron ZIP not found: ${ZIP}`);

  const tmp = await fs.mkdtemp(path.join(require('os').tmpdir(), 'dma-build-'));
  console.log('Extracting to', tmp);
  execSync(`unzip -q "${ZIP}" -d "${tmp}"`, { stdio: 'inherit' });

  await fs.remove(finalDir);
  await fs.mkdirp(finalDir);

  const electronApp = path.join(tmp, 'Electron.app');
  await fs.copy(electronApp, appPath);

  const plistPath = path.join(appPath, 'Contents/Info.plist');
  let plist = await fs.readFile(plistPath, 'utf8');
  plist = plist
    .replace(/<key>CFBundleExecutable<\/key>\s*<string>Electron<\/string>/,
      '<key>CFBundleExecutable</key>\n    <string>desktop-mini-agent</string>')
    .replace(/<key>CFBundleName<\/key>\s*<string>Electron<\/string>/,
      '<key>CFBundleName</key>\n    <string>desktop-mini-agent</string>')
    .replace(/<key>CFBundleDisplayName<\/key>\s*<string>Electron<\/string>/,
      '<key>CFBundleDisplayName</key>\n    <string>desktop-mini-agent</string>')
    .replace(/<key>CFBundleIdentifier<\/key>\s*<string>[^<]+<\/string>/,
      '<key>CFBundleIdentifier</key>\n    <string>com.electron.desktop-mini-agent</string>');
  await fs.writeFile(plistPath, plist);

  const macExec = path.join(appPath, 'Contents/MacOS/Electron');
  const newExec = path.join(appPath, 'Contents/MacOS/desktop-mini-agent');
  await fs.move(macExec, newExec);

  const resourcesApp = path.join(appPath, 'Contents/Resources/app');
  await fs.mkdirp(resourcesApp);

  const ignore = new Set(['node_modules', 'release-builds', 'dist-app', 'dist', 'build', '.git', 'MiroFish']);
  const entries = await fs.readdir(ROOT);
  for (const entry of entries) {
    if (ignore.has(entry) || entry.endsWith('.gguf') || entry.endsWith('.bin')) continue;
    await fs.copy(path.join(ROOT, entry), path.join(resourcesApp, entry));
  }
  await fs.copy(path.join(ROOT, 'node_modules'), path.join(resourcesApp, 'node_modules'));

  if (fs.existsSync(path.join(ROOT, 'Info.plist'))) {
    const extra = await fs.readFile(path.join(ROOT, 'Info.plist'), 'utf8');
    const micMatch = extra.match(/<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]*)<\/string>/);
    if (micMatch) {
      plist = await fs.readFile(plistPath, 'utf8');
      if (!plist.includes('NSMicrophoneUsageDescription')) {
        plist = plist.replace('</dict>\n</plist>',
          `  <key>NSMicrophoneUsageDescription</key>\n    <string>${micMatch[1]}</string>\n</dict>\n</plist>`);
        await fs.writeFile(plistPath, plist);
      }
    }
  }

  if (fs.existsSync(path.join(ROOT, 'robotTemplate.png'))) {
    await fs.copy(
      path.join(ROOT, 'robotTemplate.png'),
      path.join(appPath, 'Contents/Resources/electron.icns').replace('.icns', '.png')
    );
  }

  await fs.remove(tmp);
  console.log('BUILD SUCCESS:', appPath);
}

main().catch((err) => {
  console.error('BUILD FAILED:', err);
  process.exit(1);
});
