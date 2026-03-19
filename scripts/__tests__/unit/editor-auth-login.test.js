import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/cli-auth.js', () => ({
  startLoginFlow: vi.fn(),
  readCachedTokens: vi.fn(),
  isTokenExpired: vi.fn(),
  getAccessToken: vi.fn(),
  removeCachedTokens: vi.fn(),
}));

vi.mock('../../lib/auth-constants.js', () => ({
  OIDC_AUTHORITY: 'https://test-authority.example.com',
  OIDC_CLIENT_ID: 'test-client-id',
}));

// Mock broadcast so we can verify WebSocket messages
const mockBroadcast = vi.fn();
vi.mock('../../server/ws.ts', () => ({
  broadcast: (...args) => mockBroadcast(...args),
}));

import { startLoginFlow } from '../../lib/cli-auth.js';
import { editorAuthLogin } from '../../server/router.ts';

describe('editorAuthLogin', () => {
  let ctx;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = {};
  });

  it('calls startLoginFlow and returns authorizeUrl', async () => {
    const tokenPromise = Promise.resolve({
      accessToken: 'tok',
      idToken: 'eyJhbGciOiJSUzI1NiJ9.eyJuYW1lIjoiTWFyY3VzIn0.fake',
    });
    startLoginFlow.mockResolvedValue({
      authorizeUrl: 'https://test-authority.example.com/authorize?...',
      tokenPromise,
    });

    const response = await editorAuthLogin(ctx);

    expect(startLoginFlow).toHaveBeenCalledWith({
      authority: 'https://test-authority.example.com',
      clientId: 'test-client-id',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.authorizeUrl).toContain('https://test-authority.example.com');
  });

  it('broadcasts auth_complete after token resolves', async () => {
    const tokenPromise = Promise.resolve({
      accessToken: 'tok',
      idToken: 'eyJhbGciOiJSUzI1NiJ9.eyJuYW1lIjoiTWFyY3VzIn0.fake',
    });
    startLoginFlow.mockResolvedValue({
      authorizeUrl: 'https://test-authority.example.com/authorize',
      tokenPromise,
    });

    await editorAuthLogin(ctx);
    // Wait for the background tokenPromise to resolve
    await tokenPromise;
    // Allow microtasks to flush
    await new Promise(r => setTimeout(r, 10));

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth_complete' })
    );
  });

  it('returns 500 on startLoginFlow failure', async () => {
    startLoginFlow.mockRejectedValue(new Error('Could not start server'));

    const response = await editorAuthLogin(ctx);

    expect(response.status).toBe(500);
  });
});
