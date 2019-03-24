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
var a = plug({ enforceWhitelist: true }) // default
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

### `var plug = fsPlug([opts][, onconsumer(err, mypath)])`

Create a new plug. Options default to:

``` js
{
  dereference: false, // follow symlinks when looking up requested files?
  enforceWhitelist: true, // only serve files if they have been whitelisted before?
  timeout: 500 // max number of ms to wait for initial bytes when consuming
  passphrase: undefined // if buffer or string require this passphrase for every request
  whitelist: undefined // string[] seed the plug's whitelist with these file paths
}
```

`onconsumer` will be called every time a file or directory has been supplied to a consumer or in case of an error during that process.

### `plug.consume(conf, callback(err, localPath))`

Consume from another plug.

`conf` must be an object with the following properties:

``` js
{
  port: number,
  host: string,
  type: string, // either 'file' or 'directory'
  remotePath: string, // absolute filepath on serving machine
  localPath: string // local filepath for consumed file
  passphrase: string // sesameopen
}
```

### `plug.whitelist(filepath)`

Whitelist a file or directory on your machine to be shared with requesting consumers. Whitelisting is not required if a plug has been instantiated with `!opts.enforceWhitelist`.

### `plug.blacklist(filepath)`

Disallow sharing a resource if the plug has been instantiated with `opts.enforceWhitelist`.

### `plug.enforceWhitelist(bool)`

Toggle requiring a whitelist check by passing a boolean.

### `plug.clearWhitelist()`

Clear the plug's whitelist.

### `plug.setPassphrase(passphrase)`

Set or reset the passphrase for authorizing inbound requests. `passphrase` msut be a `Buffer` or `string`.

### `plug.supplied`

Read-only property indicating the number of files and directories supplied.

### `plug.consumed`

Read-only property indicating the number of files and directories consumed.

### `plug.on('bytes-supplied', callback(socketid, num))`

Emitted while writing to a socket. `num` is the number of bytes supplied through the socket indicated by `socketid`.

### `plug.on('bytes-consumed', callback(socketid, num))`

Emitted while consuming from a socket. `num` is the number of bytes consumed so far through the socket indicated by `socketid`.

***

## License

[MIT](./license.md)
