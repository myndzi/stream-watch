// TODO:
// consider allowing "Delay" to avoid being reset by a contrary event.
// for example, if a 15 minute delay is initiated, and then the stream
// goes offline then back online, this would delete the prior timer
// and start a new one. we may instead want behavior like:
// if a timer exists, do _not_ reset it; check the condition when
// the timer expires. if the stream is in the expected state when
// that happens, proceed; otherwise ignore

export interface DelayPolicyOpts {
  /**
   * Notify only when status has existed for at least {@link number}.
   *
   * When set to a positive integer, notifications will be _deferred_
   * for up to `waitAtLeast` milliseconds. If a transition away from this
   * {@link OnlineStatus} occurs before enough time has passed, the
   * notification will be aborted.
   *
   * When undefined, notifications will be triggered for all transition
   * events, so long as no other policy setting prevents them.
   *
   * Defaults to `undefined`.
   *
   * @throws {TypeError} Infinite, fractional, zero, and negative values are disallowed.
   */
  waitAtLeast?: number;

  /**
   * Notify immediately when transitioning from the initial {@link OnlineStatus.Unknown} status.
   *
   * {@link OnlineStatus} begins as {@link OnlineStatus.Unknown Unknown}. The first
   * time it changes can be seen as asynchronously determining the _existing_ status.
   *
   * When this property is set to `true`, this initial determination will trigger immediately,
   * ignoring the value of `waitAtLeast`
   *
   * Defaults to `false`.
   */
  noDelayOnInitial?: boolean;
}

/**
 * Defines a delay policy. Delay is used to avoid performing some action until
 * a status has existed persistently for an amount of time.
 *
 * Example use-case: "reset once-per-day bot actions, but don't get tricked
 * by a brief stream interruption"
 */
export class DelayPolicy {
  private waitAtLeast: number;
  private noDelayOnInitial: boolean;

  constructor(opts: DelayPolicyOpts) {
    if (!opts || typeof opts !== 'object') {
      throw new TypeError('`opts` is required');
    }

    const waitAtLeast = opts.waitAtLeast;
    const noDelayOnInitial = opts.noDelayOnInitial ?? false;

    if (waitAtLeast !== undefined && (!Number.isInteger(waitAtLeast) || waitAtLeast <= 0)) {
      throw new TypeError('`opts`.`waitAtLeast` must be a positive integer');
    }
    if (typeof noDelayOnInitial !== 'boolean') {
      throw new TypeError('`opts`.`noDelayOnInitial` must be a boolean');
    }

    this.waitAtLeast = waitAtLeast ?? (0 as number);
    this.noDelayOnInitial = noDelayOnInitial;
  }

  sendAfter(isInitial: boolean): number {
    if (isInitial && this.noDelayOnInitial) {
      return 0;
    }
    return this.waitAtLeast;
  }
}
