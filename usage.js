var fsPlug = require('.')

// alice and bob on two different computers
var a = fsPlug()
var b = fsPlug()

// alice allows file to be consumed by peers requesting it
a.whitelist(__filename)

// listen for connections
a.listen(10000, function () {
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