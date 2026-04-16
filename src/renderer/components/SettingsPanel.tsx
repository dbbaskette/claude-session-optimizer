import React from 'react';
import type { AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SettingsPanel(_: Props) { return <div>Settings (stub)</div>; }
