// Run after `tauri android init`: the generated Android project (shell/src-tauri/gen/android, git-ignored)
// is recreated by every init, so the loopback cleartext rule the WebView needs is applied from here.
// It copies shell/android/network_security_config.xml into the app's res/xml and points the manifest at it.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'shell/src-tauri/gen/android/app/src/main');
const manifest = path.join(app, 'AndroidManifest.xml');
if (!fs.existsSync(manifest)) {
  console.error(`prepare-android: ${path.relative(root, manifest)} is missing; run tauri android init first`);
  process.exit(1);
}

fs.mkdirSync(path.join(app, 'res/xml'), { recursive: true });
fs.copyFileSync(path.join(root, 'shell/android/network_security_config.xml'), path.join(app, 'res/xml/network_security_config.xml'));

const xml = fs.readFileSync(manifest, 'utf8');
const attr = 'android:networkSecurityConfig="@xml/network_security_config"';
if (!xml.includes(attr)) {
  if (!/<application\b/.test(xml)) {
    console.error('prepare-android: the manifest has no <application> element');
    process.exit(1);
  }
  fs.writeFileSync(manifest, xml.replace(/<application\b/, `<application\n        ${attr}`));
}
if (!fs.readFileSync(manifest, 'utf8').includes(attr)) {
  console.error('prepare-android: the manifest still does not reference the network security config');
  process.exit(1);
}
console.log('prepare-android: loopback cleartext allowed (res/xml/network_security_config.xml)');
