#!/usr/bin/env node
'use strict'

// Everything below the version check is ES2022 in ES modules. This file is not:
// it is ES5 in CommonJS, because it has to parse and run on the Node that is
// the problem in order to say so. `engines` does not do this job — npm installs
// a package whose Node requirement is unmet and prints a warning nobody reads —
// and Node 16 has no global `fetch`, so without this the first request fails
// with `fetch is not defined`, which reaches an agent as a Wave outage rather
// than as a Node version.
var REQUIRED_MAJOR = 20
var found = process.versions.node
var major = parseInt(found, 10)

if (major >= REQUIRED_MAJOR) {
  import('../dist/index.js').then(
    function (module) {
      return module.run(process.argv.slice(2))
    },
    function (error) {
      fail(error && error.message ? error.message : String(error))
    }
  ).then(
    function (code) {
      if (typeof code === 'number') process.exitCode = code
    },
    function (error) {
      fail(error && error.message ? error.message : String(error))
    }
  )
} else {
  fail(
    'needs Node ' + REQUIRED_MAJOR + ' or later, and this is Node ' + found + '.\n' +
    'Install Node ' + REQUIRED_MAJOR + ' or later, then run `npm i -g @david-sling/wave` again.'
  )
}

// `process.exit` can cut a write to a pipe short. Setting the code and letting
// the process end on its own gets the message out.
function fail(message) {
  process.stderr.write('wave: ' + message + '\n')
  process.exitCode = 1
}
