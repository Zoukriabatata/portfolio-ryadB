/**
 * IB (Interactive Brokers) Integration
 *
 * Browser-side client for the IB Gateway Bridge.
 * Provides WebSocket connectivity to IB Gateway and adapters
 * to convert IB data into heatmap and footprint formats.
 */

// Client
export { IBConnectorClient, getIBConnector } from './IBConnectorClient';

// Adapters
export { IBHeatmapAdapter, type HeatmapAdapterConfig } from './IBHeatmapAdapter';
export { IBFootprintAdapter, type FootprintAdapterConfig, type FootprintCandle, type PriceLevel } from './IBFootprintAdapter';

// Connection Manager (high-level API)
export { IBConnectionManager, getIBConnectionManager } from './ConnectionManager';
