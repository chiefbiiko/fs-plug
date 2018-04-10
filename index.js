var fs = require('fs')
var net = require('net')
var util = require('util')
var zlib = require('zlib')
var tar = require('tar-fs')
var pump = require('pump')
var lpstream = require('length-prefixed-stream')

// TODO: 2 conf obj, length-prefix stream, initially send dirpath opt with onlies

function noop () {}

function stat (entry, opts, cb) {
  opts.dereference ? fs.stat(entry, cb) : fs.lstat(entry, cb)
}

function FilePlug (opts, onconsumer) {
  if (!(this instanceof FilePlug)) return new FilePlug(opts, onconsumer)
  net.Server.call(this)

  if (typeof opts === 'function') {
    onconsumer = opts
    opts = {}
  }

  if (!opts) opts = {}
  if (!onconsumer) onconsumer = noop

  this._opts = opts
  this._opts.timeout = opts.timeout || 500
  this._opts.strict = opts.strict !== false

  this._supplied = 0
  this._consumed = 0
  this._whitelist = new Set()

  var self = this

  this.on('connection', function (socket) {
    var decoder = lpstream.decode()
    pump(socket, decoder)
    // socket.on('data', function (buf) {
    decoder.on('data', function (buf) {
      // var filepath = buf.toString()
      var preflight
      try {
        preflight = JSON.parse(buf.toString())
      } catch (err) {
        return onconsumer(err)
      }

      // refactor 2 allow
      if (self._opts.strict && !self._whitelist.has(preflight.path)) {
        return onconsumer('illegal request 4 non-whitelisted resource')
      }

      // stat(filepath, self._opts, function (err, stats) {
      stat(preflight.path, self._opts, function (err, stats) {
        if (err) return onconsumer(err)

        var readStream
        if (stats.isDirectory() && preflight.only) {
          readStream = tar.pack(preflight.path, { entries: preflight.only })
        } else if (stats.isDirectory()) {
          readStream = tar.pack(preflight.path)
        } else if (stats.isFile()) {
          readStream = fs.createReadStream(preflight.path)
        } else {
          return onconsumer('unsupported resource')
        }

        var gzip = zlib.createGzip()
        pump(readStream, gzip, socket, function (err) {
          if (err) return onconsumer(err)
          self._supplied++
          onconsumer(null, preflight.path)
        })

        gzip.on('readable', function () {
          self.emit('bytes-supplied', socket.bytesWritten)
        })

      })

    })
  })

}

util.inherits(FilePlug, net.Server)

FilePlug.prototype.__defineGetter__('supplied', function () {
  return this._supplied
})

FilePlug.prototype.__defineGetter__('consumed', function () {
  return this._consumed
})

// function consume (port, host, type, filepath, mypath, callback) {
function consume (conf, callback) {
  if (!callback) callback = noop
  var self = this

  // var socket = net.connect(port, host, function () {
  var socket = net.connect(conf.port, conf.host, function () {
    var encoder = lpstream.encode()
    pump(encoder, socket)
    // socket.write(filepath, function () {
    var preflight = JSON.stringify({
      path: conf.filepath,
      only: conf.type === 'file' ? null : conf.only
    })
    // encoder.write(conf.filepath, function () {
    encoder.write(preflight, function () {

      var target = conf.type === 'file' ? conf.mypath : conf.mypath + '.tar'
      var writeStream =
        // fs.createWriteStream(type === 'file' ? mypath : mypath + '.tar')
        fs.createWriteStream(target)

      pump(socket, zlib.createGunzip(), writeStream, function (err) {
        if (err) return callback(err)
        self._consumed++
        if (conf.type === 'file') {
          callback(null, conf.mypath)
        } else {
          var tarStream = fs.createReadStream(conf.mypath + '.tar')
          pump(tarStream, tar.extract(conf.mypath), function (err) {
            if (err) return callback(err)
            fs.unlink(conf.mypath + '.tar', function (err) {
              if (err) return callback(err)
              callback(null, conf.mypath)
            })
          })
        }
      })

      socket.on('readable', function () {
        self.emit('bytes-consumed', socket.bytesRead)
      })

      setTimeout(function () {
        if (!socket.bytesRead) socket.destroy('consume timeout')
      }, self._opts.timeout)

    })
  })
}

FilePlug.prototype.consume = consume

FilePlug.prototype.whitelist = function whitelist (filepath) {
  return this._whitelist.add(filepath)
}

FilePlug.prototype.blacklist = function blacklist (filepath) {
  return this._whitelist.delete(filepath)
}

module.exports = FilePlug