This WebExtension illustrates [libdweb][] protocol API.

The Protocol API allows you to handle custom protocols from your Firefox extension. This is different from the existing [WebExtensions protocol handler API][webextensions protocol_handlers] in that it does not register a website for handling corresponding URLs but rather allows your WebExtension to implement the handler.

The following example implements a simple `dweb://` protocol. When firefox is navigated to `dweb://hello/world`, for example, it will invoke your registered handler and pass it a `request` object containing request URL as `request.url` string property. Your handler is expected to return a repsonse with a `content` that is [async iterator][] of [`ArrayBuffer`][]s. In our example we use a `respond` [async generator][] function to respond with some HTML markup.

```js
browser.protocol.registerProtocol("dweb", request => {
  return {
    contentType: "text/html",
    content: respond(request.url)
  }
})

async function* respond(text) {
  const encoder = new TextEncoder("utf-8")
  yield encoder.encode("<h1>Hi there!</h1>\n").buffer
  yield encoder.encode(
    `<p>You've succesfully loaded <strong>${request.url}</strong><p>`
  ).buffer
}
```

Given that `response.content` is an [async iterator][] it is also possible to stream response content as this next example illustrates.

```js
browser.protocol.registerProtocol("dweb", request => {
  switch (request.url) {
    case "dweb://stream/": {
      return {
        contentType: "text/html",
        content: streamRespond(request)
      }
    }
    default: {
      return {
        contentType: "text/html",
        content: respond(request.url)
      }
    }
  }
})

async function* streamRespond(request) {
  const encoder = new TextEncoder("utf-8")
  yield encoder.encode("<h1>Say Hi to endless stream!</h1>\n").buffer
  let n = 0
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    yield encoder.encode(`<p>Chunk #${++n}<p>`).buffer
  }
}
```

You can see the demo of the example above in [Firefox Nightly][] by running following command, and then navigating to [dweb://hello/world](dweb://hello/world) or [dweb://stream/](dweb://stream/)

```
npm start
```

![preview](./preview.gif)

[libdweb]: https://github.com/mozilla/libdweb/
[async generator]: https://github.com/tc39/proposal-async-iteration#async-generator-functions
[async iterator]: https://github.com/tc39/proposal-async-iteration#async-iterators-and-async-iterables
[webextensions protocol_handlers]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/manifest.json/protocol_handlers
[firefox nightly]: https://blog.nightly.mozilla.org/
