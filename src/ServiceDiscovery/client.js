// @flow
/*::
import { Components, Cu, Cr, Ci, Cc, nsIMessageListenerManager, ExtensionAPI } from "gecko"
import type { BaseContext } from "gecko"
import type {
  Protocol,
  ServiceDiscovery,
  ServiceInfo,
  ServiceQuery,
  Discovery,
  ServiceAddress,
  DiscoveryResult,
  DiscoveredService
} from "./ServiceDiscovery"

import type {
  RegisteredService,
  HostService,
  Inbox,
  DiscoveryMessage
} from "./Format"

interface Host {
  +ServiceDiscovery: ServiceDiscovery;
}
*/

{
  const { ExtensionUtils } = Cu.import(
    "resource://gre/modules/ExtensionUtils.jsm",
    {}
  )

  const { ExtensionError, getUniqueId } = ExtensionUtils

  const getAPIClasses = (context, refs) => {
    class DiscoveredService {
      /*::
    name: string;
    type: string;
    domain: string;
    protocol: Protocol;
    lost:boolean;
    attributes:?{[string]:string};
    */
      constructor() {
        throw TypeError("Illegal constructor")
      }
      addresses() /*: Promise<ServiceAddress[]>*/ {
        const client = refs.DiscoveredService.get(this)
        if (client) {
          return client.addresses()
        } else {
          throw notFound
        }
      }
    }
    class Service {
      /*::
    name: string;
    type: string;
    domain: string;
    port: number;
    host: ?string;
    protocol: Protocol;
    attributes: ?{ [string]: string };
    */
      constructor() {
        throw TypeError("Illegal constructor")
      }
      expire() /*: Promise<void>*/ {
        const client = refs.Service.get(this)
        if (!client) {
          return notFoundPromise()
        } else {
          return client.expire()
        }
      }
    }
    class Discovery {
      /*::
    @@asyncIterator: () => self
    query: ServiceQuery;
    */
      constructor() {
        throw TypeError("Illegal constructor")
      }
      next() {
        const client = refs.Discovery.get(this)
        if (client) {
          return client.next()
        } else {
          return notFoundPromise()
        }
      }
      return() {
        const client = refs.Discovery.get(this)
        if (client) {
          return client.return()
        } else {
          return notFoundPromise()
        }
      }
    }

    const notFound = new ExtensionError("Host for the object not found")
    let notFoundPromiseCache = null

    const notFoundPromise = () => {
      if (notFoundPromiseCache) {
        return notFoundPromiseCache
      } else {
        notFoundPromiseCache = context.cloneScope.Promise.reject(notFound)
        return notFoundPromiseCache
      }
    }

    return {
      Service: exportClass(context.cloneScope, Service),
      Discovery: exportAsyncIterator(context.cloneScope, Discovery),
      DiscoveredService: exportClass(context.cloneScope, DiscoveredService)
    }
  }

  const getServiceDiscoveryAPI = (context) /*:ServiceDiscovery*/ => {
    const { cloneScope } = context
    const refs = {
      Service: new WeakMap(),
      Discovery: new WeakMap(),
      DiscoveredService: new WeakMap()
    }
    const subscribers = {
      Discovery: new Map()
    }
    const host = HostAPI.new(context)
    const api = getAPIClasses(context, refs)

    class ServiceClient {
      /*::
    expired:boolean
    id:string
    */
      constructor(id) {
        this.id = id
        this.expired = false
      }
      static announce(serviceInfo) {
        return new cloneScope.Promise(async (resolve, reject) => {
          try {
            const protocol = parseProtocol(serviceInfo.protocol)
            serviceInfo.attributes = parseAttributes(serviceInfo.attributes)

            const info = await host.startService(serviceInfo)

            const { serviceID, name, type, port, domain, attributes } = info
            const service = exportInstance(cloneScope, api.Service, {
              name,
              type,
              protocol,
              port,
              domain,
              attributes: Cu.cloneInto(attributes, cloneScope)
            })
            refs.Service.set(service, new ServiceClient(serviceID))

            resolve(service)
          } catch (error) {
            reject(ExtensionError(error))
          }
        })
      }
      expire() {
        if (this.expired) {
          return voidPromise
        } else {
          return context.wrapPromise(host.stopService({ serviceID: this.id }))
        }
      }
    }

    class DiscoveryClient {
      /*::
    id:number
    serviceQuery:ServiceQuery
    scope:Object
    requests:{resolve({done:false, value:DiscoveredService}|{done:true}):void, reject(Error):void}[]
    responses:Promise<{done:false, value:DiscoveredService}>[]
    done:Promise<{done:true, value:void}>
    isDone:boolean
    onBreak:({done:true}) => void
    onError:(Error) => void
    */
      static discover(serviceQuery /*:ServiceQuery*/) {
        const protocol = parseProtocol(serviceQuery.protocol)
        const { type } = serviceQuery
        const id = getUniqueId()
        const discovery = exportInstance(context.cloneScope, api.Discovery)
        const query = Cu.cloneInto(serviceQuery, context.cloneScope)
        const unwrapped = Cu.waiveXrays(discovery)
        Reflect.defineProperty(unwrapped, "query", { value: query })
        const client = new DiscoveryClient(cloneScope, id)
        refs.Discovery.set(discovery, client)
        subscribers.Discovery.set(id, client)
        client.start(serviceQuery)
        return discovery
      }
      constructor(scope, id) {
        this.id = id
        this.scope = scope
        this.isDone = false
        this.requests = []
        this.responses = []
      }
      start(serviceQuery) {
        this.done = new this.scope.Promise((resolve, reject) => {
          this.onBreak = resolve
          this.onError = reject

          host.startDiscovery({ discoveryID: this.id }, serviceQuery)
        })
      }
      found(serviceInfo) {
        const service = DiscoveredServiceClient.create(serviceInfo, false)
        this.contiune(service)
      }
      lost(serviceInfo) {
        const service = DiscoveredServiceClient.create(serviceInfo, true)
        this.contiune(service)
      }
      contiune(service) {
        const { requests, isDone, responses, scope } = this
        if (isDone) {
          throw Error("Received serviceInfo event after discovery was ended")
        } else {
          const request = requests.shift()
          const nextIteration = Cu.cloneInto(
            { done: false /*::,value:service*/ },
            cloneScope
          )
          Reflect.defineProperty(Cu.unwaiveXrays(nextIteration), "value", {
            value: service
          })

          if (request) {
            request.resolve(nextIteration)
          } else {
            responses.push(scope.Promise.resolve(nextIteration))
          }
        }
      }
      break() {
        const { requests } = this
        for (const request of requests) {
          request.resolve(doneIteration)
        }
        subscribers.Discovery.delete(this.id)
        this.onBreak(doneIteration)
      }
      throw(error) {
        const { requests } = this
        for (const request of requests) {
          request.reject(error)
        }
        this.onError(error)
      }
      next() {
        const { responses, requests, done, isDone, scope } = this
        const response = responses.shift()
        if (response) {
          return response
        } else if (isDone) {
          return done
        } else {
          return new scope.Promise((resolve, reject) => {
            requests.push({ resolve, reject })
          })
        }
      }
      return() {
        const { isDone, done, id } = this
        if (!isDone) {
          this.isDone = true
          host.stopDiscovery({ discoveryID: id })
        }
        return done
      }
      update(message) {
        switch (message.type) {
          case "onStopDiscoveryFailed": {
            return this.throw(
              new ExtensionError(
                `Failed to stop discovery ${message.errorCode}`
              )
            )
          }
          case "onStartDiscoveryFailed": {
            return this.throw(
              new ExtensionError(
                `Failed to start discovery ${message.errorCode}`
              )
            )
          }
          case "onDiscoveryStopped": {
            return this.break()
          }
          case "onServiceLost": {
            return this.lost(message.lost)
          }
          case "onServiceFound": {
            return this.found(message.found)
          }
        }
      }

      static close() {
        inbox.removeMessageListener(INBOX, DiscoveryClient)
      }
      static subscribe() {
        context.callOnClose(DiscoveryClient)
        inbox.addMessageListener(INBOX, DiscoveryClient.receiveMessage)
      }
      static receiveMessage({ data }) {
        const client = subscribers.Discovery.get(data.to)
        if (client) {
          client.update(data)
        } else {
          throw new RangeError(
            `Unable to receive Discovery message for ${data.to}`
          )
        }
      }
    }

    class DiscoveredServiceClient {
      /*::
    id:string;
    serviceInfo:DiscoveryResult
    serviceAddresses:?Promise<ServiceAddress[]>;
    lost:boolean
    attributes:?{[string]:string}
    */
      static create(serviceInfo, lost) {
        const { name, type, domain, protocol, attributes } = serviceInfo
        const client = new DiscoveredServiceClient(serviceInfo, lost)
        const discoveredService = exportInstance(
          context.cloneScope,
          api.DiscoveredService,
          {
            name,
            type,
            domain,
            protocol,
            attributes,
            lost
          }
        )
        refs.DiscoveredService.set(discoveredService, client)

        return discoveredService
      }
      constructor(serviceInfo, lost) {
        this.serviceInfo = serviceInfo
        this.lost = lost
      }
      createAddress(address) {
        return Cu.cloneInto(address, cloneScope)
      }
      addresses() {
        if (this.serviceAddresses) {
          return this.serviceAddresses
        } else {
          const addresses = new cloneScope.Promise(async (resolve, reject) => {
            try {
              const addresses = await host.resolveService(this.serviceInfo)
              resolve(
                Cu.cloneInto(addresses.map(this.createAddress), cloneScope)
              )
            } catch (error) {
              reject(new ExtensionError(`Failed to resolve addresses ${error}`))
            }
          })
          this.serviceAddresses = addresses
          return addresses
        }
      }
    }

    const voidPromise = cloneScope.Promise.resolve()
    const doneIteration = Cu.cloneInto({ done: true }, context.cloneScope)
    Reflect.preventExtensions(Cu.waiveXrays(doneIteration))

    const INBOX /*:Inbox*/ = "/libdweb/ServiceDiscovery/Discovery"
    const inbox /*:nsIMessageListenerManager<{name:Inbox, data:DiscoveryMessage}>*/ =
      context.childManager.messageManager

    DiscoveryClient.subscribe()

    return {
      tcp: "tcp",
      udp: "udp",
      announce: ServiceClient.announce,
      discover: DiscoveryClient.discover
    }
  }

  class HostAPI /*::implements HostService*/ {
    /*::
  context:BaseContext
  */
    constructor(context) {
      this.context = context
    }
    static new(context) /*:HostService*/ {
      return new this(context)
    }
    startService(serviceInfo /*:ServiceInfo*/) /*:Promise<RegisteredService>*/ {
      return this.context.childManager.callParentAsyncFunction(
        "ServiceDiscovery.startService",
        [serviceInfo]
      )
    }
    stopService(address) /*:Promise<void>*/ {
      return this.context.childManager.callParentAsyncFunction(
        "ServiceDiscovery.stopService",
        [address]
      )
    }
    resolveService(serviceInfo) /*:Promise<ServiceAddress[]>*/ {
      return this.context.childManager.callParentAsyncFunction(
        "ServiceDiscovery.resolveService",
        [serviceInfo]
      )
    }
    startDiscovery(discoveryID, query /*:ServiceQuery*/) {
      return this.context.childManager.callParentFunctionNoReturn(
        "ServiceDiscovery.startDiscovery",
        [discoveryID, query]
      )
    }
    stopDiscovery(discoveryID) {
      this.context.childManager.callParentFunctionNoReturn(
        "ServiceDiscovery.stopDiscovery",
        [discoveryID]
      )
    }
  }

  global.ServiceDiscovery = class extends ExtensionAPI /*::<Host>*/ {
    getAPI(context) {
      return {
        ServiceDiscovery: getServiceDiscoveryAPI(context)
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

  const exportAsyncIterator = /*::<b:Object, a:Class<b>>*/ (
    scope /*:Object*/,
    constructor /*:a*/
  ) /*:a*/ => {
    const $Symbol /*:any*/ = Symbol
    const prototype /*:Object*/ = constructor.prototype
    prototype[$Symbol.asyncIterator] = function() {
      return this
    }
    return exportClass(scope, constructor)
  }

  const parseProtocol = protocol => {
    switch (protocol) {
      case "udp":
      case "tcp":
        return protocol
      default:
        throw new ExtensionError(
          `Invalid protocol ${protocol} must be either "udp" or "tcp"`
        )
    }
  }

  const parseAttributes = (attributes) /*:?{[string]:string}*/ => {
    if (!attributes) {
      return null
    } else {
      const result /*:Object*/ = Object.create(null)
      for (const key in attributes) {
        result[key] = String(attributes[key])
      }
      return result
    }
  }
}
