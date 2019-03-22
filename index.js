var { createReadStream, createWriteStream, lstat, stat } = require('fs')
var { connect, Server } = require('net')
var { inherits } = require('util')
var { createGzip, createGunzip } = require('zlib')
var { isAbsolute, sep } = require('path')
var { extract, pack } = require('tar-fs')
var pump = require('pump')
var rimraf = require('rimraf')

var ERR = {
  BLACKLISTED_RESOURCE: Error('request for non-whitelisted resource'),
  UNSUPPORTED_RESOURCE: Error('request for unsupported resource'),
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
  this._opts.strict = opts.strict !== false

  this._supplied = 0
  this._consumed = 0
  this._whitelist = new Set()

  var self = this

  self.on('connection', function (socket) {
    socket.once('data', function (buf) {
      var preflight
      try {
        preflight = JSON.parse(buf.toString())
      } catch (err) {
        return onconsumer(err)
      }

      if (self._opts.strict && !self._whitelist.has(preflight.path)) {
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

        pump(readStream, createGzip(), socket, function (err) {
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
  var preflight = { path: conf.remotePath, only: null }

  if (!cb) cb = noop

  if (conf.only) {
    preflight.only = conf.only.map(function (filepath) {
      if (!isAbsolute(filepath)) return filepath
      else return filepath.replace(preflight.path + sep, '')
    })
  }

  var socket = connect(conf.port, conf.host, function () {
    socket.write(JSON.stringify(preflight), function () {
      var writeTarget
      var writeStream

      if (conf.type === 'directory') writeTarget = conf.localPath + '.tar'
      else writeTarget = conf.localPath

      writeStream = createWriteStream(writeTarget)

      socket.once('readable', function () {
        pump(socket, createGunzip(), writeStream, function (err) {
          if (err) return cb(err)
          self._consumed++

          if (conf.type === 'file') {
            cb(null, conf.localPath)
          } else {
            var tarball = conf.localPath + '.tar'
            pump(createReadStream(tarball), extract(conf.localPath), function (err) {
              if (err) return cb(err)
              rimraf(tarball, function (err) {
                if (err) return cb(err)
                cb(null, conf.localPath)
              })
            })
          }
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

Plug.prototype.__defineGetter__('supplied', function () {
  return this._supplied
})

Plug.prototype.__defineGetter__('consumed', function () {
  return this._consumed
})

module.exports = Plug
