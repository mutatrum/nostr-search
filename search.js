const lunr = require('lunr')

const { parentPort, workerData } = require('worker_threads')
const { storage } = workerData

var filterImageData = function (builder) {
  var pipelineFunction = function (token) {
    var t = token.toString()
    if (t.startsWith("data:image/")) {
      return token.update(function () { return t.substring(0, t.indexOf(','))})
    } else {
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

parentPort.on('message', ({key}) => parentPort.postMessage({result: idx.search(key)}))

parentPort.on('exit', () => {
  idx = null
})

parentPort.postMessage('ready')
