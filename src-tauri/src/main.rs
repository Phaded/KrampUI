#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{command, Builder, WindowEvent, generate_context, generate_handler};
use std::{thread::sleep, time::Duration};
use sysinfo::System;

#[command]
fn kill_process(name: &str) -> bool {
    let system = System::new_all();

    if let Some(process) = system.processes_by_name(&name).next() {
        return process.kill();
    }

    return false;
}

#[command]
fn is_process_running(name: &str) -> bool {
    let system = System::new_all();
    return system.processes_by_name(&name).next().is_some();
}

fn main() {
    Builder::default()
        .on_window_event(|e| {
            if let WindowEvent::Resized(_) = e.event() {
                sleep(Duration::from_millis(5));
            }
        })
        .invoke_handler(generate_handler![is_process_running, kill_process])
        .run(generate_context!())
        .expect("Failed to launch application.");
}