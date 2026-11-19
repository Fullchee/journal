# Logging in to the API behind Cloudflare Access

Research for [#2](https://github.com/Fullchee/journal-native/issues/2). Researched 2026-11-07.

## Answer

- **Android**: turn on Access **Managed OAuth** for the `fullchee-dashboard.pages.dev` app. The Expo app runs a standard OAuth code + PKCE flow with `expo-auth-session`. It sends `Authorization: Bearer <token>` and refreshes with the refresh token.
- **Web**: serve the Expo web build from the same Pages origin. The browser keeps the `CF_Authorization` cookie, exactly as the SvelteKit site does today. No token code runs on web.
- **Backend**: `functions/_lib/auth.ts` likely needs no change. Access turns the OAuth token into the same `Cf-Access-Jwt-Assertion` header the origin already checks. Verify the claims once (see [Open checks](#open-checks)).
- **Rejected**: cookie capture through a WebView (no refresh, fragile) and service tokens (a static secret shipped in the APK, no user identity).

## Options compared

| Option                                                                     | Who it identifies                       | Lifetime and refresh                                                               | Backend change                                       | Verdict               |
| -------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------- |
| Managed OAuth + `expo-auth-session`                                        | The owner's email                       | 15 min access token, refresh token lasts the grant session (set 1-2 weeks or more) | None expected                                        | **Pick**              |
| Capture `CF_Authorization` (WebView or browser), send as `cf-access-token` | The owner's email                       | App session duration (default 24 h); no refresh, re-login when it lapses           | None                                                 | Fallback only         |
| Access service token (`CF-Access-Client-Id`/`-Secret`)                     | A machine (`common_name`), not a person | Set at creation, e.g. 1 year                                                       | `authorize` must accept `common_name` on every route | Reject                |
| `cloudflared access login`                                                 | The owner's email                       | Session duration                                                                   | None                                                 | Not usable on a phone |

## Managed OAuth (recommended)

### What it is

- Access acts as an OAuth 2.0 authorization server for a self-hosted app. It targets "non-browser clients" such as CLIs, agents and SDKs. [Managed OAuth][managed-oauth]
- It enforces the same Access policies as a browser login, "and the origin sees no difference". [Managed OAuth][managed-oauth]
- Without it, non-browser clients get a `302` to the login page and no usable token. With it, they get a `401` and a `WWW-Authenticate` header pointing at the metadata. [Managed OAuth][managed-oauth]

### Setup in Cloudflare

1. Zero Trust > Access controls > Applications > the dashboard app > Advanced settings > turn on **Managed OAuth**. Or `PUT` the app with `"oauth_configuration": {"enabled": true}`, sending every field from the `GET` back. [Managed OAuth][managed-oauth]
2. Add the app's redirect URI to `dynamic_client_registration.allowed_uris`, e.g. `journal://redirect`. Custom schemes must be listed exactly; no wildcards. [Managed OAuth][managed-oauth]
3. Set `grant.access_token_lifetime` (default 15 min) and `grant.session_duration` (how long the refresh token lives). Cloudflare suggests 5-15 min and 1-2 weeks for interactive tools. [Managed OAuth][managed-oauth]

### Flow (documented endpoints)

From Cloudflare's own agent skill on [Authenticate coding agents][agents]:

- **Metadata**: `https://fullchee.cloudflareaccess.com/.well-known/oauth-authorization-server`. It lists `authorization_endpoint`, `token_endpoint`, `registration_endpoint` and `revocation_endpoint` under `/cdn-cgi/access/oauth/`.
- **Public clients allowed**: `token_endpoint_auth_methods_supported` includes `none`; `code_challenge_methods_supported` is `S256`.
- **Register once**: `POST` to `registration_endpoint` with `redirect_uris`, `token_endpoint_auth_method: "none"` and `resource: "https://fullchee-dashboard.pages.dev"`. Save the returned `client_id`. Register by hand once and bake the `client_id` into app config.
- **Authorize**: open `authorization_endpoint` with `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256` and `resource`.
- **Exchange**: `POST` to `token_endpoint` with `grant_type=authorization_code` and the `code_verifier`. The response has `access_token` (`oauth:...`, opaque), `expires_in: 900` and `refresh_token`.
- **Call the API**: `Authorization: Bearer <access_token>`.
- **Refresh**: `grant_type=refresh_token` with the `refresh_token` and `client_id`. Access re-checks the policy on each refresh. [Managed OAuth][managed-oauth]
- **Gotcha**: the code challenge must start with `[a-zA-Z0-9]`, or Access rejects it with `code_challenge_method must be S256 for public clients`. [Authenticate coding agents][agents]

### In Expo

- **`useAuthRequest`** with `usePKCE` (on by default, `S256`). [AuthSession][auth-session]
- **`makeRedirectUri`** builds `<scheme>://redirect` in a development or release build from the app config `scheme`. Expo Go gives `exp://...` instead, so test login in a development build. [AuthSession][auth-session]
- **Set `scheme`** in the app config and rebuild; an EAS Update cannot change it. [AuthSession][auth-session]
- **`exchangeCodeAsync`** and **`refreshAsync`** do the token calls; **`TokenResponse.isTokenFresh`** decides when to refresh. [AuthSession][auth-session]
- **Discovery**: pass the endpoints by hand. `useAutoDiscovery` fetches OIDC discovery, and the documented Access document is the RFC 8414 one (`/.well-known/oauth-authorization-server`). [AuthSession][auth-session], [agents]
- **PKCE gotcha**: AuthSession generates the verifier itself. Regenerate the request if the challenge starts with `-` or `_`, or pass a checked `codeVerifier`.

### Storage

- **`expo-secure-store`** keeps the refresh token. On Android it encrypts values with the Android Keystore and stores them in `SharedPreferences`. [SecureStore][secure-store]
- **Backups**: SecureStore entries cannot be decrypted after a restore. The library excludes them from Auto Backup unless the app has its own backup config. [SecureStore][secure-store]
- **Uninstall** wipes the token, so a reinstall means one new login.
- **Web**: SecureStore lists no web support. Web does not need it (see below). [SecureStore][secure-store]

### Offline-first fit

- The sync queue only needs a token when it flushes. Refresh before each flush.
- A refresh token that outlives a long offline spell avoids a login on reconnect. Set `grant.session_duration` well above the longest expected offline gap.
- When refresh fails, keep the queue and prompt one login; never drop queued changes.

## Web

- **Same origin**: the Expo web build replaces SvelteKit on `fullchee-dashboard.pages.dev` (map: web cutover). Access sets `CF_Authorization` on that domain and checks it on every request. [Authorization cookie][cookie]
- **No token code**: `fetch('/api/...')` sends the cookie, and the origin gets `Cf-Access-Jwt-Assertion` as today.
- **Cross-origin breaks**: the cookie is per domain. A preflighted cross-origin request gets a `403`, because browsers never send cookies with `OPTIONS`. [CORS][cors]
- **Local dev**: run the Expo web dev server against a local Pages Functions server, where `DEV_EMAIL` in `.dev.vars` signs you in. Don't point a `localhost` origin at the live API.
- **Platform split**: put the token logic behind a `.native.ts` file, with a cookie-only `.web.ts` twin.

## Rejected options

### Capture `CF_Authorization`, send as `cf-access-token`

- **It works in principle**: Access accepts an app token in a `cf-access-token` header; `cloudflared access login` prints one for this use. [Authenticate coding agents][agents]
- **Lifetime**: the token lasts the policy or app session duration, default 24 h. [Authorization cookie][cookie]
- **No refresh**: when it lapses, the user logs in again in a WebView or browser. That breaks the background sync queue.
- **Capture is fragile**: the cookie can be `HttpOnly`, so reading it needs a native cookie module. `expo-web-browser` runs in a separate browser, so its cookies never reach the app. [Authorization cookie][cookie]
- **Keep as fallback** only if Managed OAuth misbehaves on the `pages.dev` app.

### Service token

- **Headers**: `CF-Access-Client-Id` and `CF-Access-Client-Secret` on every request, with a Service Auth policy. [Service tokens][service-tokens]
- **Static secret in the APK**: anyone with the APK can extract it and write as owner.
- **No person**: the JWT carries `common_name`, not `email`. `authorize` returns 401 for it; only `authorizeWriter` accepts it. Every route would need the machine path, and `Viewer.email` would be `null`.
- **Right tool elsewhere**: it stays the right choice for the GitHub Action that uses `authorizeWriter`. [Managed OAuth][managed-oauth]

## Changes to `journal`

- **Access app**: enable Managed OAuth, add `journal://redirect` (or the chosen scheme) to the allowed redirect URIs, set the two lifetimes.
- **Register the client**: one `POST` to `registration_endpoint`; record the `client_id` in journal-native's app config.
- **`functions/_lib/auth.ts`**: no change expected. It reads `Cf-Access-Jwt-Assertion`, checks `iss`, `aud` and `exp`, then `email`. The docs say the origin receives the same signed assertion. [Managed OAuth][managed-oauth]

## Open checks

Each is a quick spike, not a reason to change the pick.

1. **Assertion claims**: after enabling Managed OAuth, log the decoded `Cf-Access-Jwt-Assertion` claims once. Confirm `email` is present and `aud` includes `POLICY_AUD`. The docs don't list the claims.
2. **Browser login unchanged**: confirm the SvelteKit site and the Capacitor shell still log in. The docs warn that enabling Managed OAuth replaces the `401` behaviour.
3. **Lifetime caps**: check the largest `grant.session_duration` Access accepts. The docs only show `24h` and suggest 1-2 weeks.
4. **One-time PIN**: confirm the OTP login page works in the Custom Tab that `expo-auth-session` opens on Android.

## Sources

- [Managed OAuth][managed-oauth]
- [Authenticate coding agents][agents] (includes Cloudflare's full OAuth + PKCE skill)
- [Authorization cookie][cookie]
- [CORS][cors]
- [Service tokens][service-tokens]
- [Expo AuthSession][auth-session]
- [Expo SecureStore][secure-store]
- `journal/functions/_lib/auth.ts`, `journal/wrangler.toml`, `journal/capacitor.config.ts`

[managed-oauth]: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
[agents]: https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/
[cookie]: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/
[cors]: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/cors/
[service-tokens]: https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
[auth-session]: https://docs.expo.dev/versions/latest/sdk/auth-session/
[secure-store]: https://docs.expo.dev/versions/latest/sdk/securestore/
