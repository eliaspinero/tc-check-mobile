// pankosmia-web's upload limits. Rocket's defaults (a 2 MiB form, a 1 MiB file) refuse most of the
// resource zips the client installs through POST /api/burrito/zipped (en ULT v91 is 8.4 MB), so they are
// raised. The journeys' rig (dev-env/rig) includes this same file, so it runs what the phone runs.
use rocket::data::{Limits, ToByteUnit};
use rocket::{Build, Rocket};

pub fn with_upload_limits(rocket: Rocket<Build>) -> Rocket<Build> {
    let limits = Limits::default()
        .limit("form", 256.mebibytes())
        .limit("data-form", 256.mebibytes())
        .limit("file", 256.mebibytes());
    let figment = rocket.figment().clone().merge(("limits", limits));
    rocket.configure(figment)
}
