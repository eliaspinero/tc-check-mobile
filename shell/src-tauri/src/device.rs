// The installation secret the journal actor id derives from (tC4 identity.ts, D53c): one file in
// the app's private data directory, made once and kept. It is not a credential: it only keeps
// this phone's actor id the same for a project across app restarts. Never logged.
use std::fs;
use tauri::{AppHandle, Manager};

/// The kept secret; on first use, `candidate` (minted by the client) becomes it.
#[tauri::command]
pub fn device_secret(app: AppHandle, candidate: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("installation-secret");
    match fs::read_to_string(&path) {
        Ok(s) if !s.is_empty() => Ok(s),
        Ok(_) => keep(&path, candidate),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => keep(&path, candidate),
        Err(e) => Err(e.to_string()),
    }
}

fn keep(path: &std::path::Path, secret: String) -> Result<String, String> {
    if secret.is_empty() {
        return Err("an empty installation secret".into());
    }
    fs::write(path, secret.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(secret)
}
