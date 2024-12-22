import { Poller } from './poller.js';
import { Duration } from './util.js';

const tick = () => {
  const p = new Promise(process.nextTick);
  jest.advanceTimersByTime(1);
  return p;
};
describe('Poller', () => {
  describe('constructor', () => {
    it.each([
      //
      1,
      true,
      null,
      undefined,
    ])('requires an option bag', (opts: any) => {
      expect(() => new Poller(opts)).toThrow(/`opts` is required/);
    });

    it.each([
      //
      -1,
      0,
      Infinity,
      1.2,
      null,
      undefined,
      new Date(),
    ])('every: throws on invalid value=%p', (every: any) => {
      expect(() => {
        new Poller<void>({ fn: () => Promise.resolve(), callback: () => {}, every });
      }).toThrow(/every.*must be a positive integer/);
    });

    it.each([
      //
      0,
      null,
      undefined,
      new Date(),
    ])('fn: throws on invalid value', (fn: any) => {
      expect(() => {
        new Poller<void>({ fn, callback: () => {}, every: Duration.ms(10) });
      }).toThrow(/fn.*must be a function|fn.*is required/);
    });

    it.each([
      //
      0,
      null,
      undefined,
      new Date(),
    ])('callback: throws on invalid value', (callback: any) => {
      expect(() => {
        new Poller<void>({ fn: () => Promise.resolve(), callback, every: Duration.ms(10) });
      }).toThrow(/callback.*must be a function|callback.*is required/);
    });

    it.each([
      //
      0,
      1,
      new Date(),
    ])('noDelayOnInitial: throws on invalid value (%p)', (immediately: any) => {
      expect(() => {
        new Poller<void>({ fn: () => Promise.resolve(), callback: () => {}, every: Duration.ms(10), immediately });
      }).toThrow(/immediately.*must be a boolean/);
    });
  });

  describe('sanity checks', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('avoids overscheduling timers/promises', async () => {
      const p = new Poller({
        fn: () => {
          return Promise.resolve('stream');
        },
        callback: () => {},
        every: Duration.ms(10),
        immediately: true,
      });

      expect((p as any).timer).toBeUndefined();

      const p1 = (p as any).promise;
      (p as any).poll();
      expect((p as any).promise).toEqual(p1);
      (p as any).scheduleNextPoll();
      expect((p as any).promise).toEqual(p1);
      await tick();
      expect((p as any).promise).toBeUndefined();

      const t1 = (p as any).timer;
      expect(t1).not.toBeUndefined();

      (p as any).poll();
      expect((p as any).timer).toEqual(t1);
      (p as any).scheduleNextPoll();
      expect((p as any).timer).toEqual(t1);

      p.destroy();
      expect((p as any).promise).toBeUndefined();

      expect((p as any).timer).toBeUndefined();
      (p as any).poll();
      expect((p as any).timer).toBeUndefined();
      (p as any).scheduleNextPoll();
      expect((p as any).timer).toBeUndefined();

      expect((p as any).promise).toBeUndefined();
    });
  });
  describe('behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('polls on an interval starting at T+`every` when immediately=false', async () => {
      let calls = 0;

      const p = new Poller({
        fn: () => {
          return Promise.resolve('stream');
        },
        callback: v => {
          calls++;
        },
        every: Duration.ms(10),
      });

      // just before the first interval, minus 1 for the `tick` call
      jest.advanceTimersByTime(8);
      await tick();
      expect(calls).toEqual(0);

      // first poll happens at t+10ms
      jest.advanceTimersByTime(1);
      expect(calls).toEqual(0);
      await tick(); // but it resolves asynchronously
      expect(calls).toEqual(1); // and after one tick the callback is called

      // second poll happens at t+20ms
      jest.advanceTimersByTime(9); // 1 tick passed above, so 10-1
      await tick(); // but again it resolves asynchronously
      expect(calls).toEqual(2); // so calls = 2 at t+21ms

      // verify that "destroy" works even when a promise is in-flight
      jest.advanceTimersByTime(9);
      // ensure we have our synchronization correct: this is only set for 1 tick in these tests
      expect((p as any).promise).not.toBeUndefined();

      // even though we have a promise in-flight, the callback should not be called
      // once we've called destroy
      p.destroy();

      // pass a bunch of time
      jest.advanceTimersByTime(1000);
      // and at least one tick
      await tick();

      expect(calls).toEqual(2);
    });

    it('polls on an interval starting at T+`every` when immediately=false', async () => {
      let calls = 0;

      const p = new Poller({
        fn: () => {
          return Promise.resolve('stream');
        },
        callback: v => {
          calls++;
        },
        every: Duration.ms(10),
        immediately: true,
      });

      // just before the first interval, minus 1 for the `tick` call
      jest.advanceTimersByTime(8);
      await tick();
      expect(calls).toEqual(1);

      // first poll happens at t+10ms
      jest.advanceTimersByTime(1);
      expect(calls).toEqual(1);
      await tick(); // but it resolves asynchronously
      expect(calls).toEqual(2); // and after one tick the callback is called

      // second poll happens at t+20ms
      jest.advanceTimersByTime(9); // 1 tick passed above, so 10-1
      await tick(); // but again it resolves asynchronously
      expect(calls).toEqual(3); // so calls = 3 at t+21ms

      // verify that "destroy" works even when a promise is in-flight
      jest.advanceTimersByTime(9);
      // ensure we have our synchronization correct: this is only set for 1 tick in these tests
      expect((p as any).promise).not.toBeUndefined();

      // even though we have a promise in-flight, the callback should not be called
      // once we've called destroy
      p.destroy();

      // pass a bunch of time
      jest.advanceTimersByTime(1000);
      // and at least one tick
      await tick();

      expect(calls).toEqual(3);
    });

    it("doesn't crash if the promise fails", async () => {
      // disable console error output in jest
      jest.spyOn(console, 'error').mockImplementation(jest.fn());

      let calls = 0;

      const p = new Poller({
        fn: () => {
          return Promise.reject('oh noes');
        },
        callback: v => {
          calls++;
        },
        every: Duration.ms(10),
      });

      // just before the first interval, minus 1 for the `tick` call
      jest.advanceTimersByTime(8);
      await tick();
      expect(calls).toEqual(0);

      // first poll happens at t+10ms
      jest.advanceTimersByTime(1);
      expect(calls).toEqual(0);
      await tick(); // but it resolves asynchronously
      expect(calls).toEqual(0); // and after one tick the callback is called

      // second poll happens at t+20ms
      jest.advanceTimersByTime(9); // 1 tick passed above, so 10-1
      await tick(); // but again it resolves asynchronously
      expect(calls).toEqual(0); // so calls = 2 at t+21ms

      // verify that "destroy" works even when a promise is in-flight
      jest.advanceTimersByTime(9);
      // ensure we have our synchronization correct: this is only set for 1 tick in these tests
      expect((p as any).promise).not.toBeUndefined();

      // even though we have a promise in-flight, the callback should not be called
      // once we've called destroy
      p.destroy();

      // pass a bunch of time
      jest.advanceTimersByTime(1000);
      // and at least one tick
      await tick();

      expect(calls).toEqual(0);
    });
  });
});
