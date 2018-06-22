"use strict"

var hypercore = require("hypercore")
var RandomAccessIDBFile = require("./random-access-idb-file")

const main = async options => {
  const volume = await RandomAccessIDBFile.mount(options)
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
