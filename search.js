const lunr = require('lunr')
const fs = require('fs')

const { parentPort, workerData } = require('worker_threads')
const { storage } = workerData

let filterImageData = function (builder) {
  let pipelineFunction = function (token) {
    let t = token.toString()
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

let start = Date.now()

// fs.writeFileSync('storage.json', JSON.stringify(storage))

let columns = ['pubkey']
for (var pubkey in storage) {
  let metadata = storage[pubkey].metadata
  for (var key of Object.keys(metadata)) {
    if (columns.indexOf(key) === -1) {
      columns.push(key)
    }
  }
}

let idx = lunr(function() {
  // this.tokenizer.separator = '/[\s\-]+/'
  this.use(filterImageData)
  this.ref('pubkey')
  for (var key of columns) this.field(key)
  for (var pubkey in storage) {
    let metadata = storage[pubkey].metadata
    metadata.pubkey = pubkey
    this.add(metadata)
  }
})

console.log(`Building index with ${Object.keys(storage).length} keys took ${Date.now() - start}ms ${Math.round(JSON.stringify(idx).length / 1024 / 1024)}mb`)

parentPort.on('message', ({type, key}) => {
  if (type === 'search') {
    try {
      parentPort.postMessage({result: idx.search(key)})
    } catch(error) {
      parentPort.postMessage({error: error.message})
    }
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
