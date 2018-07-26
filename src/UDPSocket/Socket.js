// @flow strict

/*::
import { Cu, Cr, Ci, Cc, ExtensionAPI } from "gecko"

import type {BaseContext, nsIUDPSocket, nsIUDPSocketListener, nsINetAddr} from "gecko"
import type {
  UDPSocket,
  UDPSocketManager,
  UDPMessage,
  SocketAddress,
  SocketOptions,
  Family
} from "./UDPSocket"

interface Host {
  +UDPSocket: UDPSocketManager;
}
*/
Cu.importGlobalProperties(["URL"])

{
  const { Services } = Cu.import("resource://gre/modules/Services.jsm", {})
  const { OS } = Cu.import("resource://gre/modules/osfile.jsm", {})
  const { ExtensionUtils } = Cu.import(
    "resource://gre/modules/ExtensionUtils.jsm",
    {}
  )

  const { ExtensionError } = ExtensionUtils

  const $Symbol /*:any*/ = Symbol

  class IOError extends ExtensionError {
    static throw(message) /*:empty*/ {
      const self = new this(message)
      throw self
    }
  }

  class Address /*::implements SocketAddress*/ {
    /*::
  host:string;
  port:number;
  family:Family;
  */
    static from({ address, port, family } /*:nsINetAddr*/) {
      return new this(address, port, family)
    }
    constructor(host, port, family) {
      this.host = host
      this.port = port
      this.family = family
    }
  }
  class Socket /*::implements UDPSocket*/ {
    /*::
  id: string;
  address: SocketAddress;
  */
    constructor(id, address) {
      this.id = id
      this.address = address
    }
  }

  const wrapUnprivilegedFunction = (f, scope) => input =>
    f(Cu.cloneInto(input, scope))

  class RemoteIterator {
    /*::
  socket:UDPSocket;
  promise: ?{resolve:({value:UDPMessage, done:false}|{done:true}) => void, reject:Error => void}
  done:boolean
  */
    constructor(socket /*:UDPSocket*/) {
      this.socket = socket
      this.done = false
    }
    onPacketReceived(socket, message) {
      debug &&
        console.log(`TCPSocket/onPacketReceived ${this.socket.id}`, message)
      this.continue({
        from: Address.from(message.fromAddr),
        data: message.rawData.buffer
      })
    }
    onStopListening(socket, status) {
      debug &&
        console.log(`TCPSocket/onStopListening ${this.socket.id}`, status)

      if (status === Cr.NS_BINDING_ABORTED) {
        return this.abort(null)
      } else {
        return this.abort(new Error(`Socket was closed with error: ${status}`))
      }
    }
    continue(value) {
      const { promise, done } = this
      this.promise = null
      debug &&
        console.log("UDPSocketClient.AsyncIterator.continue", promise, value)
      if (promise && !done) {
        promise.resolve({ value, done: false })
      }
    }
    abort(reason) {
      const { promise, done } = this
      this.promise = null
      debug && console.log("UDPSocketClient.AsyncIterator.break", promise)
      if (promise && !done) {
        if (reason) {
          promise.reject(reason)
        } else {
          promise.resolve({ done: true })
        }
      }
      this.done = true
    }

    getAPI(context) /*:AsyncIterator<UDPMessage>*/ {
      const iterator = Cu.cloneInto(
        {
          /*::
        @@asyncIterator: () => iterator,
        */
          next: () => {
            return new context.cloneScope.Promise((resolve, reject) => {
              if (this.done) {
                resolve(Cu.cloneInto({ done: true }, context.cloneScope))
              } else {
                this.promise = {
                  resolve: wrapUnprivilegedFunction(
                    resolve,
                    context.cloneScope
                  ),
                  reject: wrapUnprivilegedFunction(reject, context.cloneScope)
                }
              }
            })
          },
          return: () => {
            new context.cloneScope.Promise((resolve, reject) => {
              const done = { done: true }
              const { promise } = this
              if (promise) {
                this.promise = null
                this.done = true
                promise.resolve(done)
              }
              resolve(Cu.cloneInto(done, context.cloneScope))
            })
          }
        },
        context.cloneScope,
        {
          cloneFunctions: true
        }
      )

      const unwrappedIterator /*:Object*/ = Cu.waiveXrays(iterator)
      unwrappedIterator[$Symbol.asyncIterator] = Cu.exportFunction(function() {
        return this
      }, context.cloneScope)

      return iterator
    }
  }

  class UDPSocketHost /*::implements UDPSocketManager*/ {
    /*::
  context:BaseContext;
  sockets:{[string]:nsIUDPSocket}
  listeners:{[string]:nsIUDPSocketListener}
  nextSocketID:number

  messages:(UDPSocket) => AsyncIterator<UDPMessage>
  */
    constructor(context /*:BaseContext*/) {
      const sockets /*: Object*/ = Object.create(null)
      const listeners /*:Object*/ = Object.create(null)
      this.context = context
      this.sockets = sockets
      this.listeners = listeners
      this.nextSocketID = 0
    }

    async init(self, options /*:SocketOptions*/) {
      try {
        const socket = Cc["@mozilla.org/network/udp-socket;1"].createInstance(
          Ci.nsIUDPSocket
        )

        if (options.host != null) {
          socket.init2(
            options.host,
            options.port || -1,
            null,
            options.addressReuse != false
          )
        } else {
          socket.init(
            options.port || -1,
            options.loopbackOnly != false,
            null,
            options.addressReuse != false
          )
        }

        const id = `UDPSocket@${++this.nextSocketID}`
        this.sockets[id] = socket
        self.id = id
        self.address = Address.from(socket.localAddr)
        // const self = scope.Object.create(proto)
        // self.constructor(id, Address.from(socket.localAddr))
        // return self
        // return proto
        return self
      } catch (error) {
        return IOError.throw(error)
      }
    }
    async create(options /*:SocketOptions*/) /*: Promise<UDPSocket>*/ {
      try {
        const socket = Cc["@mozilla.org/network/udp-socket;1"].createInstance(
          Ci.nsIUDPSocket
        )

        if (options.host != null) {
          socket.init2(
            options.host,
            options.port || -1,
            null,
            options.addressReuse != false
          )
        } else {
          socket.init(
            options.port || -1,
            options.loopbackOnly != false,
            null,
            options.addressReuse != false
          )
        }

        const id = `UDPSocket@${++this.nextSocketID}`
        this.sockets[id] = socket
        return new Socket(id, Address.from(socket.localAddr))
      } catch (error) {
        return IOError.throw(error)
      }
    }
    async close({ id } /*:UDPSocket*/) /*: Promise<void>*/ {
      const socket = this.sockets[id]
      if (socket) {
        delete this.sockets[id]
        return socket.close()
      } else {
        return IOError.throw("Unable to find corresponding socket")
      }
    }
    async send(
      { id } /*:UDPSocket*/,
      host /*: string*/,
      port /*: number*/,
      data /*: ArrayBuffer*/,
      size /*::?: number*/
    ) /*: Promise<number>*/ {
      const socket = this.sockets[id]
      if (socket) {
        return socket.send(
          host,
          port,
          new Uint8Array(data),
          size || data.byteLength
        )
      } else {
        return IOError.throw("Unable to find corresponding socket")
      }
    }

    async setMulticastLoopback(
      { id } /*:UDPSocket*/,
      flag /*:boolean*/
    ) /*: Promise<void>*/ {
      const socket = this.sockets[id]
      if (socket) {
        socket.multicastLoopback = flag
      } else {
        return IOError.throw("Unable to find corresponding socket")
      }
    }
    async setMulticastInterface(
      { id } /*:UDPSocket*/,
      multicastInterface /*:string*/
    ) /*: Promise<void>*/ {
      const socket = this.sockets[id]
      if (socket) {
        socket.multicastInterface = multicastInterface
      } else {
        return IOError.throw("Unable to find corresponding socket")
      }
    }
    async addMembership(
      { id } /*:UDPSocket*/,
      address /*: string*/,
      multicastInterface /*::?: string*/
    ) /*: Promise<void>*/ {
      const socket = this.sockets[id]
      if (socket) {
        socket.joinMulticast(address, multicastInterface)
      } else {
        return IOError.throw("Unable to find corresponding socket")
      }
    }
    async dropMembership(
      { id } /*:UDPSocket*/,
      address /*: string*/,
      multicastInterface /*::?: string*/
    ) /*: Promise<void>*/ {
      const socket = this.sockets[id]
      if (socket) {
        socket.leaveMulticast(address, multicastInterface)
      } else {
        return IOError.throw("Unable to find corresponding socket")
      }
    }
    asyncListen({ id } /*:UDPSocket*/, listener /*:nsIUDPSocketListener*/) {
      const { context, sockets } = this
      const socket = sockets[id]
      debug && console.log(`TCPSocket.asyncListen ${id}`, socket, listener)
      if (socket) {
        socket.asyncListen(listener)
      } else {
        return IOError.throw("Unable to find corresponding socket")
      }
    }

    static new(context /*:BaseContext*/) {
      return new this(context)
    }
    terminate() {
      const { sockets } = this
      for (const id in sockets) {
        const socket = sockets[id]
        delete sockets[id]
        socket.close()
      }
    }
  }

  global.UDPSocket = class extends ExtensionAPI /*::<Host>*/ {
    getAPI(context) {
      const socketManager = UDPSocketHost.new(context)

      context.callOnClose({
        close() {
          socketManager.terminate()
        }
      })

      debug && console.log("UDPSocketClient.new")

      return {
        UDPSocket: {
          FAMILY_INET: Ci.nsINetAddr.FAMILY_INET,
          FAMILY_INET6: Ci.nsINetAddr.FAMILY_INET6,
          FAMILY_LOCAL: Ci.nsINetAddr.FAMILY_LOCAL,

          create: options => socketManager.create(options),

          close: socket => socketManager.close(socket),
          send: (socket, host, port, data, size) =>
            socketManager.send(socket, host, port, data, size),
          setMulticastLoopback: (socket, flag) =>
            socketManager.setMulticastLoopback(socket, flag),
          setMulticastInterface: (socket, multicastInterface) =>
            socketManager.setMulticastInterface(socket, multicastInterface),
          addMembership: (socket, address, multicastInterface) =>
            socketManager.addMembership(socket, address, multicastInterface),
          dropMembership: (socket, address, multicastInterface) =>
            socketManager.addMembership(socket, address, multicastInterface),

          messages(socket /*:UDPSocket*/) /*:AsyncIterator<UDPMessage>*/ {
            const iterator = new RemoteIterator(socket)
            socketManager.asyncListen(socket, iterator)
            return iterator.getAPI(context)
          }
        }
      }
    }
  }

  const debug = true
}
