const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const babel = require('@babel/core')
const { ESLint } = require('eslint')

async function readdirRecursively (dir, files = []) {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true })
  const dirs = []
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      dirs.push(path.join(dir, dirent.name))
    }

    if (dirent.isFile()) {
      files.push(path.join(dir, dirent.name))
    }
  }
  let newFiles = files
  for (const newDir of dirs) {
    newFiles = await readdirRecursively(newDir, newFiles)
  }
  return newFiles
}

function retrieveAdobeDirectives (code) {
  const sharpRegex = /#.*/gu
  const adobeDirectives = code.match(sharpRegex)
  const retrieved = code.replace(sharpRegex, '')
  return [adobeDirectives, retrieved]
}

function putBackAdobeDirectives (adobeDirectives, code) {
  if (adobeDirectives && adobeDirectives.length > 0) {
    return adobeDirectives.join('\n') + '\n\n' + code
  } else {
    return code
  }
}

async function compileScript (inputFile, outputFile) {
  const inputHandle = await fs.promises.open(inputFile, 'r')
  const inputRead = await inputHandle.readFile()
  const code = inputRead.toString()
    .replace(/\r/gu, '/n')
  await inputHandle.close()
  const [adobeDirectives, retrieved] = retrieveAdobeDirectives(code)
  const babelOptions = {
    presets: ["extendscript"],
    plugins: [
      "babel-plugin-transform-es3-member-expression-literals",
      "babel-plugin-transform-es5-property-mutators"
    ]
  }
  const data = await babel.transformAsync(retrieved, babelOptions)
  const resultCode = putBackAdobeDirectives(adobeDirectives, data.code)
  if (outputFile) {
    const dirPath = path.dirname(outputFile)
    fs.promises.access(dirPath).catch(
      await fs.promises.mkdir(dirPath, { recursive: true })
    )
    const outputHandle = await fs.promises.open(outputFile, 'w')
    await outputHandle.writeFile(resultCode, { encoding: 'utf-8' })
    await outputHandle.close()
  }
  return resultCode
}

async function lintFiles (files) {
  const baseConfig = {
    env: {
      browser: true,
      commonjs: true,
      es6: true,
      "extendscript/extendscript": true
    },
    extends: ["eslint:recommended"],
    plugins: ["skip-adobe-directives", "extendscript"]
  }
  const eslint = new ESLint({ baseConfig: baseConfig })
  const results = await eslint.lintFiles(files)
  const formatter = await eslint.loadFormatter("stylish")
  const message = formatter.format(results)
  const errorCount = results.reduce((num, result) => num + result.errorCount, 0)
  return { errorCount: errorCount, message: message }
}

class ShimForExtendScript {
  constructor (
    inputPath, { outputPath, outputType, recursive, quiet, lint } = {}) {
    this.inputPath = inputPath
    this.outputPath = outputPath
    this.outputType = outputType
    this.recursive = recursive
    this.quiet = quiet
    this.lint = lint
    this.watcher = null
    this.compilePromises = []
    this.lintPromises = []
  }

  async _setAsyncParams () {
    const inputStat = await fs.promises.lstat(this.inputPath)
    this.inputType = inputStat.isFile() ? 'file' : 'dir'
    this.rootDir = this.inputType === 'dir'
      ? this.inputPath : path.dirname(this.inputPath)
  }

  _calcOutputFile (inputFile) {
    let outputFile
    if (this.outputType === 'dir') {
      const relPath = path.relative(
        path.resolve(this.rootDir), path.resolve(inputFile))
      outputFile = path.join(this.outputPath, relPath)
    } else {
      outputFile = this.outputPath
    }
    return outputFile
  }

  async _wrapCompileScript (inputFile) {
    const that = this
    function addCompilePromise () {
      const outputFile = that._calcOutputFile(inputFile)
      const compilePromise = compileScript(inputFile, outputFile)
      compilePromise
        .then(code => {
          if (!that.quiet) {
            if (outputFile) {
              const today = new Date()
              const curTime = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
              console.log('compiled', inputFile, 'to', outputFile, 'at', curTime)
            } else {
              console.log(code)
            }
          }
          return code
        })
        .catch(error => {
          console.error(error)
        })
      that.compilePromises.push(compilePromise)
    }

    if (!['.js', '.jsx'].includes(path.extname(inputFile))) {
      return
    }

    if (this.lint) {
      const lintPromise = lintFiles([inputFile]).then(lintObj => {
        if (lintObj.errorCount === 0) {
          addCompilePromise()
        } else if (!this.quiet) {
          console.log(lintObj.message)
        }
        return lintObj
      })
      this.lintPromises.push(lintPromise)
    } else {
      addCompilePromise()
    }
  }

  async compileOnce () {
    await this._setAsyncParams()
    let inputFiles
    if (this.inputType === 'file') {
      inputFiles = [this.inputPath]
    } else {
      if (this.recursive) {
        inputFiles = await readdirRecursively(this.inputPath)
      } else {
        inputFiles = await fs.promises.readdir(this.inputPath)
        inputFiles = inputFiles.map(file => path.join(this.rootDir, file))
      }
    }
    for (const inputFile of inputFiles) {
      this._wrapCompileScript(inputFile)
    }
    return {
      compilePromises: this.compilePromises,
      lintPromises: this.lintPromises
    }
  }

  async startWatch () {
    await this._setAsyncParams()
    const that = this
    function _processChangedFile (changedFile, elem) {
      that._wrapCompileScript(changedFile)
    }
    let depth = Infinity
    let watchingComment = 'watching ' + this.inputPath
    if (this.recursive) {
      watchingComment += ' recursively'
    } else {
      depth = 0
    }
    if (!this.quiet) {
      console.log(watchingComment)
    }
    this.watcher = chokidar.watch(this.inputPath, {
      depth, ignoreInitial: true
    })
    this.watcher.on('add', _processChangedFile)
    this.watcher.on('change', _processChangedFile)
    this.watcher.on('error', console.error)
    return new Promise(resolve => {
      that.watcher.on('ready', () => resolve())
    })
  }

  stopWatch () {
    return {
      watchPromise: this.watcher.close(),
      lintPromises: this.lintPromises,
      compilePromises: this.compilePromises
    }
  }
}

module.exports.lintFiles = lintFiles
module.exports.compileScript = compileScript
module.exports.ShimForExtendScript = ShimForExtendScript
