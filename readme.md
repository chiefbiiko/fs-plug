# fs-plug

[![build status](http://img.shields.io/travis/chiefbiiko/fs-plug.svg?style=flat)](http://travis-ci.org/chiefbiiko/fs-plug) [![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/github/chiefbiiko/fs-plug?branch=master&svg=true)](https://ci.appveyor.com/project/chiefbiiko/fs-plug)

***

A TCP server that listens for own filepaths and just streams out its indicated file or directory. Got a method to consume from such ports.

***

## Get it!

```
npm install --save fs-plug
```

***

## Usage

``` js
var fsPlug = require('fs-plug')

var a = fsPlug()
var b = fsPlug()

var file = __filename
var copy = __filename + ' - copy'

// allow file to be consumed by peers requesting it
a.whitelist(file)

// listen for connections
a.listen(10000, function () {
  // consume from a
  b.consume(10000, 'localhost', 'file', file, copy, function (err, mypath) {
    if (err) return console.error(err)
    console.log('file saved as:', mypath)
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

### `plug.consume(port, host, type, filepath, mypath, callback)`

Consume from another plug. `type` must be either `file` or `directory`. `filepath` is the absolute filepath of the requested resource on the serving machine. `mypath` is the filepath to which the requested resource will be written on the requesting machine. The callback will be called once the resource has been consumed.

### `plug.whitelist(filepath)`

Whitelist a file or directory on your machine to be shared with requesting consumers. Whitelisting is not required if a plug has been instantiated with `!opts.strict`.

### `plug.blacklist(filepath)`

Disallow sharing a resource if the plug has been instantiated with `opts.strict`.

### `plug.supplied`

Read-only property indicating the number of files and directories supplied.

### `plug.consumed`

Read-only property indicating the number of files and directories consumed.

### `plug.on('bytes-supplied', callback)`

Emitted every time a buffer is about to be written to a consuming socket. The callback has the signature `callback(num)`. `num` is the number of bytes supplied so far.

### `plug.on('bytes-consumed', callback)`

Emitted every time a buffer is about to be consumed from a inbound socket. The callback has the signature `callback(num)`. `num` is the number of bytes consumed so far.

***

## License

[MIT](./license.md)
