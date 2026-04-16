import React, { useState } from 'react';
import type { Trigger, Weekday } from '../../shared/types';

const DAYS: { label: string; value: Weekday }[] = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

interface Props {
  trigger: Trigger;
  onSave: (t: Trigger) => void;
  onCancel: () => void;
}

export default function TriggerEditor({ trigger, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Trigger>(trigger);

  const toggleDay = (d: Weekday) => {
    setDraft(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(d)
        ? prev.weekdays.filter(w => w !== d)
        : [...prev.weekdays, d].sort((a, b) => a - b) as Weekday[],
    }));
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Edit trigger</h3>
        <div className="field">
          <label>Label</label>
          <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <div className="field">
          <label>Time</label>
          <input type="time" value={`${String(draft.hour).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`}
            onChange={e => {
              const [h, m] = e.target.value.split(':').map(Number);
              setDraft({ ...draft, hour: h, minute: m });
            }} />
        </div>
        <div className="field">
          <label>Days</label>
          <div>
            {DAYS.map(d => (
              <span key={d.value}
                className={`weekday-chip ${draft.weekdays.includes(d.value) ? 'on' : ''}`}
                onClick={() => toggleDay(d.value)}>{d.label}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>{' '}
          <button className="btn primary" onClick={() => onSave(draft)}>OK</button>
        </div>
      </div>
    </div>
  );
}
