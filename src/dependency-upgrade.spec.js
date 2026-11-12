import { describe, expect, it } from 'vitest'
import globals from 'globals'
import viteConfig from '../vite.config.js'

describe('dependency integration', () => {
  it('configures React and Tailwind plugins for Vite', () => {
    const config = viteConfig({ mode: 'production', command: 'build' })
    const pluginNames = config.plugins
      .flat(Infinity)
      .map((plugin) => plugin?.name)
      .filter((name) => typeof name === 'string')
      .map((name) => name.toLowerCase())

    expect(config.base).toBe('/')
    expect(pluginNames.some((name) => name.includes('react'))).toBe(true)
    expect(pluginNames.some((name) => name.includes('tailwind'))).toBe(true)
  })

  it('provides browser globals used by the ESLint config', () => {
    expect(globals.browser.window).toBeDefined()
    expect(globals.browser.document).toBeDefined()
  })
})
