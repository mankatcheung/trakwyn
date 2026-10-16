// Puts Node's own fetch back over Expo's Jest-broken shim, from the copy
// nodeFetchEnvironment.js took before jest-expo's setup ran. Both
// graphql-request and the schema introspection go through this.
// Assignment is not enough: Expo installs each of these as an accessor on
// globalThis, so `globalThis.fetch = ...` is swallowed silently.
//
// And once is not enough either: importing anything from `expo` re-runs the
// install, and the test file's own imports happen after this file's body. So
// this runs again from a root beforeAll — which Jest runs before any hook the
// test file registers — and before each test.
function restoreNodeGlobals(): void {
  const nodeGlobals = (globalThis as unknown as { __nodeGlobals?: Record<string, unknown> })
    .__nodeGlobals;
  for (const [name, value] of Object.entries(nodeGlobals ?? {})) {
    if (value) {
      Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    }
  }
}

restoreNodeGlobals();
beforeAll(restoreNodeGlobals);
beforeEach(restoreNodeGlobals);

// A cold API boot, a registration and a round trip are all slower than any
// component render, and the whole-run testTimeout in jest.config.js is set for
// the fast tiers — this tier raises it for itself.
jest.setTimeout(60_000);

// expo-secure-store is a native module with no implementation under Jest, so
// the integration tier gives it a real one: an in-process map. Everything
// above it — tokenStorage's single-key write, the client's refresh-and-retry,
// AuthContext's restore — then runs its actual code against a real API, which
// is the whole point of this tier. Storage is the one seam it still fakes,
// because a keychain is not something a test runner has.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});
