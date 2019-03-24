var { createReadStream, createWriteStream, lstat, stat } = require("fs")
var { createGzip, createGunzip } = require("zlib")
var { timingSafeEqual } = require("crypto")
var { connect, Server } = require("net")
var { inherits } = require("util")
var { extract, pack } = require("tar-fs")
var pump = require("pump")
var rimraf = require("rimraf")

var ERR = {
  BLACKLISTED_RESOURCE: Error("request for non-whitelisted resource"),
  UNSUPPORTED_RESOURCE: Error("request for unsupported resource"),
  UNAUTHORIZED: Error("unathorized access attempt"),
  TIMEOUT: Error("consume timeout"),
  NULL: Error("zero bytes consumed")
}

function noop() {}

function xstat(entry, opts, cb) {
  opts.dereference ? stat(entry, cb) : lstat(entry, cb)
}

function Plug(opts, onconsumer) {
  if (!(this instanceof Plug)) return new Plug(opts, onconsumer)
  Server.call(this)

  if (typeof opts === "function") {
    onconsumer = opts
    opts = {}
  }

  if (!opts) opts = {}
  if (!onconsumer) onconsumer = noop

  this._opts = opts
  this._opts.dereference = !!opts.dereference
  this._opts.timeout = typeof opts.timeout === "number" ? opts.timeout : 500
  this._opts.enforceWhitelist = opts.enforceWhitelist !== false
  this._opts.passphrase =
    typeof opts.passphrase === "string" || Buffer.isBuffer(opts.passphrase)
      ? Buffer.from(opts.passphrase)
      : null

  this._supplied = 0
  this._consumed = 0
  this._whitelist = new Set(opts.whitelist)

  Object.defineProperty(this, "supplied", {
    get() {
      return this._supplied
    },
    set(count) {
      this._supplied = count
    }
  })

  Object.defineProperty(this, "consumed", {
    get() {
      return this._consumed
    },
    set(count) {
      this._consumed = count
    }
  })

  var self = this

  self.on("connection", function(socket) {
    socket.once("data", function(buf) {
      try {
        var preflight = JSON.parse(buf)
      } catch (err) {
        socket.destroy()
        return onconsumer(err)
      }

      if (self._opts.passphrase) {
        if (
          typeof preflight.passphrase !== "string" ||
          preflight.passphrase.length !== self._opts.passphrase.length
        ) {
          socket.destroy()
          return onconsumer(ERR.UNAUTHORIZED)
        }

        if (
          !timingSafeEqual(
            Buffer.from(preflight.passphrase),
            self._opts.passphrase
          )
        ) {
          socket.destroy()
          return onconsumer(ERR.UNAUTHORIZED)
        }
      }

      if (self._opts.enforceWhitelist && !self._whitelist.has(preflight.path)) {
        socket.destroy()
        return onconsumer(ERR.BLACKLISTED_RESOURCE)
      }

      xstat(preflight.path, self._opts, function(err, stats) {
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

        var interval = setInterval(function() {
          self.emit("bytes-supplied", socket.bytesWritten)
        }, 250)

        pump(readStream, createGzip(), socket, function(err) {
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

Plug.prototype.consume = function(conf, cb) {
  var self = this
  var preflight = {
    path: conf.remotePath,
    only: conf.only,
    passphrase: conf.passphrase
  }

  if (!cb) cb = noop

  var socket = connect(
    conf.port,
    conf.host,
    function() {
      socket.write(JSON.stringify(preflight), function() {
        var dump =
          conf.type === "file"
            ? createWriteStream(conf.localPath)
            : extract(conf.localPath)

        socket.once("readable", function() {
          var interval = setInterval(function() {
            self.emit("bytes-consumed", dump.bytesWritten)
          }, 250)

          pump(socket, createGunzip(), dump, function(err) {
            clearInterval(interval)
            if (err) return cb(err)
            if (!socket.bytesRead) return cb(ERR.NULL)
            self._consumed++
            cb(null, conf.localPath)
          })

          setTimeout(function() {
            if (!socket.bytesRead) {
              clearInterval(interval)
              socket.destroy(ERR.TIMEOUT)
              rimraf(conf.localPath, noop)
            }
          }, self._opts.timeout)
        })
      })
    }
  )
}

Plug.prototype.whitelist = function(filepath) {
  return this._whitelist.add(filepath)
}

Plug.prototype.blacklist = function(filepath) {
  return this._whitelist.delete(filepath)
}

Plug.prototype.enforceWhitelist = function(v) {
  this._opts.enforceWhitelist = !!v
}

Plug.prototype.clearWhitelist = function() {
  this._whitelist.clear()
}

Plug.prototype.setPassphrase = function(passphrase) {
  if (typeof passphrase === "string" || Buffer.isBuffer(passphrase)) {
    this._opts.passphrase = Buffer.from(passphrase)
  }
}

module.exports = Plug
