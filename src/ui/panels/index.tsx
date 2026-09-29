import type { App } from '../../app';
import { setTelemetryEnabled, telemetryEnabled } from '../../telemetry';
import { openSheet } from '../sheet';
import { SettingsPanel, type Telemetry } from './bodies';

export { openAnchor, openRoute, openTrack, openWaypoint } from './bodies';

const telemetry: Telemetry = { enabled: telemetryEnabled, set: setTelemetryEnabled };

export function openMenu(app: App): void {
  openSheet('menu', 'Settings', () => <SettingsPanel app={app} telemetry={telemetry} version={`${__APP_VERSION__} (${__BUILD_ID__})`} />);
}
