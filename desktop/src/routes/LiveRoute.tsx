import { LIVE_URL } from "../config";
import { WebFrame } from "./WebFrame";

export function LiveRoute() {
  return (
    <WebFrame
      url={LIVE_URL}
      title="OrderflowV2 Live"
      emptyHint="The web /live page didn't load in time. Check your connection or visit the URL directly."
    />
  );
}
