import React, { useEffect, useState } from 'react';
import { api, type AppConfig } from './api';
import SchedulePanel from './components/SchedulePanel';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import FirstLaunchModal from './components/FirstLaunchModal';

type Tab = 'schedule' | 'history' | 'settings';

export default function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [tab, setTab] = useState<Tab>('schedule');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { api.readConfig().then(setCfg); }, []);

  if (!cfg) return <div className="container">Loading…</div>;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const needsFirstLaunch = !cfg.claudePath || !cfg.nodePath;

  return (
    <>
      <div className="tabs">
        <div className={`tab ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>Schedule</div>
        <div className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</div>
        <div className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</div>
      </div>
      <div className="container">
        {tab === 'schedule' && <SchedulePanel cfg={cfg} setCfg={setCfg} showToast={showToast} />}
        {tab === 'history' && <HistoryPanel />}
        {tab === 'settings' && <SettingsPanel cfg={cfg} setCfg={setCfg} showToast={showToast} />}
      </div>
      {toast && <div className="toast">{toast}</div>}
      {needsFirstLaunch && <FirstLaunchModal cfg={cfg} setCfg={setCfg} />}
    </>
  );
}
