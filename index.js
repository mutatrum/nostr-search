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

pool.on('open', relay => {
  relay.subscribe("subid", {kinds:[0]})
});

pool.on('eose', relay => {
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

    if (!isCreatingNewIndex) {
      isCreatingNewIndex = true
      setTimeout(createNewWorker, process.env.REBUILD)
    }
  } catch(syntaxError) {
    // console.log(event.content)
  }
});

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


const { Worker } = require('worker_threads')

let idxWorker = null

var isCreatingNewIndex = true
createNewWorker()
    
function createNewWorker() {
  const worker = new Worker('./search.js', { workerData: { storage: STORAGE } })
  worker.on('error', (err) => { throw err })
  worker.once('message', (data) => {

    const prevWorker = idxWorker
    idxWorker = worker;
    isCreatingNewIndex = false

    if (prevWorker) {
      prevWorker.removeAllListeners()
      prevWorker.postMessage({type: 'exit'})
      prevWorker.unref()
      prevWorker.terminate()
    }
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

      const start = Date.now()

      if (key in STORAGE) {
        const pubkey = key
        res.write("[")
        res.write(JSON.stringify({pubkey: pubkey, npub: pubkeytonpub(pubkey), metadata: STORAGE[pubkey] }))
        res.write("]")
        res.end();
        return
      }
      const pubkey = npubtopubkey(key)
      if (pubkey && pubkey in STORAGE) {
        res.write("[")
        res.write(JSON.stringify({pubkey: pubkey, npub: pubkeytonpub(pubkey), metadata: STORAGE[pubkey] }))
        res.write("]")
        res.end();
        return
      }

      idxWorker.once('message', ({result}) => {

        res.write("[")
        var count = 0
        for (var entry of result) {
          var pubkey = entry.ref
          if (count != 0) res.write(",")
          res.write(JSON.stringify({pubkey: pubkey, npub: pubkeytonpub(pubkey), metadata: STORAGE[pubkey] }))
          count++
          if (count === 100) break
        }
        res.write("]")
       
        res.end();

        console.log(`Search: "${key}" yields ${count} results in ${Date.now() - start}ms`)
      })

      idxWorker.postMessage({type: 'search', key: key})

      return
    }
  }
  res.writeHead(404).end();
};

const server = http.createServer(requestListener);

