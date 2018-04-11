var fs = require('fs')
var net = require('net')
var util = require('util')
var zlib = require('zlib')
var tar = require('tar-fs')
var pump = require('pump')
var lpstream = require('length-prefixed-stream')
var debug = require('debug')('fs-plug')
//var relDirChild = require('./../rel-dir-child')
var { isAbsolute, sep } = require('path')

// TODO: send imports on diet, emit socket ids with those byte counts

function noop () {}

function stat (entry, opts, cb) {
  opts.dereference ? fs.stat(entry, cb) : fs.lstat(entry, cb)
}

function Plug (opts, onconsumer) {
  if (!(this instanceof Plug)) return new Plug(opts, onconsumer)
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

  self.on('connection', function onconnection (socket) {
    var lpdecoder = lpstream.decode()
    pump(socket, lpdecoder)
    lpdecoder.on('data', function oncedata (buf) {
      var preflight
      try {
        preflight = JSON.parse(buf.toString())
      } catch (err) {
        return onconsumer(err)
      }
      if (self._opts.strict && !self._whitelist.has(preflight.path)) {
        return onconsumer(Error('request for non-whitelisted resource'))
      }
      stat(preflight.path, self._opts, function onstat (err, stats) {
        if (err) return onconsumer(err)
        var readStream
        if (stats.isDirectory() && preflight.only) {
          readStream = tar.pack(preflight.path, { entries: preflight.only })
        } else if (stats.isDirectory()) {
          readStream = tar.pack(preflight.path)
        } else if (stats.isFile()) {
          readStream = fs.createReadStream(preflight.path)
        } else {
          return onconsumer(Error('request for unsupported resource'))
        }
        var gzip = zlib.createGzip()
        gzip.on('readable', function () {
          self.emit('bytes-supplied', socket.bytesWritten)
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

util.inherits(Plug, net.Server)

Plug.prototype.consume = function consume (conf, cb) {
  if (!cb) cb = noop
  var self = this
  var socket = net.connect(conf.port, conf.host, function onconnect () {
    var lpencoder = lpstream.encode()
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
      writeStream = fs.createWriteStream(writeTarget)
      socket.on('readable', function () {
        self.emit('bytes-consumed', socket.bytesRead)
      })
      pump(socket, zlib.createGunzip(), writeStream, function (err) {
        debug('pumpd socket -> gunzip -> file::', err, writeTarget)
        if (err) return cb(err)
        self._consumed++
        if (conf.type === 'file') {
          cb(null, conf.localPath)
        } else {
          var tarStream = fs.createReadStream(conf.localPath + '.tar')
          pump(tarStream, tar.extract(conf.localPath), function (err) {
            debug('pumpd tarstream -> tar.extract::', err, conf.localPath)
            if (err) return cb(err)
            fs.unlink(conf.localPath + '.tar', function (err) {
              if (err) return cb(err)
              cb(null, conf.localPath)
            })
          })
        }
      })
      setTimeout(function () {
        if (!socket.bytesRead) socket.destroy(Error('consume timeout'))
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
