import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { loadConfigFromFile, loadEnv } from 'vite'

const projectDirectory = fileURLToPath(new URL('../', import.meta.url))
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')
const { scripts } = JSON.parse(packageSource)
const editionSource = await readFile(new URL('../src/utils/edition.ts', import.meta.url), 'utf8')

// Test the checked-in mode defaults rather than an invoking shell's intentional overrides.
const environmentKeys = ['VITE_APP_EDITION', 'VITE_ANGLE_FORMAT']
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]))
for (const key of environmentKeys) delete process.env[key]
after(() => {
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnvironment[key]
  }
})

function modeFor(scriptName, command) {
  const script = scripts[scriptName]
  assert.ok(script, `${scriptName} must exist`)
  assert.match(script, command === 'build' ? /^vite build\b/ : /^vite --host\b/)
  return script.match(/--mode\s+(\S+)/)?.[1] ?? 'development'
}

async function loadEdition(env) {
  const source = editionSource.replaceAll('import.meta.env', JSON.stringify(env))
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

test('all six build commands load the correct actual edition and preserve separate offline output directories', async () => {
  const directories = new Set()
  for (const [suffix, configuredEdition, appEdition, directory] of [
    ['standard', 'standard', 'standard', '地球自转与公转-标准版'],
    ['advanced', 'advanced', 'sundial', '地球自转与公转-进阶日晷版'],
    ['city', 'city', 'city', '地球自转与公转-进阶城市版'],
  ]) {
    // Load decimal first: switching back must not inherit its angle setting.
    for (const decimal of [true, false]) {
      const scriptName = `build:${suffix}${decimal ? ':decimal' : ''}`
      const mode = modeFor(scriptName, 'build')
      const env = loadEnv(mode, projectDirectory)
      assert.equal(env.VITE_APP_EDITION, configuredEdition, scriptName)
      assert.equal(env.VITE_ANGLE_FORMAT, decimal ? 'decimal' : 'dms', scriptName)
      const edition = await loadEdition(env)
      assert.equal(edition.appEdition, appEdition, scriptName)
      assert.equal(edition.isAdvancedEdition, appEdition !== 'standard', scriptName)
      assert.equal(edition.solarSceneObject, appEdition === 'city' ? 'city' : 'sundial', scriptName)

      // Load the production Vite config with its real plugins; do not execute a build.
      const loaded = await loadConfigFromFile({ command: 'build', mode }, configFile, projectDirectory, 'silent')
      assert.ok(loaded, scriptName)
      const { config } = loaded
      const expectedDirectory = `${directory}${decimal ? '-23.5度版' : ''}`
      assert.equal(config.build.outDir, expectedDirectory, scriptName)
      assert.equal(config.base, './', 'offline HTML keeps relative asset paths')
      assert.equal(config.build.rollupOptions.output.format, 'iife', 'offline code does not require module loading')
      assert.ok(config.plugins.flat(Infinity).some(plugin => plugin?.name === 'vite:singlefile'))
      assert.ok(!directories.has(config.build.outDir), 'no edition may overwrite another output')
      directories.add(config.build.outDir)
    }
  }
  assert.equal(directories.size, 6)
})

test('development commands switch angle modes without polluting subsequent original-edition loads', async () => {
  for (const [scriptName, configuredEdition, angleFormat] of [
    ['dev:decimal', 'advanced', 'decimal'],
    ['dev', 'advanced', 'dms'],
    ['dev:standard:decimal', 'standard', 'decimal'],
    ['dev:city', 'city', 'dms'],
    ['dev:city:decimal', 'city', 'decimal'],
    ['dev', 'advanced', 'dms'],
  ]) {
    const env = loadEnv(modeFor(scriptName, 'serve'), projectDirectory)
    assert.equal(env.VITE_APP_EDITION, configuredEdition, scriptName)
    assert.equal(env.VITE_ANGLE_FORMAT, angleFormat, scriptName)
    for (const key of environmentKeys) assert.equal(process.env[key], undefined, `${key} must remain mode-local`)
  }

  const jsonTree = ts.parseJsonText('package.json', packageSource)
  function checkUniqueProperties(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.map(property => property.name.text)
      assert.equal(new Set(names).size, names.length, 'duplicate script or package keys must not hide one another')
    }
    ts.forEachChild(node, checkUniqueProperties)
  }
  checkUniqueProperties(jsonTree)
  for (const mode of ['', 'standard', 'advanced', 'city', 'standard-decimal', 'advanced-decimal', 'city-decimal']) {
    const source = await readFile(new URL(`../.env${mode ? `.${mode}` : ''}`, import.meta.url), 'utf8')
    const keys = [...source.matchAll(/^([A-Z_]+)=/gm)].map(match => match[1])
    assert.equal(keys.length, 2, `${mode || 'default'} must explicitly define edition and angle format once`)
    assert.equal(new Set(keys).size, keys.length)
  }
})
