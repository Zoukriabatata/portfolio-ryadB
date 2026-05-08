import { ACCOUNT_URL } from "../config";
import { WebFrame } from "./WebFrame";

export function AccountRoute() {
  return (
    <WebFrame
      url={ACCOUNT_URL}
      title="OrderflowV2 Account"
      emptyHint="The web /account page didn't load in time. Check your connection or visit the URL directly."
    />
  );
}
