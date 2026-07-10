import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

export function sites() {
  let root = process.cwd()

  return {
    name: 'codex-sites-package',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    async closeBundle() {
      const outputDirectory = resolve(root, 'dist')
      const metadataDirectory = resolve(outputDirectory, '.openai')
      const serverDirectory = resolve(outputDirectory, 'server')

      await rm(metadataDirectory, { recursive: true, force: true })
      await mkdir(metadataDirectory, { recursive: true })
      await mkdir(serverDirectory, { recursive: true })
      await cp(resolve(root, '.openai', 'hosting.json'), resolve(metadataDirectory, 'hosting.json'))
      await cp(resolve(root, 'worker', 'index.js'), resolve(serverDirectory, 'index.js'))
    },
  }
}
