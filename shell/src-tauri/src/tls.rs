//! Android only. Sync's HTTPS (reqwest, from the Rust tC4's tc-door43) checks Door43's certificate with
//! rustls-platform-verifier, which on Android asks the system's own verifier through the JVM. It needs the app's
//! Context before the first request, or the request panics ("Expect rustls-platform-verifier to be initialized").
//! MainActivity calls this once as the app starts (shell/android/MainActivity.kt); the verifier's Kotlin half is added
//! to the Gradle build by scripts/prepare-android.mjs.

use jni::objects::JObject;
use jni::EnvUnowned;

/// `MainActivity.initTlsVerifier(context)`: hands the verifier the app's Context. A second call does nothing.
#[no_mangle]
pub extern "system" fn Java_org_unfoldingword_tccheck_MainActivity_initTlsVerifier<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _activity: JObject<'caller>,
    context: JObject<'caller>,
) {
    unowned_env
        .with_env(|env| rustls_platform_verifier::android::init_with_env(env, context))
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>();
}
