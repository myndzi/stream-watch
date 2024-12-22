import { ThrottlePolicy } from './policy/throttle.js';
import { DelayPolicy } from './policy/delay.js';
import { Logger } from './util.js';

export interface NotifierOpts<T = never> {
  throttle?: ThrottlePolicy;
  delay?: DelayPolicy;
  callback: (v: T) => void;
  logger?: Logger;
}

export type NotifierState<Stream> =
  | {
      initialized: false;
    }
  | {
      initialized: true;
      pending: false;
      isActive: boolean;
      lastNotifiedWith: Stream | undefined;
    }
  | {
      initialized: true;
      pending: true;
      willNotifyWith: Stream;
      willNotifyIn: number;
    };

type NotifyState<Stream> =
  | {
      isSet: undefined;
    }
  | {
      isSet: false;
      at: number;
    }
  | {
      isSet: true;
      value: Stream;
      at: number;
    };

/**
 * @throws {TypeError}
 */
export class Notifier<Stream> {
  private lastKnown: NotifyState<Stream>;
  private lastNotified: NotifyState<Stream>;

  private throttle: ThrottlePolicy | undefined;
  private delay: DelayPolicy | undefined;

  private timer: NodeJS.Timeout | undefined;
  private timerSetAt: number | undefined;

  private callback: (v: Stream) => void;

  private logger?: Logger;

  constructor(opts: NotifierOpts<Stream>) {
    if (!opts || typeof opts !== 'object') {
      throw new TypeError('`opts` is required');
    }

    const throttle = opts.throttle;
    const delay = opts.delay;
    const callback = opts.callback;

    if (throttle !== undefined && !(throttle instanceof ThrottlePolicy)) {
      throw new TypeError('`opts`.`throttle` must be an instance of `ThrottlePolicy`');
    }
    if (delay !== undefined && !(delay instanceof DelayPolicy)) {
      throw new TypeError('`opts`.`delay` must be an instance of `DelayPolicy`');
    }
    if (callback === undefined) {
      throw new TypeError('`opts`.`callback` is required');
    }
    if (typeof callback !== 'function') {
      throw new TypeError('`opts`.`callback` must be a function');
    }

    this.lastKnown = { isSet: undefined };
    this.lastNotified = { isSet: undefined };

    this.timer = undefined;
    this.throttle = throttle;
    this.delay = delay;

    this.callback = callback;

    this.logger = opts.logger;
  }

  trigger(value: Stream, force: boolean = false): number | null {
    if (!force && this.lastKnown.isSet === true) return null;

    const isInitial = this.lastKnown.isSet === undefined;
    const now = Date.now();

    this.lastKnown = {
      isSet: true,
      value,
      at: now,
    };

    const lastNotifiedAt = this.lastNotified.isSet ? this.lastNotified.at : undefined;

    const shouldSend = this.throttle?.shouldSend(now, isInitial, lastNotifiedAt) ?? true;
    if (!shouldSend) {
      this.logger?.info(`skipping ${isInitial ? 'initial' : 'throttled'} notification`);
      return null;
    }

    const sendAfter = this.delay?.sendAfter(isInitial) ?? 0;

    const doit = () => {
      this.lastNotified = {
        isSet: true,
        value,
        at: now,
      };
      this.timer = undefined;
      this.timerSetAt = undefined;
      this.callback(value);
      this.logger?.info('sent delayed notification');
    };

    if (sendAfter <= 0) {
      doit();
      return 0;
    }

    clearTimeout(this.timer);
    this.timer = setTimeout(doit, sendAfter);
    this.timerSetAt = now;
    return sendAfter;
  }

  clear(): boolean {
    // do nothing if the state has not changed
    if (this.lastKnown.isSet === false) return false;

    const now = Date.now();
    this.lastKnown = {
      isSet: false,
      at: now,
    };

    // if we're waiting to perform an action, cancel it
    if (this.timer) this.logger?.info('cleared pending notification');
    clearTimeout(this.timer);
    this.timer = undefined;
    this.timerSetAt = undefined;

    return true;
  }

  lastKnownValue(): Stream | undefined {
    return this.lastKnown.isSet === true ? this.lastKnown.value : undefined;
  }

  state(): NotifierState<Stream> {
    if (this.lastKnown.isSet === undefined) {
      return { initialized: false };
    }

    if (this.timerSetAt !== undefined) {
      const lastKnown = this.lastKnown as NotifyState<Stream> & { isSet: true };
      return {
        initialized: true,
        pending: true,
        willNotifyWith: lastKnown.value,
        willNotifyIn: this.delay!.sendAfter(false) - (Date.now() - this.timerSetAt),
      };
    }

    // if lastKnown is initialized _and_ we don't have a pending update, then
    // lastNotified should be equal to lastKnown: they only diverge when there
    // is a delay active

    return {
      initialized: true,
      pending: false,
      isActive: this.lastKnown.isSet,
      lastNotifiedWith: this.lastKnown.isSet ? this.lastKnown.value : undefined,
    };
  }
}
