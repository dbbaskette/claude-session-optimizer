import React from 'react';
import type { Trigger } from '../api';
import { api } from '../api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  trigger: Trigger;
  onChange: (t: Trigger) => void;
  onDelete: () => void;
  onEdit: () => void;
  showToast: (msg: string) => void;
}

export default function TriggerRow({ trigger, onChange, onDelete, onEdit, showToast }: Props) {
  const weekdayStr = trigger.weekdays.length === 7 ? 'daily'
    : trigger.weekdays.length === 0 ? 'never'
    : trigger.weekdays.map(w => DAYS[w]).join(' ');

  const hhmm = `${String(trigger.hour).padStart(2, '0')}:${String(trigger.minute).padStart(2, '0')}`;

  const handleRunNow = async () => {
    try {
      await api.runNow(trigger.id);
      showToast(`"${trigger.label}" triggered — check History in a few seconds.`);
    } catch (e: any) {
      showToast(`Run failed: ${e.message}`);
    }
  };

  return (
    <div className="row">
      <input type="checkbox" checked={trigger.enabled} onChange={e => onChange({ ...trigger, enabled: e.target.checked })} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{trigger.label}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{hhmm} · {weekdayStr}</div>
      </div>
      <button className="btn" onClick={handleRunNow}>Run Now</button>
      <button className="btn" onClick={onEdit}>Edit</button>
      <button className="btn danger" onClick={onDelete}>Delete</button>
    </div>
  );
}
