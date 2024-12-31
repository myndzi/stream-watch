// this file is intended to be run as-is to verify that the code in the example works and is valid.
// parts of it get inserted into the readme during the build process

//* pt:export preamble *//
// twitch user id to track
const STREAMER_ID = '241636';
//* pt:end *//

// getting a user access token (implicit flow):
// (1) create a twitch app
// (2) add a redirect uri of http://localhost:3000
//     important: "http" is only allowed for localhost
// (3) get the client id from the app page
// (4) in a browser, logged in to twitch, visit: https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=PUT_THE_CLIENT_ID_HERE&redirect_uri=http://localhost:3000
// (5) accept the request. twitch will redirect you to localhost:3000 (which doesn't exist). the auth_token will be in the fragment of the url.
//
// note: you should use the "authorization code" grant flow in real usage, and a RefreshingAuthProvider,
// but the extra code would detract from the example.
// see https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow

//* pt:export twurple *//
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
//* pt:end *//

//* pt:export stream-watch *//
// ----- Set up stream-watch -----
import { Duration, Watcher } from 'stream-watch';

// define the function to retrieve the stream status
const getStream = (): Promise<HelixStream | null> => apiClient.streams.getStreamByUserId(STREAMER_ID);

// create the Watcher instance
const watcher = new Watcher({
  logger: true,
  getStream,
});
//* pt:end *//

//* pt:export on_online *//
// without any policy configured, these will just pass through every
// online or offline state change, but it will deduplicate the transitions.
// you can expect that once you've received an "online" event that you will
// not receive another until there has first been an "offline" event
watcher.on('online', (stream: HelixStream) => {
  console.log('stream is now live', stream.gameName);
  // stream is live, do something
});
//* pt:end *//

//* pt:export on_offline *//
watcher.on('offline', () => {
  console.log('stream is now offline');
  // stream ended, do something
});
//* pt:end *//

//* pt:export poll *//
// start the watcher polling, as a backup. `immediately: true`
// performs a poll immediately, to get the initial state
watcher.poll({ every: Duration.minute(10), immediately: true });
//* pt:end *//

//* pt:export online_throttle_policy *//
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
//* pt:end *//

//* pt:export offline_delay_policy *//
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
//* pt:end *//

//* pt:export eventsub *//
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
//* pt:end *//

//* pt:export get_status *//
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
//* pt:end *//
