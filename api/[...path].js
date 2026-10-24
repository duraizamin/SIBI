const http = require("node:http");
const https = require("node:https");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

module.exports = (req, res) => {
  const backendUrl = process.env.SIBI_API_URL;
  if (!backendUrl) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Sibi backend is not configured." }));
    return;
  }

  let target;
  try {
    target = new URL(req.url, backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`);
    const configuredBackend = new URL(backendUrl);
    if (
      !["http:", "https:"].includes(configuredBackend.protocol) ||
      configuredBackend.pathname !== "/" ||
      configuredBackend.search ||
      configuredBackend.hash ||
      target.origin !== configuredBackend.origin ||
      !target.pathname.startsWith("/api/")
    ) {
      throw new Error("Invalid backend URL or API path.");
    }
  } catch (error) {
    console.error("Invalid SIBI_API_URL configuration:", error.message);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Sibi backend configuration is invalid." }));
    return;
  }

  const headers = { ...req.headers, host: target.host };
  for (const header of HOP_BY_HOP_HEADERS) delete headers[header];
  delete headers["content-length"];
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = "https";

  const transport = target.protocol === "https:" ? https : http;
  const upstream = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (upstreamResponse) => {
      res.statusCode = upstreamResponse.statusCode || 502;
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
          res.setHeader(name, value);
        }
      }
      upstreamResponse.pipe(res);
    },
  );

  upstream.setTimeout(25000, () => {
    upstream.destroy(new Error("Backend request timed out."));
  });
  upstream.on("error", (error) => {
    console.error("Sibi backend proxy failed:", error.message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Sibi backend is unavailable." }));
    } else {
      res.destroy(error);
    }
  });

  req.pipe(upstream);
};
