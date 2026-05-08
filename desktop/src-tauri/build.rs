use std::fs;
use std::io::Result;
use std::path::PathBuf;

fn main() -> Result<()> {
    tauri_build::build();
    compile_rithmic_protos()?;
    Ok(())
}

fn compile_rithmic_protos() -> Result<()> {
    let proto_dir = PathBuf::from("../rithmic-sdk/proto");
    let out_dir = PathBuf::from("src/connectors/rithmic/proto");

    println!("cargo:rerun-if-changed=../rithmic-sdk/proto");

    if !proto_dir.exists() {
        println!(
            "cargo:warning=rithmic-sdk/proto not found at {:?} — skipping Rithmic adapter compilation",
            proto_dir
        );
        // Always provide a stub mod.rs so the connectors module compiles
        // even when the SDK is absent (e.g. CI without local SDK copy).
        fs::create_dir_all(&out_dir)?;
        fs::write(
            out_dir.join("mod.rs"),
            "// stub — rithmic-sdk/proto absent at build time\n",
        )?;
        return Ok(());
    }

    fs::create_dir_all(&out_dir)?;

    let proto_files: Vec<PathBuf> = fs::read_dir(&proto_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("proto"))
        .collect();

    println!(
        "cargo:warning=Compiling {} Rithmic .proto files into {:?}",
        proto_files.len(),
        out_dir
    );

    // Point prost-build at the vendored protoc so we don't depend on a
    // system install on every dev machine / CI runner.
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string()))?;
    std::env::set_var("PROTOC", protoc);

    let mut config = prost_build::Config::new();
    config.out_dir(&out_dir);
    config.compile_protos(&proto_files, &[&proto_dir])?;

    // prost emits one file per protobuf package; everything in the SDK
    // is `package rti`, so we expect a single `rti.rs`. Rename it to
    // `mod.rs` so the connectors module can do `pub mod proto;`.
    let rti_path = out_dir.join("rti.rs");
    if rti_path.exists() {
        fs::rename(&rti_path, out_dir.join("mod.rs"))?;
    }

    Ok(())
}
