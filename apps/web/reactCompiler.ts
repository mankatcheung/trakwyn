import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';

// React Compiler (JEF-610), shared by vite.config.ts and vitest.config.ts so
// dev, the production build and the tests all run the same compiled output.
//
// `infer` compiles every component and hook the compiler can prove safe and
// skips the rest (it does not fail the build). A component it cannot handle
// opts out with a `'use no memo'` directive and a comment saying why.
// Set to `annotation` to compile only functions marked `'use memo'`.
const COMPILATION_MODE: 'infer' | 'annotation' = 'infer';

export const reactCompiler = () =>
  babel({ presets: [reactCompilerPreset({ compilationMode: COMPILATION_MODE })] });
