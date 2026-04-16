import React, { useEffect, useState } from 'react';
import { api, type AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
}

export default function FirstLaunchModal({ cfg, setCfg }: Props) {
  const [claudePath, setClaudePath] = useState(cfg.claudePath);
  const [nodePath, setNodePath] = useState(cfg.nodePath);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.detectPaths().then(d => {
      if (!claudePath && d.claudePath) setClaudePath(d.claudePath);
      if (!nodePath && d.nodePath) setNodePath(d.nodePath);
    });
  }, []);

  const confirm = async () => {
    if (!claudePath || !nodePath) {
      setErr('Both paths are required.');
      return;
    }
    setBusy(true);
    const next = { ...cfg, claudePath, nodePath };
    try {
      await api.saveConfig(next);
      setCfg(next);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Setup</h3>
        <p style={{ fontSize: 13, color: '#555' }}>
          We need absolute paths to <code>claude</code> and <code>node</code> — launchd runs with a minimal PATH and can't find them otherwise.
        </p>
        <div className="field">
          <label>Path to <code>claude</code></label>
          <input value={claudePath} onChange={e => setClaudePath(e.target.value)} placeholder="/usr/local/bin/claude" />
        </div>
        <div className="field">
          <label>Path to <code>node</code></label>
          <input value={nodePath} onChange={e => setNodePath(e.target.value)} placeholder="/usr/local/bin/node" />
        </div>
        {err && <div style={{ color: '#b00020', marginBottom: 12 }}>{err}</div>}
        <div style={{ textAlign: 'right' }}>
          <button className="btn primary" disabled={busy} onClick={confirm}>Continue</button>
        </div>
      </div>
    </div>
  );
}
