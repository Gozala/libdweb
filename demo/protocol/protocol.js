browser.protocol.registerProtocol("dweb", request => {
  switch (request.url) {
    case "dweb://stream/": {
      return {
        contentType: "text/html",
        content: (async function*() {
          const encoder = new TextEncoder("utf-8")
          yield encoder.encode("<h1>Say Hi to endless stream!</h1>\n").buffer
          let n = 0
          while (true) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            yield encoder.encode(`<p>Chunk #${++n}<p>`).buffer
          }
        })()
      }
    }
    case "dweb://text/": {
      return {
        content: (async function*() {
          const encoder = new TextEncoder("utf-8")
          yield encoder.encode("Just a plain text").buffer
        })()
      }
    }
    case "dweb://html/": {
      return {
        content: (async function*() {
          const encoder = new TextEncoder("utf-8")
          yield encoder.encode("<h1>HTML</h1>").buffer
          yield encoder.encode("<p>ContentType was inferred as HTML").buffer
        })()
      }
    }
    case "dweb://api/": {
      return {
        content: (async function*() {
          const encoder = new TextEncoder("utf-8")
          yield encoder.encode("<h1>API</h1>").buffer
          yield encoder.encode(
            `<iframe src="moz-extension://3aaeb329-ec20-0846-aa43-aa00a2d393e6/api.html" sandbox></iframe>`
          ).buffer
        })()
      }
    }
    default: {
      return {
        contentType: "text/html",
        content: (async function*() {
          const encoder = new TextEncoder("utf-8")
          yield encoder.encode("<h1>Hi there!</h1>\n").buffer
          yield encoder.encode(
            `<p>You've succesfully loaded <strong>${request.url}</strong><p>`
          ).buffer
        })()
      }
    }
  }
})
