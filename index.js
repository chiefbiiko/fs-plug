var fs = require('fs')
var net = require('net')
var zlib = require('zlib')
var tar = require('tar-fs')
var pump = require('pump')
var inherits = require('util').inherits

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

  this.supplied = 0
  this.consumed = 0
  this._opts = opts

  var self = this

  this.on('connection', function (socket) {
    socket.on('data', function (buf) {
      var filepath = buf.toString()
      stat(filepath, opts, function (err, stats) {
        if (err) return onconsumer(err)

        var readStream
        if (stats.isDirectory()) readStream = tar.pack(filepath)
        else if (stats.isFile()) readStream = fs.createReadStream(filepath)
        else return onconsumer('unsupported resource')

        var gzip = zlib.createGzip()
        pump(readStream, gzip, socket, function (err) {
          if (err) return onconsumer(err)
          self.supplied++
          onconsumer(null, filepath)
        })

        gzip.on('data', function (_) {
          self.emit('bytes-supplied', socket.bytesWritten)
        })

      })
    })
  })

}

inherits(FilePlug, net.Server)

function _consume (port, host, type, filepath, mypath, callback) {
  if (!callback) callback = noop
  var self = this
  var socket = net.connect(port, host, function () {
    socket.write(filepath, function () {
      var writeStream =
        fs.createWriteStream(type === 'file' ? mypath : mypath + '.tar')
      pump(socket, zlib.createGunzip(), writeStream, function (err) {
        if (err) return callback(err)
        self.consumed++
        if (type === 'file') {
          callback(null, mypath)
        } else {
          var tarStream = fs.createReadStream(mypath + '.tar')
          pump(tarStream, tar.extract(mypath), function (err) {
            if (err) return callback(err)
            fs.unlink(mypath + '.tar', function (err) {
              if (err) return callback(err)
              callback(null, mypath)
            })
          })
        }
      })
      socket.on('data', function (_) {
        self.emit('bytes-consumed', socket.bytesRead)
      })
      setTimeout(function () {
        if (!socket.bytesRead) socket.destroy('consume timeout')
      }, self._opts.timeout || 500)
    })
  })
  return socket
}

FilePlug.prototype.consume = _consume

module.exports = FilePlug
