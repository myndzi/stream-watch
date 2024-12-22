import { Notifier } from './notifier.js';
import { DelayPolicy } from './policy/delay.js';
import { ThrottlePolicy } from './policy/throttle.js';
import { Duration } from './util.js';

describe('notifier', () => {
  describe('constructor', () => {
    it.each([
      //
      1,
      true,
      null,
      undefined,
    ])('requires an option bag', (opts: any) => {
      expect(() => new Notifier(opts)).toThrow(/`opts` is required/);
    });

    it.each([
      //
      0,
      null,
      new Date(),
    ])('throttle: throws on invalid value', (throttle: any) => {
      expect(() => {
        new Notifier({ throttle, callback: () => {} });
      }).toThrow(/must be an instance of/);
    });

    it.each([
      //
      0,
      null,
      new Date(),
    ])('delay: throws on invalid value', (delay: any) => {
      expect(() => {
        new Notifier({ delay, callback: () => {} });
      }).toThrow(/must be an instance of/);
    });

    it.each([
      //
      0,
      null,
      undefined,
      new Date(),
    ])('callback: throws on invalid value', (callback: any) => {
      expect(() => {
        new Notifier({ callback });
      }).toThrow(/must be a function|callback.*is required/);
    });
  });

  describe('notifications', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('rejects duplicate trigger/clear conditions', () => {
      const notifier1 = new Notifier({ callback: (v: string) => {} });
      expect(notifier1.trigger('foo')).toEqual(0);
      const { lastKnown: lc1, lastNotified: ln1 } = notifier1 as any;
      expect(notifier1.trigger('foo')).toEqual(null);
      expect(notifier1 as any).toMatchObject({ lastKnown: lc1, lastNotified: ln1 });

      const notifier2 = new Notifier({ callback: (v: string) => {} });
      expect(notifier2.clear()).toEqual(true);
      const { lastKnown: lc2, lastNotified: ln2 } = notifier2 as any;
      expect(notifier2.clear()).toEqual(false);
      expect(notifier2 as any).toMatchObject({ lastKnown: lc2, lastNotified: ln2 });
    });

    it('passes all notifications (no throttle policy)', () => {
      let calls = 0;
      const notifier = new Notifier({
        callback: (v: string) => {
          expect(v).toEqual('foo');
          calls++;
        },
      });

      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(9);
      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(1);
      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(1000);

      expect(calls).toEqual(5);
    });

    it('throttles notifications (notifyOnInitial=false)', () => {
      let calls = 0;
      const notifier = new Notifier({
        throttle: new ThrottlePolicy({
          atMostOncePer: Duration.ms(10),
          notifyOnInitial: false,
        }),
        callback: (v: string) => {
          expect(v).toEqual('foo');
          calls++;
        },
      });

      expect(notifier.trigger('foo')).toEqual(null); // should not trigger (initial status)
      expect(notifier.clear()).toEqual(true);

      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(9);
      expect(notifier.trigger('foo')).toEqual(null);
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(1);
      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      expect(notifier.trigger('foo')).toEqual(null);
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(1000);

      expect(calls).toEqual(2);
    });

    it('throttles notifications (notifyOnInitial=true)', () => {
      let calls = 0;
      const notifier = new Notifier({
        throttle: new ThrottlePolicy({
          atMostOncePer: Duration.ms(10),
          notifyOnInitial: true,
        }),
        callback: (v: string) => {
          expect(v).toEqual('foo');
          calls++;
        },
      });

      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      expect(notifier.trigger('foo')).toEqual(null);
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(9);
      expect(notifier.trigger('foo')).toEqual(null);
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(1);
      expect(notifier.trigger('foo')).toEqual(0); // should trigger
      expect(notifier.clear()).toEqual(true);

      expect(notifier.trigger('foo')).toEqual(null);
      expect(notifier.clear()).toEqual(true);

      jest.advanceTimersByTime(1000);

      expect(calls).toEqual(2);
    });

    it('delays notifications (noDelayOnInitial=false)', () => {
      let calls = 0;
      const notifier = new Notifier({
        delay: new DelayPolicy({
          waitAtLeast: Duration.ms(10),
          noDelayOnInitial: false,
        }),
        callback: (v: string) => {
          expect(v).toEqual('foo');
          calls++;
        },
      });

      // event was scheduled, will fire in 10ms
      expect(notifier.trigger('foo')).toEqual(10);
      // did not schedule anew
      expect(notifier.trigger('foo')).toEqual(null);

      // clear the event before the timer expires
      expect(notifier.clear()).toEqual(true);

      // expire the timer - shouldn't have fired
      jest.advanceTimersByTime(1000);
      expect(calls).toEqual(0);

      // event was scheduled (previously was cleared)
      expect(notifier.trigger('foo')).toEqual(10);

      // advance to just before the delay - shouldn't have fired
      jest.advanceTimersByTime(9);
      expect(calls).toEqual(0);

      // advance over the threshold - should fire now
      jest.advanceTimersByTime(1);
      expect(calls).toEqual(1);

      jest.advanceTimersByTime(1000);
      expect(calls).toEqual(1);
    });

    it('delays notifications (noDelayOnInitial=true)', () => {
      let calls = 0;
      const notifier = new Notifier({
        delay: new DelayPolicy({
          waitAtLeast: Duration.ms(10),
          noDelayOnInitial: true,
        }),
        callback: (v: string) => {
          expect(v).toEqual('foo');
          calls++;
        },
      });

      // event was scheduled and fired immediately
      expect(notifier.trigger('foo')).toEqual(0);
      expect(calls).toEqual(1);

      // did not schedule anew
      expect(notifier.trigger('foo')).toEqual(null);

      // there should not have been a timer
      jest.advanceTimersByTime(1000);
      expect(calls).toEqual(1);

      // clear status so we can trigger it again
      expect(notifier.clear()).toEqual(true);

      // event was scheduled and delayed by 10ms
      expect(notifier.trigger('foo')).toEqual(10);

      // advance to just before the delay - shouldn't have fired
      jest.advanceTimersByTime(9);
      expect(calls).toEqual(1);

      // advance over the threshold - should fire now
      jest.advanceTimersByTime(1);
      expect(calls).toEqual(2);

      jest.advanceTimersByTime(1000);
      expect(calls).toEqual(2);
    });
  });
});
