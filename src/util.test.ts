import { defaultHumanizer, defaultLogger, Duration } from './util.js';

describe('defaultHumanizer', () => {
  it.each([
    [-1200, '1s ago'],
    [-1600, '2s ago'],
    [0, 'just now'],
    [1200, '1s from now'],
    [1600, '2s from now'],
  ])('delta: %p -> %p', (ms, expected) => {
    expect(defaultHumanizer(ms, 0)).toEqual(expected);
  });

  it.each([
    [-1200, '-1s'],
    [-1600, '-2s'],
    [-999, '-999ms'],
    [-1000, '-1s'],
    [0, '0ms'],
    [999, '999ms'],
    [1000, '1s'],
    [1200, '1s'],
    [1600, '2s'],
  ])('absolute: %p -> %p', (ms, expected) => {
    expect(defaultHumanizer(ms)).toEqual(expected);
  });
});

describe('defaultLogger', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  it('logs info to stdout', () => {
    jest.useFakeTimers();
    const ts = new Date().toISOString();
    const mock = jest.spyOn(console, 'log');
    defaultLogger.info('hi');
    expect(mock).toHaveBeenCalledWith(ts, '[StreamWatch]', 'hi');
    mock.mockRestore();
  });
  it('logs error to stderr', () => {
    jest.useFakeTimers();
    const ts = new Date().toISOString();
    const mock = jest.spyOn(console, 'error');
    defaultLogger.error('hi');
    expect(mock).toHaveBeenCalledWith(ts, '[StreamWatch]', 'hi');
    mock.mockRestore();
  });
});

describe('duration', () => {
  it.each([
    ['ms', 1],
    ['second', 1 * 1000],
    ['minute', 1 * 1000 * 60],
    ['hour', 1 * 1000 * 60 * 60],
    ['day', 1 * 1000 * 60 * 60 * 24],
  ] as [method: keyof typeof Duration, expected: number][])('1 %p => %p', (method, expected) => {
    expect(Duration[method](1)).toEqual(expected);
  });
});
