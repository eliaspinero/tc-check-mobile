// Prevents an additional console window on Windows in release. DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// One entry point for every target: the desktop build runs the same lib.rs as the phone, so a desktop
// check exercises the server start, the client and the token commands that ship.
fn main() {
    tc_check_lib::run()
}
