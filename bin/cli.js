#!/usr/bin/env node

const getSettings = require('./getSettings')
const { ShimForExtendScript } = require('../index.js')

function main () {
  getSettings()
    .then(settings => {
      const shim = new ShimForExtendScript(settings.inputPath, settings)
      if (settings.watch) {
        return shim.startWatch()
      } else {
        return shim.compileOnce()
      }
    })
    .catch(console.error)
}

main()
