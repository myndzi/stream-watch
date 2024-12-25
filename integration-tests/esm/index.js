import { Watcher } from 'stream-watch';
const w = new Watcher(() => Promise.reject('test'));
let called = undefined;
w.on('online', v => {
  console.log('online:', v);
  called = v;
});
w.update('hi');
if (called !== 'hi') {
  console.error('expected listener to be called, but it was not');
  process.exit(1);
}

console.log('ok');
process.exit(0);
