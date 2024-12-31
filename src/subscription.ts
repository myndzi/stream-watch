import { Notifier } from './notifier.js';
import { StreamState } from './watcher.js';

export type SubscriptionType = 'online' | 'offline' | 'change';

export type SubscriptionStatus =
  | {
      state: StreamState.Unknown | StreamState.Online | StreamState.Offline;
      remaining?: undefined;
    }
  | {
      state: StreamState.PendingOnline | StreamState.PendingOffline;
      remaining: number;
    };

export type SubscriptionOpts<Stream> = {
  type: SubscriptionType;
  notifier: Notifier<Stream>;
  unsubscribe: () => void;
};

export class Subscription<Stream> {
  private type: SubscriptionType;
  private notifier: Notifier<Stream>;
  readonly unsubscribe: () => void;
  constructor({ type, notifier, unsubscribe }: SubscriptionOpts<Stream>) {
    this.type = type;
    this.notifier = notifier;
    this.unsubscribe = unsubscribe;
  }

  status(): SubscriptionStatus {
    const state = this.notifier.state();

    if (!state.initialized) {
      return {
        state: StreamState.Unknown,
      };
    }

    if (this.type === 'change') {
      if (state.pending) {
        return {
          state: state.willNotifyWith === null ? StreamState.PendingOffline : StreamState.PendingOnline,
          remaining: state.willNotifyIn,
        };
      }

      return {
        state: state.lastNotifiedWith == null ? StreamState.Offline : StreamState.Online,
      };
    }

    if (state.pending) {
      return {
        state: this.type === 'online' ? StreamState.PendingOnline : StreamState.PendingOffline,
        remaining: state.willNotifyIn,
      };
    }

    if (state.isActive) {
      return { state: this.type === 'online' ? StreamState.Online : StreamState.Offline };
    } else {
      return { state: this.type === 'online' ? StreamState.Offline : StreamState.Online };
    }
  }
}
