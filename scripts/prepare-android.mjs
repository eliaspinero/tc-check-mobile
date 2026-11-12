// Run after `tauri android init`: the generated Android project (shell/src-tauri/gen/android, git-ignored)
// is recreated by every init, so the loopback cleartext rule the WebView needs is applied from here.
// It copies shell/android/network_security_config.xml into the app's res/xml and points the manifest at it.
// It also copies the launcher icons (`tauri icon shell/app-icon.svg` writes them to src-tauri/icons/android),
// because init writes Tauri's default icons, and replaces the MainActivity (shell/android/MainActivity.kt).
// Last, it adds rustls-platform-verifier's Android library to the Gradle build (Sync's HTTPS, shell/src-tauri/src/tls.rs).
import { execFileSync } from 'node:child_process';
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

fs.cpSync(path.join(root, 'shell/src-tauri/icons/android'), path.join(app, 'res'), { recursive: true });
console.log('prepare-android: launcher icons copied (shell/src-tauri/icons/android)');

// Init writes a MainActivity that only draws edge to edge; ours also tells the page how tall the system bars are (#57).
const activity = path.join(app, 'java/org/unfoldingword/tccheck/MainActivity.kt');
if (!fs.existsSync(activity)) {
  console.error(`prepare-android: ${path.relative(root, activity)} is missing; did the app identifier change?`);
  process.exit(1);
}
fs.copyFileSync(path.join(root, 'shell/android/MainActivity.kt'), activity);
console.log('prepare-android: MainActivity replaced (shell/android/MainActivity.kt)');

// Sync's HTTPS checks Door43's certificate with rustls-platform-verifier, whose Android half is a small Kotlin library
// shipped inside the crate as a Maven folder (shell/src-tauri/src/tls.rs). Cargo knows where the crate is on disk.
// The folder has no version list Gradle can read, so the library is asked for at the crate's own version (its pom
// says it is an aar).
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--filter-platform', 'aarch64-linux-android', '--manifest-path', path.join(root, 'shell/src-tauri/Cargo.toml')],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  ),
);
const verifier = metadata.packages.find((p) => p.name === 'rustls-platform-verifier-android');
if (!verifier) {
  console.error('prepare-android: cargo metadata has no rustls-platform-verifier-android');
  process.exit(1);
}
const maven = path.join(path.dirname(verifier.manifest_path), 'maven').replaceAll('\\', '/');
const gradle = path.join(app, '../../build.gradle.kts');
const marker = '// rustls-platform-verifier (prepare-android.mjs)';
const gradleText = fs.readFileSync(gradle, 'utf8');
if (!gradleText.includes(marker)) {
  fs.writeFileSync(
    gradle,
    `${gradleText}\n${marker}\nrepositories {\n    maven { url = uri("${maven}") }\n}\ndependencies {\n    implementation("rustls:rustls-platform-verifier:${verifier.version}")\n}\n`,
  );
}
// The release build shrinks code with R8, which cannot see calls from Rust through JNI: keep the verifier's classes.
const proguard = path.join(app, '../../proguard-rules.pro');
const keep = '-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }';
const rules = fs.existsSync(proguard) ? fs.readFileSync(proguard, 'utf8') : '';
if (!rules.includes(keep)) fs.writeFileSync(proguard, `${rules}\n${keep}\n`);
console.log(`prepare-android: rustls-platform-verifier's Android library added (${maven})`);
