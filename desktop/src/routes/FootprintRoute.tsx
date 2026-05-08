// Phase B / M3 — Footprint route now ships a source switcher
// (Rithmic / Bybit / Binance). The full Rithmic flow (vault →
// connect → subscribe) is preserved verbatim inside RithmicFootprint;
// CryptoFootprint provides the auth-less path for the public
// crypto feeds. The switcher lives in MultiSourceFootprint.

import { MultiSourceFootprint } from "../components/MultiSourceFootprint";

export function FootprintRoute() {
  return <MultiSourceFootprint />;
}
