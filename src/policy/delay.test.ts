import { Duration } from '../util.js';
import { DelayPolicy } from './delay.js';

describe('policy/throttle', () => {
  describe('constructor', () => {
    it.each([
      //
      1,
      true,
      null,
      undefined,
    ])('requires an option bag', (opts: any) => {
      expect(() => new DelayPolicy(opts)).toThrow(/`opts` is required/);
    });

    it.each([
      //
      -1,
      0,
      Infinity,
      1.2,
      null,
      new Date(),
    ])('waitAtLeast: throws on invalid value', (waitAtLeast: any) => {
      expect(() => {
        new DelayPolicy({ waitAtLeast });
      }).toThrow(/must be a positive integer/);
    });

    it.each([
      //
      0,
      1,
      new Date(),
    ])('noDelayOnInitial: throws on invalid value (%p)', (noDelayOnInitial: any) => {
      expect(() => {
        new DelayPolicy({ waitAtLeast: Duration.ms(1), noDelayOnInitial });
      }).toThrow(/must be a boolean/);
    });
  });

  describe('sendAfter', () => {
    it.each([
      [{ noDelayOnInitial: true }, true, 0],
      [{ noDelayOnInitial: true }, false, 0],
      [{ waitAtLeast: Duration.day(1), noDelayOnInitial: true }, true, 0],
      [{ waitAtLeast: Duration.day(1), noDelayOnInitial: false }, true, Duration.day(1)],
      [{ waitAtLeast: Duration.day(1), noDelayOnInitial: true }, false, Duration.day(1)],
      [{ waitAtLeast: Duration.day(1), noDelayOnInitial: false }, false, Duration.day(1)],
    ])('respects opts=%p initial=%p expected=%p', (opts, initial, expected) => {
      expect(new DelayPolicy(opts).sendAfter(initial)).toEqual(expected);
    });
  });
});
