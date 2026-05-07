import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

const SIGNUP_URL = 'https://orderflow-v2.vercel.app/auth/register';

export function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const dismiss = async () => {
    try {
      await invoke('cmd_mark_first_launch_completed');
    } catch (e) {
      console.warn('mark_first_launch_completed failed:', e);
      // Don't block the UX if persistence fails — proceed anyway.
    }
    onDismiss();
  };

  const openSignup = async () => {
    try {
      await openUrl(SIGNUP_URL);
    } catch (e) {
      console.error('openUrl failed:', e);
    }
    await dismiss();
  };

  return (
    <div className="card welcome">
      <h1>Welcome to OrderflowV2</h1>
      <p className="muted">Professional order flow analysis on your desktop.</p>

      <p className="muted small">
        To use OrderflowV2 you need an active subscription. Sign up or sign in at:
      </p>
      <p className="welcome-link">
        <code>orderflow-v2.vercel.app</code>
      </p>

      <button type="button" onClick={openSignup}>
        Sign up on the web
      </button>
      <button type="button" className="secondary" onClick={dismiss}>
        I already have an account
      </button>
    </div>
  );
}
