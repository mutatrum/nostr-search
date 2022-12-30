const dotenv = require('dotenv');
dotenv.config();

const http = require("http");
const fs = require('fs').promises;
const { RelayPool } = require('nostr');
const { pubkeytonpub, npubtopubkey } = require('./npub')

const relays = process.env.RELAYS.split(',')
const pool = RelayPool(relays)

const HOST = process.env.HOST
const PORT = process.env.PORT

const STORAGE = {}
var updates = 0
var indexDate = Date.now()

const { Worker } = require('worker_threads')

let indexWorker = null

var isCreatingNewIndex = true

pool.on('open', relay => {
  console.log(`Open ${JSON.stringify(relay.url)}`)
  relay.subscribe("subid", {kinds:[0]})
});

pool.on('eose', relay => {
  console.log(`Close ${JSON.stringify(relay.url)}`)
  relay.close()
});

pool.on('event', (relay, sub_id, event) => {
  const pubkey = event.pubkey

  const previousEvent = STORAGE[pubkey]
  if (previousEvent && previousEvent.created_at > event.created_at) {
    return
  }
  try {

    STORAGE[pubkey] = JSON.parse(event.content);

    updates++
  } catch(syntaxError) {
    // console.log(event.content)
  }
});

setInterval(() => {
  var indexAge = Date.now() - indexDate
  // console.log(`Index age: ${indexAge}ms, updates: ${updates}`)
  if (isCreatingNewIndex) return
  if ((Date.now() - indexDate > process.env.REBUILD) || (updates > 100)) createNewIndexWorker()
}, 1000)

setInterval(() => pool.send(JSON.stringify({ event: "ping" })), 10000)

fs.readFile(__dirname + "/index.html")
    .then(contents => {
        indexFile = contents;
        server.listen(PORT, HOST, () => {
            console.log(`Server is running on http://${HOST}:${PORT}`);
        });
    })
    .catch(err => {
        console.error(`Could not read index.html file: ${err}`);
        process.exit(1);
    });


function createNewIndexWorker() {
  isCreatingNewIndex = true

  // console.log(`Creating new index`)
  const newWorker = new Worker('./search.js', { workerData: { storage: STORAGE } })
  newWorker.on('error', (err) => { throw err })
  newWorker.once('message', (msg) => {
    if (msg === 'ready') {
      const oldWorker = indexWorker

      indexWorker = newWorker
      indexDate = Date.now()
      isCreatingNewIndex = false
      updates = 0
  
      if (oldWorker) {
        oldWorker.removeAllListeners()
        oldWorker.postMessage({type: 'exit'})
        oldWorker.unref()
        oldWorker.terminate()
      }
      return;
    }
    console.log(`Unknown message: ${msg}`)
  })
}

const requestListener = function (req, res) {
  console.log(`${req.method} ${req.url}`)
  const url = new URL(req.url, `https://${HOST}/`)
  if (url.pathname === '/' && req.method === 'GET') {
    res.setHeader("Content-Type", "text/html")
    res.writeHead(200)
    res.end(indexFile)
    return
  }
  if (url.pathname === '/api/search' && req.method === 'GET') {
    const key = url.searchParams.get('search')
    if (key) {
      res.setHeader("Content-Type", "application/json")
      res.writeHead(200)
      if (key in STORAGE) {
        res.write("[")
        res.write(output(key))
        res.write("]")
        res.end();
        return
      }
      const pubkey = npubtopubkey(key)
      if (pubkey && pubkey in STORAGE) {
        res.write("[")
        res.write(output(pubkey))
        res.write("]")
        res.end();
        return
      }

      const start = Date.now()
      indexWorker.once('message', ({result}) => {
        res.write("[")
        var count = 0
        for (var entry of result) {
          var pubkey = entry.ref
          if (count != 0) res.write(",")
          res.write(output(pubkey))
          count++
          if (count === 100) break
        }
        res.write("]")
       
        res.end();

        console.log(`Search: "${key}" yields ${count} results in ${Date.now() - start}ms`)
      })

      indexWorker.postMessage({type: 'search', key: key})

      return
    }
  }
  res.writeHead(404).end();
};

function output(pubkey) {
  return JSON.stringify({pubkey: pubkey, npub: pubkeytonpub(pubkey), metadata: STORAGE[pubkey] })
}

createNewIndexWorker()
    
const server = http.createServer(requestListener);