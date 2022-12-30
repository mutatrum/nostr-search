const { randomUUID } = require('crypto')
const lunr = require('lunr')

const { parentPort, workerData } = require('worker_threads')
const { storage } = workerData

const workerId = randomUUID()

setInterval(() => {
  console.log(`Worker ${workerId}`)
}, 10000)

console.log(workerId)

var filterImageData = function (builder) {
  var pipelineFunction = function (token) {
    var t = token.toString()
    if (t.startsWith("data:image/")) {
      return token.update(function () { return t.substring(0, t.indexOf(','))})
    } else {
      // if (t.length > 100 && t.indexOf(' ') === -1) {
      //   return null
      // }
      return token
    }
  }

  lunr.Pipeline.registerFunction(pipelineFunction, 'filterImageData')

  builder.pipeline.before(lunr.stemmer, pipelineFunction)
}

const start = Date.now()

var columns = ['pubkey']
for (var pubkey in storage) {
  const metadata = storage[pubkey]
  for (var key of Object.keys(metadata)) {
    if (columns.indexOf(key) === -1) {
      columns.push(key)
    }
  }
}

var idx = lunr(function() {
  this.tokenizer.separator = ''
  this.use(filterImageData)
  this.ref('pubkey')
  for (var key of columns) this.field(key)
  for (var pubkey in storage) {
    const metadata = storage[pubkey]
    metadata.pubkey = pubkey
    this.add(metadata)
  }
})

console.log(`Building index with ${Object.keys(storage).length} keys took ${Date.now() - start}ms ${Math.round(JSON.stringify(idx).length / 1024 / 1024)}mb`)

parentPort.on('message', ({type, key}) => {
  if (type === 'search') {
    parentPort.postMessage({result: idx.search(key)})
  }
  if (type === 'exit') {
    parentPort.removeAllListeners()
    idx = null
  }
})

parentPort.on('exit', (msg) => {
  console.log(`exit: ${msg}`)
})

parentPort.postMessage('ready')
