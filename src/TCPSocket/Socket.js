// @flow strict

/*::
import { Components, Cu, Cr, Ci, Cc, ExtensionAPI } from "gecko"
import type {
  BaseContext,
  nsresult,
  nsISupports,
  nsISocketTransport,
  nsIServerSocket,
  TCPReadyState,
  nsIInputStream,
  nsIOutputStream,
  nsIBinaryOutputStream,
  nsIBinaryInputStream,
  nsIAsyncInputStream,
  nsIInputStreamPump,
  nsIRequestObserver,

  TCPServerSocketAPI,
  TCPSocketAPI,
  SocketOptions,
  TCPSocketBinaryType,
  TCPServerSocketEventAPI,
  ErrorEventAPI
} from "gecko"
import type {
  API,
  ServerOptions,
  ServerSocket,

  ClientOptions,
  ClientSocket,

  Status,
} from "./TCPSocket"

interface Host {
  +TCPSocket: API;
}
*/
Cu.importGlobalProperties(["URL"])
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {})
const { OS } = Cu.import("resource://gre/modules/osfile.jsm", {})
const { TCPSocket, TCPServerSocket } = Cu.getGlobalForObject(OS)
const { ExtensionUtils } = Cu.import(
  "resource://gre/modules/ExtensionUtils.jsm",
  {}
)

// const url = Components.stack.filename.split("->").pop()
// const { TCPSocketAdapter, TCPServerSocketAdapter } = Cu.import(
//   new URL(`./TCP.js`, url),
//   {}
// )

const { ExtensionError } = ExtensionUtils

const AsAsyncIterator = constructor => {
  const $Symbol /*:any*/ = Symbol
  const prototype /*:Object*/ = constructor.prototype
  prototype[$Symbol.asyncIterator] = function() {
    return this
  }
  return constructor
}

class IOError extends ExtensionError {
  static throw(message) /*:empty*/ {
    const self = new this(message)
    throw self
  }
}

const wrapUnprivilegedFunction = (f, scope) => input =>
  f(Cu.cloneInto(input, scope))

class Server {
  /*::
  socket:TCPServerSocketAPI
  closed:Promise<void>
  onerrored:(Error) => void
  onclosed:() => void
  context:BaseContext
  connections:Connections
  localPort:number
  */
  constructor(
    socket /*:TCPServerSocketAPI*/,
    localPort /*:number*/,
    connections /*:Connections*/
  ) {
    this.socket = socket
    this.localPort = localPort
    this.connections = connections
  }

  closeImmediately() {
    debug && console.log("terminate server")
    this.socket.close()
    this.delete()
  }
  delete() {
    delete this.socket
    delete this.closed
  }
  static async new(options /*:ServerOptions*/) /*: Promise<Server>*/ {
    try {
      console.log(
        `TCPServerSocket.serve ${options.port} ${String(options.backlog)}`
      )
      const socket = new TCPServerSocketAdapter(
        options.port,
        { binaryType: "arraybuffer" },
        options.backlog || undefined
      )

      console.log(`new TCPServerSocket1 ${socket.localPort}`)
      const connections = new Connections()
      const server = new Server(socket, socket.localPort, connections)

      socket.onconnect = event => connections.connect(event.socket)
      server.closed = new Promise((resolve, reject) => {
        socket.onerror = ({ name, message }) =>
          reject(new Error(`${name}: ${message}`))
        // self.onclose = () => resolve()
      })

      return server
    } catch (error) {
      return IOError.throw(error.message)
    }
  }
  onclose(status /*:nsresult*/) {
    this.onclosed()
    this.connections.close()
  }
  onerror(status /*:nsresult*/) {
    const error = new Error(status)
    this.connections.close(error)
    this.onerrored(error)
  }
  close() {
    return this.socket.close()
  }
}

class Connections {
  /*::
  requests:{resolve(?TCPSocketAPI):void, reject(Error):void}[]
  */
  constructor() {
    this.requests = []
  }
  request(resolve, reject) {
    this.requests.push({ resolve, reject })
  }
  connect(socket /*:TCPSocketAPI*/) {
    const request = this.requests.shift()
    if (request) {
      request.resolve(socket)
    } else {
      socket.closeImmediately()
    }
  }
  close(error) {
    const { requests } = this
    while (requests.length) {
      const request = requests.shift()
      if (error) {
        request.reject(error)
      } else {
        request.resolve()
      }
    }
  }
}

global.TCPSocket = class extends ExtensionAPI /*::<Host>*/ {
  getAPI(context) {
    const servers = new WeakMap()
    const clients = new WeakMap()
    const connections = new WeakMap()
    const sockets = new Set()

    context.callOnClose({
      close() {
        console.log(`!!!! Unload ${sockets.size}`)
        for (const socket of sockets) {
          socket.closeImmediately()
        }
      }
    })

    const deref = /*::<a, b>*/ (
      refs /*:WeakMap<a, b>*/,
      handle /*:a*/
    ) /*:b*/ => {
      const ref = refs.get(handle)
      if (!ref) {
        return IOError.throw("Unable to find corresponding socket")
      } else {
        return ref
      }
    }

    const derefServer = handle => deref(servers, handle)
    const derefSocket = handle => deref(clients, handle)
    const derefConnections = handle => deref(connections, handle)

    const TCPClient = exportClass(
      context.cloneScope,
      class TCPClient {
        /*::
        opened:Promise<void>
        closed:Promise<void>
        */
        constructor() {
          throw TypeError("Illegal constructor")
        }
        get host() {
          return derefSocket(this).host
        }
        get port() {
          return derefSocket(this).port
        }
        get ssl() {
          return derefSocket(this).ssl
        }
        get readyState() {
          return derefSocket(this).readyState
        }
        get bufferedAmount() {
          return derefSocket(this).bufferedAmount
        }
        write(buffer, byteOffset, byteLength) {
          const socket = derefSocket(this)
          if (socket.send(buffer, byteOffset, byteLength)) {
            return voidPromise
          } else {
            return new context.cloneScope.Promise((resolve, reject) => {
              socket.ondrain = () => resolve()
              socket.onerror = ({ name, message }) =>
                reject(IOError(`${name}: ${message}`))
            })
          }
        }
        read() {
          return context.wrapPromise(
            new Promise((resolve, reject) => {
              derefSocket(this).ondata = event => resolve(event.data)
            })
          )
        }
        suspend() {
          derefSocket(this).suspend()
        }
        resume() {
          derefSocket(this).resume()
        }
        close() {
          derefSocket(this).close()
          return voidPromise
        }
        closeImmediately() {
          derefSocket(this).closeImmediately()
          return voidPromise
        }
        upgradeToSecure() {
          return derefSocket(this).upgradeToSecure()
        }
      }
    )

    const TCPConnections = exportClass(
      context.cloneScope,
      AsAsyncIterator(
        class TCPConnections {
          /*::
        @@asyncIterator: () => self
          // server:Server
        */
          constructor() {
            throw TypeError("Illegal constructor")
          }
          next() {
            return new context.cloneScope.Promise((resolve, reject) => {
              const self = derefConnections(this)
              self.request(socket => {
                if (socket) {
                  resolve(next(createClientSocket(socket)))
                } else {
                  resolve(done)
                }
              }, reject)
            })
          }
          return() {
            derefConnections(this).close()
          }
        }
      )
    )

    const TCPServer = exportClass(
      context.cloneScope,
      class TCPServer {
        /*::
        connections:AsyncIterator<ClientSocket>
        */
        constructor() {
          throw TypeError("Illegal constructor")
        }
        close() {
          const server = derefServer(this)
          server.close()
          sockets.delete(server)
          servers.delete(server)
        }
        get localPort() {
          return derefServer(this).localPort
        }
        get closed() {
          return context.wrapPromise(derefServer(this).closed)
        }
      }
    )

    const voidPromise = context.cloneScope.Promise.resolve()
    const done = Cu.cloneInto({ done: true }, context.cloneScope)
    const next = value => {
      const result = Cu.cloneInto({ done: false }, context.cloneScope)
      Reflect.defineProperty(result, "value", { value })
      return result
    }

    const createClientSocket = (socket /*:TCPSocketAPI*/) /*:ClientSocket*/ => {
      const client = exportInstance(context.cloneScope, TCPClient)
      clients.set(client, socket)
      sockets.add(socket)

      client.opened =
        socket.readyState === "open"
          ? voidPromise
          : new context.cloneScope.Promise((resolve, reject) => {
              socket.onopen = () => resolve()
            })

      client.closed = context.wrapPromise(
        new Promise((resolve, reject) => {
          socket.onclose = () => resolve()
          socket.onerror = event =>
            reject(IOError(`${event.name}: ${event.message}`))
        })
      )

      return client
    }

    const createConnections = () /*:TCPConnections*/ =>
      exportInstance(context.cloneScope, TCPConnections)

    const createServerSocket = () /*:ServerSocket*/ => {
      const connections = createConnections()
      const server = exportInstance(context.cloneScope, TCPServer)
      Reflect.defineProperty(server, "connections", { value: connections })
      return server
    }

    return {
      TCPSocket: {
        listen: options =>
          new context.cloneScope.Promise(async (resolve, reject) => {
            try {
              const socket = createServerSocket()
              const server = await Server.new(options)

              sockets.add(server)
              connections.set(socket.connections, server.connections)
              servers.set(socket, server)

              resolve(socket)
            } catch (error) {
              reject(error)
            }
          }),
        connect: options =>
          new context.cloneScope.Promise(async (resolve, reject) => {
            try {
              const socket = new TCPSocket(options.host, options.port, {
                useSecureTransport: options.useSecureTransport,
                binaryType: "arraybuffer"
              })

              const client = createClientSocket(socket)
              // await client.opened
              resolve(client)
            } catch (error) {
              reject(error)
            }
          })
      }
    }
  }
}

const exportClass = /*::<b, a:Class<b>>*/ (
  scope /*:Object*/,
  constructor /*:a*/
) /*:a*/ => {
  const clone = Cu.exportFunction(constructor, scope)
  const unwrapped = Cu.waiveXrays(clone)
  const prototype = Cu.waiveXrays(Cu.createObjectIn(scope))

  const source = constructor.prototype
  for (const key of Reflect.ownKeys(constructor.prototype)) {
    if (key !== "constructor") {
      const descriptor = Reflect.getOwnPropertyDescriptor(source, key)
      Reflect.defineProperty(
        prototype,
        key,
        Cu.waiveXrays(
          Cu.cloneInto(descriptor, scope, {
            cloneFunctions: true
          })
        )
      )
    }
  }

  Reflect.defineProperty(unwrapped, "prototype", {
    value: prototype
  })
  Reflect.defineProperty(prototype, "constructor", {
    value: unwrapped
  })

  return clone
}

const exportInstance = /*::<a:Object, b:a>*/ (
  scope,
  constructor /*:Class<b>*/,
  properties /*::?:a*/
) /*:b*/ => {
  const instance /*:any*/ = properties
    ? Cu.cloneInto(properties, scope)
    : Cu.cloneInto({}, scope)
  Reflect.setPrototypeOf(
    Cu.waiveXrays(instance),
    Cu.waiveXrays(constructor).prototype
  )
  return instance
}

const SEC_ERROR_BASE = Ci.nsINSSErrorsService.NSS_SEC_ERROR_BASE
const SEC_ERROR_EXPIRED_CERTIFICATE = SEC_ERROR_BASE + 11
const SEC_ERROR_REVOKED_CERTIFICATE = SEC_ERROR_BASE + 12
const SEC_ERROR_UNKNOWN_ISSUER = SEC_ERROR_BASE + 13
const SEC_ERROR_UNTRUSTED_ISSUER = SEC_ERROR_BASE + 20
const SEC_ERROR_UNTRUSTED_CERT = SEC_ERROR_BASE + 21
const SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE = SEC_ERROR_BASE + 30
const SEC_ERROR_CA_CERT_INVALID = SEC_ERROR_BASE + 36
const SEC_ERROR_INADEQUATE_KEY_USAGE = SEC_ERROR_BASE + 90
const SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED = SEC_ERROR_BASE + 176

const SSL_ERROR_BASE = -0x3000
const SSL_ERROR_NO_CERTIFICATE = 3
const SSL_ERROR_BAD_CERTIFICATE = SSL_ERROR_BASE + 4
const SSL_ERROR_UNSUPPORTED_CERTIFICATE_TYPE = SSL_ERROR_BASE + 8
const SSL_ERROR_UNSUPPORTED_VERSION = SSL_ERROR_BASE + 9
const SSL_ERROR_BAD_CERT_DOMAIN = SSL_ERROR_BASE + 12

const BUFFER_SIZE = 65536

// Port of: https://github.com/mozilla/gecko-dev/blob/f51c4fa5d92d59fcb46f314e94edbf045cb3067c/dom/network/TCPServerSocket.cpp
class TCPServerSocketAdapter /*::implements TCPServerSocketAPI*/ {
  /*::
  onconnect: ?(TCPServerSocketEventAPI) => mixed;
  onerror: ?(ErrorEventAPI) => mixed;
  localPort: number;
  serverSocket: ?nsIServerSocket;
  */
  constructor(port, options, backlog) {
    const serverSocket = Cc[
      "@mozilla.org/network/server-socket;1"
    ].createInstance(Ci.nsIServerSocket)
    serverSocket.init(port, false, backlog || -1)
    this.serverSocket = serverSocket
    this.localPort = serverSocket.port

    serverSocket.asyncListen(this)
  }
  close() {
    debug && console.log("TPCServerSocketAdapter.close", this.serverSocket)
    if (this.serverSocket) {
      this.serverSocket.close()
    }
  }

  // nsIServerSocketListener
  onSocketAccepted(server, transport) {
    const socket = TCPSocketAdapter.createAcceptedSocket(transport)
    TCPServerSocketAdapter.fireEvent(this, "connect", socket)
  }
  onStopListening(server, status) {
    this.serverSocket = null
    switch (status) {
      case Cr.NS_BINDING_ABORTED: {
        // return void this.onclose(status)
        break
      }
      default: {
        TCPServerSocketAdapter.fireErrorEvent(
          this,
          "NetworkError",
          "Server socket was closed by unexpected reason."
        )
      }
    }
  }

  // Statics
  static fireEvent(self, type, socket /*:TCPSocketAPI*/) {
    switch (type) {
      case "connect": {
        if (self.onconnect) {
          self.onconnect({
            type: "connect",
            socket
          })
        }
        break
      }
    }
  }
  static fireErrorEvent(self, name, message) {
    if (self.onerror) {
      self.onerror({
        type: "error",
        name,
        message
      })
    }
  }
}

// Port of: https://github.com/mozilla/gecko-dev/blob/f51c4fa5d92d59fcb46f314e94edbf045cb3067c/dom/network/TCPSocket.cpp#L411
const DO_NOT_INIT = {}
const ASYNC_COPY = { type: "asyncCopy" }
const ASYNC_READ = { type: "asyncRead" }

class TCPSocketAdapter /*::implements TCPSocketAPI*/ {
  /*::
  host:string;
  port:number;
  binaryType: TCPSocketBinaryType;
  bufferedAmount:number;
  transport:nsISocketTransport;
  readyState:TCPReadyState;
  ssl:boolean;
  socketInputStream:?nsIInputStream
  socketOutputStream:?nsIOutputStream
  binaryInputStream:nsIBinaryInputStream
  inputStreamPump:?nsIInputStreamPump
  suspendCount:number
  asyncCopierActive:boolean
  waitingForDrain:boolean
  waitingForStartTLS:boolean
  pendingData:nsIInputStream[]
  pendingDataAfterStartTLS:nsIInputStream[]
  copyObserver:nsIRequestObserver

  onopen:?({type:"open"}) => mixed
  onclose:?({type:"close"}) => mixed
  ondrain:?({type:"drain"}) => mixed
  ondata:?({type:"data", data:ArrayBuffer}) => mixed
  onerror:?(ErrorEventAPI) => mixed
  */
  constructor(
    host /*:string*/,
    port /*:number*/,
    options /*::?:SocketOptions*/
  ) {
    this.host = host
    this.port = port
    this.ssl = options && options.useSecureTransport ? true : false
    this.readyState = "closed"
    this.asyncCopierActive = false
    this.waitingForDrain = false
    this.bufferedAmount = 0
    this.suspendCount = 0
    this.waitingForStartTLS = false
    this.pendingData = []
    this.pendingDataAfterStartTLS = []
    this.binaryType = "arraybuffer"
    this.copyObserver = new CopierObserver(this)

    if (options !== DO_NOT_INIT) {
      TCPSocketAdapter.init(this)
    }
  }
  static createAcceptedSocket(transport /*:nsISocketTransport*/) {
    const self = new TCPSocketAdapter(
      transport.host,
      transport.port,
      DO_NOT_INIT
    )
    self.transport = transport

    TCPSocketAdapter.createStream(self)
    TCPSocketAdapter.createInputStreamPump(self)
    self.readyState = "open"

    return self
  }
  static init(self) {
    self.readyState = "connecting"
    const transportService = Cc[
      "@mozilla.org/network/socket-transport-service;1"
    ].getService(Ci.nsISocketTransportService)
    const socketTypes = self.ssl ? ["ssl"] : ["starttls"]
    const transport = transportService.createTransport(
      socketTypes,
      1,
      self.host,
      self.port,
      null
    )
    TCPSocketAdapter.initWithUnconnectedTransport(self, transport)
  }
  static initWithUnconnectedTransport(self, transport) {
    self.readyState = "connecting"
    self.transport = transport
    transport.setEventSink(self, null)
    TCPSocketAdapter.createStream(self)
  }
  static createStream(self) {
    const { transport } = self
    const socketInputStream = transport.openInputStream(0, 0, 0)
    const socketOutputStream = transport.openOutputStream(
      Ci.nsITransport.OPEN_UNBUFFERED,
      0,
      0
    )
    const asyncStream = socketInputStream.QueryInterface(Ci.nsIAsyncInputStream)

    asyncStream.asyncWait(
      self,
      Ci.nsIAsyncInputStream.WAIT_CLOSURE_ONLY,
      0,
      null
    )
    const binaryInputStream = Cc[
      "@mozilla.org/binaryinputstream;1"
    ].createInstance(Ci.nsIBinaryInputStream)
    binaryInputStream.setInputStream(socketInputStream)

    self.binaryInputStream = binaryInputStream
    self.socketInputStream = socketInputStream
    self.socketOutputStream = socketOutputStream
  }
  static createInputStreamPump(self) {
    const { socketInputStream } = self
    if (!socketInputStream) {
      return IOError.throw(Cr.NS_ERROR_NOT_AVAILABLE)
    }
    const inputStreamPump = Cc[
      "@mozilla.org/network/input-stream-pump;1"
    ].createInstance(Ci.nsIInputStreamPump)
    inputStreamPump.init(socketInputStream, 0, 0, false, null)

    while (self.suspendCount--) {
      inputStreamPump.suspend()
    }
    inputStreamPump.asyncRead(self, null)
  }
  static maybeReportErrorAndCloseIfOpen(self, status) {
    if (self.readyState === "closed") {
      return undefined
    }
    self.close()
    self.readyState = "closed"

    if (status !== Cr.NS_OK) {
      let errorType = "SecurityProtocol"
      let errorName = "SecurityError"

      // security module? (and this is an error)
      if ((status & 0xff0000) === 0x5a0000) {
        const errorService = Cc["@mozilla.org/nss_errors_service;1"].getService(
          Ci.nsINSSErrorsService
        )
        try {
          // getErrorClass will throw a generic NS_ERROR_FAILURE if the error code is
          // somehow not in the set of covered errors.
          const errorClass = errorService.getErrorClass(status)
          switch (errorClass) {
            case Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT: {
              errorType = "SecurityCertificate"
              break
            }
            default: {
              break
            }
          }
        } catch (_) {}

        // NSS_SEC errors (happen below the base value because of negative vals)
        if (
          (status & 0xffff) <
          Math.abs(Ci.nsINSSErrorsService.NSS_SEC_ERROR_BASE)
        ) {
          switch (status) {
            case SEC_ERROR_EXPIRED_CERTIFICATE:
              errorName = "SecurityExpiredCertificateError"
              break
            case SEC_ERROR_REVOKED_CERTIFICATE:
              errorName = "SecurityRevokedCertificateError"
              break
            case SEC_ERROR_UNKNOWN_ISSUER:
            case SEC_ERROR_UNTRUSTED_ISSUER:
            case SEC_ERROR_UNTRUSTED_CERT:
            case SEC_ERROR_CA_CERT_INVALID:
              errorName = "SecurityUntrustedCertificateIssuerError"
              break
            case SEC_ERROR_INADEQUATE_KEY_USAGE:
              errorName = "SecurityInadequateKeyUsageError"
              break
            case SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED:
              errorName = "SecurityCertificateSignatureAlgorithmDisabledError"
              break
            default:
              break
          }
        } else {
          switch (status) {
            case SSL_ERROR_NO_CERTIFICATE:
              errorName = "SecurityNoCertificateError"
              break
            case SSL_ERROR_BAD_CERTIFICATE:
              errorName = "SecurityBadCertificateError"
              break
            case SSL_ERROR_UNSUPPORTED_CERTIFICATE_TYPE:
              errorName = "SecurityUnsupportedCertificateTypeError"
              break
            case SSL_ERROR_UNSUPPORTED_VERSION:
              errorName = "SecurityUnsupportedTLSVersionError"
              break
            case SSL_ERROR_BAD_CERT_DOMAIN:
              errorName = "SecurityCertificateDomainMismatchError"
              break
            default:
              break
          }
        }
      } else {
        errorType = "Network"
        switch (status) {
          case Cr.NS_ERROR_CONNECTION_REFUSED: {
            errorName = "ConnectionRefusedError"
            break
          }
          case Cr.NS_ERROR_NET_TIMEOUT: {
            errorName = "NetworkTimeoutError"
            break
          }
          case Cr.NS_ERROR_UNKNOWN_HOST: {
            errorName = "DomainNotFoundError"
            break
          }
          case Cr.NS_ERROR_NET_INTERRUPT: {
            errorName = "NetworkInterruptError"
            break
          }
          default: {
            errorName = "NetworkError"
            break
          }
        }
      }

      TCPSocketAdapter.fireErrorEvent(self, errorName, errorType)
    }
    TCPSocketAdapter.fireEvent(self, "close")
  }
  static fireErrorEvent(self, name, type) {
    const { onerror } = self
    if (onerror) {
      onerror({ type: "error", name, message: type })
    }
  }
  static fireEvent(self, type) {
    const event = { type }
    switch (type) {
      case "close": {
        const handler = self.onclose
        if (handler) {
          handler({ type: "close" })
        }
        break
      }
      case "open": {
        const handler = self.onopen
        if (handler) {
          handler({ type: "open" })
        }
        break
      }
      case "drain": {
        const handler = self.ondrain
        if (handler) {
          handler({ type: "drain" })
        }
        break
      }
    }
  }
  static fireDataEvent(self, buffer) {
    const { ondata } = self
    if (ondata) {
      ondata({ type: "data", data: buffer })
    }
  }
  static close(self, waitForUnsentData /*:boolean*/) {
    if (self.readyState === "closed" || self.readyState === "closing") {
      return undefined
    }
    self.readyState = "closing"
    if (self.asyncCopierActive || !waitForUnsentData) {
      self.pendingData.splice(0)
      self.pendingDataAfterStartTLS.splice(0)

      const { socketOutputStream, socketInputStream } = self
      if (socketOutputStream) {
        socketOutputStream.close()
        self.socketOutputStream = null
        delete self.binaryInputStream
      }

      if (socketInputStream) {
        socketInputStream.close()
        self.socketInputStream = null
      }
    }
  }
  static send(self, stream, byteLength) {
    console.log(`TCPSocketAdapter.send ${stream.available()}`)
    self.bufferedAmount += byteLength
    const isBufferFull = self.bufferedAmount > BUFFER_SIZE
    if (isBufferFull) {
      self.waitingForDrain = true
    }

    if (self.waitingForStartTLS) {
      self.pendingDataAfterStartTLS.push(stream)
    } else {
      self.pendingData.push(stream)
    }
    TCPSocketAdapter.ensureCopying(self)

    return !isBufferFull
  }
  static ensureCopying(self) {
    const { socketOutputStream, asyncCopierActive } = self

    if (asyncCopierActive || !socketOutputStream) {
      return
    }
    self.asyncCopierActive = true
    const multiplexStream = Cc[
      "@mozilla.org/io/multiplex-input-stream;1"
    ].createInstance(Ci.nsIMultiplexInputStream)

    const stream = multiplexStream.QueryInterface(Ci.nsIInputStream)

    while (self.pendingData.length > 0) {
      const stream = self.pendingData.shift()
      multiplexStream.appendStream(stream)
    }

    const copier = Cc[
      "@mozilla.org/network/async-stream-copier;1"
    ].createInstance(Ci.nsIAsyncStreamCopier)
    const socketTransportService = Cc[
      "@mozilla.org/network/socket-transport-service;1"
    ].getService(Ci.nsISocketTransportService)

    const target = socketTransportService.QueryInterface(Ci.nsIEventTarget)

    console.log(
      `TCPSocketAdapter.ensureCopying copy ${stream.available()} bytes`
    )

    copier.init(
      stream,
      socketOutputStream,
      target,
      true,
      false,
      BUFFER_SIZE,
      false,
      false
    )

    copier.asyncCopy(self.copyObserver, null)
  }
  static notifyCopyComplete(self, status) {
    console.log(`TCPSocketAdapter.notifyCopyComplete ${status}`)
    self.asyncCopierActive = false
    let bufferedAmount = 0
    for (const stream of self.pendingData) {
      bufferedAmount += stream.available()
    }
    self.bufferedAmount = bufferedAmount

    if (status !== Cr.NS_OK) {
      return TCPSocketAdapter.maybeReportErrorAndCloseIfOpen(self, status)
    }

    if (bufferedAmount > 0) {
      return TCPSocketAdapter.ensureCopying(self)
    }

    // Maybe we have some empty stream. We want to have an empty queue now.
    self.pendingData.splice(0)
    // If we are waiting for initiating starttls, we can begin to
    // activate tls now.
    if (self.waitingForStartTLS && self.readyState === "open") {
      TCPSocketAdapter.activateTLS(self)
      self.waitingForStartTLS = false
      // If we have pending data, we should send them, or fire
      // a drain event if we are waiting for it.
      if (self.pendingDataAfterStartTLS.length !== 0) {
        self.pendingData = self.pendingDataAfterStartTLS
        return TCPSocketAdapter.ensureCopying(self)
      }
    }

    if (self.waitingForDrain) {
      self.waitingForDrain = false
      TCPSocketAdapter.fireEvent(self, "drain")
    }

    if (self.readyState === "closing") {
      const { socketOutputStream } = self
      if (socketOutputStream) {
        socketOutputStream.close()
        self.socketOutputStream = null
      }
      self.readyState = "closed"
      TCPSocketAdapter.fireEvent(self, "close")
    }
  }
  static activateTLS(self) {
    const { securityInfo } = self.transport
    const socketControl = securityInfo.QueryInterface(Ci.nsISSLSocketControl)
    if (socketControl) {
      socketControl.StartTLS()
      self.ssl = true
    }
  }

  onTransportStatus(transport, status, progress, max) {
    this.readyState = "open"
    TCPSocketAdapter.createInputStreamPump(self)
    TCPSocketAdapter.fireEvent(self, "open")
  }
  onStartRequest(request, context) {}
  onDataAvailable(request, context, stream /*:nsIInputStream*/, offset, size) {
    const buffer = new ArrayBuffer(size)
    this.binaryInputStream.readArrayBuffer(size, buffer)
    TCPSocketAdapter.fireDataEvent(this, buffer)
  }
  onStopRequest(request, context, status) {
    console.log(`TCPSocketAdapter.notifyReadComplete ${status}`)
    this.inputStreamPump = null
    if (this.asyncCopierActive && status === Cr.NS_OK) {
      // If we have some buffered output still, and status is not an
      // error, the other side has done a half-close, but we don't
      // want to be in the close state until we are done sending
      // everything that was buffered. We also don't want to call onclose
      // yet.
      return undefined
    } else {
      return TCPSocketAdapter.maybeReportErrorAndCloseIfOpen(this, status)
    }
  }
  onInputStreamReady(asyncStream /*:nsIAsyncInputStream*/) /*:void*/ {
    // Only used for detecting if the connection was refused.
    try {
      const available = asyncStream.available()
      debug &&
        console.log(
          `TCPSocketAdapter.onInputStreamReady available: ${available}`
        )
    } catch (error) {
      debug &&
        console.log(`TCPSocketAdapter.onInputStreamReady unavailable: ${error}`)
      TCPSocketAdapter.maybeReportErrorAndCloseIfOpen(this, error)
    }
  }

  send(
    buffer /*:ArrayBuffer*/,
    byteOffset /*:number*/ = 0,
    byteLength = buffer.byteLength
  ) {
    if (this.readyState !== "open") {
      return IOError.throw("Socket is not open")
    }
    const stream = Cc[
      "@mozilla.org/io/arraybuffer-input-stream;1"
    ].createInstance(Ci.nsIArrayBufferInputStream)
    stream.setData(buffer, byteOffset, byteLength)
    return TCPSocketAdapter.send(this, stream, byteLength)
  }
  suspend() {}
  resume() {}
  close() {
    TCPSocketAdapter.close(this, true)
  }
  closeImmediately() {
    TCPSocketAdapter.close(this, false)
  }
  upgradeToSecure() {
    if (this.readyState !== "open") {
      return IOError.throw(Cr.NS_ERROR_FAILURE)
    }
    if (!this.ssl) {
      return
    }
    if (!this.asyncCopierActive) {
      TCPSocketAdapter.activateTLS(this)
    } else {
      this.waitingForStartTLS = true
    }
  }
}

class CopierObserver {
  /*::
  owner:TCPSocketAdapter
  */
  constructor(socket) {
    this.owner = socket
  }
  onStartRequest(request, context) {}
  onStopRequest(request, context, status) {
    TCPSocketAdapter.notifyCopyComplete(this.owner, status)
    delete this.owner
  }
}

const streams = ({ cloneScope, wrapPromise }) => {
  /*::

  interface ReadRequest<a> {
    resolve({done:true}|{done:false, value:a}):mixed;
  }

  interface ReadableController<a> {
    queue:Array<a>;

    close():void;
    enqueue(a):void;
    error(Error):void;

    CancelStep(?Error):?Promise<void>;
    PullStep():?Promise<void>;
  }

  interface ReadableDefaultController<a> extends ReadableController<a> {
    +desiredSize:number;
  }
  
  interface ReadableSource<a> {
    start(ReadableController<a>):?Promise<void>;
    pull(ReadableController<a>):?Promise<void>;
    cancel(?Error):Promise<void>;
  }

  interface ReadableByteSource extends ReadableSource<ArrayBuffer> {
    type:"bytes";
    autoAllocateChunkSize:?number;
  }

  interface ReaderLock<a> {
    reader:ReadableStreamDefaultReader<a>;
    readRequests:ReadRequest<a>[];
    resolve():mixed;
    reject(Error):mixed;
  }


  type ReadableState =
    | {status:'readable'}
    | {status:'closed'}
    | {status:'errored', error:Error}
  */

  class Readable /*::<a>*/ {
    /*::

    closed:Promise<?Error>
    stream:ReadableStream<a>
    controller:ReadableController<a>
    lock:?ReaderLock<a>
    state:ReadableState
    disturbed:boolean
    */
    constructor(stream /*:ReadableStream<a>*/, state, lock, disturbed) {
      this.stream = stream
      this.state = state
      this.lock = lock
      this.disturbed = disturbed
    }

    get locked() {
      return this.lock != null
    }
    get reader() {
      const { lock } = this
      return lock && lock.reader
    }
    getReader(options) {
      if (this.lock != null) {
        throw new TypeError(
          "This stream has already been locked for exclusive reading by another reader"
        )
      }

      const mode = options && options.mode
      switch (mode) {
        case undefined: {
          return this.createDefaultReader()
        }
        case "byob": {
          return this.createBYOBReader()
        }
        default: {
          throw new RangeError("Invalid mode is specified")
        }
      }
    }
    cancel(reason) {
      this.disturbed = true
      const { state } = this
      switch (state.status) {
        case "closed": {
          return voidPromise
        }
        case "errored": {
          return cloneScope.Promise.reject(state.error)
        }
        default: {
          return ReadableStreamCancel(this, reason)
          // this.closeStream()
          // return wrapPromise(this.controller.CancelStep(reason))
        }
      }
    }
    closeStream() {
      this.state = closedState
      const { lock } = this
      if (lock != null) {
        for (const { resolve } of lock.readRequests) {
          resolve(doneIteration)
        }
        lock.readRequests.length = 0
        lock.resolve()
      }
    }
    releaseLock() {
      const { lock } = this
      if (lock) {
        if (lock.readRequests.length > 0) {
          throw new TypeError(
            "Tried to release a reader lock when that reader has pending read() calls un-settled"
          )
        }

        if (this.state === "readable") {
          lock.reject(
            new TypeError(
              "Reader was released and can no longer be used to monitor the stream's closedness"
            )
          )
        }

        readables.delete(lock.reader)
        this.lock = null
      }
    }
    read() {
      this.disturbed = true
      const { state } = this
      switch (state.status) {
        case "closed":
          return doneIterationPromise
        case "errored":
          return cloneScope.Promise.reject(state.error)
        case "readable":
          return wrapPromise(this.controller.PullStep())
        default:
          throw RangeError(`Invalid stream state: ${state.status}`)
      }
    }

    createDefaultReader() {
      const reader = exportInstance(cloneScope, ReadableStreamDefaultReader)
      const closed = new cloneScope.Promise((resolve, reject) => {
        this.lock = { reader, resolve, reject, readRequests: [] }
      })
      readables.set(reader, this)
      const unwrappedReader = Cu.waiveXrays(reader)
      Reflect.set(unwrappedReader, "closed", { value: closed })
      return reader
    }
    createBYOBReader() {}

    static for(source /*:ReadableStream<a>|ReadableStreamDefaultReader<a>*/) {
      const state = readables.get(source)
      if (state == null) {
        throw TypeError("Unable to find ReadableStream state")
      } else {
        return state
      }
    }

    static createStream(source, strategy) {
      const stream = exportInstance(cloneScope, ReadableStream)
      const readable = new Readable(stream, readableState, null, false)
      const controler = this.createByteStreamController(
        readable,
        source,
        strategy
      )
      readables.set(stream, readable)
      return stream
    }
    static createByteStreamController(readable, source, strategy) {
      const controller = new ReadableByteStreamController()
      controller.readable = readable
      // controller.source = source
      // controller.strategy = strategy
      return controller
    }
  }
  const readables = new WeakMap()

  class ReadableByteStreamController {
    /*::
    readable:Readable<ArrayBuffer>
    size:number
    limit:number
    */
    enqueue(buffer /*:ArrayBuffer*/) {
      const { state } = this.readable
      switch (state.status) {
        case "readable": {
          const { byteLength } = buffer
          const byteOffset = 0
        }
        default: {
          throw new TypeError(
            `The stream (in ${
              state.status
            } state) is not in the readable state and cannot be enqueued to`
          )
        }
      }
    }
    CancelSteps(error) {}
    PullSteps() {}
  }

  class ReadableStreamDefaultController /*::<a> implements ReadableDefaultController<a>*/ {
    /*::
    size:number;
    limit:number;
    closeRequested:boolean;
    readable:Readable<a>;
    queue:a[];
    */
    get desiredSize() {
      return ReadableStreamDefaultControllerGetDesiredSize(this)
    }
    enqueue(chunk) {}
    error(reason) {}
    close() {
      if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
        throw new TypeError("The stream is not in a state that permits close")
      }

      ReadableStreamDefaultControllerClose(this)
    }

    CancelStep(error /*:?Error*/) /*:?Promise<void>*/ {}
    PullStep() /*:?Promise<void>*/ {}
  }

  const ReadableStream = exportClass(
    cloneScope,
    class ReadableStream /*::<a>*/ {
      /*::
      */
      constructor() {
        throw TypeError("Illegal constructor")
      }
      get locked() {
        return Readable.for(this).locked
      }
      cancel(reason) {
        const readable = Readable.for(this)
        if (readable.locked) {
          return unableToCancelLocked
        } else {
          return ReadableStreamCancel(readable, reason)
        }
      }
      getReader(config) {
        return Readable.for(this).getReader(config)
      }
      pipeThrough() {
        return new ExtensionError(
          "ReadableStream pipeThrough is not implemented"
        )
      }
      pipeTo() {
        return new ExtensionError("ReadableStream pipeTo is not implemented")
      }
      tee() {
        return new ExtensionError("ReadableStream pipeTo is not implemented")
      }
    }
  )

  const ReadableStreamDefaultReader = exportClass(
    cloneScope,
    class ReadableStreamDefaultReader /*::<a>*/ {
      /*::
      closed:Promise<?Error>
      */
      constructor() {
        throw TypeError("Illegal constructor")
      }
      cancel(reason) {
        const readable = Readable.for(this)
        if (readable.reader === this) {
          return readable.cancel(reason)
        } else {
          throw readerLockException("cancel")
        }
      }
      read() {
        const readable = Readable.for(this)
        if (readable.reader === this) {
          return readable.read()
        } else {
          throw readerLockException("read from")
        }
      }
      releaseLock() {
        const readable = Readable.for(this)
        if (readable.reader === this) {
          return readable.releaseLock()
        }
      }
    }
  )

  const ReadableStreamDefaultControllerGetDesiredSize = controller => {
    const { readable } = controller
    const { state } = readable
    switch (state.status) {
      case "errored":
        return 0
      case "closed":
        return 0
      default:
        return controller.limit - controller.size
    }
  }

  const ReadableStreamDefaultControllerCanCloseOrEnqueue = controller =>
    controller.closeRequested === false &&
    controller.readable.state.status === "readable"

  const ReadableStreamDefaultControllerClose = /*::<a>*/ (
    controller /*:ReadableStreamDefaultController<a>*/
  ) => {
    controller.closeRequested = true
    if (controller.queue.length === 0) {
      ReadableStreamClose(controller.readable)
    }
  }

  const ReadableStreamClose = /*::<a>*/ (readable /*:Readable<a>*/) => {
    readable.state = closedState
    const { lock } = readable
    if (lock) {
      for (const request of lock.readRequests) {
        request.resolve(doneIteration)
      }

      lock.readRequests.length = 0
      defaultReaderClosedPromiseResolve(lock)
    }
  }

  const ReadableStreamCancel = /*::<a>*/ (
    readable /*:Readable<a>*/,
    reason /*:?Error*/
  ) /*:Promise<void>*/ => {
    readable.disturbed = true
    const { state, controller } = readable
    switch (state.status) {
      case "closed": {
        return voidPromise
      }
      case "errored": {
        return cloneScope.Promise.reject(state.error)
      }
      default: {
        ReadableStreamClose(readable)
        return wrapPromise(controller.CancelStep(reason))
      }
    }
  }

  const defaultReaderClosedPromiseResolve = /*::<a>*/ (
    lock /*:ReaderLock<a>*/
  ) => {
    lock.resolve()
    delete lock.resolve
    delete lock.reject
  }

  const readerLockException = name =>
    new ExtensionError(`Cannot ${name} a stream using a released reader`)

  const doneIteration = Cu.cloneInto({ done: true }, cloneScope)
  const voidPromise = cloneScope.Promise.resolve()
  const doneIterationPromise = cloneScope.Promise.resolve(doneIteration)
  const unableToCancelLocked = cloneScope.Promise.reject(
    new ExtensionError("Cannot cancel a stream that already has a reader")
  )
  const closedState = { status: "closed" }
  const readableState = { status: "readable" }
}

const debug = true
