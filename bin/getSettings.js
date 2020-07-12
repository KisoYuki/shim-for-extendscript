const fs = require('fs')
const assert = require('assert')
const path = require('path')
const yargs = require('yargs')

async function getSettings () {
  const { argv } = yargs
    .option('out-file', {
      alias: 'f',
      describe: 'output file path',
      type: 'string'
    })
    .option('out-dir', {
      alias: 'd',
      describe: 'output directory path',
      type: 'string'
    })
    .option('watch', {
      alias: 'w',
      describe: 'whether to watch files',
      type: 'boolean'
    })
    .option('recursive', {
      alias: 'r',
      describe: 'whether file scan is recursive',
      type: 'boolean'
    })
    .option('quiet', {
      alias: 'q',
      describe: 'whether to omit console log',
      type: 'boolean'
    })
    .option('lint', {
      alias: 'l',
      describe: 'whether to apply lint before compilation',
      type: 'boolean'
    })
    .strict()
  assert(argv._.length > 0, 'input path is required')
  assert(
    argv._.length < 2,
    'too many non-option arguments. use --help to see options')
  const inputPath = argv._[0]
  try {
    await fs.promises.access(inputPath)
  } catch {
    assert(false, 'first argument must be input path which exists')
  }
  const inputStat = await fs.promises.lstat(inputPath)
  const inputIsFile = inputStat.isFile()
  assert(
    !inputIsFile || ['.js', '.jsx'].includes(path.extname(inputPath)),
    'input path\'s extension must be js or jsx if it is file path')
  assert((inputPath !== argv['out-file']) && (inputPath !== argv['out-dir']),
    'input and output should be different')
  assert(!argv['out-file'] || !argv['out-dir'], 'outputs are duplicated')
  assert(
    argv['out-file'] !== '' && argv['out-dir'] !== '',
    'empty path name is not allowed')
  let outputDir
  if (argv['out-file']) {
    outputDir = path.dirname(argv['out-file'])
  } else if (argv['out-dir']) {
    outputDir = argv['out-dir']
  }
  if (outputDir) {
    try {
      await fs.promises.access(outputDir)
    } catch {
      assert(false, 'output directory should exist')
    }
    const outDirStat = await fs.promises.lstat(outputDir)
    assert(outDirStat.isDirectory(), 'output directory should be directory')
  }
  assert(
    inputIsFile || argv['out-dir'],
    'output dir is required if input path is directory')
  assert(
    argv['out-file'] || argv['out-dir'] || !argv.watch,
    'output path is required to watch')
  assert(
    !inputIsFile || !argv.recursive,
    'can\'t scan recursively if input is file')
  let outputPath
  if (argv['out-file']) {
    outputPath = argv['out-file']
  } else if (argv['out-dir']) {
    outputPath = argv['out-dir']
  } else {
    outputPath = null
  }
  let outputType
  if (argv['out-file']) {
    outputType = 'file'
  } else if (argv['out-dir']) {
    outputType = 'dir'
  } else {
    outputType = 'code'
  }
  return {
    inputPath: inputPath,
    outputPath: outputPath,
    outputType: outputType,
    watch: argv.watch || false,
    recursive: argv.recursive || false,
    quiet: argv.quiet,
    lint: argv.lint
  }
}

module.exports = getSettings
