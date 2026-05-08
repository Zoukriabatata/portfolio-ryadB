//! Catalogue statique des presets brokers / data-vendors supportés.
//!
//! Source de vérité partagée Rust → IPC → React: la liste retournée
//! par `all_presets()` est sérialisée telle quelle dans la commande
//! `list_broker_presets`.
//!
//! Note sur les gateway URLs (Phase 7.9) :
//! Pour R|Protocol API (par opposition à R|Trader Pro), Rithmic ne
//! publie pas officiellement les URLs WebSocket des gateways prod sur
//! leur site. Mais empiriquement (testé avec un compte Apex Trader
//! Funding actif), `wss://rprotocol.rithmic.com:443` est la gateway
//! prod générale et expose au moins les systems suivants :
//!   Rithmic 01, Rithmic 04 Colo, Rithmic Paper Trading,
//!   TopstepTrader, Apex, TradeFundrr, MES Capital, TheTradingPit,
//!   FundedFuturesNetwork, 4PropTrader, DayTraders.com,
//!   HalcyonTrader, LucidTrading, ThriveTrading, LegendsTrading,
//!   Earn2Trade, Tradeify
//! Ces presets ont donc maintenant un `default_gateway_url` rempli.
//! L'UAT (Rithmic Test) reste sur sa gateway dédiée.

use serde::Serialize;

use crate::brokers::credentials::BrokerPreset;

/// Gateway prod générale Rithmic — confirmée empiriquement Phase 7.9
/// avec un compte Apex actif. Expose la totalité des prop-firm
/// systems (Apex, Topstep, 4PropTrader, etc.) plus les retails
/// Rithmic 01 / Rithmic Paper Trading.
const RITHMIC_PROD_GATEWAY: &str = "wss://rprotocol.rithmic.com:443";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetInfo {
    pub preset: BrokerPreset,
    pub display_name: &'static str,
    pub default_system_name: &'static str,
    /// `None` quand l'URL n'est pas publique — l'utilisateur doit la
    /// renseigner depuis son email d'onboarding broker.
    pub default_gateway_url: Option<&'static str>,
    pub help_text: &'static str,
}

pub fn all_presets() -> Vec<PresetInfo> {
    vec![
        PresetInfo {
            preset: BrokerPreset::RithmicTest,
            display_name: "Rithmic Test (UAT — dev only)",
            default_system_name: "Rithmic Test",
            default_gateway_url: Some("wss://rituz00100.rithmic.com:443"),
            help_text: "Throttled UAT data — for development testing only. Real volume requires a prop-firm or paid Rithmic account.",
        },
        PresetInfo {
            preset: BrokerPreset::Apex,
            display_name: "Apex Trader Funding",
            default_system_name: "Apex",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "Confirmed Phase 7.9 with a live Apex funded account: system 'Apex' on the standard Rithmic prod gateway.",
        },
        PresetInfo {
            preset: BrokerPreset::MyFundedFutures,
            // TODO: confirmer le system_name exact pour MFFU sur R|Protocol
            // (varie entre challenge eval et compte funded). Source
            // actuelle: email d'onboarding utilisateur. La gateway prod
            // est la même que pour Apex.
            default_system_name: "Rithmic Paper Trading",
            display_name: "MyFundedFutures",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "Check your MFFU welcome email for the exact system name (sometimes 'Rithmic Paper Trading', sometimes a dedicated MFFU system).",
        },
        PresetInfo {
            preset: BrokerPreset::BluSky,
            display_name: "BluSky",
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "BluSky routes via Rithmic Paper Trading.",
        },
        PresetInfo {
            preset: BrokerPreset::Bulenox,
            display_name: "Bulenox",
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "Bulenox routes via Rithmic Paper Trading (per Bulenox official docs).",
        },
        PresetInfo {
            preset: BrokerPreset::TakeProfitTrader,
            display_name: "Take Profit Trader",
            // TODO: deux systèmes selon la phase :
            //   eval  → "Rithmic Paper Trading" (Chicago)
            //   PRO+  → "Rithmic 01-US"        (Chicago)
            // L'user peut switcher manuellement, on met le plus
            // commun par défaut.
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "Eval phase = 'Rithmic Paper Trading'. PRO+ funded = 'Rithmic 01-US'.",
        },
        PresetInfo {
            preset: BrokerPreset::FourPropTrader,
            display_name: "4PropTrader",
            // Phase 7.9 — la SystemInfo de la gateway prod expose
            // "4PropTrader" comme system dédié, pas via Rithmic Paper
            // Trading. On corrige le default que le commit Phase 7.7.4
            // avait sourcé via la doc ATAS.
            default_system_name: "4PropTrader",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "4PropTrader has its own dedicated system on the Rithmic prod gateway.",
        },
        PresetInfo {
            preset: BrokerPreset::Topstep,
            display_name: "Topstep",
            default_system_name: "TopstepTrader",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "Topstep uses a dedicated system name on Rithmic prod.",
        },
        PresetInfo {
            preset: BrokerPreset::RithmicPaperTrading,
            display_name: "Rithmic Paper Trading (retail)",
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "Direct Rithmic Paper Trading retail account.",
        },
        PresetInfo {
            preset: BrokerPreset::Rithmic01,
            display_name: "Rithmic 01 (retail live)",
            default_system_name: "Rithmic 01",
            default_gateway_url: Some(RITHMIC_PROD_GATEWAY),
            help_text: "Direct Rithmic live account via FCM.",
        },
        PresetInfo {
            preset: BrokerPreset::Custom,
            display_name: "Custom",
            default_system_name: "",
            default_gateway_url: None,
            help_text: "Manually enter gateway URL and system name.",
        },
    ]
}

pub fn preset_info(p: BrokerPreset) -> Option<PresetInfo> {
    all_presets().into_iter().find(|info| info.preset == p)
}
