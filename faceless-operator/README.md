# Faceless Operator

Browser Action Engine for Faceless Animal Studios.

Faceless Operator contains no AI model. ChatGPT or another authorized tool caller supplies the reasoning; Operator supplies deterministic browser execution.

## Tools
- create browser session
- open URL
- read page text
- click selector
- type into field
- wait
- back / forward
- screenshot
- close session

## Security
Set FACELESS_OPERATOR_API_KEY in the server environment. Requests other than /health require Bearer authentication. Local/private targets are blocked. Sensitive payment/account actions are intentionally not exposed. CAPTCHA, 2FA, anti-bot controls, and website restrictions must not be bypassed.

## Runtime
This service requires a long-running container/VM because Chromium cannot run as a normal Cloudflare Pages static asset. The Faceless Animal Studios site can remain on Cloudflare Pages while this isolated service runs at operator.facelessanimalstudios.com behind HTTPS.

No OpenAI API key or other AI-model key is required.
