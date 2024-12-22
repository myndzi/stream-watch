import { Duration } from '../util.js';
import { ThrottlePolicy, ThrottlePolicyOpts } from './throttle.js';

describe('policy/throttle', () => {
  describe('constructor', () => {
    it.each([
      //
      1,
      true,
      null,
      undefined,
    ])('requires an option bag', (opts: any) => {
      expect(() => new ThrottlePolicy(opts)).toThrow(/`opts` is required/);
    });

    it.each([
      //
      -1,
      0,
      Infinity,
      1.2,
      null,
      new Date(),
    ])('atMostOncePer: throws on invalid value', (atMostOncePer: any) => {
      expect(() => {
        new ThrottlePolicy({ atMostOncePer });
      }).toThrow(/must be a positive integer/);
    });

    it.each([
      //
      0,
      1,
      new Date(),
    ])('notifyOnInitial: throws on invalid value (%p)', (notifyOnInitial: any) => {
      expect(() => {
        new ThrottlePolicy({ atMostOncePer: Duration.ms(1), notifyOnInitial });
      }).toThrow(/must be a boolean/);
    });
  });

  describe('shouldSend', () => {
    it.each([
      //
      [{ notifyOnInitial: false }, 199, false, undefined, true],
      [{ notifyOnInitial: false }, 200, false, 100, true],
      [{ notifyOnInitial: false }, 201, false, 100, true],

      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 199, false, undefined, true],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 199, false, 100, false],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 200, false, 100, true],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 201, false, 100, true],

      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 199, true, undefined, false],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 199, true, 100, false],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 200, true, 100, false],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: false }, 201, true, 100, false],

      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 199, false, undefined, true],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 199, false, 100, false],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 200, false, 100, true],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 201, false, 100, true],

      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 199, true, undefined, true],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 199, true, 100, true],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 200, true, 100, true],
      [{ atMostOncePer: Duration.ms(100), notifyOnInitial: true }, 201, true, 100, true],
    ] as [ThrottlePolicyOpts, number, boolean, number | undefined, boolean][])(
      'respects opts=%p now=%p isInitial=%p, last=%p expected=%p',
      (opts, now, isInitial, lastNotified, expected) => {
        expect(new ThrottlePolicy(opts).shouldSend(now, isInitial, lastNotified)).toEqual(expected);
      }
    );
  });
});
