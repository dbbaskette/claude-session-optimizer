import React from 'react';
import type { AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
}

export default function FirstLaunchModal(_: Props) { return null; }
