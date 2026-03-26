import { describe, it, expect } from 'vitest';
import { simulateSync, type RecordedOp } from '../../eval-harness.ts';

describe('simulateSync', () => {
  it('verifies per-user writes stay isolated', async () => {
    // Alice adds bid, Bob adds bid → both stores have 2 bids after sync
    const aliceWrites: RecordedOp[] = [
      {
        op: 'addRow',
        table: 'bids',
        rowFactory: () => ({ amount: 100, bidder: 'alice@test.com' }),
      },
    ];
    const bobWrites: RecordedOp[] = [
      {
        op: 'addRow',
        table: 'bids',
        rowFactory: () => ({ amount: 150, bidder: 'bob@test.com' }),
      },
    ];

    const result = await simulateSync(aliceWrites, bobWrites);

    expect(result.failures).toHaveLength(0);
    expect(result.syncPassed).toBe(true);
    expect(result.storeARows).toHaveLength(2);
    expect(result.storeBRows).toHaveLength(2);
  }, 10000);

  it('detects shared data convergence', async () => {
    // Alice sets timer running → Bob's store sees it
    const aliceWrites: RecordedOp[] = [
      {
        op: 'setCell',
        table: 'timer',
        row: 'shared',
        cell: 'running',
        value: true,
      },
    ];
    const bobWrites: RecordedOp[] = [];

    const result = await simulateSync(aliceWrites, bobWrites);

    expect(result.syncPassed).toBe(true);
    expect(result.storeBState.timer?.shared?.running).toBe(true);
  }, 10000);
});
