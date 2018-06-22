// @flow

// This implementation uses IDBMutableFile API
// https://developer.mozilla.org/en-US/docs/Web/API/IDBMutableFile

const RandomAccess = require("random-access-storage")
const { Buffer } = require("Buffer")

const promise = request =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

class RandomAccessIDBFileVolume {
  constructor(db, name, version, storeName, options) {
    this.db = db
    this.name = name
    this.version = version
    this.storeName = storeName
    this.options = options
  }
  store() {
    const { db, storeName } = this
    const transaction = db.transaction([storeName], "readwrite")
    return transaction.objectStore(storeName)
  }
  async delete(url) {
    return await promise(this.store().delete(url))
  }
  async save(url, file) {
    return await promise(this.store().put(file, url))
  }
  async open(url, mode) {
    const file = await promise(this.store().get(url))
    if (file) {
      return file
    } else if (mode === "readwrite") {
      const file = await promise(
        this.db.createMutableFile(url, "binary/random")
      )
      await this.save(url, file)
      return file
    } else {
      throw new RangeError(`File ${url} does not exist`)
    }
  }

  mount(file, options) {
    return new RandomAccessIDBFile(this, `/${file}`, options)
  }
}

class RandomAccessIDBFile extends RandomAccess {
  static async mount(options = {}) {
    if (!self.IDBMutableFile) {
      throw Error(
        `Implementation depends on IDBMutableFile https://developer.mozilla.org/en-US/docs/Web/API/IDBMutableFile`
      )
    } else {
      const name = options.name || `RandomAccess`
      const version = options.version || 1.0
      const storeName = options.storeName || `IDBMutableFile`

      const request = indexedDB.open(name, version)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName)
        }
      }
      const db = await promise(request)
      const volume = new RandomAccessIDBFileVolume(
        db,
        name,
        version,
        storeName,
        options
      )
      return (path, options) => volume.mount(path, options)
    }
  }
  static async open(self, { mode }) {
    self.debug && console.log(`>> open ${self.url} ${mode}`)

    if (!self.file || (self.mode !== mode && mode === "readwrite")) {
      self.mode = mode
      self.file = await self.volume.open(self.url, mode)
    }

    self.debug && console.log(`<< open ${self.url} ${mode}`)
    return self
  }
  static async read(self, { data, offset, size }) {
    self.debug && console.log(`>> read ${self.url} <${offset}, ${size}>`)
    const buffer = data || Buffer.allocUnsafe(size)
    if (size === 0) {
      return buffer
    }

    const file = self.activate()
    file.location = offset
    const chunk = await promise(file.readAsArrayBuffer(size))

    Buffer.from(chunk).copy(buffer)
    self.debug &&
      console.log(`<< read ${self.url} <${offset}, ${size}>`, buffer)
    return buffer
  }
  static async write(self, { data, offset, size }) {
    self.debug && console.log(`>> write ${self.url} <${offset}, ${size}>`, data)
    const { byteLength, byteOffset } = data
    const chunk =
      byteLength === size
        ? byteOffset > 0
          ? data.buffer.slice(byteOffset)
          : data.buffer
        : byteLength > size
          ? data.buffer.slice(byteOffset, byteOffset + size)
          : byteOffset > 0
            ? data.buffer.slice(byteOffset)
            : data.buffer

    const file = self.activate()
    file.location = offset
    const wrote = await file.write(chunk)

    self.debug &&
      console.log(`<< write ${wrote} ${self.url} <${offset}, ${size}>`)

    return wrote
  }
  static async delete(self, { offset, size }) {
    this.debug && console.log(`>> delete ${self.url} <${offset}, ${size}>`)
    const state = await this.stat(self)
    if (offset + size > stat.size) {
      const file = self.activate()
      await promise(file.truncate(offset))
    }

    this.debug && console.log(`<< delete ${self.url} <${offset}, ${size}>`)
  }
  static async stat(self) {
    self.debug && console.log(`>> stat ${self.url}`)
    const file = self.activate()
    const stat = await promise(file.getMetadata())
    self.debug && console.log(`<< stat {size:${stat.size}} ${self.url} `)

    return stat
  }
  static async close(self) {
    self.debug && console.log(`>> close ${self.url}`)
    const { lockedFile } = this
    if (lockedFile.active) {
      await promise(lockedFile.flush())
    }
    this.lockedFile = null
    this.file = null
    self.debug && console.log(`<< close ${self.url}`)
  }
  static async destroy(self) {
    self.debug && console.log(`>> destroy ${self.url}`)
    await self.volume.delete(self.url)
    self.debug && console.log(`<< destroy ${self.url}`)
  }

  static async awake(self) {
    const { workQueue } = self
    self.isIdle = false
    let index = 0
    while (index < workQueue.length) {
      const request = workQueue[index++]
      await this.wait(self, request)
    }
    workQueue.length = 0
    self.isIdle = true
    // if (self.file) {
    //   await self.volume.save(self.url, self.file)
    // }
  }
  static schedule(self, request) {
    self.workQueue.push(request)
    if (self.isIdle) {
      this.awake(self)
    }
  }
  static perform(self, request) {
    switch (request.type) {
      case RequestType.open: {
        return this.open(self, request)
      }
      case RequestType.read: {
        return this.read(self, request)
      }
      case RequestType.write: {
        return this.write(self, request)
      }
      case RequestType.delete: {
        return this.delete(self, request)
      }
      case RequestType.stat: {
        return this.stat(self, request)
      }
      case RequestType.close: {
        return this.close(self, request)
      }
      case RequestType.destroy: {
        return this.destory(self, request)
      }
    }
  }
  static async wait(self, request) {
    try {
      const result = await this.perform(self, request)
      request.callback(null, result)
    } catch (error) {
      request.callback(error)
    }
  }
  _open(request) {
    request.mode = "readwrite"
    RandomAccessIDBFile.schedule(this, request)
  }
  _openReadonly(request) {
    request.mode = "readonly"
    RandomAccessIDBFile.schedule(this, request)
  }
  _write(request) {
    RandomAccessIDBFile.schedule(this, request)
  }
  _read(request) {
    RandomAccessIDBFile.schedule(this, request)
  }
  _del(request) {
    RandomAccessIDBFile.schedule(this, request)
  }
  _stat(request) {
    RandomAccessIDBFile.wait(this, request)
  }
  _close(request) {
    RandomAccessIDBFile.schedule(this, request)
  }
  _destroy(request) {
    RandomAccessIDBFile.schedule(this, request)
  }
  constructor(volume, url, options) {
    super()
    this.volume = volume
    this.url = url
    this.options = options
    this.file = null
    this.mode = null
    this.lockedFile = null

    this.workQueue = []
    this.isIdle = true
    this.debug = !!volume.options.debug
  }
  activate() {
    const { lockedFile, file, mode } = this
    if (lockedFile && lockedFile.active) {
      return lockedFile
    } else {
      const lockedFile = file.open(mode)
      this.lockedFile = lockedFile
      return lockedFile
    }
  }
}

const RequestType = {
  open: 0,
  read: 1,
  write: 2,
  delete: 3,
  stat: 4,
  close: 5,
  destroy: 6
}

module.exports = RandomAccessIDBFile
