// @noflow

const cluster = require("cluster")
const path = require("path")
const {
  Builder,
  Capabilities,
  By,
  until,
  logging
} = require("selenium-webdriver")
const firefox = require("selenium-webdriver/firefox")
const geckodriver = require("geckodriver")
const { Command } = require("selenium-webdriver/lib/command")
const fs = require("mz/fs")
const TEST_TIMEOUT = 5000
const fxUtil = require("fx-runner/lib/utils")
const OS = require("os")
const finished = require("tap-finished")
const child = require("child_process")

const run = async testPath => {
  const extensionPath = path.join(process.cwd(), testPath)
  const driver = await launchBrowser({ extensionPath })
  // await runExtensionTest(driver, extensionPath)
}

const runExtensionTest = async (driver, extensionDirName) => {
  const userAgent = await driver.executeScript(() => window.navigator.userAgent)
  console.log(`Connected to browser: ${userAgent}"`)
}

const OUTPUT_PREFIX = "console.log: WebExtensions:"

const onexit = process =>
  new Promise(resolve => {
    process.on("beforeExit", resolve)
  })

const launchBrowser = async ({ extensionPath }) => {
  process.env.MOZ_DISABLE_CONTENT_SANDBOX = 1
  const binary = await findFirefox(process.env.MOZ_BINARY || "nightly")

  logging.installConsoleHandler()
  const log = new logging.Preferences()
  log.setLevel(logging.Type.BROWSER, logging.Level.DEBUG)

  const capabilities = new Capabilities().set("marionette", true)
  const options = new firefox.Options()
    .setPreference("log", "{level: info}")
    .setBinary(binary)
    .setLoggingPrefs(log)

  if (process.env.HEADLESS === "1") {
    options.headless()
  }

  const service = new firefox.ServiceBuilder(geckodriver.path).setStdio([
    "inherit",
    "inherit",
    "inherit"
  ])

  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    // .withCapabilities(capabilities)
    .build()

  const command = new Command("install addon")
    .setParameter("path", extensionPath)
    .setParameter("temporary", true)

  driver.execute(command)

  const code = await onexit(process)
  await driver.quit()
}

const findFirefox = async binaryPath => {
  const binary = await fxUtil.normalizeBinary(binaryPath)
  if (fs.exists(binary)) {
    return binary
  } else {
    throw new Error(`Could not find ${binaryPath}`)
  }
}

const main = (program, script, testPath) => {
  if (cluster.isMaster) {
    cluster.setupMaster({
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    })
    const worker = cluster.fork()
    const tap = finished(results => {
      worker.kill()
      if (results.ok) {
        process.exit(0)
      } else {
        process.exit(1)
      }
    })

    worker.process.stdout.on("data", chunk => {
      for (const line of chunk.toString().split("\n")) {
        if (line === `${OUTPUT_PREFIX} ---------- FIN ----------`) {
          tap.end()
        } else if (line.startsWith(OUTPUT_PREFIX)) {
          const message = line.substr(OUTPUT_PREFIX.length + 1)
          if (message != "") {
            tap.write(`${message}\n`)
            process.stdout.write(`${message}\n`)
          }
        } else {
          process.stdout.write(`${line}\n`)
        }
      }
    })
    worker.on("exit", code => {
      process.exit(code)
    })
  } else {
    run(testPath)
  }
}

main(...process.argv)
