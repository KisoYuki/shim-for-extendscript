const fs = require('fs')
const path = require('path')
const ava = require('ava')
const index = require('../index')
const assert = require('assert')

const successCode = 'alert("hello")\n'
const failCode = 'wrongVariable\nnoGoodVariable\n'
const adobeDirectives = '#target illustrator\n#targetEngine main\n'

async function clearDir (dir) {
  try {
    await fs.promises.access(dir)
  } catch {
    await fs.promises.mkdir(dir, { recursive: true })
  }
  const dirStat = await fs.promises.lstat(dir)
  assert(dirStat.isDirectory(), "dir must be directory")

  const dirItems = await fs.promises.readdir(dir)
  for (const item of dirItems) {
    const itemPath = path.join(dir, item)
    const itemStat = await fs.promises.lstat(itemPath)
    if (itemStat.isFile()) {
      await fs.promises.unlink(itemPath)
    } else {
      await fs.promises.rmdir(itemPath, { recursive: true })
    }
  }
}

async function makeFile (filePath, codeArg = null) {
  const code = codeArg || successCode
  const fileHandle = await fs.promises.open(filePath, 'w')
  await fileHandle.writeFile(code)
  await fileHandle.close()
}

async function getPathes (testname, relpath, inputType, outputType) {
  const basename = testname.replace(/ /ug, '_')
  const filename = basename + '.jsx'
  const input = { path: 'test/src/', type: inputType }
  const output = { path: 'test/dist/', type: outputType }
  for (const item of [input, output]) {
    if (item.type === 'file') {
      if (relpath === '') {
        item.path = path.join(item.path, filename)
      } else {
        item.path = path.join(item.path, basename, relpath, filename)
      }
    } else if (item.type === 'dir') {
      if (relpath === '') {
        item.path = path.join(item.path, basename)
      } else {
        item.path = path.join(item.path, basename, relpath)
      }
    } else {
      item.path = null
    }
    if (item.type !== 'code') {
      const dirname = item.type === 'file' ? path.dirname(item.path) : item.path
      await fs.promises.access(dirname).catch(
        () => fs.promises.mkdir(dirname, { recursive: true }))
    }
  }
  const inputFile = inputType === 'file'
    ? input.path : path.join(input.path, filename)
  let outputFile
  if (outputType === 'file') {
    outputFile = output.path
  } else if (outputType === 'dir') {
    outputFile = path.join(output.path, filename)
  }
  return [input.path, output.path, inputFile, outputFile]
}

async function readyToCompile (
  testname, relpath, inputType, outputType, recursive, lint, code) {
  let [inputPath, outputPath, inputFile, outputFile] = await getPathes(
    testname, relpath, inputType, outputType)
  await makeFile(inputFile, code)
  if (recursive) {
    inputPath = 'test/src'
    outputPath = 'test/dist'
  }
  const shim = new index.ShimForExtendScript(inputPath, {
    outputPath: outputPath,
    outputType: outputType,
    recursive: recursive,
    quiet: true,
    lint: lint
  })
  return [shim, inputFile, outputFile]
}

async function fileContentTest (test, filePath, content) {
  const fileHandle = await fs.promises.open(filePath, 'r')
  const data = await fileHandle.readFile()
  test.true(data.toString().indexOf(content) > -1)
  await fileHandle.close()
}

async function testCompileScript (test, inputType, outputType, content) {
  const [inputFile, outputFile] = await getPathes(
    test.title, '', inputType, outputType)
  await makeFile(inputFile, content)
  const code = await index.compileScript(inputFile, outputFile)
  if (outputType === 'code') {
    return code
  } else {
    await fs.promises.access(outputFile)
    test.pass()
    return outputFile
  }
}

async function testLintAndCompilePromises (test, promises, outputFile, content) {
  const lintObjs = await Promise.all(promises.lintPromises)
  if (lintObjs.every(lintObj => lintObj.errorCount === 0)) {
    await Promise.all(promises.compilePromises)
    await fs.promises.access(outputFile)
    test.pass()
    if (content) {
      await fileContentTest(test, outputFile, content)
    }
  } else {
    test.true(promises.compilePromises.length === 0)
  }
}

async function testCompileOnce (
  test, relpath, inputType, outputType, recursive, lint, code) {
  const [shim, , outputFile] = await readyToCompile(
    test.title, relpath, inputType, outputType, recursive, lint, code)
  const promises = await shim.compileOnce()
  await testLintAndCompilePromises(test, promises, outputFile)
}

async function testStartWatch (
  test, relpath, inputType, outputType, recursive, lint, code) {
  const [shim, inputFile, outputFile] = await readyToCompile(
    test.title, relpath, inputType, outputType, recursive, lint, code)
  await shim.startWatch()
  await makeFile(inputFile, 'alert("updated")\n')
  const promises = shim.stopWatch()
  await promises.watchPromise
  await testLintAndCompilePromises(test, promises, outputFile, 'updated')
}

ava.before(async () => {
  await clearDir('test/src')
  await clearDir('test/dist')
})

ava('compile script',
  async test => {
    const code = await testCompileScript(test, 'file', 'code', successCode)
    test.true(code.indexOf('hello') > -1)
  }
)

ava('compile script file to file', test => testCompileScript(test, 'file', 'file'))

ava('adobe preprocessor directives', async test => {
  const outputFile = await testCompileScript(
    test, 'file', 'file', adobeDirectives + successCode)
  await fileContentTest(test, outputFile, '#target')
  await fileContentTest(test, outputFile, '#targetEngine')
})

ava('compile once file to file', test => testCompileOnce(test, '', 'file', 'file'))
ava('compile once file to dir', test => testCompileOnce(test, '', 'file', 'dir'))
ava('compile once dir to dir', test => testCompileOnce(test, '', 'dir', 'dir'))
ava('compile once dir to dir recursively',
  test => testCompileOnce(test, 'parent/child', 'dir', 'dir', true))

ava('watch file', test => testStartWatch(test, '', 'file', 'file'))
ava('watch dir', test => testStartWatch(test, '', 'dir', 'dir'))
ava('watch dir recursively',
  test => testStartWatch(test, 'parent/child', 'dir', 'dir', true))

ava('lint file', async test => {
  const [, , inputFile] = await getPathes(test.title, '', 'file', 'file')
  await makeFile(inputFile, adobeDirectives + failCode)
  const { errorCount } = await index.lintFiles([inputFile])
  test.true(errorCount > 1)
})

ava('lint success and compile once', test =>
  testCompileOnce(test, '', 'file', 'file', false, true))

ava('lint fail and do not compile once', test =>
  testCompileOnce(test, '', 'file', 'file', false, true, failCode))

ava('watch and lint success', test =>
  testStartWatch(test, '', 'file', 'file', false, true))

ava('watch and lint fail', test =>
  testStartWatch(test, '', 'file', 'file', false, true, failCode))
