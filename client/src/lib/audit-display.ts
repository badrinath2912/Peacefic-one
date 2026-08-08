import type { AuditCategory, AuditSeverity } from '@peacefic/shared';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  auth: 'Sign-in',
  data: 'Data',
  admin: 'Administration',
  security: 'Security',
  system: 'System',
};

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: 'Routine',
  warning: 'Notable',
  critical: 'Critical',
};

export const AUDIT_SEVERITY_TONES: Record<AuditSeverity, Tone> = {
  info: 'neutral',
  warning: 'warning',
  critical: 'danger',
};

/**
 * A readable form of an action key.
 *
 * `AUDIT_ACTIONS` lives on the server and is not published to the client, so
 * rather than mirroring a list that would drift, the key is unpacked: every
 * action is `resource.verb_in_snake_case`, and that reads perfectly well as
 * "Placement offer revoked".
 */
export function actionLabel(action: string): string {
  const [resource = '', ...rest] = action.split('.');
  const verb = rest.join('.').replace(/_/g, ' ');

  const readable = `${resource} ${verb}`.trim().replace(/_/g, ' ');
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}
