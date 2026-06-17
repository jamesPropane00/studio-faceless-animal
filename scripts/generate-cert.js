'use strict'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const certPath = path.join(ROOT, '.localhost-cert.pem')
const keyPath = path.join(ROOT, '.localhost-key.pem')

// Generate RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
})

// Write the private key
fs.writeFileSync(keyPath, privateKey, 'utf8')

// Build a self-signed X.509 cert using Node's built-in cert generation
// We create a temporary self-signed cert via child process or use manual DER
// Since openssl may not be available, construct a simple PEM cert manually
const pubDer = Buffer.from(
  publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, ''),
  'base64'
)

// Extract just the raw EC/RSA public key point (last 65 bytes for RSA 2048)
const keyBytes = pubDer.slice(pubDer.length - 65)

// Build a minimal DER-encoded self-signed cert that Node's TLS will accept.
// Format: Certificate = TBSCertificate + SignatureAlgorithm + SignatureValue
const serial = Buffer.from([1, 2, 3, 4]) // simple serial
const now = new Date()
const yearFromNow = new Date(now.getTime() + 365 * 86400000)

// Helper: time to generalized time DER
function timeGeneralized(d) {
  const s = d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const buf = Buffer.alloc(2 + s.length)
  buf[0] = 0x18 // generalized time tag
  buf[1] = s.length
  buf.write(s, 2)
  return buf
}

// Helper: ASN.1 length encoding
function derLen(n) {
  if (n < 128) return Buffer.from([n])
  const b = Buffer.alloc(4)
  let len = 0
  let tmp = n
  while (tmp > 0) { b[len] = tmp & 0xff; len++; tmp >>= 8 }
  const out = Buffer.alloc(1 + len)
  out[0] = 0x80 | len
  for (let i = 0; i < len; i++) out[1 + i] = b[len - 1 - i]
  return out
}

// Helper: ASN.1 sequence
function derSeq(contents) {
  return Buffer.concat([Buffer.from([0x30]), derLen(contents.length), contents])
}

// Helper: ASN.1 integer
function derInt(n) {
  const hex = n.toString(16)
  const buf = Buffer.from((hex.length % 2 ? '0' : '') + hex, 'hex')
  return Buffer.concat([Buffer.from([0x02]), derLen(buf.length), buf])
}

// Subject/Issuer name: CN = localhost
const nameAttr = derSeq(Buffer.concat([Buffer.from([0x31, 0x0c, 0x30, 0x0a, 0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, 0x03, 0x6c, 0x6f, 0x6c])])) // "CN=localhost" in UTF8String
// Actually let me just use a simple printable string
const cn = Buffer.from('localhost')
const name = derSeq(Buffer.concat([
  Buffer.from([0x31, 0x0b]),
  derSeq(Buffer.concat([
    Buffer.from([0x06, 0x03, 0x55, 0x04, 0x03]), // id-at-commonName OID
    Buffer.from([0x0c, cn.length]), // UTF8String tag + length
    cn,
  ])),
]))

// Public key info - RSA
const algoId = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]) // rsaEncryption OID
const pubKeyInfo = derSeq(Buffer.concat([algoId, Buffer.from([0x03, keyBytes.length + 1, 0x00]), keyBytes]))

// Validity
const validity = Buffer.concat([timeGeneralized(now), timeGeneralized(yearFromNow)])

// TBSCertificate
const tbs = derSeq(Buffer.concat([
  Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]), // version [0] explicit INTEGER 2
  derInt(serial.readUInt32BE(0)), // serialNumber
  Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00]), // sha256WithRSAEncryption
  name, // issuer
  validity, // validity
  name, // subject
  pubKeyInfo, // subjectPublicKeyInfo
]))

// Sign the TBS with RSA
const sign = crypto.createSign('sha256')
sign.update(tbs)
sign.end()
const sig = sign.sign(privateKey)

// Signature value (bit string)
const sigVal = Buffer.concat([Buffer.from([0x03, sig.length + 1, 0x00]), sig])

// Certificate = TBS + sig algo + sig value
const certDer = derSeq(Buffer.concat([
  tbs,
  Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00]), // sha256WithRSAEncryption
  sigVal,
]))

// PEM encode
const b64 = certDer.toString('base64').match(/.{1,64}/g).join('\n')
const pem = '-----BEGIN CERTIFICATE-----\n' + b64 + '\n-----END CERTIFICATE-----\n'
fs.writeFileSync(certPath, pem, 'utf8')

console.log('Self-signed cert generated:')
console.log('  Cert:', certPath)
console.log('  Key:', keyPath)
