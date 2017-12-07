var fs = require('fs')
var path = require('path')
var tape = require('tape')
var fsPlug = require('./index')

var selfie = __filename
var dope = selfie + ' yea!'
var stash = path.join(__dirname, 'node_modules')
var dopedir = stash + ' yea!'
var bad = selfie.substr(0, 5)

tape.onFinish(function () {
  fs.unlink(dope, function (err) {
    if (err) return console.error(err)
  })
})

tape('file sharing', function (t) {

  var a = fsPlug()
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {

    b.consume(10000, '127.0.0.1', 'file', selfie, dope, function (err) {
      if (err) t.end(err)

      t.ok(fs.existsSync(dope), 'file shared')
      t.same(fs.readFileSync(selfie), fs.readFileSync(dope), 'identical files')
      t.is(a.supplied, 1, 'a should have supplied 1 file')
      t.is(b.consumed, 1, 'b should have consumed 1 file')

      a.close()
      t.end()
    })

  })

})

tape('dir sharing', function (t) {

  var a = fsPlug()
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {

    b.consume(10000, '127.0.0.1', 'directory', stash, dopedir, function (err) {
      if (err) t.end(err)

      a.close()

      t.ok(fs.existsSync(dopedir), 'directory shared')
      t.same(fs.readdirSync(stash), fs.readdirSync(dopedir), 'identical dirs')
      t.is(a.supplied, 1, 'a should have supplied 1 dir')
      t.is(b.consumed, 1, 'b should have consumed 1 dir')

      t.end()
    })

  })

})

tape('exceptions', function (t) {

  t.plan(1)

  var a = fsPlug()
  var b = fsPlug()

  a.listen(10000, '127.0.0.1', function () {

    b.consume(10000, '127.0.0.1', 'file', bad, dope, function (err) {

      a.close()

      t.ok(err, 'expecting a consume timeout error')

    })

  })

})
