import React, { useState } from 'react';
import { api, type AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SettingsPanel({ cfg, setCfg, showToast }: Props) {
  const [busy, setBusy] = useState(false);

  const updateAndSave = async (patch: Partial<AppConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    await api.saveConfig(next);
  };

  const removeAll = async () => {
    if (!confirm('Unload and delete every trigger plist we installed? (Config and history stay.)')) return;
    setBusy(true);
    try {
      await api.removeAllSchedules();
      await updateAndSave({ triggers: cfg.triggers.map(t => ({ ...t, enabled: false })) });
      showToast('All schedules removed.');
    } catch (e: any) {
      showToast(`Remove failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="field">
        <label>
          <input type="checkbox" checked={cfg.failureNotifications}
            onChange={e => updateAndSave({ failureNotifications: e.target.checked })} />
          {' '}Show macOS notification when a trigger fails
        </label>
      </div>
      <div className="field">
        <label>Path to <code>node</code></label>
        <input value={cfg.nodePath} onChange={e => updateAndSave({ nodePath: e.target.value })} />
      </div>
      <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #ddd' }} />
      <button className="btn danger" disabled={busy} onClick={removeAll}>Remove all schedules</button>
    </>
  );
}
