var { existsSync, readFileSync, readdirSync } = require('fs')
var { join } = require('path')
var tape = require('tape')
var fsPlug = require('./index')
var rimraf = require('rimraf')

tape('file sharing', function (t) {
  var orig = __filename
  var dest = orig + '_copy'

  var a = fsPlug({ strict: false })
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: orig,
      localPath: dest
    }

    b.consume(conf, function (err) {
      if (err) {
        a.close()
        t.end(err)
      }
      a.close()

      t.ok(existsSync(dest), 'file shared')
      t.same(readFileSync(dest), readFileSync(orig), 'identical files')
      t.is(a.supplied, 1, 'a should have supplied 1 file')
      t.is(b.consumed, 1, 'b should have consumed 1 file')

      rimraf(dest, t.end)
    })
  })
})

tape('dir sharing', function (t) {
  var orig = join(__dirname, 'node_modules')
  var dest = orig + '_copy'

  var a = fsPlug({ strict: false })
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'directory',
      remotePath: orig,
      localPath: dest
    }

    b.consume(conf, function (err) {
      if (err) {
        a.close()
        t.end(err)
      }
      a.close()

      t.ok(existsSync(dest), 'directory shared')
      t.same(readdirSync(dest), readdirSync(orig), 'identical dirs')
      t.is(a.supplied, 1, 'a should have supplied 1 dir')
      t.is(b.consumed, 1, 'b should have consumed 1 dir')

      rimraf(dest, t.end)
    })
  })
})

tape('consume error on wrong remotePath', function (t) {
  var orig = 'non_existing_file'
  var dest = orig + '_copy'

  var a = fsPlug({ strict: false })
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: orig,
      localPath: dest
    }

    b.consume(conf, function (err) {
      a.close()

      t.ok(err, 'expecting a consume timeout error')

      t.end()
    })
  })
})

tape('in strict mode only whitelisted files are shared', function (t) {
  var orig = __filename
  var dest = orig + '_copy'

  var a = fsPlug({ strict: true })
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: orig,
      localPath: dest
    }

    b.consume(conf, function (err) {
      a.close()

      t.ok(err, 'expecting an error')

      t.end()
    })
  })
})

tape('only packing specific entries in a directory', function (t) {
  var orig = join(__dirname, 'node_modules')
  var dest = orig + '_copy'

  var a = fsPlug({ strict: false })
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'directory',
      remotePath: orig,
      localPath: dest,
      only: [ './tape' ]
    }

    b.consume(conf, function (err) {
      if (err) {
        a.close()
        t.end(err)
      }
      a.close()

      var entries = readdirSync(dest).filter(function (entry) {
        return !entry.startsWith('.')
      })

      t.ok(entries.length === 1 && entries[0] === 'tape', 'only contains tape')

      rimraf(dest, t.end)
    })
  })
})
