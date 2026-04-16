import { Trigger } from '../shared/types';
import { plistLabel } from './paths';

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generatePlist(trigger: Trigger, nodePath: string, triggerScriptPath: string): string {
  const label = plistLabel(trigger.id);
  const intervals = trigger.weekdays.map(wd => `    <dict>
      <key>Hour</key>
      <integer>${trigger.hour}</integer>
      <key>Minute</key>
      <integer>${trigger.minute}</integer>
      <key>Weekday</key>
      <integer>${wd}</integer>
    </dict>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(triggerScriptPath)}</string>
    <string>${xmlEscape(trigger.id)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervals}
  </array>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/${xmlEscape(label)}.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/${xmlEscape(label)}.log</string>
</dict>
</plist>
`;
}
