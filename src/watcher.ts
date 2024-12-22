import { Notifier, NotifierOpts } from './notifier.js';
import { Poller } from './poller.js';
import { Subscription } from './subscription.js';
import { defaultHumanizer, defaultLogger, Humanizer, Logger } from './util.js';

export type GetStreamFn<Stream extends any> = () => Promise<Stream | null>;

export const enum StreamState {
  Unknown = 'Unknown',

  Online = 'Online',
  PendingOnline = 'PendingOnline',

  Offline = 'Offline',
  PendingOffline = 'PendingOffline',
}

export type StreamStatus<Stream> =
  | {
      status: StreamState.Online;
      stream: Stream;
    }
  | {
      status: StreamState.Offline;
    }
  | {
      status: StreamState.Unknown;
    };

export type WatcherOpts<Stream> = {
  getStream: GetStreamFn<Stream>;
  logger?: Logger | true;
  humanizer?: Humanizer;
};

export class Watcher<Stream> {
  private destroyed: boolean;
  private status: StreamStatus<Stream>;
  private getStreamFn: GetStreamFn<Stream | null>;
  private logger?: Logger;
  private humanizer: Humanizer;

  private notifiers: {
    online: Notifier<Stream>[];
    offline: Notifier<void>[];
    change: Notifier<Stream | null>[];
  };

  private destroyPoller: (() => void) | undefined;

  private testHook: (promise: Promise<any>) => void;

  constructor({ getStream, logger, humanizer }: WatcherOpts<Stream>) {
    this.destroyed = false;
    this.status = { status: StreamState.Unknown };
    this.getStreamFn = getStream;
    this.logger = logger === true ? defaultLogger : logger;
    this.humanizer = humanizer ?? defaultHumanizer;

    this.notifiers = { online: [], offline: [], change: [] };

    this.destroyPoller = undefined;
    /* istanbul ignore next */
    this.testHook = () => {};
  }

  update(stream: Stream | null, source?: string): void {
    if (this.destroyed) throw new Error('Watcher is destroyed');

    const lastStatus = this.status.status;

    const results: Record<string, (number | null)[]> = {
      online: [],
      offline: [],
      change: [],
    };

    // update status first, for logging
    switch (stream) {
      case null:
        this.status = { status: StreamState.Offline };
        break;
      default:
        this.status = { status: StreamState.Online, stream: stream };
        break;
    }

    // ensure the status update comes before logging from the notifiers
    const logger = this.logger;
    if (logger) {
      logger.info(`status updated source=${source ?? 'unknown'} from=${lastStatus} to=${this.status.status}`);
    }

    // now notify subscribers
    switch (stream) {
      case null: {
        this.notifiers.online.forEach(not => {
          not.clear();
        });
        this.notifiers.offline.forEach(not => {
          results.offline.push(not.trigger());
        });
        break;
      }
      default: {
        this.notifiers.offline.forEach(not => {
          not.clear();
        });
        this.notifiers.online.forEach(not => {
          results.online.push(not.trigger(stream));
        });
        break;
      }
    }

    if (logger) {
      this.logResults(logger, results);
    }

    // change notifications don't fit the abstraction i initially implemented:
    // a notifier has a "set" and a "cleared" state, so that it can distinguish
    // when a notification would be redundant. but a "change" notifier is always
    // set after the initial update. however, to make deduplication work properly,
    // we have to distinguish between when we're "set with a value" and when we're
    // "set with the lack of a value".
    //
    // this code implements that logic:
    // - if the last known value is undefined, we're in the initial state, and
    //   should always trigger with the value we received (Stream|null)
    // - if the last known value is not the same "nullness" as the stream
    //   value we received, it's a new change and should be notified
    // - if the last known value is the same "nullness" as the stream value
    //   we received, do not reset the notifier - let it do whatever it was
    //   already doing
    this.notifiers.change.forEach(not => {
      const lnv = not.lastKnownValue();
      if (lnv === undefined) {
        not.trigger(stream);
      } else if ((lnv === null) !== (stream === null)) {
        not.trigger(stream, true);
      }
    });
  }

  private logResults(logger: Logger, results: Record<string, (number | null)[]>): void {
    for (const [key, vals] of Object.entries(results)) {
      if (vals.length === 0) continue;

      logger.info(
        `notified ${vals.length} '${key}' listeners: `,
        vals.map(v => (v === null ? 'ignored' : v === 0 ? 'sent immediately' : `will send in ${this.humanizer(v)}`))
      );
    }
  }

  getStatus(): StreamStatus<Stream> {
    if (this.destroyed) throw new Error('Watcher is destroyed');

    return this.status;
  }

  poll(opts: { every: number; immediately?: boolean }): () => void {
    if (this.destroyed) throw new Error('Watcher is destroyed');

    this.destroyPoller?.();

    const poller = new Poller({
      immediately: false,
      ...opts,
      fn: () => {
        const promise = this.getStreamFn();
        console.log('logPollResult');
        this.logPollResult(promise);
        return promise;
      },
      callback: stream => this.update(stream, 'poll'),
    });

    const destroyPoller = () => {
      poller.destroy();
      this.destroyPoller = undefined;
    };

    this.destroyPoller = destroyPoller;
    return destroyPoller;
  }

  // normally it would be okay-ish to asynchronously do something with the
  // result of this promise, but it causes problems in the tests. if we inline
  // the handlers, then the "poll" promise takes more event-loop turns, throwing
  // off all the fake timer stuff. this might be okay, but it's also nice to
  // keep the logging code in a separate place than the polling code.
  //
  // here, to write the tests properly, we need to be able to wait for the
  // promise to be resolved, which we'll do in a hacky way in the tests by
  // wrapping this method and causing an "await"
  private logPollResult(promise: Promise<Stream | null>): void {
    const logger = this.logger;
    if (!logger) return;

    logger.info('polling for status');
    const fullPromise = promise
      .then(stream => {
        logger.info('got stream=' + (stream !== null));
      })
      .catch(err => {
        logger.error('getStream failed', err instanceof Error ? err.message : String(err));
      });

    // notify the testing code about the new promise we've created
    this.testHook(fullPromise);
  }

  on(evt: 'online', cb: (stream: Stream) => void, opts?: Omit<NotifierOpts<Stream>, 'callback'>): Subscription<Stream>;
  on(evt: 'offline', cb: (stream: void) => void, opts?: Omit<NotifierOpts<void>, 'callback'>): Subscription<void>;
  on(evt: 'change', cb: (stream: Stream | null) => void, opts?: Omit<NotifierOpts<Stream | null>, 'callback'>): Subscription<Stream | null>;
  on(
    ...args:
      | [evt: 'online', cb: (stream: Stream) => void, opts?: Omit<NotifierOpts<Stream>, 'callback'>]
      | [evt: 'offline', cb: (stream: void) => void, opts?: Omit<NotifierOpts<void>, 'callback'>]
      | [evt: 'change', cb: (stream: Stream | null) => void, opts?: Omit<NotifierOpts<Stream | null>, 'callback'>]
  ): Subscription<Stream> | Subscription<void> | Subscription<Stream | null> {
    if (this.destroyed) throw new Error('Watcher is destroyed');

    const [evt, callback, opts] = args;

    switch (evt) {
      case 'online': {
        const notifier = new Notifier({
          ...opts,
          callback,
          logger: this.logger,
        });
        this.notifiers.online.push(notifier);
        const unsubscribe = () => {
          const idx = this.notifiers.online.indexOf(notifier);
          if (idx > -1) this.notifiers.online.splice(idx, 1);
        };
        return new Subscription({ type: 'online', notifier, unsubscribe });
      }
      case 'offline': {
        const notifier = new Notifier({
          ...opts,
          callback,
          logger: this.logger,
        });
        this.notifiers.offline.push(notifier);
        const unsubscribe = () => {
          const idx = this.notifiers.offline.indexOf(notifier);
          if (idx > -1) this.notifiers.offline.splice(idx, 1);
        };
        return new Subscription({ type: 'offline', notifier, unsubscribe });
      }
      case 'change': {
        const notifier = new Notifier({
          ...opts,
          callback,
          logger: this.logger,
        });
        this.notifiers.change.push(notifier);
        const unsubscribe = () => {
          const idx = this.notifiers.change.indexOf(notifier);
          if (idx > -1) this.notifiers.change.splice(idx, 1);
        };
        return new Subscription({ type: 'change', notifier, unsubscribe });
      }
    }
  }

  destroy() {
    if (this.destroyed) throw new Error('Watcher is destroyed');
    this.logger?.info('watcher.destroy() called, cleaning up');

    this.destroyPoller?.();
    this.notifiers.offline.length = 0;
    this.notifiers.online.length = 0;

    this.destroyed = true;
  }
}
