// Rendering exports
export { InstitutionalColorEngine } from './InstitutionalColorEngine';
export { InstitutionalRenderer } from './InstitutionalRenderer';
export { ProfessionalRenderer, COLORS } from './ProfessionalRenderer';
export type { RenderSettings, ProfessionalRenderContext } from './ProfessionalRenderer';

// Institutional Heatmap Renderer (advanced)
export { InstitutionalHeatmapRenderer, PALETTE } from './InstitutionalHeatmapRenderer';
export type { InstitutionalRenderSettings, InstitutionalRenderContext } from './InstitutionalHeatmapRenderer';

// Smoothed Heatmap Renderer (time-dilated, human-readable)
export { SmoothedHeatmapRenderer, CALM_PALETTE } from './SmoothedHeatmapRenderer';
export type { SmoothedRenderSettings, SmoothedRenderContext } from './SmoothedHeatmapRenderer';

// Absorption Bar Renderer (orderflow visualization)
export { AbsorptionBarRenderer, DEFAULT_ABSORPTION_BAR_SETTINGS } from './AbsorptionBarRenderer';
export type { AbsorptionBarSettings } from './AbsorptionBarRenderer';

// Absorption Level Marker (bounce/break/retest indicators)
export { AbsorptionLevelMarker, DEFAULT_LEVEL_MARKER_SETTINGS } from './AbsorptionLevelMarker';
export type { AbsorptionLevelMarkerSettings, AbsorptionLevelEvent, LevelMarkerType } from './AbsorptionLevelMarker';
