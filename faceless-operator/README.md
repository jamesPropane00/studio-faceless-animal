# Faceless Operator — Browser Action Engine

Faceless Operator is an isolated Playwright/Chromium execution service. ChatGPT remains the reasoning layer; Operator contains no LLM and needs no OpenAI API key.

## Architecture

ChatGPT connects to the authenticated Streamable HTTP MCP endpoint at https://operator.facelessanimalstudios.com/mcp. The same container exposes a REST compatibility API. Each API key is a separate owner; one owner cannot access another owner's browser sessions.

The main Faceless Animal site can remain on Cloudflare Pages. Chromium runs in this long-lived container on a VM or container platform. A reverse proxy terminates HTTPS for operator.facelessanimalstudios.com and forwards to port 8788.

## Security model

- /health is public. /mcp and all /v1 routes require a bearer key.
- Keys come only from FACELESS_OPERATOR_API_KEY or comma-separated FACELESS_OPERATOR_API_KEYS.
- Requests are rate-limited and concurrent Chromium sessions are capped.
- Sessions are owner-scoped, expire after inactivity, and are cleaned up automatically.
- Top-level navigation, redirects, subresources, and browser requests are checked against DNS. Loopback, RFC1918, carrier-grade NAT, link-local, reserved, multicast, cloud metadata, unsafe IPv6, and local destinations are blocked.
- CORS is allowlist-based. CORS_ALLOWED_ORIGINS defaults to https://chatgpt.com.
- Logs contain method, route, status, timing, and a request ID. Typed text, keys, cookies, page content, and approval tokens are never logged.
- Consequential clicks or form actions require a matching one-time approval token. It expires after 60 seconds and is consumed once.
- CAPTCHA, 2FA, anti-bot protections, and website security must never be bypassed.

Browser data exists only in memory for the session. Downloads and service workers are disabled.

## Available browser tools

The MCP server advertises browser_session_create, browser_open, browser_read, browser_click, browser_type, browser_wait, browser_back, browser_forward, browser_screenshot, browser_action_approve, and browser_session_close.

REST compatibility routes:

- POST /v1/sessions
- POST /v1/sessions/:id/actions
- POST /v1/sessions/:id/approvals
- DELETE /v1/sessions/:id

## Deployment

1. Provision a Linux VM/container with Docker.
2. Point operator.facelessanimalstudios.com DNS to the host.
3. Save FACELESS_OPERATOR_API_KEY in the host's secret manager. Never put it in Git, an image, logs, or the site.
4. Build the supplied Dockerfile and run the container with port 8788 bound to localhost.
5. Put Caddy, nginx, or equivalent HTTPS reverse proxy in front of localhost:8788.
6. Verify /health, then inspect /mcp with MCP Inspector using bearer authentication.

Optional settings: SESSION_TTL_MS, MAX_CONCURRENT_SESSIONS, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, NAVIGATION_TIMEOUT_MS, ACTION_TIMEOUT_MS, and CORS_ALLOWED_ORIGINS.

## Connect to ChatGPT

Current ChatGPT integration uses MCP, not the legacy plugin manifest.

1. Deploy the stable public HTTPS endpoint.
2. In ChatGPT Settings, enable Developer mode.
3. Open ChatGPT Plugins, choose the plus button, and add https://operator.facelessanimalstudios.com/mcp.
4. Configure bearer authentication without pasting the key into a chat.
5. Review the discovered tools and read/write annotations, then run harmless tests.

The OpenAPI document remains for REST clients. plugin-manifest.json is retained only for compatibility and is not the production connection mechanism.

## Local test

Install dependencies, install Playwright Chromium, set FACELESS_OPERATOR_API_KEY to a local test value, then run npm test. The tests cover public health, authentication, MCP initialization/tool discovery, session creation/closure, and private/metadata/IPv6 SSRF rejection.

## Troubleshooting

- UNAUTHORIZED: missing or wrong bearer key.
- SSRF_BLOCKED: destination or DNS result is non-public.
- SESSION_NOT_FOUND or SESSION_EXPIRED: create a new session.
- SESSION_CAPACITY: close abandoned sessions or carefully raise the cap.
- APPROVAL_REQUIRED: confirm the exact consequential action, call browser_action_approve, then retry with its token.
- Chromium launch errors: use the supplied Playwright image and give the host adequate memory.
- ChatGPT cannot connect: confirm public HTTPS, /mcp, bearer configuration, Streamable HTTP responses, and tool discovery with MCP Inspector.
