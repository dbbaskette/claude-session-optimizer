import React, { useEffect, useState } from 'react';
import { api, type HistoryEntry } from '../api';

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function HistoryPanel() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [expandedTs, setExpandedTs] = useState<string | null>(null);

  const refresh = () => api.readHistory().then(h => setEntries([...h].reverse()));

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) {
    return <div style={{ color: '#888', padding: 20, textAlign: 'center' }}>No runs yet.</div>;
  }

  return (
    <table className="history">
      <thead>
        <tr>
          <th>Time</th>
          <th>Trigger</th>
          <th>Duration</th>
          <th>Exit</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(e => (
          <React.Fragment key={e.ts + e.triggerId}>
            <tr onClick={() => setExpandedTs(expandedTs === e.ts ? null : e.ts)} style={{ cursor: e.ok ? 'default' : 'pointer' }}>
              <td>{fmtTime(e.ts)}{e.manual ? ' (manual)' : ''}</td>
              <td>{e.triggerLabel || e.triggerId}</td>
              <td>{fmtDuration(e.durationMs)}</td>
              <td>{e.exitCode === null ? 'timeout' : e.exitCode}</td>
              <td className={e.ok ? 'status-ok' : 'status-fail'}>{e.ok ? '✓' : '✗'}</td>
            </tr>
            {expandedTs === e.ts && !e.ok && (
              <tr>
                <td colSpan={5} style={{ background: '#fff6f6', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                  {e.outputTail || '(no output captured)'}
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}
