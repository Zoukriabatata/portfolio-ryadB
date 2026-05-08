import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./BrokerSettings.css";

// Stable preset identifier — must match the BrokerPreset enum in
// desktop/src-tauri/src/brokers/credentials.rs.
type BrokerPreset =
  | "RithmicTest"
  | "RithmicPaperTrading"
  | "Rithmic01"
  | "Apex"
  | "MyFundedFutures"
  | "BluSky"
  | "Bulenox"
  | "TakeProfitTrader"
  | "FourPropTrader"
  | "Topstep"
  | "Custom";

type PresetInfo = {
  preset: BrokerPreset;
  displayName: string;
  defaultSystemName: string;
  defaultGatewayUrl: string | null;
  helpText: string;
};

type RedactedCreds = {
  preset: BrokerPreset;
  gatewayUrl: string;
  systemName: string;
  username: string;
  hasPassword: boolean;
};

type FormState = {
  preset: BrokerPreset;
  gatewayUrl: string;
  systemName: string;
  username: string;
  password: string;
};

const EMPTY_FORM: FormState = {
  preset: "RithmicTest",
  gatewayUrl: "",
  systemName: "",
  username: "",
  password: "",
};

type Status =
  | { kind: "idle" }
  | { kind: "busy"; what: "save" | "test" | "delete" }
  | { kind: "error"; msg: string }
  | { kind: "success"; msg: string };

export function BrokerSettings({
  onSaved,
  onClose,
}: {
  /** Fires after a successful save with the new redacted snapshot. */
  onSaved?: (saved: RedactedCreds) => void;
  /** Optional: hide the panel without saving. The footprint screen
   *  passes this if creds already exist (so user can cancel an edit). */
  onClose?: () => void;
}) {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [existing, setExisting] = useState<RedactedCreds | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const isCustom = form.preset === "Custom";
  const presetInfo = useMemo(
    () => presets.find((p) => p.preset === form.preset),
    [presets, form.preset],
  );

  // Bootstrap: list presets and load any saved credentials.
  useEffect(() => {
    (async () => {
      try {
        const list = await invoke<PresetInfo[]>("list_broker_presets");
        setPresets(list);

        const saved = await invoke<RedactedCreds | null>(
          "load_broker_credentials",
        );
        if (saved) {
          setExisting(saved);
          setForm({
            preset: saved.preset,
            gatewayUrl: saved.gatewayUrl,
            systemName: saved.systemName,
            username: saved.username,
            password: "",
          });
        } else if (list.length > 0) {
          // First-time setup: seed with the first preset's defaults.
          const seed = list[0];
          setForm({
            preset: seed.preset,
            gatewayUrl: seed.defaultGatewayUrl ?? "",
            systemName: seed.defaultSystemName,
            username: "",
            password: "",
          });
        }
      } catch (e) {
        setStatus({ kind: "error", msg: String(e) });
      }
    })();
  }, []);

  const onPresetChange = useCallback(
    (preset: BrokerPreset) => {
      const info = presets.find((p) => p.preset === preset);
      setForm((f) => ({
        ...f,
        preset,
        gatewayUrl: info?.defaultGatewayUrl ?? "",
        systemName: info?.defaultSystemName ?? "",
      }));
      setStatus({ kind: "idle" });
    },
    [presets],
  );

  const onSave = useCallback(async () => {
    setStatus({ kind: "busy", what: "save" });
    try {
      // If the user is editing an existing record and didn't retype the
      // password, the redacted projection didn't carry one — warn
      // upfront rather than silently saving an empty password.
      if (!form.password) {
        setStatus({
          kind: "error",
          msg: "Password is required (re-enter it to save changes).",
        });
        return;
      }
      await invoke("save_broker_credentials", {
        args: {
          preset: form.preset,
          gatewayUrl: form.gatewayUrl,
          systemName: form.systemName,
          username: form.username,
          password: form.password,
        },
      });
      const saved = await invoke<RedactedCreds | null>(
        "load_broker_credentials",
      );
      if (saved) {
        setExisting(saved);
        // Clear the password input — it's now persisted, no reason
        // to keep it in React memory.
        setForm((f) => ({ ...f, password: "" }));
        setStatus({ kind: "success", msg: "Saved." });
        if (onSaved) onSaved(saved);
      }
    } catch (e) {
      setStatus({ kind: "error", msg: String(e) });
    }
  }, [form, onSaved]);

  const onTest = useCallback(async () => {
    setStatus({ kind: "busy", what: "test" });
    try {
      if (!form.password) {
        setStatus({
          kind: "error",
          msg: "Password required for test (re-enter even if already saved).",
        });
        return;
      }
      await invoke("test_broker_connection", {
        args: {
          preset: form.preset,
          gatewayUrl: form.gatewayUrl,
          systemName: form.systemName,
          username: form.username,
          password: form.password,
        },
      });
      setStatus({ kind: "success", msg: "Connection OK — login accepted." });
    } catch (e) {
      setStatus({ kind: "error", msg: String(e) });
    }
  }, [form]);

  const onDelete = useCallback(async () => {
    setStatus({ kind: "busy", what: "delete" });
    try {
      await invoke("delete_broker_credentials");
      setExisting(null);
      setForm((f) => ({ ...f, password: "" }));
      setStatus({ kind: "success", msg: "Credentials cleared." });
    } catch (e) {
      setStatus({ kind: "error", msg: String(e) });
    }
  }, []);

  const busy = status.kind === "busy";

  return (
    <div className="broker-settings">
      <header className="bs-header">
        <h2>Broker Connection</h2>
        {onClose && (
          <button
            type="button"
            className="bs-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        )}
      </header>

      <p className="bs-intro">
        Pick your prop firm or data vendor below, then enter the credentials
        sent to you in the onboarding email. They&apos;re stored encrypted in
        the OS keychain on this machine — never uploaded.
      </p>

      <label className="bs-field">
        <span>Preset</span>
        <select
          value={form.preset}
          onChange={(e) => onPresetChange(e.target.value as BrokerPreset)}
          disabled={busy}
        >
          {presets.map((p) => (
            <option key={p.preset} value={p.preset}>
              {p.displayName}
            </option>
          ))}
        </select>
        {presetInfo?.helpText && (
          <small className="bs-help">{presetInfo.helpText}</small>
        )}
      </label>

      <label className="bs-field">
        <span>Gateway URL</span>
        <input
          type="text"
          value={form.gatewayUrl}
          onChange={(e) =>
            setForm((f) => ({ ...f, gatewayUrl: e.target.value }))
          }
          placeholder="wss://..."
          disabled={busy}
        />
      </label>

      <label className="bs-field">
        <span>System name</span>
        <input
          type="text"
          value={form.systemName}
          onChange={(e) =>
            setForm((f) => ({ ...f, systemName: e.target.value }))
          }
          // Editable for Custom preset, otherwise also editable so
          // users can override (e.g. TPT eval vs PRO+ system switch).
          disabled={busy}
          readOnly={false}
          placeholder={isCustom ? "e.g. Rithmic 01" : ""}
        />
      </label>

      <label className="bs-field">
        <span>Username</span>
        <input
          type="email"
          autoComplete="username"
          value={form.username}
          onChange={(e) =>
            setForm((f) => ({ ...f, username: e.target.value }))
          }
          disabled={busy}
        />
      </label>

      <label className="bs-field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) =>
            setForm((f) => ({ ...f, password: e.target.value }))
          }
          placeholder={existing?.hasPassword ? "•••••••• (saved)" : ""}
          disabled={busy}
        />
      </label>

      {status.kind === "error" && (
        <div className="bs-error">{status.msg}</div>
      )}
      {status.kind === "success" && (
        <div className="bs-success">{status.msg}</div>
      )}

      <div className="bs-actions">
        <button type="button" onClick={onTest} disabled={busy}>
          {status.kind === "busy" && status.what === "test"
            ? "Testing…"
            : "Test connection"}
        </button>
        <button
          type="button"
          className="bs-primary"
          onClick={onSave}
          disabled={busy}
        >
          {status.kind === "busy" && status.what === "save"
            ? "Saving…"
            : "Save"}
        </button>
        {existing && (
          <button
            type="button"
            className="bs-danger"
            onClick={onDelete}
            disabled={busy}
          >
            {status.kind === "busy" && status.what === "delete"
              ? "Deleting…"
              : "Delete saved credentials"}
          </button>
        )}
      </div>
    </div>
  );
}
