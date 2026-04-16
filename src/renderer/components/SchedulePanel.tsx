import React from 'react';
import type { AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SchedulePanel(_: Props) { return <div>Schedule (stub)</div>; }
