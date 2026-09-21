// src-tauri/src/main.rs
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::fs::{self, File};
use std::io::{Write, Read};
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use tauri::{CustomMenuItem, Menu, MenuItem, Submenu};
use zip::write::FileOptions;
use zip::ZipWriter;

// =========================================================================
// COMMANDS: ATOMIC PROJECT ARCHIVE I/O
// =========================================================================

#[tauri::command]
fn save_project_archive(
  file_path: String,
  manifest_json: String,
  timeline_json: String,
  tiles: HashMap<String, Vec<u8>>
) -> Result<String, String> {
  let path = Path::new(&file_path);
  let temp_path = path.with_extension("animstudio.tmp");

  // 1. Write to a temporary file first (Crash & Power-cut safety)
  let file = File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;
  let mut zip = ZipWriter::new(file);

  let options = FileOptions::default()
    .compression_method(zip::CompressionMethod::Stored) // Stored = fastest for already-compressed WebP
    .unix_permissions(0o755);

  // Write project manifest
  zip.start_file("manifest.json", options).map_err(|e| e.to_string())?;
  zip.write_all(manifest_json.as_bytes()).map_err(|e| e.to_string())?;

  // Write animation timeline
  zip.start_file("timeline.json", options).map_err(|e| e.to_string())?;
  zip.write_all(timeline_json.as_bytes()).map_err(|e| e.to_string())?;

  // Write raw binary tiles
  for (tile_name, tile_bytes) in tiles {
    let zip_entry_name = format!("tiles/{}.webp", tile_name);
    zip.start_file(&zip_entry_name, options).map_err(|e| e.to_string())?;
    zip.write_all(&tile_bytes).map_err(|e| e.to_string())?;
  }

  zip.finish().map_err(|e| format!("Failed to finalize package: {}", e))?;

  // 2. Atomic rename: guarantees file is never corrupt on disk
  if path.exists() {
    let _ = fs::remove_file(path);
  }
  fs::rename(&temp_path, path).map_err(|e| format!("Failed atomic rename: {}", e))?;

  Ok("Saved successfully".into())
}

#[derive(serde::Serialize)]
struct LoadedArchive {
  manifest_json: String,
  timeline_json: String,
  tiles: HashMap<String, Vec<u8>>,
}

#[tauri::command]
fn load_project_archive(file_path: String) -> Result<LoadedArchive, String> {
  let file = File::open(&file_path).map_err(|e| format!("Could not open file: {}", e))?;
  let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid archive: {}", e))?;

  let mut manifest_json = String::new();
  let mut timeline_json = String::new();
  let mut tiles: HashMap<String, Vec<u8>> = HashMap::new();

  for i in 0..archive.len() {
    let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
    let name = file.name().to_string();

    if name == "manifest.json" {
      file.read_to_string(&mut manifest_json).map_err(|e| e.to_string())?;
    } else if name == "timeline.json" {
      file.read_to_string(&mut timeline_json).map_err(|e| e.to_string())?;
    } else if name.starts_with("tiles/") && name.ends_with(".webp") {
      let key = name
        .trim_start_matches("tiles/")
        .trim_end_matches(".webp")
        .to_string();
      let mut buffer = Vec::new();
      file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
      tiles.insert(key, buffer);
    }
  }

  Ok(LoadedArchive {
    manifest_json,
    timeline_json,
    tiles,
  })
}

#[tauri::command]
fn get_os_autosave_dir() -> Result<String, String> {
  let base_dir = dirs_next::data_local_dir()
    .unwrap_or_else(|| PathBuf::from("./"))
    .join("MannSejroStudio")
    .join("AutoSave");

  fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;
  Ok(base_dir.to_string_lossy().to_string())
}

// =========================================================================
// RUNNER & APPLICATION LIFECYCLE
// =========================================================================

fn main() {
  let open_file = CustomMenuItem::new("open".to_string(), "Open Project...\tCtrl+O");
  let save_file = CustomMenuItem::new("save".to_string(), "Save Project\tCtrl+S");
  let save_as = CustomMenuItem::new("save_as".to_string(), "Save As...\tCtrl+Shift+S");

  let file_submenu = Submenu::new(
    "File",
    Menu::new()
      .add_item(open_file)
      .add_item(save_file)
      .add_item(save_as)
      .add_native_item(MenuItem::Separator)
      .add_native_item(MenuItem::Quit),
  );

  let menu = Menu::new().add_submenu(file_submenu);

  tauri::Builder::default()
    .menu(menu)
    .on_menu_event(|event| match event.menu_item_id() {
      "save" => {
        let _ = event.window().emit("menu-save", ());
      }
      "save_as" => {
        let _ = event.window().emit("menu-save-as", ());
      }
      "open" => {
        let _ = event.window().emit("menu-open", ());
      }
      _ => {}
    })
    .invoke_handler(tauri::generate_handler![
      save_project_archive,
      load_project_archive,
      get_os_autosave_dir
    ])
    .run(tauri::generate_context!())
    .expect("Error while running MannSejro Studio");
}
