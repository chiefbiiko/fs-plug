var { createReadStream, createWriteStream, lstat, stat, unlink } = require('fs')
var { connect, Server } = require('net')
var { inherits } = require('util')
var { createGzip, createGunzip } = require('zlib')
var { isAbsolute, sep } = require('path')
var { encode, decode } = require('length-prefixed-stream')
var { extract, pack } = require('tar-fs')
var pump = require('pump')

var ERR = {
  BLK_RES: Error('request for non-whitelisted resource'),
  UNS_RES: Error('request for unsupported resource'),
  TIMEOUT: Error('consume timeout')
}

function noop () {}

function chiefstat (entry, opts, cb) {
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

  self.on('connection', function onconnection (socket) {
    var lpdecoder = decode()
    pump(socket, lpdecoder)
    lpdecoder.once('data', function oncedata (buf) {
      var preflight
      try {
        preflight = JSON.parse(buf.toString())
      } catch (err) {
        return onconsumer(err)
      }
      if (self._opts.strict && !self._whitelist.has(preflight.path)) {
        return onconsumer(ERR.BLK_RES)
      }
      chiefstat(preflight.path, self._opts, function onstat (err, stats) {
        if (err) return onconsumer(err)
        var readStream
        if (stats.isDirectory() && preflight.only) {
          readStream = pack(preflight.path, { entries: preflight.only })
        } else if (stats.isDirectory()) {
          readStream = pack(preflight.path)
        } else if (stats.isFile()) {
          readStream = createReadStream(preflight.path)
        } else {
          return onconsumer(ERR.UNS_RES)
        }
        var gzip = createGzip()
        gzip.on('readable', function () {
          var to = socket.remoteAddress + ':' + socket.remotePort
          self.emit('bytes-supplied', to, socket.bytesWritten)
        })
        pump(readStream, gzip, socket, function (err) {
          if (err) return onconsumer(err)
          self._supplied++
          onconsumer(null, preflight.path)
        })
      })
    })
  })
}

inherits(Plug, Server)

Plug.prototype.consume = function consume (conf, cb) {
  if (!cb) cb = noop
  var self = this
  var socket = connect(conf.port, conf.host, function onconnect () {
    var lpencoder = encode()
    pump(lpencoder, socket)
    var preflight = { path: conf.remotePath, only: null }
    if (conf.only) {
      preflight.only = conf.only.map(function (filepath) {
        if (!isAbsolute(filepath)) return filepath
        else return filepath.replace(preflight.path + sep, '')
      })
    }
    lpencoder.write(JSON.stringify(preflight), function inflight () {
      var writeTarget, writeStream
      if (conf.type === 'directory') writeTarget = conf.localPath + '.tar'
      else writeTarget = conf.localPath
      writeStream = createWriteStream(writeTarget)
      socket.on('readable', function () {
        var from = socket.remoteAddress + ':' + socket.remotePort
        self.emit('bytes-consumed', from, socket.bytesRead)
      })
      pump(socket, createGunzip(), writeStream, function (err) {
        if (err) return cb(err)
        self._consumed++
        if (conf.type === 'file') {
          cb(null, conf.localPath)
        } else {
          var tarStream = createReadStream(conf.localPath + '.tar')
          pump(tarStream, extract(conf.localPath), function (err) {
            if (err) return cb(err)
            unlink(conf.localPath + '.tar', function (err) {
              if (err) return cb(err)
              cb(null, conf.localPath)
            })
          })
        }
      })
      setTimeout(function () {
        if (!socket.bytesRead) socket.destroy(ERR.TIMEOUT)
      }, self._opts.timeout)
    })
  })
}

Plug.prototype.whitelist = function whitelist (filepath) {
  return this._whitelist.add(filepath)
}

Plug.prototype.blacklist = function blacklist (filepath) {
  return this._whitelist.delete(filepath)
}

Plug.prototype.__defineGetter__('supplied', function supplied () {
  return this._supplied
})

Plug.prototype.__defineGetter__('consumed', function consumed () {
  return this._consumed
})

module.exports = Plug
