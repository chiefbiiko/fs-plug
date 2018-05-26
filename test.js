var fs = require('fs')
var path = require('path')
var del = require('del')
var tape = require('tape')
var fsPlug = require('./index')

var selfie = __filename
var dope = selfie + ' yea!'
var coke = selfie + ' yay!'
var stash = path.join(__dirname, 'node_modules')
var dopedir = stash + '_yea!'
var bad = selfie.substr(0, 5)
var only = stash + '_only_tape'

tape.onFinish(function () {
  del.sync([ dope, coke, only ])
})

tape('file sharing', function (t) {
  var a = fsPlug({ strict: false })
  var b = fsPlug()
  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: selfie,
      localPath: dope
    }
    b.consume(conf, function (err) {
      if (err) t.end(err)
      a.close()
      t.ok(fs.existsSync(dope), 'file shared')
      t.same(fs.readFileSync(selfie), fs.readFileSync(dope), 'identical files')
      t.is(a.supplied, 1, 'a should have supplied 1 file')
      t.is(b.consumed, 1, 'b should have consumed 1 file')
      t.end()
    })
  })
})

tape('dir sharing', function (t) {
  var a = fsPlug({ strict: false })
  var b = fsPlug()
  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'directory',
      remotePath: stash,
      localPath: dopedir
    }
    b.consume(conf, function (err) {
      if (err) t.end(err)
      a.close()
      t.ok(fs.existsSync(dopedir), 'directory shared')
      t.same(fs.readdirSync(stash), fs.readdirSync(dopedir), 'identical dirs')
      t.is(a.supplied, 1, 'a should have supplied 1 dir')
      t.is(b.consumed, 1, 'b should have consumed 1 dir')
      del.sync([ dopedir ])
      t.end()
    })
  })
})

tape('exceptions', function (t) {
  t.plan(1)
  var a = fsPlug({ strict: false })
  var b = fsPlug()
  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: bad,
      localPath: dope
    }
    b.consume(conf, function (err) {
      a.close()
      t.ok(err, 'expecting a consume timeout error')
    })
  })
})

tape('in strict mode only whitelisted files are shared', function (t) {
  t.plan(1)
  var a = fsPlug({ strict: true })
  var b = fsPlug()
  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'file',
      remotePath: selfie,
      localPath: coke
    }
    b.consume(conf, function (err) {
      a.close()
      t.ok(err, 'expecting a consume timeout error')
    })
  })
})

tape('events emit bytes written/read', function (t) {
  t.plan(1)
  var a = fsPlug({ strict: false })
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
      remotePath: selfie,
      localPath: coke
    }
    b.consume(conf, function (err) {
      if (err) t.end(err)
      a.close()
      t.same(logA, logB, 'written and read num bytes should be the same')
    })
  })
})

tape('only', function (t) {
  t.plan(1)
  var a = fsPlug({ strict: false })
  var b = fsPlug()
  a.listen(10000, '127.0.0.1', function () {
    var conf = {
      port: 10000,
      host: 'localhost',
      type: 'directory',
      remotePath: stash,
      localPath: only,
      only: [ './tape' ]
    }
    b.consume(conf, function (err) {
      a.close()
      fs.readdir(only, function (err, entries) {
        if (err) t.end(err)
        entries = entries.filter(function (entry) {
          return !entry.startsWith('.')
        })
        var ok = entries.length === 1 && entries[0] === 'tape'
        t.ok(ok, 'should only contain tape')
      })
    })
  })
})
