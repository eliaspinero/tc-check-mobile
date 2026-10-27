// The Door43 token between app sessions: one file in the app's private data directory.
// On Android that directory is private to this app; no other app can read it.
// Never logged, never put in a URL. The client calls these three commands through Tauri IPC.
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn token_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("door43-token"))
}

#[tauri::command]
pub fn token_keep(app: AppHandle, token: String) -> Result<(), String> {
    let path = token_path(&app)?;
    fs::write(&path, token.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn token_read(app: AppHandle) -> Result<Option<String>, String> {
    let path = token_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(t) if !t.is_empty() => Ok(Some(t)),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn token_forget(app: AppHandle) -> Result<(), String> {
    let path = token_path(&app)?;
    match fs::remove_file(&path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
