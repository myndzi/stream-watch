import { ThrottlePolicy } from './policy/throttle.js';
import { Duration } from './util.js';
import { StreamState, StreamStatus, Watcher } from './watcher.js';

const tick = () => {
  const p = new Promise(process.nextTick);
  jest.advanceTimersByTime(1);
  return p;
};

describe('Watcher', () => {
  describe('destroy', () => {
    it.each([
      ['update', w => w.update(null)],
      ['getStatus', w => w.getStatus()],
      ['poll', w => w.poll({ every: Duration.ms(1) })],
      ['on', w => w.on('offline', () => {})],
      ['destroy', w => w.destroy()],
    ] as [name: string, cb: (w: Watcher<any>) => {}][])('throws on method=%s when destroyed', (_, cb) => {
      const w = new Watcher({ getStream: () => Promise.resolve() });
      w.destroy();
      expect(() => cb(w)).toThrow(/destroyed/);
    });
    it('stops polling when destroyed', async () => {
      let called = false;

      jest.useFakeTimers();
      let watcher = new Watcher({
        getStream: () => {
          called = true;
          return Promise.resolve();
        },
      });
      watcher.poll({ every: Duration.ms(10) });

      watcher.destroy();
      jest.advanceTimersByTime(1000);
      await tick();

      expect(called).toEqual(false);

      // the inverse case to verify
      watcher = new Watcher({
        getStream: () => {
          called = true;
          return Promise.resolve();
        },
      });
      watcher.poll({ every: Duration.ms(10) });

      jest.advanceTimersByTime(1000);
      await tick();

      expect(called).toEqual(true);
    });
  });

  describe('polling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    const mockWatcher = () => {
      let nextStatus: any = undefined;
      const watcher = new Watcher<string>({ getStream: () => Promise.resolve(nextStatus) });

      const runMockPolling = async (statuses: (string | null)[]): Promise<StreamStatus<string>[]> => {
        const stopPoll = watcher.poll({ every: Duration.ms(10) });
        const receivedStatuses: StreamStatus<string>[] = [];

        do {
          nextStatus = statuses.shift()!;
          await tick();

          receivedStatuses.push(watcher.getStatus());

          jest.advanceTimersByTime(9);
        } while (statuses.length > 0);

        await tick();

        stopPoll();
        jest.advanceTimersByTime(1000);
        await tick();

        receivedStatuses.push(watcher.getStatus());
        watcher.destroy();

        return receivedStatuses;
      };

      return { watcher, runMockPolling };
    };

    it('overrides previous poller', async () => {
      const { watcher, runMockPolling } = mockWatcher();

      // this will get overwritten by mockWatcher, which executes watcher.poll in the runMockPolling callback
      watcher.poll({ every: Duration.hour(1) });

      const statuses = await runMockPolling(['test', null, 'test']);
      expect(statuses).toEqual([
        { status: StreamState.Unknown },
        { status: StreamState.Online, stream: 'test' },
        { status: StreamState.Offline },
        { status: StreamState.Online, stream: 'test' },
      ]);
    });

    it('correctly updates getStatus', async () => {
      const { runMockPolling } = mockWatcher();
      const statuses = await runMockPolling(['test', 'test', null, null, 'test']);
      expect(statuses).toMatchObject([
        { status: StreamState.Unknown },
        { status: StreamState.Online, stream: 'test' },
        { status: StreamState.Online, stream: 'test' },
        { status: StreamState.Offline },
        { status: StreamState.Offline },
        { status: StreamState.Online, stream: 'test' },
      ]);
    });

    it('notifies listeners (no policies)', async () => {
      let onlineCalls: any[] = [];
      let offlineCalls: any[] = [];

      const { watcher, runMockPolling } = mockWatcher();
      watcher.on('online', stream => {
        onlineCalls.push(stream);
      });
      watcher.on('offline', ((undef: any) => {
        offlineCalls.push(undef);
      }) as any);

      // unknown -> online  : notify
      // online  -> offline : notify
      // offline -> offline : ignore
      // offline -> online  : notify
      // online  -> online : ignore
      await runMockPolling(['test1', null, null, 'test2', 'test3']);

      expect(onlineCalls).toEqual(['test1', 'test2']);
      expect(offlineCalls).toEqual([undefined]);
    });

    it.each([
      //
      ['online', Duration.ms(1), false, ['test']],
      ['online', Duration.ms(1), true, ['test', 'test']],
      ['online', Duration.hour(1), true, ['test']],
      ['offline', Duration.ms(1), false, [undefined]],
      ['offline', Duration.ms(1), true, [undefined]],
      ['change', Duration.ms(1), false, [null, 'test']],
      ['change', Duration.ms(1), true, ['test', null, 'test']],
      ['change', Duration.hour(1), false, [null]],
      ['change', Duration.hour(1), true, ['test']],
    ] as [evt: 'online' | 'offline' | 'change', dur: number, notifyInitial: boolean, expected: any[]][])(
      'throttles notifications evt=%p dur=%p initial=%p expected=%p',
      async (evt, atMostOncePer, notifyOnInitial, expected) => {
        let calls: any[] = [];

        const { watcher, runMockPolling } = mockWatcher();

        watcher.on(
          evt as any,
          stream => {
            calls.push(stream);
          },
          { throttle: new ThrottlePolicy({ atMostOncePer, notifyOnInitial }) }
        );

        await runMockPolling(['test', null, null, 'test']);

        expect(calls).toEqual(expected);
      }
    );

    it.each([
      //
      ['online', Duration.ms(1), false, ['test']],
      ['online', Duration.ms(1), true, ['test', 'test']],
      ['online', Duration.hour(1), true, ['test']],
      ['offline', Duration.ms(1), false, [undefined]],
      ['offline', Duration.ms(1), true, [undefined]],
      ['change', Duration.ms(1), false, [null, 'test']],
      ['change', Duration.ms(1), true, ['test', null, 'test']],
      ['change', Duration.hour(1), false, [null]],
      ['change', Duration.hour(1), true, ['test']],
    ] as [evt: 'online' | 'offline' | 'change', dur: number, notifyInitial: boolean, expected: any[]][])(
      'unsubscribes correctly evt=%p dur=%p initial=%p expected=%p',
      async (evt, atMostOncePer, notifyOnInitial, expected) => {
        let calls: any[] = [];

        const { watcher, runMockPolling } = mockWatcher();

        const sub = watcher.on(
          evt as any,
          stream => {
            calls.push(stream);
          },
          { throttle: new ThrottlePolicy({ atMostOncePer, notifyOnInitial }) }
        );
        sub.unsubscribe();

        // double unsubscribe should be safe
        sub.unsubscribe();

        await runMockPolling(['test', null, null, 'test']);

        expect(calls).toEqual([]);
      }
    );

    //
  });
});
