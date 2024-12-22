import { Notifier } from './notifier.js';
import { DelayPolicy } from './policy/delay.js';
import { Subscription, SubscriptionStatus } from './subscription.js';
import { Duration } from './util.js';
import { StreamState } from './watcher.js';

const tick = () => {
  const p = new Promise(process.nextTick);
  jest.advanceTimersByTime(1);
  return p;
};
describe('subscription', () => {
  describe('no delay policy', () => {
    it('type=online', () => {
      const changes: [fn: (not: Notifier<string>) => void, expect: SubscriptionStatus][] = [
        [not => not.trigger('foo'), { state: StreamState.Online }],
        [not => not.trigger('foo'), { state: StreamState.Online }],
        [not => not.clear(), { state: StreamState.Offline }],
        [not => not.clear(), { state: StreamState.Offline }],
      ];
      const notifier = new Notifier<string>({ callback: () => {} });
      const sub = new Subscription({ type: 'online', notifier, unsubscribe: () => {} });
      expect(sub.status()).toMatchObject({ state: StreamState.Unknown });
      for (const [fn, expected] of changes) {
        fn(notifier);
        expect(sub.status()).toMatchObject(expected);
      }
    });

    it('notifier type=offline', () => {
      const changes: [fn: (not: Notifier<void>) => void, expect: SubscriptionStatus][] = [
        [not => not.trigger(), { state: StreamState.Offline }],
        [not => not.trigger(), { state: StreamState.Offline }],
        [not => not.clear(), { state: StreamState.Online }],
        [not => not.clear(), { state: StreamState.Online }],
      ];
      const notifier = new Notifier<void>({ callback: () => {} });
      const sub = new Subscription({ type: 'offline', notifier, unsubscribe: () => {} });
      expect(sub.status()).toMatchObject({ state: StreamState.Unknown });
      for (const [fn, expected] of changes) {
        fn(notifier);
        expect(sub.status()).toMatchObject(expected);
      }
    });

    it('notifier type=change', () => {
      const changes: [fn: (not: Notifier<string | null>) => void, expect: SubscriptionStatus][] = [
        [not => not.trigger('foo', true), { state: StreamState.Online }],
        [not => not.trigger('foo', true), { state: StreamState.Online }],
        [not => not.trigger(null, true), { state: StreamState.Offline }],
        [not => not.trigger(null, true), { state: StreamState.Offline }],
      ];
      const notifier = new Notifier<string | null>({ callback: () => {} });
      const sub = new Subscription({ type: 'change', notifier, unsubscribe: () => {} });

      const expected: any[] = [{ state: StreamState.Unknown }];
      const actual: any[] = [sub.status()];
      for (const [fn, expect] of changes) {
        expected.push(expect);
        fn(notifier);
        actual.push(sub.status());
      }
      expect(expected).toEqual(actual);
    });
  });

  describe('with delay policy', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const noop = () => {};

    it('notifier type=online', async () => {
      const changes: [fn: (not: Notifier<string>) => void, expect: SubscriptionStatus][] = [
        [not => not.trigger('foo'), { state: StreamState.PendingOnline, remaining: 5 }],
        [noop, { state: StreamState.Online }],
        [not => not.clear(), { state: StreamState.Offline }],
      ];
      const notifier = new Notifier<string>({ callback: () => {}, delay: new DelayPolicy({ waitAtLeast: Duration.ms(10) }) });
      const sub = new Subscription({ type: 'online', notifier, unsubscribe: () => {} });
      expect(sub.status()).toMatchObject({ state: StreamState.Unknown });

      for (const [fn, expected] of changes) {
        fn(notifier);
        jest.advanceTimersByTime(4);
        await tick();
        expect(sub.status()).toMatchObject(expected);
      }
    });

    it('notifier type=offline', async () => {
      const changes: [fn: (not: Notifier<void>) => void, expect: SubscriptionStatus][] = [
        [not => not.trigger(), { state: StreamState.PendingOffline, remaining: 5 }],
        [noop, { state: StreamState.Offline }],
        [not => not.clear(), { state: StreamState.Online }],
      ];
      const notifier = new Notifier<void>({ callback: () => {}, delay: new DelayPolicy({ waitAtLeast: Duration.ms(10) }) });
      const sub = new Subscription({ type: 'offline', notifier, unsubscribe: () => {} });
      expect(sub.status()).toMatchObject({ state: StreamState.Unknown });

      for (const [fn, expected] of changes) {
        fn(notifier);
        jest.advanceTimersByTime(4);
        await tick();
        expect(sub.status()).toMatchObject(expected);
      }
    });

    it('notifier type=change', async () => {
      const changes: [fn: (not: Notifier<string | null>) => void, expect: SubscriptionStatus][] = [
        [not => not.trigger('foo', true), { state: StreamState.PendingOnline, remaining: 5 }],
        [noop, { state: StreamState.Online }],
        [not => not.trigger(null, true), { state: StreamState.PendingOffline, remaining: 5 }],
        [noop, { state: StreamState.Offline }],
      ];
      const notifier = new Notifier<string | null>({ callback: () => {}, delay: new DelayPolicy({ waitAtLeast: Duration.ms(10) }) });
      const sub = new Subscription({ type: 'change', notifier, unsubscribe: () => {} });
      expect(sub.status()).toMatchObject({ state: StreamState.Unknown });

      for (const [fn, expected] of changes) {
        fn(notifier);
        jest.advanceTimersByTime(4);
        await tick();
        expect(sub.status()).toMatchObject(expected);
      }
    });
  });
});
