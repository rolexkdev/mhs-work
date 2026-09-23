// Cầu nối IP Việt Nam cho API Zalo.
//
// Zalo chặn các API thông tin cá nhân khi yêu cầu đến từ IP ngoài Việt Nam,
// mà Edge Function của Supabase chạy ở nước ngoài. Máy này đặt tại Việt Nam
// nên đứng ra gọi Zalo hộ: Edge Function → máy này → Zalo.
//
// Chỉ nghe ở 127.0.0.1; đường vào từ Internet do Tailscale Funnel (hoặc
// Cloudflare Tunnel) lo — xem README.md.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8787);
const SECRET = process.env.ZALO_BRIDGE_SECRET ?? "";

if (SECRET.length < 32) {
  console.error(
    "Thiếu ZALO_BRIDGE_SECRET (cần ít nhất 32 ký tự). Tạo bằng: openssl rand -hex 32",
  );
  process.exit(1);
}

/** Chỉ 3 domain này được gọi — tránh biến máy thành proxy công cộng. */
const ALLOWED_HOSTS = new Set([
  "graph.zalo.me",
  "openapi.zalo.me",
  "oauth.zaloapp.com",
]);

/** Header Zalo cần; các header khác bỏ hết để không lộ gì của Supabase. */
const FORWARD_HEADERS = [
  "access_token",
  "appsecret_proof",
  "secret_key",
  "content-type",
  "accept",
];

const MAX_BODY = 1_000_000;
const TIMEOUT_MS = 20_000;

function secretOk(given) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(SECRET);
  // So sánh không phụ thuộc thời gian, tránh dò secret theo độ trễ.
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error("Nội dung gửi lên quá lớn"));
      } else {
        chunks.push(c);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function log(...parts) {
  console.log(new Date().toISOString(), ...parts);
}

const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url ?? "/", "http://localhost");

  // Để kiểm tra cầu nối còn sống — không cần secret, không lộ gì.
  if (reqUrl.pathname === "/health") return json(res, 200, { ok: true });
  if (reqUrl.pathname !== "/fwd") return json(res, 404, { message: "Not found" });

  if (!secretOk(req.headers["x-bridge-secret"])) {
    log("401", "sai secret");
    return json(res, 401, { message: "Sai hoặc thiếu x-bridge-secret" });
  }

  let target;
  try {
    target = new URL(reqUrl.searchParams.get("url") ?? "");
  } catch {
    return json(res, 400, { message: "Thiếu hoặc sai tham số url" });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    log("403", target.hostname);
    return json(res, 403, { message: `Không cho phép gọi ${target.hostname}` });
  }

  let body = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, 413, { message: e instanceof Error ? e.message : String(e) });
    }
  }

  const headers = {};
  for (const name of FORWARD_HEADERS) {
    const v = req.headers[name];
    if (v) headers[name] = Array.isArray(v) ? v[0] : v;
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    log(upstream.status, req.method, target.host + target.pathname);
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    });
    res.end(buf);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("502", req.method, target.host + target.pathname, message);
    json(res, 502, { message: `Không gọi được Zalo: ${message}` });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  log(`Cầu nối Zalo đang chạy tại http://127.0.0.1:${PORT}`);
});
