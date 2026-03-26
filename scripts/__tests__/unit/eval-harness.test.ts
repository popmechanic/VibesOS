import { describe, it, expect } from 'vitest';
import { analyzeDataModel } from '../../eval-harness.js';

describe('eval-harness', () => {
  describe('analyzeDataModel — recording mocks', () => {
    it('records useTable calls', () => {
      const jsx = `
function App() {
  const tasks = useTable('tasks');
  const { isReady } = useApp();
  if (!isReady) return <div>Loading...</div>;
  return <div>{Object.keys(tasks).length} tasks</div>;
}
`;
      const result = analyzeDataModel(jsx);
      expect(result.failures).toHaveLength(0);

      // Both Alice and Bob should have a readTable op for 'tasks'
      const aliceReadTable = result.aliceOps.filter(
        (op) => op.op === 'readTable' && op.table === 'tasks'
      );
      const bobReadTable = result.bobOps.filter(
        (op) => op.op === 'readTable' && op.table === 'tasks'
      );

      expect(aliceReadTable.length).toBeGreaterThan(0);
      expect(bobReadTable.length).toBeGreaterThan(0);
    });

    it('records useAddRowCallback with row factory', () => {
      const jsx = `
function App() {
  const { isReady, user } = useApp();
  const addBid = useAddRowCallback('bids', (e) => ({
    bidder: user.email,
    amount: 100,
  }), [user]);

  if (!isReady) return <div>Loading...</div>;
  return <button onClick={addBid}>Place Bid</button>;
}
`;
      const result = analyzeDataModel(jsx);
      expect(result.failures).toHaveLength(0);

      // Should have addRow op for 'bids' with a callable factory
      const aliceAddBid = result.aliceOps.find(
        (op) => op.op === 'addRow' && op.table === 'bids'
      );
      const bobAddBid = result.bobOps.find(
        (op) => op.op === 'addRow' && op.table === 'bids'
      );

      expect(aliceAddBid).toBeDefined();
      expect(bobAddBid).toBeDefined();
      expect(typeof aliceAddBid!.rowFactory).toBe('function');
      expect(typeof bobAddBid!.rowFactory).toBe('function');
    });

    it('detects per-user isolation via email-keyed rows', () => {
      const jsx = `
function App() {
  const { isReady, user } = useApp();
  const addBid = useAddRowCallback('bids', (e) => ({
    bidder: user.email,
    amount: 100,
  }), [user]);

  if (!isReady) return <div>Loading...</div>;
  return <button onClick={addBid}>Place Bid</button>;
}
`;
      const result = analyzeDataModel(jsx);
      expect(result.failures).toHaveLength(0);

      const aliceAddBid = result.aliceOps.find(
        (op) => op.op === 'addRow' && op.table === 'bids'
      );
      const bobAddBid = result.bobOps.find(
        (op) => op.op === 'addRow' && op.table === 'bids'
      );

      expect(aliceAddBid).toBeDefined();
      expect(bobAddBid).toBeDefined();

      // Invoke the row factories — Alice produces bidder=alice@test.com, Bob produces bidder=bob@test.com
      const aliceRow = aliceAddBid!.rowFactory!();
      const bobRow = bobAddBid!.rowFactory!();

      expect(aliceRow.bidder).toBe('alice@test.com');
      expect(bobRow.bidder).toBe('bob@test.com');
    });

    it('returns failures for components that throw', () => {
      const jsx = `
function App() {
  // This will throw because undefinedFn is not defined
  undefinedFn();
  return <div>Hello</div>;
}
`;
      const result = analyzeDataModel(jsx);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });
});
