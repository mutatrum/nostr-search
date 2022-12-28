const http = require("http");
const fs = require('fs').promises;
const { RelayPool } = require('nostr');
const { bech32 } = require('bech32')

const damus = "wss://relay.damus.io"
const scsi = "wss://nostr-pub.wellorder.net"
const rocks = "wss://nostr.rocks"
const semisol = "wss://nostr-pub.semisol.dev"
const zebedee = "wss://nostr.zebedee.cloud"
const relays = [damus, scsi, rocks, semisol, zebedee]
const pool = RelayPool(relays)

const HOST = "0.0.0.0"
const PORT = 8080

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

    var metadata = JSON.parse(event.content);
    metadata.npub = bech32.encode('npub', bech32.toWords(fromHexString(pubkey)))

    STORAGE[pubkey] = metadata;

    if (!isCreatingNewIndex) {
      isCreatingNewIndex = true
      setTimeout(createNewWorker, 10000)
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

    if (prevWorker) prevWorker.unref()
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

      idxWorker.once('message', ({result}) => {

        res.write("[")
        var count = 0
        for (var entry of result) {
          var pubkey = entry.ref
          if (count != 0) res.write(",")
          res.write(JSON.stringify({pubkey: pubkey, metadata: STORAGE[pubkey] }))
          count++
          if (count === 100) break
        }
        res.write("]")
       
        res.end();

        console.log(`Search: "${key}" yields ${count} results in ${Date.now() - start}ms`)
      })

      idxWorker.postMessage({key: key})

      return
    }
  }
  res.writeHead(404).end();
};

function fromHexString(str) {
  if (str.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(str)) {
    return null;
  }
  let buffer = new Uint8Array(str.length / 2);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = parseInt(str.substr(2 * i, 2), 16);
  }
  return buffer;
}

const server = http.createServer(requestListener);

