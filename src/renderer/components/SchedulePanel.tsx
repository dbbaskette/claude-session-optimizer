import React, { useState } from 'react';
import { api, defaultTrigger, type AppConfig, type Trigger } from '../api';
import TriggerRow from './TriggerRow';
import TriggerEditor from './TriggerEditor';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SchedulePanel({ cfg, setCfg, showToast }: Props) {
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [dirty, setDirty] = useState(false);

  const updateCfg = (patch: Partial<AppConfig>) => {
    setCfg({ ...cfg, ...patch });
    setDirty(true);
  };

  const updateTrigger = (t: Trigger) => {
    updateCfg({ triggers: cfg.triggers.map(x => x.id === t.id ? t : x) });
  };

  const addTrigger = () => {
    const t = defaultTrigger();
    updateCfg({ triggers: [...cfg.triggers, t] });
    setEditing(t);
  };

  const deleteTrigger = (id: string) => {
    updateCfg({ triggers: cfg.triggers.filter(t => t.id !== id) });
  };

  const save = async () => {
    try {
      await api.saveConfig(cfg);
      setDirty(false);
      const count = cfg.triggers.filter(t => t.enabled).length;
      showToast(`Schedule updated — ${count} trigger${count === 1 ? '' : 's'} active.`);
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`);
    }
  };

  return (
    <>
      <div className="field">
        <label>Default prompt (sent by every trigger)</label>
        <input value={cfg.defaultPrompt} onChange={e => updateCfg({ defaultPrompt: e.target.value })} />
      </div>
      <div className="field">
        <label>Path to <code>claude</code> binary</label>
        <input value={cfg.claudePath} onChange={e => updateCfg({ claudePath: e.target.value })} />
      </div>
      <div style={{ margin: '16px 0', display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Triggers</h3>
        <button className="btn" onClick={addTrigger}>+ Add trigger</button>
      </div>
      <div>
        {cfg.triggers.length === 0 && <div style={{ color: '#888', padding: 20, textAlign: 'center' }}>No triggers yet.</div>}
        {cfg.triggers.map(t => (
          <TriggerRow key={t.id} trigger={t}
            onChange={updateTrigger}
            onDelete={() => deleteTrigger(t.id)}
            onEdit={() => setEditing(t)}
            showToast={showToast} />
        ))}
      </div>
      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <button className="btn primary" disabled={!dirty} onClick={save}>Save</button>
      </div>
      {editing && (
        <TriggerEditor trigger={editing}
          onSave={t => { updateTrigger(t); setEditing(null); }}
          onCancel={() => setEditing(null)} />
      )}
    </>
  );
}
