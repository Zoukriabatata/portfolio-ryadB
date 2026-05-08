//! Catalogue statique des presets brokers / data-vendors supportés.
//!
//! Source de vérité partagée Rust → IPC → React: la liste retournée
//! par `all_presets()` est sérialisée telle quelle dans la commande
//! `list_broker_presets`.
//!
//! Note importante sur les gateway URLs en prod :
//! pour R|Protocol API (par opposition à R|Trader Pro), Rithmic ne
//! publie pas les URLs WebSocket des gateways prod (Chicago,
//! Frankfurt, Singapore, Tokyo) sur leur site. L'URL est fournie par
//! email lors de l'onboarding prod. Pour cette raison, seuls les
//! presets dont on connaît l'URL en clair (UAT) ont
//! `default_gateway_url = Some(_)`. Les autres laissent l'user remplir
//! avec ce que sa prop firm / Rithmic lui a envoyé.

use serde::Serialize;

use crate::brokers::credentials::BrokerPreset;

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
            default_gateway_url: None,
            help_text: "System: Apex. Gateway URL provided by Apex/Rithmic on funded onboarding.",
        },
        PresetInfo {
            preset: BrokerPreset::MyFundedFutures,
            // TODO: confirmer le system_name exact pour MFFU sur R|Protocol
            // (varie entre challenge eval et compte funded). Source
            // actuelle: email d'onboarding utilisateur.
            default_system_name: "Rithmic Paper Trading",
            display_name: "MyFundedFutures",
            default_gateway_url: None,
            help_text: "Check your MFFU welcome email for the exact system name (sometimes 'Rithmic Paper Trading', sometimes a dedicated MFFU system).",
        },
        PresetInfo {
            preset: BrokerPreset::BluSky,
            display_name: "BluSky",
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: None,
            help_text: "BluSky routes via Rithmic Paper Trading.",
        },
        PresetInfo {
            preset: BrokerPreset::Bulenox,
            display_name: "Bulenox",
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: None,
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
            default_gateway_url: None,
            help_text: "Eval phase = 'Rithmic Paper Trading'. PRO+ funded = 'Rithmic 01-US'.",
        },
        PresetInfo {
            preset: BrokerPreset::FourPropTrader,
            display_name: "4PropTrader",
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: None,
            help_text: "Per ATAS official integration: routes via Rithmic Paper Trading.",
        },
        PresetInfo {
            preset: BrokerPreset::Topstep,
            display_name: "Topstep",
            default_system_name: "TopstepTrader",
            default_gateway_url: None,
            help_text: "Topstep uses a dedicated system name on Rithmic.",
        },
        PresetInfo {
            preset: BrokerPreset::RithmicPaperTrading,
            display_name: "Rithmic Paper Trading (retail)",
            default_system_name: "Rithmic Paper Trading",
            default_gateway_url: None,
            help_text: "Direct Rithmic Paper Trading retail account (Chicago / Frankfurt / Singapore / Tokyo).",
        },
        PresetInfo {
            preset: BrokerPreset::Rithmic01,
            display_name: "Rithmic 01 (retail live)",
            default_system_name: "Rithmic 01",
            default_gateway_url: None,
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
