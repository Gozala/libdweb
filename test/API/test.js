// @noflow

const { test } = browser.test

test("TCPSocket", test => {
  const { TCPSocket } = browser
  test.equal(typeof TCPSocket, "object", "TCPSocket API available")
  test.equal(
    typeof TCPSocket.listen,
    "function",
    "TCPSocket.listen is a function"
  )
  test.equal(
    typeof TCPSocket.connect,
    "function",
    "TCPSocket.connect is a function"
  )
})

test("UDPSocket", test => {
  const { UDPSocket } = browser
  test.notEqual(typeof UDPSocket.FAMILY_INET, "undefined")
  test.notEqual(typeof UDPSocket.FAMILY_INET6, "undefined")
  test.notEqual(typeof UDPSocket.FAMILY_LOCAL, "undefined")
  test.equal(typeof UDPSocket, "object", "UDPSocket API available")
  test.equal(
    typeof UDPSocket.create,
    "function",
    "UDPSocket.create is a function"
  )
  test.equal(
    typeof UDPSocket.close,
    "function",
    "UDPSocket.close is a function"
  )
  test.equal(
    typeof UDPSocket.messages,
    "function",
    "UDPSocket.messages is a function"
  )
  test.equal(
    typeof UDPSocket.setMulticastInterface,
    "function",
    "UDPSocket.setMulticastLoopback is a function"
  )

  test.equal(
    typeof UDPSocket.setMulticastInterface,
    "function",
    "UDPSocket.setMulticastInterface is a function"
  )

  test.equal(
    typeof UDPSocket.addMembership,
    "function",
    "UDPSocket.addMembership is a function"
  )

  test.equal(
    typeof UDPSocket.dropMembership,
    "function",
    "UDPSocket.dropMembership is a function"
  )
})

test("FileSystem", test => {
  const { FileSystem, File } = browser
  test.equal(typeof FileSystem, "object", "FileSystem API available")
  test.equal(typeof File, "object", "File API available")
})

test("ServiceDiscovery", test => {
  const { ServiceDiscovery } = browser
  test.equal(
    typeof ServiceDiscovery,
    "object",
    "ServiceDiscovery API available"
  )
})

test("protocol", test => {
  const { protocol } = browser
  test.equal(typeof protocol, "object", "protocol API available")
})
