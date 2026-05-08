// Wrapper minimaliste : on remonte le composant existant sans changer
// son comportement. Tout le state (phase = checking / needs-creds /
// settings / connecting / ready / failed), les abonnements aux events
// Tauri et la pipeline Rithmic vivent dans RithmicFootprint, on n'y
// touche pas — c'est la contrainte explicite de la Phase 7.7.5.

import { RithmicFootprint } from "../components/RithmicFootprint";

export function FootprintRoute() {
  return <RithmicFootprint />;
}
