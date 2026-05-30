//! Databento cost probe — affiche le coût exact en USD d'un fetch 24h
//! MNQ trades sur le dataset GLBX.MDP3 (CME Globex MDP3 officiel).
//!
//! L'endpoint `metadata.get_cost` est lui-même GRATUIT — il ne consomme
//! aucun crédit du solde du compte. C'est le moyen canonique recommandé
//! par Databento pour estimer une requête avant de la facturer.
//!
//! Pourquoi ce probe existe :
//!   1. Le compte Apex Trader Funding de l'utilisateur n'a pas la
//!      permission HISTORY_PLANT (rp_code=13 confirmé 2026-05-13).
//!   2. Databento est l'alternative directe : ils servent le MÊME feed
//!      CME Globex MDP3 que Rithmic, en pay-per-use, sans add-on
//!      mensuel ni dépendance à une prop firm.
//!   3. À l'inscription Databento offre $125 de crédits gratuits — ce
//!      probe permet de chiffrer combien de fetches 24h MNQ on peut
//!      faire avec cette enveloppe avant de devoir charger la carte.
//!
//! Usage (PowerShell) :
//!   $env:DATABENTO_API_KEY = "db-..."
//!   cargo run --example databento_cost_probe

use std::env;
use std::time::Duration;

const DATABENTO_BASE: &str = "https://hist.databento.com/v0";
const DATASET: &str = "GLBX.MDP3";
// MNQ.v.0 = "continuous front-month" — Databento résout
// automatiquement vers le contrat le plus liquide à chaque date de la
// fenêtre. Pas besoin de hardcoder "MNQM6" (qui devient obsolète à chaque
// roll trimestriel).
const SYMBOL: &str = "MNQ.v.0";
const STYPE_IN: &str = "continuous";
const SCHEMA: &str = "trades";

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = env::var("DATABENTO_API_KEY").map_err(|_| {
        "DATABENTO_API_KEY env var not set — paste your Databento API key into the env first"
    })?;

    let now = chrono::Utc::now();
    let start = now - chrono::Duration::hours(24);
    let start_iso = start.format("%Y-%m-%dT%H:%M:%S").to_string();
    let end_iso = now.format("%Y-%m-%dT%H:%M:%S").to_string();

    println!("Databento cost probe");
    println!("  dataset = {DATASET}");
    println!("  symbol  = {SYMBOL} (stype_in={STYPE_IN})");
    println!("  schema  = {SCHEMA}");
    println!("  window  = {start_iso} → {end_iso} UTC (24h)");
    println!();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;

    let resp = client
        .get(format!("{DATABENTO_BASE}/metadata.get_cost"))
        // Databento auth = HTTP Basic, API key as username, empty password.
        .basic_auth(&api_key, Some(""))
        .query(&[
            ("dataset", DATASET),
            ("symbols", SYMBOL),
            ("schema", SCHEMA),
            ("stype_in", STYPE_IN),
            ("start", start_iso.as_str()),
            ("end", end_iso.as_str()),
        ])
        .send()
        .await?;

    let status = resp.status();
    let body = resp.text().await?;

    println!("HTTP {status}");
    println!("Response body: {body}");

    if status.is_success() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            // Databento renvoie un nombre brut (USD) pour cet endpoint.
            // Selon les versions API ça peut être directement un f64 ou
            // wrappé dans `{ "cost": <usd> }` — on essaie les deux.
            let cost_usd = json
                .as_f64()
                .or_else(|| json.get("cost").and_then(|v| v.as_f64()));
            if let Some(cost) = cost_usd {
                println!();
                println!("→ Coût exact pour 24h MNQ trades : ${cost:.4} USD");
                let free_credits = 125.0_f64;
                if cost > 0.0 {
                    let n_fetches = (free_credits / cost).floor() as u64;
                    println!(
                        "→ Crédits gratuits Databento ($125) ≈ {n_fetches} fetches 24h avant de débourser"
                    );
                }
            }
        }
    }

    Ok(())
}
