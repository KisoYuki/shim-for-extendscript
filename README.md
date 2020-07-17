# @kisoyuki/shim-for-extendscript
This is a npm module that compiles es6 code into extendscript.

## Install
``` sh
# add github repository to registry
npm config set @kisoyuki:registry=https://npm.pkg.github.com/
npm install --save-dev @kisoyuki/shim-for-extendscript
```

## Usage
### Command line
```sh
npx shim-for-extendscript [input file or dir] { Optitons }

# examples below
# compile script
npx shim-for-extendscript src/test.jsx --out-file dist/test.jsx

# watch directory
npx shim-for-extendscript src --out-dir dist --watch
```

#### Options
```
--out-file, -f   output file path                                     [string]
--out-dir, -d    output directory path                                [string]
--watch, -w      whether to watch files                              [boolean]
--recursive, -r  whether file scan is recursive                      [boolean]
--quiet, -q      whether to omit console log                         [boolean]
--lint, -l       whether to apply lint before compilation            [boolean]
--help           Show help                                           [boolean]
--version        Show version number                                 [boolean]
```

### Node.js API
``` js
const shim = require('shim-for-extendscript')
const promise = shim.compileScript('src/test.jsx', 'dist/test.jsx')
promise.then(console.log).catch(console.error)
```
