//! Découverte dynamique du gateway HistoryPlant via
//! `RequestRithmicSystemGatewayInfo` (SHARED / pre-login).
//!
//! Rithmic expose plusieurs gateways régionaux par system_name. Le
//! gateway prod générique (rprotocol.rithmic.com) ne sert pas les
//! requêtes HistoryPlant pour tous les systems (ex : Paper Trading
//! Frankfurt). Ce module interroge le gateway d'entrée pour obtenir
//! l'URI exact du HistoryPlant associé au system_name courant.
//!
//! Le template ID 20/21 est notre meilleure estimation — les samples
//! Python officiels ne le documentent pas directement. Les logs Rust
//! affichent le template_id réel reçu ; si la valeur 21 est fausse,
//! le message "unexpected template_id=N" donnera la valeur correcte.

use std::time::Duration;

use prost::Message as ProstMessage;
use tokio::time::timeout;

use crate::connectors::error::ConnectorError;
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::proto::{
    RequestRithmicSystemGatewayInfo, ResponseRithmicSystemGatewayInfo,
};

/// Template ID envoyé dans RequestRithmicSystemGatewayInfo.
const REQUEST_GATEWAY_INFO: i32 = 20;

/// Template ID attendu dans ResponseRithmicSystemGatewayInfo.
const RESPONSE_GATEWAY_INFO: i32 = 21;

/// Durée maximale accordée à la connexion + échange complet.
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(5);

/// Cherche l'URI HistoryPlant pour `system_name` en interrogeant le
/// gateway `gateway_url` (connexion fresh, pre-login).
///
/// Retourne `None` si :
/// - La connexion échoue / timeout
/// - Le template_id reçu ≠ 21 (guess incorrect — voir les logs)
/// - Aucun gateway "history" dans la réponse
/// - rp_code ≠ "0"
pub async fn discover_history_gateway(
    gateway_url: &str,
    system_name: &str,
) -> Option<String> {
    match timeout(DISCOVERY_TIMEOUT, inner(gateway_url, system_name)).await {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!(
                "gateway-discovery: timeout (>{}s) for system='{}'",
                DISCOVERY_TIMEOUT.as_secs(),
                system_name,
            );
            None
        }
    }
}

async fn inner(gateway_url: &str, system_name: &str) -> Option<String> {
    let mut client = RithmicClient::new();

    if let Err(e) = client.connect(gateway_url).await {
        tracing::warn!("gateway-discovery: connect failed: {}", e);
        return None;
    }

    let req = RequestRithmicSystemGatewayInfo {
        template_id: REQUEST_GATEWAY_INFO,
        user_msg: vec![],
        system_name: Some(system_name.to_string()),
    };

    if let Err(e) = client.send(&req).await {
        tracing::warn!("gateway-discovery: send failed: {}", e);
        let _ = client.close().await;
        return None;
    }

    let raw = match client.recv_raw().await {
        Ok(r) => r,
        Err(ConnectorError::ConnectionClosed) => {
            tracing::warn!(
                "gateway-discovery: connection closed without response — \
                 REQUEST_GATEWAY_INFO={} is probably wrong",
                REQUEST_GATEWAY_INFO,
            );
            return None;
        }
        Err(e) => {
            tracing::warn!("gateway-discovery: recv failed: {}", e);
            return None;
        }
    };
    let _ = client.close().await;

    let probe = match TemplateProbe::decode(raw.as_slice()) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("gateway-discovery: probe decode failed: {}", e);
            return None;
        }
    };

    tracing::info!(
        "gateway-discovery: response template_id={} (expected {})",
        probe.template_id,
        RESPONSE_GATEWAY_INFO,
    );

    if probe.template_id != RESPONSE_GATEWAY_INFO {
        tracing::warn!(
            "gateway-discovery: unexpected template_id={} — REQUEST_GATEWAY_INFO={} \
             est probablement faux. Vraie valeur request = {}.",
            probe.template_id,
            REQUEST_GATEWAY_INFO,
            probe.template_id - 1,
        );
        return None;
    }

    let resp = match ResponseRithmicSystemGatewayInfo::decode(raw.as_slice()) {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("gateway-discovery: response decode failed: {}", e);
            return None;
        }
    };

    tracing::info!(
        "gateway-discovery: system='{}' rp_code={:?} names={:?} uris={:?}",
        system_name,
        resp.rp_code,
        resp.gateway_name,
        resp.gateway_uri,
    );

    if !resp.rp_code.iter().any(|c| c == "0") {
        tracing::warn!(
            "gateway-discovery: rp_code={:?} — accès refusé pour system='{}'",
            resp.rp_code,
            system_name,
        );
        return None;
    }

    for (name, uri) in resp.gateway_name.iter().zip(resp.gateway_uri.iter()) {
        if name.to_lowercase().contains("history") {
            tracing::info!(
                "gateway-discovery: HistoryPlant trouvé → name='{}' uri='{}'",
                name,
                uri,
            );
            return Some(uri.clone());
        }
    }

    tracing::warn!(
        "gateway-discovery: aucun gateway 'history' dans la réponse. \
         Noms disponibles: {:?}",
        resp.gateway_name,
    );
    None
}
