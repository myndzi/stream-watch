export type ThrottlePolicyOpts = {
  /**
   * Notify no more frequently than once per {@link number} milliseconds.
   *
   * When set to a positive integer, notifications will be _discarded_ if
   * the transition occurs less than `atMostOncePer` milliseconds since the
   * last transition to this state.
   *
   * When undefined, notifications will be triggered for all transition
   * events, so long as no other policy setting prevents them.
   *
   * Defaults to `undefined`
   *
   * @throws {TypeError} Infinite, fractional, zero, and negative values are disallowed.
   */
  atMostOncePer?: number;

  /**
   * Notify when transitioning from the initial {@link OnlineStatus.Unknown} status.
   *
   * {@link OnlineStatus} begins as {@link OnlineStatus.Unknown Unknown}. The first
   * time it changes can be seen as asynchronously determining the _existing_ status.
   *
   * When this property is set to `true`, this initial determination will also emit
   * a notification. When set to false, it will not.
   *
   * Defaults to `false`.
   */
  notifyOnInitial?: boolean;
};

/**
 * Defines a throttle policy. Throttling is used to avoid repeatedly performing
 * some action if a status change happens too frequently.
 *
 * Example use-case: "send a message to Discord when a stream comes online, but
 * don't spam the channel"
 */
export class ThrottlePolicy {
  private atMostOncePer: number;
  private notifyOnInitial: boolean;

  constructor(opts: ThrottlePolicyOpts) {
    if (!opts || typeof opts !== 'object') {
      throw new TypeError('`opts` is required');
    }

    const atMostOncePer = opts.atMostOncePer;
    const notifyOnInitial = opts.notifyOnInitial ?? false;

    if (atMostOncePer !== undefined && (!Number.isInteger(atMostOncePer) || atMostOncePer <= 0)) {
      throw new TypeError('`opts`.`atMostOncePer` must be a positive integer');
    }
    if (typeof notifyOnInitial !== 'boolean') {
      throw new TypeError('`opts`.`notifyOnInitial` must be a boolean');
    }

    this.atMostOncePer = atMostOncePer ?? (0 as number);
    this.notifyOnInitial = notifyOnInitial;
  }

  shouldSend(now: number, isInitial: boolean, lastNotified: number | undefined): boolean {
    if (isInitial) {
      return this.notifyOnInitial;
    }

    if (lastNotified === undefined) return true;

    return now >= lastNotified + this.atMostOncePer;
  }
}
