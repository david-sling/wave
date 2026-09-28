#!/usr/bin/env node
'use strict'

// ES5 CommonJS on purpose: it has to run on an old Node to say that Node is too old.
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

// process.exit can cut a piped write short; setting exitCode lets the message out.
function fail(message) {
  process.stderr.write('wave: ' + message + '\n')
  process.exitCode = 1
}
