// @flow strict

/*::
import { Cu, Cr } from "gecko"
import type { nsIMessageSender } from "gecko"
import { ExtensionAPI, BaseContext } from "gecko"
import type { HandlerInbox, RequestStatus, HandlerOutbox, Inn, Out } from "./router"

interface Head {
  contentType?: string,
  contentLength?: number,
  contentCharset?: string
}

interface Body {
  content: AsyncIterator<ArrayBuffer>
}

interface Response extends Head, Body {

}

interface Handler {
  ({ url: string }):Response
}

type Status =
  | RequestStatus
  | typeof Cr.NS_BASE_STREAM_CLOSED

interface ConnectionManager {
  disconnect(id:string):void;
}

interface Client {
  +protocol: {
    registerProtocol(string, Handler): Promise<void>
  }
}
*/

{
  const { Services } = Cu.import("resource://gre/modules/Services.jsm", {})

  const OUTBOX = "libdweb:protocol:handler:outbox"
  const INBOX = "libdweb:protocol:handler:inbox"

  const ACTIVE = Cr.NS_OK
  const PAUSED = Cr.NS_BASE_STREAM_WOULD_BLOCK
  const CLOSED = Cr.NS_BASE_STREAM_CLOSED
  const ABORTED = Cr.NS_BINDING_ABORTED

  class Connection {
    /*::
  requestID:string
  port:Out<HandlerOutbox>
  content:AsyncIterator<ArrayBuffer>
  status:Status
  */
    constructor(
      requestID /*:string*/,
      port /*:Out<HandlerOutbox>*/,
      content /*:AsyncIterator<ArrayBuffer>*/
    ) {
      this.requestID = requestID
      this.port = port
      this.content = content
      this.status = ACTIVE
    }
    head({ contentType, contentCharset, contentLength } /*:Head*/) {
      this.port.sendAsyncMessage(OUTBOX, {
        type: "head",
        requestID: this.requestID,
        contentType,
        contentCharset,
        contentLength
      })
    }
    body(content /*:ArrayBuffer*/) {
      this.port.sendAsyncMessage(OUTBOX, {
        type: "body",
        requestID: this.requestID,
        content
      })
    }
    end() {
      this.port.sendAsyncMessage(OUTBOX, {
        type: "end",
        requestID: this.requestID
      })
    }
    suspend(manager /*:ConnectionManager*/) {
      if (this.status === ACTIVE) {
        this.status = PAUSED
      }
      return this
    }
    async resume(manager /*:ConnectionManager*/) {
      while (this.status === ACTIVE) {
        const { done, value } = await this.content.next()
        if (this.status === ACTIVE) {
          if (value) {
            this.body(value)
          }

          if (done) {
            this.close(manager)
          }
        }
      }
    }
    close(manager) {
      manager.disconnect(this.requestID)
      this.status = CLOSED
      this.end()
      delete this.port
    }
    abort(manager /*:ConnectionManager*/) {
      manager.disconnect(this.requestID)
      this.status = ABORTED
      delete this.port
    }
  }

  class Protocol /*::implements ConnectionManager*/ {
    /*::
  context: BaseContext
  handlers: { [string]: Handler }
  outbox: Out<HandlerOutbox>
  inbox: Inn<HandlerInbox>
  connections: {[string]: Connection}
  */
    constructor(context /*: BaseContext */) {
      this.context = context
      this.handlers = {}
      this.connections = {}
      this.outbox = context.childManager.messageManager
      this.inbox = context.messageManager
    }
    receiveMessage({ name, data, target } /*: HandlerInbox */) {
      console.log(`Receive message Addon.Child ${name} ${JSON.stringify(data)}`)
      switch (data.type) {
        case `request`: {
          return void this.request(data, target)
        }
        case `requestUpdate`: {
          return this.updateRequest(data)
        }
      }
    }
    register(scheme /*: string */, handler /*: Handler */) {
      this.handlers[scheme] = handler
      console.log(`register "${scheme}" protocol handler: ${String(handler)}`)
      this.outbox.sendAsyncMessage(OUTBOX, {
        type: "install",
        scheme
      })
    }
    request(request, target /*: Out<HandlerOutbox> */) {
      const { requestID, scheme, url } = request
      const handler = this.handlers[request.scheme]
      const response = Cu.waiveXrays(handler(Cu.cloneInto(request, handler)))
      const connection = new Connection(requestID, target, response.content)
      this.connect(connection)
      connection.head(response)
      connection.resume(this)
    }
    connect(connection /*:Connection*/) {
      this.connections[connection.requestID] = connection
    }
    disconnect(requestID /*:string*/) {
      delete this.connections[requestID]
    }
    updateRequest(data) {
      const { requestID, status } = data
      const connection = this.connections[requestID]
      if (connection) {
        switch (status) {
          case ACTIVE: {
            return void connection.resume(this)
          }
          case PAUSED: {
            return void connection.suspend(this)
          }
          case ABORTED: {
            return void connection.abort(this)
          }
          default:
            return void this
        }
      } else {
        console.error(
          `Received update for the a closed connection ${requestID}`
        )
      }
    }

    static spawn(context) {
      const self = new Protocol(context)
      self.inbox.addMessageListener(INBOX, self)

      return self
    }
  }

  class ProtocolClient extends ExtensionAPI /*::<Client>*/ {
    getAPI(context) {
      const init = context.childManager.callParentAsyncFunction(
        "protocol.spawn",
        []
      )

      const protocol = Protocol.spawn(context)

      return {
        protocol: {
          async registerProtocol(scheme, handler) {
            await init
            protocol.register(scheme, handler)
          }
        }
      }
    }
  }
  global.protocol = ProtocolClient
}
