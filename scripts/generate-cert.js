'use strict'
const forge = require('node-forge')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const certPath = path.join(ROOT, '.localhost-cert.pem')
const keyPath = path.join(ROOT, '.localhost-key.pem')

const keys = forge.pki.rsa.generateKeyPair(2048)
const cert = forge.pki.createCertificate()

cert.publicKey = keys.publicKey
cert.serialNumber = '1234567890'
cert.validity.notBefore = new Date()
cert.validity.notAfter = new Date()
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10)

const attrs = [{ name: 'commonName', value: 'localhost' }]
cert.setSubject(attrs)
cert.setIssuer(attrs)

cert.setExtensions([
  { name: 'basicConstraints', cA: false },
  { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] },
  { name: 'extKeyUsage', serverAuth: true },
])

cert.sign(keys.privateKey, forge.md.sha256.create())

const certPem = forge.pki.certificateToPem(cert)
const keyPem = forge.pki.privateKeyToPem(keys.privateKey)

fs.writeFileSync(certPath, certPem, 'utf8')
fs.writeFileSync(keyPath, keyPem, 'utf8')
console.log('Self-signed cert generated for localhost HTTPS.')
