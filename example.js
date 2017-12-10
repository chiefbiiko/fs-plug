var fsPlug = require('.')

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
