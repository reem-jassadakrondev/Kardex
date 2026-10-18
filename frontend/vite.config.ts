import { transformAsync } from '@babel/core'
import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

/** Browser targets shared by Babel, plugin-legacy and postcss-preset-env ("browserslist" in package.json). */
const targets: string[] = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).browserslist

/**
 * plugin-legacy bundles core-js with rolldown, whose CommonJS wrapper uses arrow functions — a syntax
 * error on iOS 9 that would stop every polyfill from loading. Lower that chunk to ES5 once more.
 */
function es5PolyfillChunk(): Plugin {
  return {
    name: 'kardex:es5-polyfill-chunk',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk' || !file.fileName.includes('polyfills-legacy')) continue
        const result = await transformAsync(file.code, {
          babelrc: false,
          configFile: false,
          sourceType: 'script',
          compact: true,
          comments: false,
          presets: [['@babel/preset-env', { targets, modules: false }]],
        })
        if (result?.code) file.code = result.code
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Old iPads/Android must work. Only legacy (ES5 + core-js polyfills, loaded via SystemJS) chunks
    // are emitted: iOS 11–13 support <script type="module"> but not newer syntax, so a separate
    // modern bundle would break exactly those devices.
    legacy({ targets, renderModernChunks: false }),
    es5PolyfillChunk(),
  ],
  build: {
    // Vite 8's default (oxc) minifier rewrites the ES5 legacy output with ES2015 syntax (template
    // literals); terser keeps it ES5.
    minify: 'terser',
    // Keep the CSS minifier from emitting syntax old Safari can't parse (e.g. #rrggbbaa colors).
    cssTarget: ['safari9', 'chrome49'],
  },
  server: {
    // The app calls /api/v1 on its own origin; in dev forward that to the local backend.
    proxy: { '/api': process.env.KARDEX_API_PROXY ?? 'http://localhost:8000' },
  },
})
