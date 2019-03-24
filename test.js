var { existsSync, readFileSync, readdirSync } = require('fs')
var { join } = require('path')
var tape = require('tape')
var fsPlug = require('./index')
var rimraf = require('rimraf')

tape('file sharing', function (t) {
  var orig = __filename
  var dest = orig + '_copy'

  var a = fsPlug({ checkWhitelist: false })
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
      if (err) t.end(err)

      t.ok(existsSync(dest), 'file shared')
      t.same(readFileSync(dest), readFileSync(orig), 'identical files')
      t.is(a.supplied, 1, 'a has supplied 1 file')
      t.is(b.consumed, 1, 'b has consumed 1 file')

      rimraf(dest, t.end)
    })
  })
})

tape('dir sharing', function (t) {
  var orig = join(__dirname, 'node_modules')
  var dest = orig + '_copy'

  var a = fsPlug({ checkWhitelist: false })
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
      a.close()
      if (err) t.end(err)

      t.ok(existsSync(dest), 'directory shared')
      t.same(readdirSync(dest), readdirSync(orig), 'identical dirs')
      t.is(a.supplied, 1, 'a has supplied 1 dir')
      t.is(b.consumed, 1, 'b has consumed 1 dir')

      rimraf(dest, t.end)
    })
  })
})

tape('consume error on wrong remotePath', function (t) {
  var orig = 'non_existing_file'
  var dest = orig + '_copy'

  var a = fsPlug({ checkWhitelist: false })
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

tape('in checkWhitelist mode only whitelisted files are shared', function (t) {
  var orig = __filename
  var dest = orig + '_copy'

  var a = fsPlug({ checkWhitelist: true })
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

tape('emits bytes-supplied, bytes-consumed', function (t) {
  var orig = __filename
  var dest = orig + '_copy'

  var a = fsPlug({ checkWhitelist: false })
  var b = fsPlug()

  var logA = []
  var logB = []

  a.on('bytes-supplied', function (to, bytes) {
    logA.push(bytes)
  })
  b.on('bytes-consumed', function (from, bytes) {
    logB.push(bytes)
  })

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
      if (err) t.end(err)
      
      t.same(logA, logB, 'written and read num bytes are the same')
      
      rimraf(dest, t.end)
    })
  })
})

tape('only packing specific entries in a directory', function (t) {
  var orig = join(__dirname, 'node_modules')
  var dest = orig + '_copy'

  var a = fsPlug({ checkWhitelist: false })
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
      a.close()
      if (err) t.end(err)

      var entries = readdirSync(dest).filter(function (entry) {
        return !entry.startsWith('.')
      })

      t.ok(entries.length === 1 && entries[0] === 'tape', 'only contains tape')

      rimraf(dest, t.end)
    })
  })
})

tape('wrong passphrase', function (t) {
  var orig = __filename
  var dest = orig + '_copy'

  var a = fsPlug({ passphrase: 'sesameopen' })
  var b = fsPlug()

  a.whitelist(orig)

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: orig,
      localPath: dest,
      passphrase: 'forgot'
    }

    b.consume(conf, function (err) {
      a.close()

      t.ok(err, 'expecting an error')

      t.end()
    })
  })
})

tape('correct passphrase', function (t) {
  var orig = __filename
  var dest = orig + '_copy'
  
  var passphrase = 'sesameopen'

  var a = fsPlug({ passphrase })
  var b = fsPlug()

  a.whitelist(orig)

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: orig,
      localPath: dest,
      passphrase
    }

    b.consume(conf, function (err) {
      a.close()
      if (err) t.end(err)

      t.ok(existsSync(dest), 'file shared')
      t.same(readFileSync(dest), readFileSync(orig), 'identical files')
      t.is(a.supplied, 1, 'a has supplied 1 file')
      t.is(b.consumed, 1, 'b has consumed 1 file')

      rimraf(dest, t.end)
    })
  })
})

tape('resetting passphrase', function (t) {
  var orig = __filename
  var dest = orig + '_copy'
  
  var passphrase = 'sesameopen'

  var a = fsPlug({ passphrase: 'typo' })
  var b = fsPlug()

  a.whitelist(orig)
  a.setPassphrase(passphrase)

  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: orig,
      localPath: dest,
      passphrase
    }

    b.consume(conf, function (err) {
      a.close()
      if (err) t.end(err)

      t.ok(existsSync(dest), 'file shared')
      t.same(readFileSync(dest), readFileSync(orig), 'identical files')
      t.is(a.supplied, 1, 'a has supplied 1 file')
      t.is(b.consumed, 1, 'b has consumed 1 file')

      rimraf(dest, t.end)
    })
  })
})
