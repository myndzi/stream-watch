export interface Humanizer {
  (ms: number, since?: number): string;
}
export const defaultHumanizer: Humanizer = (ms, since) => {
  if (since === undefined) {
    return Math.abs(ms) < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
  }

  const delta = Math.round((ms - since) / 1000);
  if (delta === 0) return 'just now';
  else if (delta < 0) return `${-delta}s ago`;
  else return `${delta}s from now`;
};

export interface Logger {
  info(...args: any[]): void;
  error(...args: any[]): void;
}

const timestamp = () => new Date().toISOString();

export const defaultLogger: Logger = {
  info(...args) {
    console.log(timestamp(), '[StreamWatch]', ...args);
  },
  error(...args) {
    console.error(timestamp(), '[StreamWatch]', ...args);
  },
};

/**
 * Helpers to specify the unit of a duration, for use in a {@link NotifyPolicy}
 */
export const Duration = {
  ms: (num: number) => num,
  second: (num: number) => num * 1_000,
  minute: (num: number) => num * 60_000,
  hour: (num: number) => num * 3600_000,
  day: (num: number) => num * 86400_000,
};
