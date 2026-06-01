# Jackpot Lab

台灣彩券今彩 539 隔期狀態分析 — Nuxt 4 + Firebase + LINE LIFF (Phase 2).

## Stack

- **Nuxt 4** + TypeScript
- **Nuxt UI v4** (Tailwind CSS v4 + Reka UI)
- **Pinia** state management
- **VeeValidate + Zod** forms
- **Firebase** Auth + Firestore (region: `asia-east1`)
- **LINE LIFF** (deferred to Phase 2)

## Local development

```bash
pnpm install
cp .env.example .env.local
# Fill in Firebase web app config from
# https://console.firebase.google.com/project/jackpotlab/settings/general
pnpm dev
```

Visit http://localhost:3000.

## Environment variables

See [.env.example](./.env.example). The `NUXT_PUBLIC_FIREBASE_*` keys are bound to `runtimeConfig.public.firebase.*` automatically.

`FIREBASE_SERVICE_ACCOUNT_JSON` and `ADMIN_EMAILS` are server-only — never expose them to the client.

## Deploy

Pushes to `main` deploy to Vercel automatically.

## Project structure

```
app/
  app.vue              # Root layout, header, footer
  app.config.ts        # Nuxt UI tokens (color, fonts)
  pages/               # File-based routes
  components/          # Vue components
  plugins/             # Nuxt plugins (firebase.client.ts)
  composables/         # Reusable composables (planned)
  assets/css/main.css  # Tailwind v4 entry + theme CSS variables
public/                # Static assets (favicon, og images)
nuxt.config.ts         # Modules + runtimeConfig + colorMode
```

## License

MIT — see [LICENSE](./LICENSE).
