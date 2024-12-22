export type PollerOpts<Stream> = {
  fn: () => Promise<Stream | null>;
  callback: (stream: Stream | null) => void;
  every: number;
  immediately?: boolean;
};
export class Poller<Stream> {
  private destroyed: boolean;
  private fn: () => Promise<Stream | null>;
  private callback: (stream: Stream | null) => void;
  private every: number;
  private lastPoll: number;
  private promise: Promise<Stream | null> | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(opts: PollerOpts<Stream>) {
    if (!opts || typeof opts !== 'object') {
      throw new TypeError('`opts` is required');
    }
    const fn = opts.fn;
    const callback = opts.callback;
    const every = opts.every;
    const immediately = opts.immediately ?? false;

    if (!Number.isInteger(every) || every <= 0) {
      throw new TypeError('`opts`.`every` must be a positive integer');
    }
    if (fn === undefined) {
      throw new TypeError('`opts`.`fn` is required');
    }
    if (typeof fn !== 'function') {
      throw new TypeError('`opts`.`fn` must be a function');
    }
    if (callback === undefined) {
      throw new TypeError('`opts`.`callback` is required');
    }
    if (typeof callback !== 'function') {
      throw new TypeError('`opts`.`callback` must be a function');
    }
    if (typeof immediately !== 'boolean') {
      throw new TypeError('`opts`.`immediately` must be a boolean');
    }

    this.destroyed = false;

    this.fn = fn;
    this.callback = callback;
    this.every = every;

    this.promise = undefined;
    this.timer = undefined;

    this.lastPoll = immediately ? 0 : Date.now();
    this.scheduleNextPoll();
  }

  private scheduleNextPoll() {
    if (this.destroyed) return;

    // max one scheduled or in-flight
    if (this.timer || this.promise) return;

    // (now - lastPoll) is the amount of time that has passed since we last updated lastPoll.
    // if we're targeting e.g. every 15 minutes, and the elapsed time is 17 minutes, this value
    // will be negative, indicating we should poll immediately. if the value is positive, that's
    // how long we should wait until our next poll.
    const timeUntilNext = this.every - (Date.now() - this.lastPoll);

    if (timeUntilNext <= 0) {
      this.poll();
    } else {
      this.timer = setTimeout(() => {
        this.poll();
        this.timer = undefined;
      }, timeUntilNext);
    }
  }

  private async poll() {
    if (this.destroyed) return;

    // don't poll while we're already polling!
    if (this.promise) return;

    this.lastPoll = Date.now();

    let stream: Stream | null | undefined = undefined;

    try {
      this.promise = this.fn();
      stream = await this.promise;
    } catch (err) {
      // the poller function should handle notifying failures
    }
    this.promise = undefined;

    // if we were destroyed during the async poll call, don't do anything further
    if (this.destroyed) return;

    if (stream !== undefined) this.callback(stream);

    this.scheduleNextPoll();
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.promise = undefined;
  }
}
