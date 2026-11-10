// The client's kept results on the device (shell/src-tauri/src/kept.rs, #44): a name reads back what was
// written, nothing kept reads as nothing, and a name the client does not make never reaches a file.
#[path = "../../../shell/src-tauri/src/kept.rs"]
mod kept;

use std::path::PathBuf;

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tc-check-kept-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

#[test]
fn a_name_reads_back_the_last_text_written() {
    let dir = temp("roundtrip");
    assert_eq!(kept::read(&dir, "projects-qa-door43-org-checker1").expect("reads"), None);
    kept::write(&dir, "projects-qa-door43-org-checker1", "[1]").expect("writes");
    kept::write(&dir, "projects-qa-door43-org-checker1", "[1,2]").expect("writes again");
    assert_eq!(kept::read(&dir, "projects-qa-door43-org-checker1").expect("reads").as_deref(), Some("[1,2]"));
    // Only the file itself is left: the temporary one took its name.
    let files: Vec<_> = std::fs::read_dir(&dir).expect("the folder").map(|e| e.expect("entry").file_name()).collect();
    assert_eq!(files, ["projects-qa-door43-org-checker1.json"]);
}

#[test]
fn a_name_the_client_does_not_make_is_refused() {
    let dir = temp("names");
    for name in ["", "../token", "a/b", "A", "door43-token.json", &"a".repeat(121)] {
        assert!(matches!(kept::write(&dir, name, "x"), Err(kept::KeptError::BadName(_))), "{name:?} was taken");
        assert!(matches!(kept::read(&dir, name), Err(kept::KeptError::BadName(_))), "{name:?} was read");
    }
    assert!(!dir.exists(), "a refused name wrote nothing");
}
