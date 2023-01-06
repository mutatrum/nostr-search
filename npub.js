const { bech32 } = require('bech32')
const buffer = require('buffer')

module.exports = {
  pubkeytonpub, npubtopubkey
}

function pubkeytonpub(pubkey) {
  let words = bech32.toWords( buffer.Buffer.from( pubkey, 'hex' ) );
  return bech32.encode( "npub", words );
}

function npubtopubkey(npub) {
  if (!npub.startsWith('npub') || npub.length < 60) return null
  let decoded = bech32.fromWords( bech32.decode( npub ).words );
  return buffer.Buffer.from( decoded ).toString( 'hex' )
}
