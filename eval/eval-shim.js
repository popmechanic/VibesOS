// eval/eval-shim.js
//
// Eval-mode useUser() mock — replaces OIDC-based identity with URL param.
// Injected by assemble.js --eval-mode, which strips the OIDC import block.
//
// Usage: Load page with ?testUser=alice@test.com
// useUser() returns { email: "alice@test.com", sub: "eval-alice", ... }

(function() {
  const params = new URLSearchParams(window.location.search);
  const testEmail = params.get('testUser') || 'anonymous@eval.test';
  const testName = testEmail.split('@')[0];

  const userObj = {
    email: testEmail,
    id: 'eval-' + testName,
    sub: 'eval-' + testName,
    firstName: testName.charAt(0).toUpperCase() + testName.slice(1),
    lastName: 'Eval',
    username: testName,
    imageUrl: null,
    groups: [],
  };

  window.useUser = function useUser() {
    return {
      isSignedIn: true,
      isLoaded: true,
      user: userObj,
    };
  };

  window.useOIDCContext = function useOIDCContext() {
    return {
      user: userObj,
      isAuthenticated: true,
      dashApi: null,
    };
  };

  // Set a fake OIDC token so the template's sync code doesn't bail
  // (private apps check sessionStorage for vibes_oidc_access_token before connecting)
  sessionStorage.setItem('vibes_oidc_access_token', 'eval-fake-token');

  // Stub OIDC components so any template code referencing them doesn't crash
  const Passthrough = (props) => props.children;
  window.OIDCProvider = Passthrough;
  window.SignedIn = Passthrough;
  window.SignedOut = () => null;
  window.SignInButton = () => null;
  window.UserButton = () => null;
  window.OIDCComponents = {
    OIDCProvider: Passthrough,
    SignedIn: Passthrough,
    SignedOut: () => null,
    SignInButton: () => null,
    UserButton: () => null,
  };
})();
