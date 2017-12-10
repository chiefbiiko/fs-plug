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

***

## License

[MIT](./license.md)
