# fs-plug

[![build status](http://img.shields.io/travis/chiefbiiko/fs-plug.svg?style=flat)](http://travis-ci.org/chiefbiiko/fs-plug) [![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/github/chiefbiiko/fs-plug?branch=master&svg=true)](https://ci.appveyor.com/project/chiefbiiko/fs-plug)

***

A TCP server that listens for own filepaths and streams out its indicated file or directory. Got a method to consume from such peers. And a simple access control mechanism.

***

## Get it!

```
npm install --save fs-plug
```

***

## Usage

``` js
var plug = require('fs-plug')

// alice and bob on two different computers
var a = plug({ strict: true }) // default
var b = plug()

// alice allows file to be consumed by peers requesting it
a.whitelist(__filename)

// listen for connections
a.listen(10000, 'localhost', function () {
  // bobs consume config
  var conf = {
    port: 10000,
    host: 'localhost',
    type: 'file',
    remotePath: __filename,
    localPath: __filename + '_copy'
  }
  // bob consuming from alice
  b.consume(conf, function (err, localPath) {
    if (err) return console.error(err)
    console.log('file saved as:', localPath)
    a.close()
  })
})
```

***

## API

### `var plug = fsPlug([opts][, onconsumer])`

Create a new plug. Options default to:

``` js
{
  dereference: false, // follow symlinks when looking up requested files?
  strict: true, // only serve files if they have been whitelisted before?
  timeout: 500 // max number of ms to wait for initial bytes when consuming
}
```

The callback has the signature `onconsumer(err, mypath)` and will be called every time a file or directory has been supplied to a consumer.

### `plug.consume(conf, callback)`

Consume from another plug. Provide `conf.port` and `conf.host` to address the peer. `conf.type` must be either `'file'` or `'directory'`. `conf.remotePath` is the absolute filepath of the requested resource on the serving machine. `conf.localPath` is the filepath to which the requested resource will be written on the requesting machine. 
The callback will be called once the resource has been consumed.

### `plug.whitelist(filepath)`

Whitelist a file or directory on your machine to be shared with requesting consumers. Whitelisting is not required if a plug has been instantiated with `!opts.strict`.

### `plug.blacklist(filepath)`

Disallow sharing a resource if the plug has been instantiated with `opts.strict`.

### `plug.supplied`

Read-only property indicating the number of files and directories supplied.

### `plug.consumed`

Read-only property indicating the number of files and directories consumed.

### `plug.on('bytes-supplied', callback)`

Emitted every time a buffer is about to be written to a consuming socket. The callback has the signature `callback(num)`. `num` is the number of bytes supplied through an active socket.

### `plug.on('bytes-consumed', callback)`

Emitted every time a buffer is about to be consumed from an inbound socket. The callback has the signature `callback(num)`. `num` is the number of bytes consumed so far through an active socket.

***

## License

[MIT](./license.md)
