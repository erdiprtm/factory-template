// Native: no error monitoring yet. Phase 10 adds @sentry/react-native behind these same functions.
export function initMonitoring(): Promise<void> {
  return Promise.resolve();
}
export function setMonitoringUser(_userId: string | null): void {}
export function captureError(_err: unknown): void {}
