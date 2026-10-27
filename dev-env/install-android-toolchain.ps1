# Installs what the Android build of shell/ needs: JDK 17 (winget), the Android SDK command-line
# tools, platform 34, build-tools 34, NDK 27.0.12077973, an x86_64 emulator image, and the Rust
# Android targets. Sets JAVA_HOME, ANDROID_HOME and NDK_HOME for the user. Run it yourself:
#   powershell -NoProfile -ExecutionPolicy Bypass -File dev-env\install-android-toolchain.ps1
# from the root of a checkout that has this file. Its log is %TEMP%\tc-check-android\install.log.

$ErrorActionPreference = 'Stop'
# Invoke-WebRequest is many times slower with its progress bar in Windows PowerShell 5.1.
$ProgressPreference = 'SilentlyContinue'
$work = Join-Path $env:TEMP "tc-check-android"
New-Item -ItemType Directory -Force $work | Out-Null
$log = "$work\install.log"
function Log($m) { "$(Get-Date -Format s) $m" | Tee-Object -FilePath $log -Append }
# Runs a native command with its output in the log. Native tools write progress and warnings to
# stderr, which 'Stop' would turn into a failure, so the exit code decides instead.
function Native($name, [scriptblock]$cmd, [switch]$AnyExit) {
  $ErrorActionPreference = 'Continue'
  & $cmd 2>&1 | ForEach-Object { "$_" } | Out-File -Append $log
  if (-not $AnyExit -and $LASTEXITCODE -ne 0) { Log "$name failed (exit $LASTEXITCODE), see $log"; exit 1 }
}
Log "JDK 17"
# winget exits non-zero when the JDK is already installed; the folder check below decides.
Native 'winget' { winget install --id Microsoft.OpenJDK.17 -e --silent --accept-package-agreements --accept-source-agreements } -AnyExit
$jdk = Get-ChildItem "C:\Program Files\Microsoft" -Directory -Filter "jdk-17*" | Select-Object -First 1
if (-not $jdk) { Log "JDK not found after install"; exit 1 }
$env:JAVA_HOME = $jdk.FullName
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk.FullName, 'User')
Log "JAVA_HOME=$($jdk.FullName)"
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
$zip = "$work\cmdline-tools.zip"
Log "download cmdline-tools"
Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -OutFile $zip
Expand-Archive -Force $zip "$work\ct"
if (Test-Path "$sdk\cmdline-tools\latest") { Remove-Item -Recurse -Force "$sdk\cmdline-tools\latest" }
Move-Item "$work\ct\cmdline-tools" "$sdk\cmdline-tools\latest"
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
$env:ANDROID_HOME = $sdk
$sm = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
Log "accept licenses"
Native 'sdkmanager --licenses' { (1..20 | ForEach-Object { 'y' }) | & $sm --licenses }
Log "sdkmanager packages"
Native 'sdkmanager' { & $sm "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973" "emulator" "system-images;android-34;google_apis;x86_64" }
[Environment]::SetEnvironmentVariable('NDK_HOME', "$sdk\ndk\27.0.12077973", 'User')
Log "rust android targets"
Native 'rustup' { rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android }
Log "DONE"
