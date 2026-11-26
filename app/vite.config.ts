import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { inlineScripts, scriptHash } from './server/csp-hash.mjs'
import { buildSimulator } from './src/expert/build-simulator.mjs'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

function expertScriptHashes(): Plugin {
  return {
    name: 'expert-script-hashes',
    apply: 'build',
    generateBundle() {
      const simulator = buildSimulator(source('./src/expert/simulator.html'), JSON.parse(source('./src/expert/download.json')).version, source('./src/expert/demo-market.mjs'))
      this.emitFile({ type: 'asset', fileName: 'csp-hashes.json', source: JSON.stringify(inlineScripts(simulator).map(scriptHash)) })
    },
  }
}

export default defineConfig({
  plugins: [react(), expertScriptHashes()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3001' } },
})
