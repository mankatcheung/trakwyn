// The integration tier's test environment: React Native's, plus a copy of the
// Web APIs Node itself provides, taken before anything has had a chance to
// replace them.
//
// jest-expo's setup ends with `require('expo/src/winter')`, which installs
// Expo's own fetch/Headers/Response over Node's — and stubs out the native
// module underneath them, so under Jest every response comes back with an
// undefined status and an undefined body. That is the right call for the unit
// and component tiers, which mock the transport and must never reach the
// network by accident. This tier exists to reach it, so it keeps the originals.
//
// A test environment is the only hook that runs before setupFiles, which is
// why this is a whole environment rather than one more setup file.
const ReactNativeEnv = require(require('jest-expo/jest-preset').testEnvironment);

const NODE_GLOBALS = ['fetch', 'Headers', 'Request', 'Response', 'FormData'];

module.exports = class NodeFetchEnvironment extends ReactNativeEnv {
  async setup() {
    await super.setup();
    // Taken from the Jest process's own globals rather than the sandbox's:
    // by the time an environment is set up, the sandbox copy has already been
    // replaced, while the parent still holds Node's originals.
    this.global.__nodeGlobals = Object.fromEntries(
      NODE_GLOBALS.map((name) => [name, globalThis[name]]),
    );
  }
};
