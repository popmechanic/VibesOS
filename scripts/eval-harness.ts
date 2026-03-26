import { readFileSync, existsSync } from 'fs';
// @ts-ignore
import * as Babel from '@babel/standalone';
import React from 'react';
import { renderToString } from 'react-dom/server';

export interface RecordedOp {
  op:
    | 'readCell'
    | 'readRow'
    | 'readTable'
    | 'readRowIds'
    | 'readSortedRowIds'
    | 'addRow'
    | 'setCell'
    | 'setRow'
    | 'delRow'
    | 'readValue'
    | 'setValue'
    | 'readHasRow'
    | 'readHasCell'
    | 'setCellState'
    | 'setValueState';
  table?: string;
  row?: string;
  cell?: string;
  valueId?: string;
  rowFactory?: () => Record<string, any>;
  cellFactory?: () => any;
  value?: any;
}

export interface DataModelAnalysis {
  aliceOps: RecordedOp[];
  bobOps: RecordedOp[];
  failures: string[];
}

/**
 * Transform JSX source to plain JS using Babel standalone.
 */
function transformJsx(jsx: string): string {
  const result = Babel.transform(jsx, {
    presets: ['react'],
    filename: 'app.jsx',
  });
  return result.code;
}

/**
 * Create recording mock globals for a given user email.
 * Each hook records the call into `ops` and returns a sensible default.
 */
function createRecordingMocks(email: string): { mocks: Record<string, any>; ops: RecordedOp[] } {
  const ops: RecordedOp[] = [];

  const user = {
    email,
    id: email,
    sub: email,
    firstName: email.split('@')[0],
    lastName: 'Test',
    username: email.split('@')[0],
  };

  const mocks: Record<string, any> = {
    // React itself
    React,

    // Standard React hooks (not recorded, just functional)
    useState: (init: any) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: (_fn: any, _deps?: any) => {},
    useCallback: (fn: any, _deps?: any) => fn,
    useMemo: (fn: any, _deps?: any) => fn(),
    useRef: (init?: any) => ({ current: init }),
    useContext: (_ctx: any) => ({}),
    useReducer: (_reducer: any, init: any) => [init, () => {}],
    useLayoutEffect: (_fn: any, _deps?: any) => {},

    // --- TinyBase read hooks (recording) ---

    useApp: () => ({ isReady: true, isSyncing: false, user }),

    useUser: () => ({
      isSignedIn: true,
      isLoaded: true,
      user,
    }),

    useTable: (table: string) => {
      ops.push({ op: 'readTable', table });
      return {};
    },

    useRowIds: (table: string) => {
      ops.push({ op: 'readRowIds', table });
      return ['mock-row-1'];
    },

    useSortedRowIds: (
      table: string,
      _cellId?: string,
      _descending?: boolean,
      _offset?: number,
      _limit?: number
    ) => {
      ops.push({ op: 'readSortedRowIds', table });
      return ['mock-row-1'];
    },

    useCell: (table: string, row: string, cell: string) => {
      ops.push({ op: 'readCell', table, row, cell });
      return '';
    },

    useRow: (table: string, row: string) => {
      ops.push({ op: 'readRow', table, row });
      return {};
    },

    useHasRow: (table: string, row: string) => {
      ops.push({ op: 'readHasRow', table, row });
      return false;
    },

    useHasCell: (table: string, row: string, cell: string) => {
      ops.push({ op: 'readHasCell', table, row, cell });
      return false;
    },

    useValue: (valueId: string) => {
      ops.push({ op: 'readValue', valueId });
      return undefined;
    },

    useValues: () => ({}),

    // State-returning hooks (recording setter calls)

    useValueState: (valueId: string) => {
      const setter = (val: any) => {
        ops.push({ op: 'setValueState', valueId, value: val });
      };
      return [undefined, setter];
    },

    useCellState: (table: string, row: string, cell: string) => {
      const setter = (val: any) => {
        ops.push({ op: 'setCellState', table, row, cell, value: val });
      };
      return ['', setter];
    },

    // --- TinyBase write hooks (recording, return noop) ---

    useAddRowCallback: (table: string, fn?: (...args: any[]) => Record<string, any>, _deps?: any) => {
      // Capture the factory so callers can invoke it later
      const rowFactory = fn
        ? (...args: any[]) => fn(...args)
        : () => ({});
      ops.push({ op: 'addRow', table, rowFactory });
      return () => {};
    },

    useSetCellCallback: (
      table: string,
      row: string,
      cell: string,
      fn?: (...args: any[]) => any,
      _deps?: any
    ) => {
      const cellFactory = fn ? (...args: any[]) => fn(...args) : () => undefined;
      ops.push({ op: 'setCell', table, row, cell, cellFactory });
      return () => {};
    },

    useSetRowCallback: (table: string, row: string, _fn?: any, _deps?: any) => {
      ops.push({ op: 'setRow', table, row });
      return () => {};
    },

    useDelRowCallback: (table: string, row: string, _fn?: any, _deps?: any) => {
      ops.push({ op: 'delRow', table, row });
      return () => {};
    },

    useSetValueCallback: (valueId: string, _fn?: any, _deps?: any) => {
      ops.push({ op: 'setValue', valueId });
      return () => {};
    },

    useDelValueCallback: (_valueId: string, _fn?: any, _deps?: any) => () => {},

    // Other globals apps may reference
    useOIDCContext: () => ({ user, isAuthenticated: true }),

    store: {
      setCell: () => {},
      setRow: () => {},
      setTable: () => {},
      delRow: () => {},
      delCell: () => {},
      getCell: () => '',
      getRow: () => ({}),
      getTable: () => ({}),
      getRowIds: () => [],
    },
  };

  return { mocks, ops };
}

/**
 * Build and render a React component from transpiled JS code
 * using injected mock globals. Returns rendered HTML string.
 */
function renderWithMocks(jsCode: string, mocks: Record<string, any>): string {
  const paramNames = Object.keys(mocks);
  const paramValues = paramNames.map((k) => mocks[k]);

  const wrappedCode = `
${jsCode}

if (typeof App !== 'undefined') return App;
throw new Error('No App component found');
`;

  const factory = new Function(...paramNames, wrappedCode);
  const AppComponent: React.ComponentType = factory(...paramValues);

  return renderToString(React.createElement(AppComponent));
}

/**
 * Main entry point: render with Alice and Bob recording mocks,
 * collect all recorded ops, return analysis.
 */
export function analyzeDataModel(jsxOrPath: string): DataModelAnalysis {
  // Load code from file if it's a path
  const jsx =
    !jsxOrPath.includes('\n') && existsSync(jsxOrPath)
      ? readFileSync(jsxOrPath, 'utf8')
      : jsxOrPath;

  // Step 1: Babel transform
  let jsCode: string;
  try {
    jsCode = transformJsx(jsx);
  } catch (err: any) {
    return {
      aliceOps: [],
      bobOps: [],
      failures: [`Babel transform failed: ${err.message}`],
    };
  }

  const failures: string[] = [];

  // Step 2: Render as Alice
  const { mocks: aliceMocks, ops: aliceOps } = createRecordingMocks('alice@test.com');
  try {
    renderWithMocks(jsCode, aliceMocks);
  } catch (err: any) {
    failures.push(`Alice render failed: ${err.message}`);
  }

  // Step 3: Render as Bob
  const { mocks: bobMocks, ops: bobOps } = createRecordingMocks('bob@test.com');
  try {
    renderWithMocks(jsCode, bobMocks);
  } catch (err: any) {
    failures.push(`Bob render failed: ${err.message}`);
  }

  return { aliceOps, bobOps, failures };
}

// CLI entry point
if (import.meta.main) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: bun scripts/eval-harness.ts <app.jsx>');
    process.exit(1);
  }
  const result = analyzeDataModel(filePath);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.failures.length === 0 ? 0 : 1);
}
