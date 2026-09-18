# admira.live: source of truth

Verified on 18 September 2026 for FLT-100563.

- Public home: `https://www.admira.live/`.
- Active Council page: root `index.html`, loading `app.flt-100529.js`.
- `app.js` is the maintained source and must match `app.flt-100529.js`.
- `council-scumm.html` redirects to `/`. Files under `public/` and `docs/`
  are older variants; they do not supply the active home.
- Repository: `csilvasantin/32.-ConsejoAdmiraNextGame`.
- Hosting: Cloudflare Pages project `admira-live`, deployed with `deploy.sh`.
  It archives committed HEAD and stamps the version from `control/index.html`.
- GrokBot UI: `council-grokbot.js/css`, `council-integration.js`,
  `council-speech.js` and `council-table.js/css`.
- GrokBot relay: `fleet-control/grokbot-bridge.js`; see
  `fleet-control/GROKBOT-BRIDGE.md`. Provider credentials and conversation state
  are private runtime files outside the website checkout.

Do not edit `admiranext.html`, `admiranext-v2.html` or archived copies to change
this Council home. No credentials belong in the static site.
