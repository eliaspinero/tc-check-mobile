// How pankosmia-web receives the resource zips the client installs through POST /api/burrito/zipped.
// Rocket's defaults (a 2 MiB form, a 1 MiB file) refuse most of them (en ULT v91 is 8.4 MB), so the limits
// are raised. Rocket writes each upload to a temporary file first, by default in the system's temp
// directory, which an Android app may not write (/data/local/tmp, #54): the caller gives a directory of
// the app's own. The journeys' rig (dev-env/rig) includes this same file, so it runs what the phone runs.
use std::path::Path;

use rocket::data::{Limits, ToByteUnit};
use rocket::{Build, Rocket};

/// Raises the upload limits and puts Rocket's temporary files in `temp_dir`, which must exist.
pub fn with_uploads(rocket: Rocket<Build>, temp_dir: &Path) -> Rocket<Build> {
    let limits = Limits::default()
        .limit("form", 256.mebibytes())
        .limit("data-form", 256.mebibytes())
        .limit("file", 256.mebibytes());
    let figment = rocket
        .figment()
        .clone()
        .merge(("limits", limits))
        .merge(("temp_dir", temp_dir));
    rocket.configure(figment)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn uploads_are_written_to_the_given_directory() {
        let dir = std::env::temp_dir().join("tc-check-uploads-test");
        let rocket = with_uploads(rocket::build(), &dir);
        let temp_dir: PathBuf = rocket
            .figment()
            .extract_inner("temp_dir")
            .expect("temp_dir is set");
        assert_eq!(temp_dir, dir);
    }
}
