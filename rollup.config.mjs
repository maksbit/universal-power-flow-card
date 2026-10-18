import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import { readFileSync } from 'node:fs';

const isWatch = process.env.ROLLUP_WATCH === 'true';
const licenseBanner = `/*!\n${readFileSync('./LICENSE', 'utf8')}\n*/`;

const plugins = [
  nodeResolve({
    jsnext: true,
    main: true,
    extensions: ['.mjs', '.js', '.json', '.node', '.ts'],
  }),
  commonjs(),
  json(),
  babel({
    exclude: 'node_modules/**',
    babelHelpers: 'bundled',
    compact: true,
    extensions: ['.js', '.ts'],
    presets: [
      '@babel/preset-typescript',
      [
        '@babel/env',
        {
          modules: false,
          targets: '> 2.5%, not dead',
        },
      ],
    ],
    plugins: [
      [
        '@babel/plugin-proposal-decorators',
        {
          legacy: true,
        },
      ],
      ['@babel/plugin-proposal-class-properties'],
      ['@babel/plugin-transform-template-literals'],
    ],
  }),
  // Only minify in non-watch (build) mode for better dev experience
  !isWatch && terser(),
].filter(Boolean);

export default {
  input: ['./src/universal/card.ts'],
  output: {
    file: 'dist/universal-power-flow-card.js',
    format: 'esm',
    name: 'UniversalPowerFlowCard',
    banner: licenseBanner,
    inlineDynamicImports: true,
    sourcemap: true,
  },
  watch: {
    clearScreen: false,
  },
  plugins: [...plugins],
  onwarn: function (warning, handler) {
    if (warning.code === 'THIS_IS_UNDEFINED') {
      return;
    }

    // console.warn everything else
    handler(warning);
  },
};
