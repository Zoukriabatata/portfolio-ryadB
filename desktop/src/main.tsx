import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "./styles/tokens.css";
import { injectGeistFonts } from "./styles/fonts";
// Importing this module attaches focus/blur/visibility listeners that
// freeze every animation when the app loses focus — saves >90% of GPU
// usage when the user alt-tabs to a foreground game like Valorant.
import "./lib/usePauseOnBlur";

// Geist Sans + Mono — matches orderflow-v2 web typography.
injectGeistFonts();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
