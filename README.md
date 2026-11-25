# AI Peek

**English** | [简体中文](README.zh-CN.md)

Peek at everything you want to know.

Automatically lock onto vehicles through your phone camera, or upload photos and game screenshots to identify vehicles, landmarks, and objects. Switch between **English** and **Chinese** directly in the top bar. Scan results, key frames, language preference, and theme selection stay in your current browser.

## Run Locally

Install Node.js 22.19.0 and run the following in the project root:

```sh
npm ci
npm run dev
```

Open the local URL printed in your terminal. In **Model Settings**, pick a vision-capable model and paste your API key. Built-in preset providers are proxied through `/api/scan`, while custom OpenAI-compatible endpoints are called directly from the browser (requires HTTPS and CORS enabled).

## Push to a Private GitHub Repository

Create an empty **Private** repository on GitHub. If you extracted the project from a ZIP archive, initialize Git in the project root first with `git init -b main`. Replace the GitHub URL below with your repository URL, then run:

```sh
git add .
git commit -m "Add AI Peek Workers release"
git remote add origin "https://github.com/YOUR_ACCOUNT/YOUR_PRIVATE_REPO.git"
git push -u origin main
```

## Deploy to Cloudflare Workers from GitHub

In Cloudflare **Workers & Pages**, create a Worker and import your GitHub repository. When authorizing the **Cloudflare Workers and Pages** app, choose **Only select repositories** and select your private repository from the previous step. Fill in the build settings below:

| Setting | Value |
| --- | --- |
| Worker name | `ai-shuang-kui` |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |

If you customize the Worker name, also update `name` in `wrangler.jsonc`. After the first successful deployment, pushes to `main` trigger automatic updates. The build outputs client assets to `dist/client` and the Worker bundle and deploy configuration to `dist/server`.

[Cloudflare GitHub Integration Docs](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)

## Deploy to Cloudflare Workers from Your Machine

```sh
npm ci
npm run typecheck
npm run build
npm run deploy -- --dry-run
npx wrangler login
npm run deploy
```

`--dry-run` verifies the deployment bundle locally. Before deploying, you can also run `npm run preview` to preview the built Worker locally.

Deployment requires a Cloudflare account. When using your own API, enter your model API key in the web app. Each domain has isolated browser settings and scan history. GitHub repository visibility and Worker access are managed separately.

## Enable Trial Account

After deploying the Worker, configure runtime variables under **Settings → Variables and Secrets**. Once all required values are set, a **Trial Account** tab appears in **Model Settings**, allowing visitors to enable the built-in model with a trial password.

| Runtime Variable | Type | Purpose |
| --- | --- | --- |
| `TRIAL_PASSWORD` | Secret | Long random password shared with trial users |
| `TRIAL_API_KEY` | Secret | Model provider API key (a dedicated key is recommended for trial use) |
| `TRIAL_SESSION_SECRET` | Secret | Independent random signing secret, at least 32 characters |
| `TRIAL_BASE_URL` | Text | HTTPS OpenAI-compatible base URL or full `/chat/completions` URL |
| `TRIAL_MODEL` | Text | Vision model ID used on the server |
| `TRIAL_SCANS_PER_IP_PER_HOUR` | Text | Allowed scans per IP in a rolling 1-hour window (default `20`, positive integer) |

For example, when using Google Gemini for the trial model, set `TRIAL_BASE_URL` to `https://generativelanguage.googleapis.com/v1beta/openai` and `TRIAL_MODEL` to a vision model available to that key. You can generate a random signing secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Password verification runs in the Worker, and trial sessions last 8 hours. Rotating the password or signing secret invalidates existing sessions. Once enabled, model requests use the server-side endpoint, model ID, and API key.

Trial quota is shared per client IP and persists across page refreshes and re-logins. Each authenticated request sent to the model consumes one scan; when the limit is reached, the UI displays the wait time. Deploying the Worker provisions a SQLite Durable Object for quota counting and a rate-limiting binding for login attempts. Provider-side API key limits still apply.

For local testing, copy [.dev.vars.example](.dev.vars.example) to `.dev.vars` in the project root, fill in test values, and run `npm run dev`. Production secrets are managed via Cloudflare Secrets, and `.dev.vars` is already gitignored.

[Cloudflare Secrets Docs](https://developers.cloudflare.com/workers/configuration/secrets/) · [Durable Objects Docs](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
