const encoder = new TextEncoder()
const decoder = new TextDecoder()
;(async function(context) {
  console.log("attemping to listen")
  const server = await browser.TCPSocket.listen({ port: 8090 })
  console.log("listening on :8090")
  await (async function(server) {
    for await (const client of server.connections) {
      console.log("CONNECTION", client)
      while (true) {
        var msg = decoder.decode(await client.read())
        console.log("RECV", msg)
        await client.write(encoder.encode(msg.toUpperCase()).buffer)
      }
    }
    console.log("server stopped")
  })(server)
})(window)
