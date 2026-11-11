// What the client keeps on the device between app sessions (#44): its last Door43 project list, the
// signed-in username, the books' progress. One JSON file per name in a `kept` folder of the app's
// private data directory, beside the token. Like tC4's caches (STORAGE.md §3.6) none of it decides
// what exists: a missing or damaged file only means the client reads the thing again.
//
// No Tauri here, so the rig's tests can call it (dev-env/rig/tests/kept.rs); lib.rs wraps these two
// functions as the `kept_read` and `kept_write` commands.
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// Why a kept file could not be read or written.
#[derive(Debug, thiserror::Error)]
pub enum KeptError {
    /// The client asked for a name that is not lower-case letters, digits and `-`.
    #[error("not a kept name: {0:?}")]
    BadName(String),
    #[error("kept file: {0}")]
    Io(#[from] std::io::Error),
}

/// The longest name the client uses is a host and a username; this leaves room and no more.
const MAX_NAME: usize = 120;

/// The file for `name`: only names the client makes, so a name can never reach outside the folder.
fn file_of(dir: &Path, name: &str) -> Result<PathBuf, KeptError> {
    let fits = !name.is_empty()
        && name.len() <= MAX_NAME
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if !fits {
        return Err(KeptError::BadName(name.to_owned()));
    }
    Ok(dir.join(format!("{name}.json")))
}

/// The text kept under `name`, or `None` when nothing is.
///
/// # Errors
///
/// [`KeptError::BadName`] for a name the client does not make, [`KeptError::Io`] when the file
/// exists but cannot be read.
pub fn read(dir: &Path, name: &str) -> Result<Option<String>, KeptError> {
    match fs::read_to_string(file_of(dir, name)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Keeps `value` under `name`, replacing what was there. The new text goes to a temporary file that
/// then takes the name, so an app closed mid-write leaves the old file or the new one, never half of one.
///
/// # Errors
///
/// [`KeptError::BadName`] for a name the client does not make, [`KeptError::Io`] when the folder or
/// the file cannot be written.
pub fn write(dir: &Path, name: &str, value: &str) -> Result<(), KeptError> {
    let file = file_of(dir, name)?;
    fs::create_dir_all(dir)?;
    let partial = file.with_extension("json.partial");
    fs::write(&partial, value)?;
    fs::rename(&partial, &file)?;
    Ok(())
}
