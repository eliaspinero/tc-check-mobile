# machine-uid 0.6.0, with an Android branch

A copy of [machine-uid](https://github.com/Hanaasagi/machine-uid) 0.6.0 as crates.io publishes it
(MIT, `LICENSE`), used through `[patch.crates-io]` in `shell/src-tauri/Cargo.toml` and
`dev-env/rig/Cargo.toml`.

Why: the Rust translationCore 4's `tc-store` depends on `machine-uid` on every platform
(`crates/tc-store/src/platform.rs:42` at c0d6e0e8), and 0.6.0 has no module for
`target_os = "android"`, so the phone's build would not compile.

Changes, all in `src/lib.rs`: one `machine_id` module for Android whose `get_machine_id` returns an
error. `tc-store` then uses its own fallback name; a device stays unique by the installation secret and the
project folder's path (translationCore4 `docs/STORAGE.md` §6.3). `Cargo.toml` drops the `[[test]]` target,
whose files are not copied. Nothing else is changed.

Remove this copy when machine-uid publishes an Android branch, or tc-store stops depending on it there.
