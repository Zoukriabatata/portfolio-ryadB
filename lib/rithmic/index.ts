/**
 * RITHMIC INTEGRATION MODULE
 *
 * Real-time CME futures data via Rithmic (Topstep)
 *
 * Setup:
 * 1. Start the Python bridge: cd rithmic && python rithmic_bridge.py
 * 2. Connect from Next.js: rithmicClient.connect()
 *
 * Supported symbols: NQ, MNQ, ES, MES
 */

export {
  rithmicClient,
  getRithmicClient,
  CME_SPECS,
  type RithmicTrade,
  type ClassifiedTrade,
} from './RithmicClient';

export {
  RithmicFootprintEngine,
  getRithmicFootprintEngine,
  resetRithmicFootprintEngine,
  type RithmicFootprintConfig,
} from './RithmicFootprintEngine';
