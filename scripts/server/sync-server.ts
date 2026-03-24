import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server';
import { WebSocketServer } from 'ws';

const DEFAULT_SYNC_PORT = 3334;

export function startSyncServer(port: number = DEFAULT_SYNC_PORT) {
  const wss = new WebSocketServer({ port });
  // createWsServer without a persister factory acts as a routing server:
  // clients sync state with each other via the server's message relay.
  // No server-side store is needed for eval-mode in-memory testing.
  const tinybaseServer = createWsServer(wss);

  console.log(`[eval-mode] TinyBase sync server running on ws://localhost:${port}`);

  return {
    port,
    shutdown: () => {
      tinybaseServer.destroy();
    },
  };
}

if (import.meta.main) {
  const port = parseInt(
    process.argv.find((_, i, a) => a[i - 1] === '--port') || String(DEFAULT_SYNC_PORT),
    10,
  );
  const { shutdown } = startSyncServer(port);
  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
}
