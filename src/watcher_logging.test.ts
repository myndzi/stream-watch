import { DelayPolicy } from './policy/delay.js';
import { ThrottlePolicy } from './policy/throttle.js';
import { Duration, Logger } from './util.js';
import { Watcher } from './watcher.js';

const tick = (...promises: Promise<any>[]) => {
  const p = new Promise(process.nextTick);
  jest.advanceTimersByTime(1);
  return Promise.allSettled([...promises, p]);
};

describe('logging', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const testWatcherSequence = async (results: Promise<string | null>[]): Promise<any[]> => {
    const calls: any[] = [];
    const promises: Promise<any>[] = [];

    const now = Date.now();

    const logger: Logger = {
      info(...args) {
        calls.push(['info', args]);
      },
      error(...args) {
        calls.push(['error', args]);
      },
    };

    let nextResult: Promise<string | null>;

    const watcher = new Watcher({ logger, getStream: () => nextResult });
    (watcher as any).testHook = (promise: Promise<any>) => {
      promises.push(promise);
    };

    watcher.poll({ every: Duration.ms(10) });

    do {
      nextResult = results.shift()!;
      jest.advanceTimersByTime(9);
      await tick();
    } while (results.length > 0);

    await tick(...promises.splice(0));
    watcher.destroy();
    return calls;
  };

  it('poll success', async () => {
    const res = await testWatcherSequence([
      //
      Promise.resolve('test'),
      Promise.resolve('test'),
      Promise.resolve(null),
      Promise.resolve(null),
    ]);

    expect(res).toMatchInlineSnapshot(`
        [
          [
            "info",
            [
              "polling for status",
            ],
          ],
          [
            "info",
            [
              "got stream=true",
            ],
          ],
          [
            "info",
            [
              "status updated source=poll from=Unknown to=Online",
            ],
          ],
          [
            "info",
            [
              "polling for status",
            ],
          ],
          [
            "info",
            [
              "got stream=true",
            ],
          ],
          [
            "info",
            [
              "status updated source=poll from=Online to=Online",
            ],
          ],
          [
            "info",
            [
              "polling for status",
            ],
          ],
          [
            "info",
            [
              "got stream=false",
            ],
          ],
          [
            "info",
            [
              "status updated source=poll from=Online to=Offline",
            ],
          ],
          [
            "info",
            [
              "polling for status",
            ],
          ],
          [
            "info",
            [
              "got stream=false",
            ],
          ],
          [
            "info",
            [
              "status updated source=poll from=Offline to=Offline",
            ],
          ],
          [
            "info",
            [
              "watcher.destroy() called, cleaning up",
            ],
          ],
        ]
      `);
  });

  it('poll failures', async () => {
    const res = await testWatcherSequence([
      Promise.reject('oh noes1'),
      Promise.resolve('test'),
      Promise.resolve(null),
      Promise.reject(new Error('oh noes2')),
      Promise.resolve(null),
    ]);

    expect(res).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "polling for status",
          ],
        ],
        [
          "error",
          [
            "getStream failed",
            "oh noes1",
          ],
        ],
        [
          "info",
          [
            "polling for status",
          ],
        ],
        [
          "info",
          [
            "got stream=true",
          ],
        ],
        [
          "info",
          [
            "status updated source=poll from=Unknown to=Online",
          ],
        ],
        [
          "info",
          [
            "polling for status",
          ],
        ],
        [
          "info",
          [
            "got stream=false",
          ],
        ],
        [
          "info",
          [
            "status updated source=poll from=Online to=Offline",
          ],
        ],
        [
          "info",
          [
            "polling for status",
          ],
        ],
        [
          "error",
          [
            "getStream failed",
            "oh noes2",
          ],
        ],
        [
          "info",
          [
            "polling for status",
          ],
        ],
        [
          "info",
          [
            "got stream=false",
          ],
        ],
        [
          "info",
          [
            "status updated source=poll from=Offline to=Offline",
          ],
        ],
        [
          "info",
          [
            "watcher.destroy() called, cleaning up",
          ],
        ],
      ]
    `);
  });

  it('manual update', async () => {
    const calls: any[] = [];
    const promises: Promise<any>[] = [];

    const logger: Logger = {
      info(...args) {
        calls.push(['info', args]);
      },
      error(...args) {
        calls.push(['error', args]);
      },
    };

    const watcher = new Watcher<string | null>({ logger, getStream: () => Promise.reject('failure') });
    (watcher as any).testHook = (promise: Promise<any>) => {
      promises.push(promise);
    };

    watcher.update('hello', 'manual');
    watcher.update(null, 'manual');
    watcher.update('ok'); // no source -> "unknown"

    watcher.destroy();

    await tick(...promises);
    expect(calls).toMatchInlineSnapshot(`
        [
          [
            "info",
            [
              "status updated source=manual from=Unknown to=Online",
            ],
          ],
          [
            "info",
            [
              "status updated source=manual from=Online to=Offline",
            ],
          ],
          [
            "info",
            [
              "status updated source=unknown from=Offline to=Online",
            ],
          ],
          [
            "info",
            [
              "watcher.destroy() called, cleaning up",
            ],
          ],
        ]
      `);
  });

  it('default logger', async () => {
    jest.setSystemTime(100000000);

    const promises: Promise<any>[] = [];

    const mockInfo = jest.spyOn(console, 'log');
    const mockError = jest.spyOn(console, 'error');

    const watcher = new Watcher<string | null>({ logger: true, getStream: () => Promise.reject('failure') });
    (watcher as any).testHook = (promise: Promise<any>) => {
      promises.push(promise);
    };

    watcher.update('hello', 'manual');
    watcher.update(null, 'manual');
    watcher.update('ok'); // no source -> "unknown"

    watcher.poll({ every: Duration.ms(10) });
    jest.advanceTimersByTime(9);
    await tick();

    watcher.destroy();

    await tick(...promises);

    expect(mockInfo.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "1970-01-02T03:46:40.000Z",
          "[StreamWatch]",
          "status updated source=manual from=Unknown to=Online",
        ],
        [
          "1970-01-02T03:46:40.000Z",
          "[StreamWatch]",
          "status updated source=manual from=Online to=Offline",
        ],
        [
          "1970-01-02T03:46:40.000Z",
          "[StreamWatch]",
          "status updated source=unknown from=Offline to=Online",
        ],
        [
          "1970-01-02T03:46:40.010Z",
          "[StreamWatch]",
          "polling for status",
        ],
        [
          "1970-01-02T03:46:40.010Z",
          "[StreamWatch]",
          "watcher.destroy() called, cleaning up",
        ],
      ]
    `);
    expect(mockError.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "1970-01-02T03:46:40.010Z",
          "[StreamWatch]",
          "getStream failed",
          "failure",
        ],
      ]
    `);

    mockInfo.mockRestore();
    mockError.mockRestore();
  });

  it('with listeners', async () => {
    const calls: any[] = [];
    const promises: Promise<any>[] = [];

    const logger: Logger = {
      info(...args) {
        calls.push(['info', args]);
      },
      error(...args) {
        calls.push(['error', args]);
      },
    };

    const watcher = new Watcher<string | null>({ logger, getStream: () => Promise.reject('failure') });
    (watcher as any).testHook = (promise: Promise<any>) => {
      promises.push(promise);
    };

    watcher.on('online', () => {});
    watcher.on('offline', () => {});
    watcher.on('change', () => {});

    watcher.update('hello', 'manual');
    watcher.update(null, 'manual');

    watcher.destroy();

    await tick(...promises);
    expect(calls).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Unknown to=Online",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
        [
          "info",
          [
            "notified 1 'online' listeners: ",
            [
              "sent immediately",
            ],
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
        [
          "info",
          [
            "status updated source=manual from=Online to=Offline",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
        [
          "info",
          [
            "notified 1 'offline' listeners: ",
            [
              "sent immediately",
            ],
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
        [
          "info",
          [
            "watcher.destroy() called, cleaning up",
          ],
        ],
      ]
    `);
  });

  it('online notifier with delay policy and alternate humanizer', async () => {
    const calls: any[] = [];
    const promises: Promise<any>[] = [];

    const logger: Logger = {
      info(...args) {
        calls.push(['info', args]);
      },
      error(...args) {
        calls.push(['error', args]);
      },
    };

    const watcher = new Watcher<string | null>({
      logger,
      humanizer: n => `0x${n.toString(16)}`,
      getStream: () => Promise.reject('failure'),
    });
    (watcher as any).testHook = (promise: Promise<any>) => {
      promises.push(promise);
    };

    watcher.on('online', () => {}, {
      throttle: new ThrottlePolicy({ notifyOnInitial: true, atMostOncePer: 20 }),
      delay: new DelayPolicy({ noDelayOnInitial: false, waitAtLeast: 10 }),
    });

    // initial state: no notification (throttle)
    watcher.update('hello', 'manual');
    jest.advanceTimersByTime(10);
    await tick(...promises.splice(0));

    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Unknown to=Online",
          ],
        ],
        [
          "info",
          [
            "notified 1 'online' listeners: ",
            [
              "will send in 0xa",
            ],
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
      ]
    `);
  });

  it('online notifiers with delay policy', async () => {
    const calls: any[] = [];
    const promises: Promise<any>[] = [];

    const logger: Logger = {
      info(...args) {
        calls.push(['info', args]);
      },
      error(...args) {
        calls.push(['error', args]);
      },
    };

    const watcher = new Watcher<string | null>({ logger, getStream: () => Promise.reject('failure') });
    (watcher as any).testHook = (promise: Promise<any>) => {
      promises.push(promise);
    };

    watcher.on('online', () => {}, {
      throttle: new ThrottlePolicy({ notifyOnInitial: false, atMostOncePer: 20 }),
      delay: new DelayPolicy({ noDelayOnInitial: false, waitAtLeast: 10 }),
    });
    watcher.on('online', () => {}, {
      throttle: new ThrottlePolicy({ notifyOnInitial: true, atMostOncePer: 20 }),
      delay: new DelayPolicy({ noDelayOnInitial: true, waitAtLeast: 10 }),
    });

    // initial state: no notification (throttle)
    watcher.update('hello', 'manual');
    jest.advanceTimersByTime(10);
    await tick(...promises.splice(0));

    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Unknown to=Online",
          ],
        ],
        [
          "info",
          [
            "skipping initial notification",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
        [
          "info",
          [
            "notified 2 'online' listeners: ",
            [
              "ignored",
              "sent immediately",
            ],
          ],
        ],
      ]
    `);

    // rapid state change (online): discard (throttled)
    watcher.update(null, 'manual');
    jest.advanceTimersByTime(1);
    await tick();
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Offline",
          ],
        ],
      ]
    `);
    watcher.update('hello', 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Offline to=Online",
          ],
        ],
        [
          "info",
          [
            "skipping throttled notification",
          ],
        ],
        [
          "info",
          [
            "notified 2 'online' listeners: ",
            [
              "will send in 10ms",
              "ignored",
            ],
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
      ]
    `);

    // redundant state: no change
    watcher.update('hello', 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Online",
          ],
        ],
        [
          "info",
          [
            "notified 2 'online' listeners: ",
            [
              "ignored",
              "ignored",
            ],
          ],
        ],
      ]
    `);

    // state change: notify on a delay
    watcher.update(null, 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Offline",
          ],
        ],
      ]
    `);

    // rapid state change (offline): discard (throttled)
    watcher.update('brief', 'manual');
    jest.advanceTimersByTime(1);
    await tick();
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Offline to=Online",
          ],
        ],
        [
          "info",
          [
            "notified 2 'online' listeners: ",
            [
              "will send in 10ms",
              "will send in 10ms",
            ],
          ],
        ],
      ]
    `);

    watcher.update(null, 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));

    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Offline",
          ],
        ],
        [
          "info",
          [
            "cleared pending notification",
          ],
        ],
        [
          "info",
          [
            "cleared pending notification",
          ],
        ],
      ]
    `);
  });

  it('change notifiers with delay policy', async () => {
    const calls: any[] = [];
    const promises: Promise<any>[] = [];

    const logger: Logger = {
      info(...args) {
        calls.push(['info', args]);
      },
      error(...args) {
        calls.push(['error', args]);
      },
    };

    const watcher = new Watcher<string | null>({ logger, getStream: () => Promise.reject('failure') });
    (watcher as any).testHook = (promise: Promise<any>) => {
      promises.push(promise);
    };

    watcher.on('change', () => {}, {
      throttle: new ThrottlePolicy({ notifyOnInitial: false, atMostOncePer: 20 }),
      delay: new DelayPolicy({ noDelayOnInitial: false, waitAtLeast: 10 }),
    });
    watcher.on('change', () => {}, {
      throttle: new ThrottlePolicy({ notifyOnInitial: true, atMostOncePer: 20 }),
      delay: new DelayPolicy({ noDelayOnInitial: true, waitAtLeast: 10 }),
    });

    // initial state: no notification (throttle)
    watcher.update('hello', 'manual');
    jest.advanceTimersByTime(10);
    await tick(...promises.splice(0));

    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Unknown to=Online",
          ],
        ],
        [
          "info",
          [
            "skipping initial notification",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
      ]
    `);

    // rapid state change (online): discard (throttled)
    // change listeners only: eventually notify the final state,
    // so it's more like a debounce
    watcher.update(null, 'manual');
    jest.advanceTimersByTime(1);
    await tick();
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Offline",
          ],
        ],
        [
          "info",
          [
            "skipping throttled notification",
          ],
        ],
      ]
    `);
    watcher.update('hello', 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Offline to=Online",
          ],
        ],
        [
          "info",
          [
            "skipping throttled notification",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
      ]
    `);

    // redundant state: no change
    watcher.update('hello', 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Online",
          ],
        ],
      ]
    `);

    // state change: notify on a delay
    watcher.update(null, 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Offline",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
      ]
    `);

    // rapid state change (offline): discard (throttled)
    // change listeners only: we don't emit "cleared" messages,
    // because we're always in the "set" state. instead, we act
    // like a debounce and always emit the final value even if
    // it is the same as the last time we emitted something
    watcher.update('brief', 'manual');
    jest.advanceTimersByTime(1);
    await tick();
    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Offline to=Online",
          ],
        ],
      ]
    `);

    watcher.update(null, 'manual');
    jest.advanceTimersByTime(100);
    await tick(...promises.splice(0));

    expect(calls.splice(0)).toMatchInlineSnapshot(`
      [
        [
          "info",
          [
            "status updated source=manual from=Online to=Offline",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
        [
          "info",
          [
            "sent delayed notification",
          ],
        ],
      ]
    `);
  });

  //
});
