import { describe, it, expect, afterAll } from 'vitest';
import { createMergeableStore } from 'tinybase/mergeable-store';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';

describe('local TinyBase sync server', () => {
  let shutdown;
  const PORT = 3444;

  afterAll(() => {
    shutdown?.();
  });

  it('should sync data between two stores via local WsServer', async () => {
    const { startSyncServer } = await import('../../server/sync-server.ts');
    const result = startSyncServer(PORT);
    shutdown = result.shutdown;

    const store1 = createMergeableStore('client-1');
    const store2 = createMergeableStore('client-2');

    const ws1 = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve, reject) => {
      ws1.addEventListener('open', resolve);
      ws1.addEventListener('error', reject);
    });

    const ws2 = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve, reject) => {
      ws2.addEventListener('open', resolve);
      ws2.addEventListener('error', reject);
    });

    const sync1 = await createWsSynchronizer(store1, ws1);
    const sync2 = await createWsSynchronizer(store2, ws2);

    await sync1.startSync();
    await sync2.startSync();

    store1.setRow('settings', 'alice@test.com', { team: 'red' });
    await new Promise(r => setTimeout(r, 500));

    const aliceRow = store2.getRow('settings', 'alice@test.com');
    expect(aliceRow).toEqual({ team: 'red' });

    store2.setRow('settings', 'bob@test.com', { team: 'blue' });
    await new Promise(r => setTimeout(r, 500));

    const bobRow = store1.getRow('settings', 'bob@test.com');
    expect(bobRow).toEqual({ team: 'blue' });

    sync1.destroy();
    sync2.destroy();
  }, 10000);
});
