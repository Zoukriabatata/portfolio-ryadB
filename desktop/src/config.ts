// Configuration partagée frontend (Vite). Pour la base API license/auth
// côté Rust, voir desktop/src-tauri/src/auth.rs::default_api_base.
//
// Le frontend ne tape PAS sur localhost en prod : si l'utilisateur lance
// le binaire packagé, on assume qu'il veut viser le déploiement public.
// `VITE_API_BASE` reste un override de dev pour quand on bosse contre
// un serveur Next.js local.

const FALLBACK_BASE = "https://orderflow-v2.vercel.app";

export const WEB_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? FALLBACK_BASE;

export const LIVE_URL = `${WEB_BASE}/live`;
export const ACCOUNT_URL = `${WEB_BASE}/account`;
