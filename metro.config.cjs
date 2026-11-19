const { withVarlockMetroConfig } = require("@varlock/expo-integration/metro-config");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withUniwindConfig } = require("uniwind/metro");
const { createHash } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

/** Varlock inlines env values during transforms, so Metro must re-transform when they change. */
function withEnvInCacheKey(config) {
  const env = process.env.__VARLOCK_ENV;
  config.cacheVersion = `${config.cacheVersion ?? ""}:${createHash("sha256").update(env).digest("hex")}`;

  return config;
}

// Hosts the emulator reaches on this machine: the smoke flows must never touch production or Cloudflare.
// oxlint-disable-next-line sonarjs/no-hardcoded-ip -- 10.0.2.2 is the Android emulator's fixed alias for the host's loopback.
const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

/** Parses `url`, which must point at one of the local API hosts. */
function localApiUrl(url, requirement) {
  if (!url || !LOCAL_API_HOSTS.has(new URL(url).hostname)) {
    throw new Error(`${requirement} on ${[...LOCAL_API_HOSTS].join(", ")}; got "${url ?? ""}".`);
  }

  return new URL(url);
}

/** Maestro runs against the local API, which needs no Access token, so JOURNAL_E2E=1 swaps in a signed-in auth module. */
function withE2EAuth(config) {
  if (process.env.JOURNAL_E2E !== "1") return config;
  localApiUrl(process.env.EXPO_PUBLIC_API_URL, "JOURNAL_E2E=1 needs EXPO_PUBLIC_API_URL");

  const e2eAuth = path.join(__dirname, "src/lib/auth/auth.e2e.ts");
  const resolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) =>
    moduleName === "@/lib/auth/auth" && platform !== "web"
      ? { type: "sourceFile", filePath: e2eAuth }
      : (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);

  return config;
}

/** Pipes one request to the local API and its answer back. */
function forwardRequest(req, res, { hostname, port }) {
  const headers = { ...req.headers, host: `${hostname}:${port}` };

  const upstream = http.request(
    { hostname, port, path: req.url, method: req.method, headers },
    (apiRes) => {
      res.writeHead(apiRes.statusCode ?? 502, apiRes.headers);
      apiRes.pipe(res);
    },
  );

  req.pipe(upstream);

  return upstream;
}

/** Web uses its own origin for the API, so web-preview.sh routes `/api/*` through Metro to the local API (no CORS). */
function withLocalApiProxy(config) {
  const target = process.env.JOURNAL_WEB_API_PROXY;

  if (!target) return config;

  // A set API URL would send web's requests past the proxy, possibly to production.
  if (process.env.EXPO_PUBLIC_API_URL) {
    throw new Error(
      `JOURNAL_WEB_API_PROXY needs EXPO_PUBLIC_API_URL unset; got "${process.env.EXPO_PUBLIC_API_URL}".`,
    );
  }

  const api = localApiUrl(target, "JOURNAL_WEB_API_PROXY must be");
  const enhanceMiddleware = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (metroMiddleware, server) => {
    const next = enhanceMiddleware ? enhanceMiddleware(metroMiddleware, server) : metroMiddleware;

    return (req, res, fallthrough) => {
      if (!req.url.startsWith("/api/")) return next(req, res, fallthrough);

      forwardRequest(req, res, api).on("error", fallthrough);
    };
  };

  return config;
}

// Varlock resolves `varlock/env` and validates .env against .env.schema.
// Sentry's config gives each bundle a debug ID, which matches it to its uploaded source map.
// Uniwind must wrap every other Metro wrapper.
const envConfig = withEnvInCacheKey(withVarlockMetroConfig(getSentryExpoConfig(__dirname)));
const localConfig = withLocalApiProxy(withE2EAuth(envConfig));

module.exports = withUniwindConfig(localConfig, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
