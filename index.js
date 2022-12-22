const http = require("http");
const fs = require('fs').promises;
const {RelayPool} = require('nostr');

const damus = "wss://relay.damus.io"
const scsi = "wss://nostr-pub.wellorder.net"
const rocks = "wss://nostr.rocks"
const relays = [damus, scsi, rocks]

const pool = RelayPool(relays)

const storage = {}
const keys = []

pool.on('open', relay => {
  relay.subscribe("subid", {kinds:[0]})
});

pool.on('eose', relay => {
  relay.close()
});

pool.on('event', (relay, sub_id, ev) => {
  const pubkey = ev.pubkey

  const oldEvent = storage[pubkey]
  if (oldEvent && oldEvent.created_at > ev.created_at) {
    return
  }
  try {
    const content = JSON.parse(ev.content)

    storage[pubkey] = content

    return;
  } catch(syntaxError) {

  }
});

// setInterval(() => console.log(`Number of keys: ${Object.keys(storage).length}`), 60000)

setInterval(() => pool.send(JSON.stringify({ event: "ping" })), 10000)

fs.readFile(__dirname + "/index.html")
    .then(contents => {
        indexFile = contents;
        server.listen(port, host, () => {
            console.log(`Server is running on http://${host}:${port}`);
        });
    })
    .catch(err => {
        console.error(`Could not read index.html file: ${err}`);
        process.exit(1);
    });


const host = "0.0.0.0"
const port = 8080

function hasValue(pubkey, key) {
  if (pubkey.indexOf(key) != -1) {
    return true
  } else {
    const metadata = storage[pubkey]
    for (var value of Object.values(metadata)) {
      if (value && value.indexOf(key) != -1) {
        return true
      }
    }
  }
}

const requestListener = function (req, res) {
  console.log(`${req.method} ${req.url}`)
  const url = new URL(req.url, `https://${host}/`)
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
      res.write("[")
      var count = 0
      const start = Date.now()
      for (var pubkey in storage) {
        if (hasValue(pubkey, key)) {
          if (count != 0) res.write(",")
          res.write(JSON.stringify({pubkey: pubkey, metadata: storage[pubkey] }))
          count++
        }
        if (count === 10) break
      }
      res.end("]")
      console.log(`Search: "${key}" yields ${count} results in ${Date.now() - start}ms`)
      return
    }
  }
  res.writeHead(404).end();
};
const server = http.createServer(requestListener);
