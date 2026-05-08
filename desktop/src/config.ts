// Configuration partagée frontend (Vite). Pour la base API license/auth
// côté Rust, voir desktop/src-tauri/src/auth.rs::default_api_base.
//
// Phase 7.8 — les URLs concrètes /live et /account ne sont plus
// exposées ici parce que le frontend ne les construit plus
// directement : `cmd_get_bridge_url` (Rust) génère un URL bridge
// signé que la WebFrame consume tel quel. WEB_BASE reste exposé pour
// d'éventuels futurs liens "open in external browser" qui ne
// nécessitent pas le passage par le bridge.

const FALLBACK_BASE = "https://orderflow-v2.vercel.app";

export const WEB_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? FALLBACK_BASE;
