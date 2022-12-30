const { bech32 } = require('bech32')

// export { pubkeytonpub, npubtopubkey }

module.exports = {
  pubkeytonpub, npubtopubkey
}

function pubkeytonpub(pubkey) {
  return bech32.encode('npub', bech32.toWords(fromHexString(pubkey)))
}

function npubtopubkey(npub) {
  if (!npub.startsWith('npub') || npub.length < 60) return null
  return toHexString(bech32.fromWords(bech32.decode(npub).words))
}

function toHexString(bytes) {
  return bytes.map(n => n.toString(16).padStart(2, '0')).join('')
}

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