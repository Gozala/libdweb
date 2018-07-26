// @noflow

const { test } = browser.test

test("API", test => {
  test.ok(typeof browser.TCPSocket === "object", "TCPSocket API available")
  test.ok(
    typeof browser.TCPSocket.listen === "function",
    "TCPSocket.listen is a function"
  )
  test.ok(
    typeof browser.TCPSocket.connect === "function",
    "TCPSocket.connect is a function"
  )
})

test("server instance", async test => {
  const server = await browser.TCPSocket.listen({ port: 8090 })
  test.equal(
    server.localPort,
    8090,
    "requested port was assigned to server socket"
  )
  test.ok(typeof server.close === "function", "server socket has close method")
  test.ok(server.closed instanceof Promise, "server is an instance of Promise")

  server.close()
  await server.closed
})

test("server / client exchange", async test => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const server = await browser.TCPSocket.listen({ port: 8090 })

  const serve = (async server => {
    for await (const client of server.connections) {
      test.equal(client.readyState, "open", "readyState")
      test.equal(client.host, "127.0.0.1")
      test.equal(typeof client.port, "number")
      test.equal(client.ssl, false)
      test.equal(client.bufferedAmount, 0)
      test.ok(client.opened instanceof Promise)
      test.ok(client.closed instanceof Promise)
      test.ok(typeof client.write === "function", "socket.write is function")
      test.ok(typeof client.read === "function", "socket.read is function")
      test.ok(
        typeof client.suspend === "function",
        "socket.suspend is a function"
      )
      test.ok(
        typeof client.resume === "function",
        "socket.resume is a function"
      )
      test.ok(typeof client.close === "function", "socket.close is a function")
      test.ok(
        typeof client.closeImmediately === "function",
        "socket.closeImmediately is a function"
      )

      const message = await client.read()
      test.equal(
        decoder.decode(message),
        "Hello TCP",
        "server received message"
      )
      await client.write(
        encoder.encode(`<echo>${decoder.decode(message)}</echo>`).buffer
      )
    }
  })(server)

  const client = await browser.TCPSocket.connect({
    host: "localhost",
    port: 8090
  })

  test.equal(client.readyState, "connecting", "readyState")
  await client.opened
  test.equal(client.host, "localhost")
  test.equal(client.port, 8090)
  test.equal(client.ssl, false)
  test.equal(client.bufferedAmount, 0)
  test.ok(client.opened instanceof Promise)
  test.ok(client.closed instanceof Promise)
  test.ok(typeof client.write === "function", "socket.write is function")
  test.ok(typeof client.read === "function", "socket.read is function")
  test.ok(typeof client.suspend === "function", "socket.suspend is a function")
  test.ok(typeof client.resume === "function", "socket.resume is a function")
  test.ok(typeof client.close === "function", "socket.close is a function")
  test.ok(
    typeof client.closeImmediately === "function",
    "socket.closeImmediately is a function"
  )

  client.write(encoder.encode("Hello TCP").buffer)
  const response = await client.read()
  test.equal(decoder.decode(response), "<echo>Hello TCP</echo>", "received")
  client.close()

  server.close()

  await serve

  test.pass("stopped receiving connections")
})
