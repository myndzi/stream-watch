# stream-watch

- [stream-watch](#stream-watch)
  - [What is this?](#what-is-this)
    - [Use-case 1: Automatic Discord notifications](#use-case-1-automatic-discord-notifications)
    - [Use-case 2: Offline-only channel bot](#use-case-2-offline-only-channel-bot)
  - [Combining unreliable information sources](#combining-unreliable-information-sources)
  - [Initial state](#initial-state)
- [Basic usage](#basic-usage)
  - [Adding a policy](#adding-a-policy)
- [API](#api)
  - [Watcher](#watcher)
    - [Constructor](#constructor)
      - [getStream: () =\> Promise\<Stream|null\>](#getstream---promisestreamnull)
      - [logger: true|undefined|Logger](#logger-trueundefinedlogger)
      - [humanizer: undefined|Humanizer](#humanizer-undefinedhumanizer)
    - [poll(opts): () =\> void](#pollopts---void)
      - [opts.every: number](#optsevery-number)
      - [opts.immediately: boolean](#optsimmediately-boolean)
    - [update(Stream|null): void](#updatestreamnull-void)
    - [on(event, handler, \[policies\]): Subscription](#onevent-handler-policies-subscription)
      - [event: 'online'](#event-online)
      - [event: 'offline'](#event-offline)
      - [policies.throttle: ThrottlePolicy](#policiesthrottle-throttlepolicy)
      - [policies.delay: DelayPolicy](#policiesdelay-delaypolicy)
    - [getStatus(): StreamStatus](#getstatus-streamstatus)
    - [destroy(): void](#destroy-void)
  - [Subscription](#subscription)
    - [unsubscribe(): void](#unsubscribe-void)
    - [status(): SubscriptionStatus](#status-subscriptionstatus)
  - [ThrottlePolicy](#throttlepolicy)
    - [constructor(opts)](#constructoropts)
      - [opts.atMostOncePer: number](#optsatmostonceper-number)
      - [opts.notifyOnInitial: boolean](#optsnotifyoninitial-boolean)
  - [DelayPolicy](#delaypolicy)
    - [constructor(opts)](#constructoropts-1)
      - [opts.waitAtLeast: number](#optswaitatleast-number)
      - [opts.noDelayOnInitial: boolean](#optsnodelayoninitial-boolean)

## What is this?

This package was created with the specific goal of eliminating the noise of stream online/offline handling for Twitch bots. However, it carries no production dependencies and does not rely on any Twitch-specific behavior, and could conceivably be applied to any two-state system with potentially noisy inputs where the developer wants to consolidate event-driven behavior according to some configurable policy. Some examples may help, so here are some use-cases:

### Use-case 1: Automatic Discord notifications

A streamer wants to automate the task of sending a notification to Discord when the stream goes live. The notification includes an `@mention` which pings people. People are unusually feisty about getting pinged unnecessarily.

While it's relatively straightforward to set up an event listener for one of Twitch's go-live notifications, the downside is that if the stream is interrupted for any reason at all and goes offline then online again, an unwanted message is sent.

Conversely, if PubSub or EventSub fails to send a notification, none will ever sent even when the stream is live.

### Use-case 2: Offline-only channel bot

A streamer has a chat bot that runs games for chatters to amuse themselves with while the stream is offline. However, with a large audience while live, the bot is too spammy and detracts from chat interaction with the streamer.

Again, it's relatively straightforward to set up an event listener to react to "offline" and enable the bot, or react to "online" and disable the bot. However, the same problems arise when something goes amiss: the bot can wind up being active while the stream is online or inactive when the stream is offline if notifications don't get delivered, and if there's a temporary stream outage, unruly chatters can create unnecessary noise in the brief period before the stream comes back online.

## Combining unreliable information sources

Twitch has two "push" style notifications systems: PubSub and EventSub. They usually work as expected, but sometimes they don't, or are significantly delayed. There is also an API you can call to directly request the status of a stream.

One way you might choose to address the unreliable delivery is to add a second source of information, say by polling the API. Once you decide to do that, you now have to deal with combining the results you observe into something that behaves how you want. That's what this library does.

The `Watcher` class exported by this library accepts any number of online or offline notifications, and maintains an awareness of the "canonical" state of the stream. You may then bind event listeners to be notified when the state changes. These listeners are only called once per transition, regardless of how many times the watcher was notified of a state.

Each listener may be further configured with policies defining how to behave. For example, adding a `DelayPolicy` will cause the listener to be called only after a certain amount of time has passed without a state change: "Run this code only when the stream has been offline for at least an hour". Similarly, adding a `ThrottlePolicy` will cause the listener to be called no more frequently than a specified period: "Run this code a maximum of once per 8 hours"

## Initial state

When a Watcher is first initialized, it doesn't know if the stream is online or offline. It begins in the "Unknown" state until the first update it receives tells it what the current state is.

Both `ThrottlePolicy` and `DelayPolicy` have options that alter their behavior on the _first_ transition (from unknown to online / offline) to allow you to configure whether you want to be notified about this initial transition. `ThrottlePolicy` has `notifyOnInitial`, which (when set to `true`) causes an event to be emitted for transitions from "Unknown" to whatever the desired state is. `DelayPolicy` has `noDelayOnInitial`, which (when set to `true`) causes the first event to be emitted immediately instead of after the configured delay.

# Basic usage

The primary exported class is `Watcher`. It takes an argument which is a Promise-returning function that resolves to either `null` or a generically-typed `Stream`. Online listeners will receive this type when notified of an `online` event.

```ts
// twitch user id to track
const STREAMER_ID = '241636';

// ----- Set up Twurple -----
import { ApiClient, type HelixStream } from '@twurple/api';
import { StaticAuthProvider } from '@twurple/auth';
import { EventSubWsListener } from '@twurple/eventsub-ws';

const clientId = process.env.CLIENT_ID!;
const authToken = process.env.ACCESS_TOKEN!;

// set up the auth provider (requires client_id and client_secret for a Twitch app)
// NOTE: you should use a RefreshingAuthProvider, but the code required
// to demonstrate loading and saving on refresh would complicate the example
// a bit too much...
const authProvider = new StaticAuthProvider(clientId, authToken);

// set up the API client
const apiClient = new ApiClient({ authProvider });

// set up an EventSub subscription
const listener = new EventSubWsListener({
  // NOTE: Twurple's API does not currently provide a way to use
  // websocket eventsub listeners to subscribe to a user id that
  // is not the same as the user id of the authProvider. see
  // the workaround at the bottom of this example
  apiClient: new ApiClient({ authProvider }),
});

// ----- Set up stream-watch -----
import { Duration, Watcher } from 'stream-watch';

// define the function to retrieve the stream status
const getStream = (): Promise<HelixStream | null> => apiClient.streams.getStreamByUserId(STREAMER_ID);

// create the Watcher instance
const watcher = new Watcher({
  logger: true,
  getStream,
});

// without any policy configured, these will just pass through every
// online or offline state change, but it will deduplicate the transitions.
// you can expect that once you've received an "online" event that you will
// not receive another until there has first been an "offline" event
watcher.on('online', (stream: HelixStream) => {
  console.log('stream is now live', stream.gameName);
  // stream is live, do something
});

watcher.on('offline', () => {
  console.log('stream is now offline');
  // stream ended, do something
});

// start the watcher polling, as a backup. `immediately: true`
// performs a poll immediately, to get the initial state
watcher.poll({ every: Duration.minute(10), immediately: true });

// use Twurple to feed in EventSub notifications

// add notifications from EventSub
listener.onStreamOnline(STREAMER_ID, async () => {
  // twitch does not provide the stream data, so we use
  // the eventsub notification to trigger an api call to
  // fetch it. Watcher is generic over the return type of
  // the `getStream` function we passed it initially, so
  // that subscribers can always have that value available.
  watcher.update(await getStream());
});
listener.onStreamOffline(STREAMER_ID, () => {
  // for offline notifications, we just send null.
  watcher.update(null);
});

// connect the EventSub websocket and start listening
listener.start();
```

This example shows both polling and integrating an external event source.

## Adding a policy

Online event with a throttle policy:
```ts
import { ThrottlePolicy } from 'stream-watch';
watcher.on(
  'online',
  (stream: HelixStream) => {
    // do some work, e.g. notify Discord
  },
  {
    throttle: new ThrottlePolicy({
      // do something when stream comes online, but only if it's been at least
      // 6 hours since the last time the event triggered
      atMostOncePer: Duration.hour(6),
      // if the stream is online when the code first runs, do not emit anything
      notifyOnInitial: false,
    }),
  }
);
```

Offline event with a delay policy:
```ts
import { DelayPolicy } from 'stream-watch';
watcher.on(
  'offline',
  () => {
    // do some work, e.g. enable offline bot commands
  },
  {
    delay: new DelayPolicy({
      // do something once stream has been online for the last 30 minutes
      waitAtLeast: Duration.minute(30),
      // run immediately on initial startup if stream is offline
      noDelayOnInitial: true,
    }),
  }
);
```

# API

## Watcher

Watcher has one generic argument, `Stream`, which by default is inferred from the return type of the `getStream` function

### Constructor

```ts
const watcher = new Watcher({
  // required
  getStream: apiClient.streams.getStreamByUserId(STREAMER_ID),

  // optional
  logger: defaultLogger,

  // optional
  humanizer: defaultHumanizer,
});
```

#### getStream: () => Promise<Stream|null>

A function that returns a promise for either a stream object (when online) or null (when offline). Used to get initial status and for polling.

#### logger: true|undefined|Logger

Set to `true` to use the default logger, `undefined` to disable logging, or something matching the `Logger` interface to use your own code. The `Logger` interface just matches `console.log` and `console.error`:

```ts
export interface Logger {
  info(...args: any[]): void;
  error(...args: any[]): void;
}
```

#### humanizer: undefined|Humanizer

Used when logging is enabled to render durations into friendly strings such as "15 minutes". Defaults to `defaultHumanizer`, but you can supply your own by meeting the interface:

```ts
export interface Humanizer {
  (ms: number, since?: number): string;
}
```

The first argument (`ms`) is the value, in milliseconds, to represent. If the second argument (`since`) is given, then `ms` and `since` are both timestamps (in milliseconds), and the function should return the relative time between them.

### poll(opts): () => void

Begin polling. Returns a function to disable polling. If polling is already enabled, calling again will _replace_ the previous polling configuration with the new configuration.

```ts
import { Duration } from 'stream-watch';
const stopPolling = watcher.poll({
  every: Duration.minute(5),
  immediately: true,
});

// stop polling
stopPolling();
```

#### opts.every: number
Specify how frequently to poll for status (in milliseconds). You can use the `Duration` helper for convenience, e.g. `Duration.minute(15)` or `Duration.second(30)`

#### opts.immediately: boolean
When `true`, performs a poll immediately. When `false`, the first poll will occur after `every` milliseconds.

### update(Stream|null): void

Used to integrate external online/offline notifications. Just call `update` with either null or a value of the same type as the `getStream` function you passed to the constructor.

```ts
// provide a "stream offline" input
watcher.update(null);
// provide a "stream online" input
watcher.update(stream);
```

### on(event, handler, [policies]): Subscription<Stream>

Register a handler for stream online/offline events.

The `policies` argument is the same for all events. If no policies are specified, the handler will be called once per transition. In other words, an offline handler will be called when the stream changes from `Online` to `Offline`. This includes the initial transition from `Unknown`. To exclude the initial transition, you may specify a `ThrottlePolicy` with `{notifyOnInitial: false}`.

If the watcher's last-known state is `Offline` it will not emit duplicate `Offline` events when receiving an update / poll result that indicates the stream is (still) offline.

#### event: 'online'

Register an `online` handler with the given policy configuration. Returns an unsubscribe function.

```ts
const subscription = watcher.on(
  'online',
  (stream: Stream) => {
    // called with the latest-known value of stream
  },

  // policy argument is optional, as are
  // all properties
  {
    throttle: throttlePolicy,
    delay: delayPolicy,
  }
);

// stop calling the event handler
subscription.unsubscribe();
```

#### event: 'offline'

Register an `offline` handler with the given policy configuration. Returns an unsubscribe function.

```ts
const subscription = watcher.on(
  'offline',
  () => {
    // called without any argument
  },

  // policy argument is optional, as are
  // all properties
  {
    throttle: throttlePolicy,
    delay: delayPolicy,
  }
);

// stop calling the event handler
subscription.unsubscribe();
```

#### policies.throttle: ThrottlePolicy

Enable a throttle policy. Supply an instance of `ThrottlePolicy`.

#### policies.delay: DelayPolicy

Enable a delay policy. Supply an instance of `DelayPolicy`.

### getStatus(): StreamStatus<Stream>

Returns the current / last-known status of the stream (in other words, the most recent call to `update` or poll result).

```ts
import { StreamState } from 'stream-watch';
const { status, stream } = watcher.getStatus();
switch (status) {
  case StreamState.Unknown:
    // initial status has not yet been determined
    // `stream` is undefined
    break;
  case StreamState.Online:
    // stream is currently online
    console.log(stream.gameName); // `stream` is a Stream
    break;
  case StreamState.Offline:
    // stream is currently offline
    // `stream` is undefined
    break;
}
```

### destroy(): void

Stops polling, ceases notifying any event listeners, and causes any further method calls to throw an error.

## Subscription

A helper class allowing you to unregister a subscription or inspect the status of that subscription's notifications.

### unsubscribe(): void

Stop sending events to the associated handler.

```ts
subscription.unsubscribe()
```

### status(): SubscriptionStatus

Return the current status of this Subscription:

```ts
export type SubscriptionStatus =
  | {
      state: StreamState.Unknown | StreamState.Online | StreamState.Offline;
      remaining: undefined;
    }
  | {
      state: StreamState.PendingOnline | StreamState.PendingOffline;
      remaining: number;
    };
```

`PendingOnline` and `PendingOffline` represent a subscription that's in the delay phase of a `DelayPolicy` -- that is, the stream is known to be online, but it hasn't yet been online for long enough. For the `Pending` states, an additional property (`remaining`) contains the number of milliseconds until the event handler _will_ be called, if the notification is not aborted by another stream status change.

## ThrottlePolicy

Define a throttle policy for a subscription

### constructor(opts)

```ts
const throttlePolicy = new ThrottlePolicy({
  atMostOncePer: Duration.hour(6),
  notifyOnInitial: false,
});

watcher.on('event', handler, {
  throttle: throttlePolicy,
});
```

#### opts.atMostOncePer: number

The handler will be called at most once per this many milliseconds.

#### opts.notifyOnInitial: boolean

When `true`, the handler will be called when the stream state changes from `Unknown` to `Online` or `Offline`. When `false`, it will not be called on the initial transition.

## DelayPolicy

Define a delay policy for a subscription

### constructor(opts)

```ts
const delayPolicy = new DelayPolicy({
  waitAtLeast: Duration.minute(30),
  noDelayOnInitial: true,
});

watcher.on('event', handler, {
  delay: delayPolicy,
});
```

#### opts.waitAtLeast: number

The handler will not be called until at least this many milliseconds have passed without an online/offline state change.

#### opts.noDelayOnInitial: boolean

When `true`, the handler will be called without delay when the stream state changes from `Unknown` to `Online` or `Offline`. When `false`, the initial transition will also be subject to delay.