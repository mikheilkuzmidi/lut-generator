import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

/**
 * `next lint` was removed in Next 16, and the `lint` script still called it, so
 * this project had not been linted by anything for as long as it has been on
 * 16: no eslint, no config, and a script that failed with "Invalid project
 * directory provided, no such directory: ./lint" because npm passes the
 * subcommand through as a path.
 *
 * core-web-vitals rather than the base config, because it promotes the rules
 * that actually cost a reader something to errors. The TypeScript config is
 * layered on top, which is what makes an unused import a finding rather than
 * something only `tsc` would mention.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  // Generated or vendored output. `next-env.d.ts` in particular is written by
  // the build and says so in its own body.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
  ]),
])
