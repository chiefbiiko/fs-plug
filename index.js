var { createReadStream, createWriteStream, lstat, stat } = require('fs')
var { connect, Server } = require('net')
var { inherits } = require('util')
var { createGzip, createGunzip } = require('zlib')
var { extract, pack } = require('tar-fs')
var pump = require('pump')
var rimraf = require('rimraf')
var timingSafeEqual = require('crypto').timingSafeEqual

var ERR = {
  BLACKLISTED_RESOURCE: Error('request for non-whitelisted resource'),
  UNSUPPORTED_RESOURCE: Error('request for unsupported resource'),
  UNAUTHORIZED: Error('unathorized access attempt'),
  TIMEOUT: Error('consume timeout')
}

function noop () {}

function xstat (entry, opts, cb) {
  opts.dereference ? stat(entry, cb) : lstat(entry, cb)
}

function Plug (opts, onconsumer) {
  if (!(this instanceof Plug)) return new Plug(opts, onconsumer)
  Server.call(this)

  if (typeof opts === 'function') {
    onconsumer = opts
    opts = {}
  }

  if (!opts) opts = {}
  if (!onconsumer) onconsumer = noop

  this._opts = opts
  this._opts.timeout = opts.timeout || 500
  this._opts.checkWhitelist = opts.checkWhitelist !== false
  this._opts.passphrase = typeof opts.passphrase === 'string' || Buffer.isBuffer(opts.passphrase)
    ? Buffer.from(opts.passphrase) : null

  this._supplied = 0
  this._consumed = 0
  this._whitelist = new Set()

  var self = this

  self.on('connection', function (socket) {
    socket.once('data', function (buf) {
      var preflight
      try {
        preflight = JSON.parse(buf)
      } catch (err) {
        socket.destroy()
        return onconsumer(err)
      }

      if (self._opts.passphrase) {
        var pass = Buffer.from(preflight.passphrase)
        if (pass.length !== self._opts.passphrase.length ||
            !timingSafeEqual(pass, self._opts.passphrase)) {
          socket.destroy()
          return onconsumer(ERR.UNAUTHORIZED)  
        }
      }

      if (self._opts.checkWhitelist && !self._whitelist.has(preflight.path)) {
        socket.destroy()
        return onconsumer(ERR.BLACKLISTED_RESOURCE)
      }

      xstat(preflight.path, self._opts, function (err, stats) {
        if (err) {
          socket.destroy()
          return onconsumer(err)
        }

        var readStream
        if (stats.isDirectory() && preflight.only) {
          readStream = pack(preflight.path, { entries: preflight.only })
        } else if (stats.isDirectory()) {
          readStream = pack(preflight.path)
        } else if (stats.isFile()) {
          readStream = createReadStream(preflight.path)
        } else {
          return onconsumer(ERR.UNSUPPORTED_RESOURCE)
        }

        var interval = setInterval(function () {
          self.emit('bytes-supplied', socket.bytesWritten)
        }, 250)

        pump(readStream, createGzip(), socket, function (err) {
          clearInterval(interval)
          if (err) return onconsumer(err)
          self._supplied++
          onconsumer(null, preflight.path)
        })
      })
    })
  })
}

inherits(Plug, Server)

Plug.prototype.consume = function (conf, cb) {
  var self = this
  var preflight = {
    path: conf.remotePath,
    only: conf.only,
    passphrase: conf.passphrase
  }

  if (!cb) cb = noop

  var socket = connect(conf.port, conf.host, function () {
    socket.write(JSON.stringify(preflight), function () {
      var dump = conf.type === 'file'
        ? createWriteStream(conf.localPath) : extract(conf.localPath)

      socket.once('readable', function () {
        var interval = setInterval(function () {
          self.emit('bytes-consumed', dump.bytesWritten)
        }, 250)

        pump(socket, createGunzip(), dump, function (err) {
          clearInterval(interval)
          if (err) return cb(err)
          self._consumed++
          cb(null, conf.localPath)
        })

        setTimeout(function () {
          if (!socket.bytesRead) {
            socket.destroy(ERR.TIMEOUT)
            rimraf(conf.localPath, noop)
          }
        }, self._opts.timeout)
      })
    })
  })
}

Plug.prototype.whitelist = function (filepath) {
  return this._whitelist.add(filepath)
}

Plug.prototype.blacklist = function (filepath) {
  return this._whitelist.delete(filepath)
}

Plug.prototype.checkWhitelist = function (v) {
  this._opts.checkWhitelist = !!v
}

Plug.prototype.setPassphrase = function (passphrase) {
  if (typeof passphrase === 'string' || Buffer.isBuffer(passphrase)) {
    this._opts.passphrase = Buffer.from(passphrase)  
  }
}

Plug.prototype.__defineGetter__('supplied', function () {
  return this._supplied
})

Plug.prototype.__defineGetter__('consumed', function () {
  return this._consumed
})

module.exports = Plug
