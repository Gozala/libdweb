"use strict"

var hypercore = require("hypercore")
var RandomAccessFile = require("./random-access-file")

const main = async config => {
  const volume = await RandomAccessFile.mount(config)
  var feed = hypercore(volume, { valueEncoding: "json" })

  feed.append({
    hello: "world"
  })

  feed.append({
    hej: "verden"
  })

  feed.append({
    hola: "mundo"
  })

  feed.flush(function() {
    console.log(
      "Appended 3 more blocks, %d in total (%d bytes)\n",
      feed.length,
      feed.byteLength
    )

    feed
      .createReadStream()
      .on("data", console.log.bind(console))
      .on("end", console.log.bind(console, "\n(end)"))
  })
}

main({ debug: false })
