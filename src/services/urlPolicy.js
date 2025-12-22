// src/services/urlPolicy.js
import {
  RETAILER_ALLOWLIST,
  GLOBAL_SHORTENER_HOSTS,
  BLOCKED_EXTENSIONS,
} from "../config/retailerAllowlist.js";

function isAscii(str) {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return false;
  }
  return true;
}

function isIpv4Literal(hostname) {
  const m = hostname.match(/^(\d{1,3})(\.\d{1,3}){3}$/);
  if (!m) return false;
  return hostname.split(".").every((x) => {
    const n = Number(x);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function isPrivateIpv4(hostname) {
  if (!isIpv4Literal(hostname)) return false;
  const [a, b] = hostname.split(".").map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isIpLike(hostname) {
  if (hostname.includes(":")) return true;
  return isIpv4Literal(hostname);
}

function hostMatchesAllowed(host, allowedDomain) {
  const d = allowedDomain.toLowerCase();
  const h = host.toLowerCase();
  return h === d || h.endsWith("." + d);
}

function blockedExtension(urlObj) {
  const path = (urlObj.pathname || "").toLowerCase();
  for (const ext of BLOCKED_EXTENSIONS) {
    if (path.endsWith(ext)) return ext;
  }
  return null;
}

function isAmazonHost(host) {
  return (
    host === "amazon.ca" ||
    host === "www.amazon.ca" ||
    host === "amazon.com" ||
    host === "www.amazon.com"
  );
}

export function validateDealLink({ url, retailer }) {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, reason: "URL is required." };
  }

  const raw = url.trim();
  if (raw.length > 2048) {
    return { ok: false, reason: "URL is too long." };
  }

  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL format." };
  }

  // HTTPS only
  if (u.protocol !== "https:") {
    return { ok: false, reason: "Only HTTPS links are allowed." };
  }

  // Block credentials
  if (u.username || u.password) {
    return { ok: false, reason: "URL cannot contain credentials." };
  }

  const host = (u.hostname || "").toLowerCase();

  // Anti-homograph
  if (!isAscii(host)) {
    return { ok: false, reason: "Non-ASCII domains are not allowed." };
  }

  // Block localhost
  if (host === "localhost" || host.endsWith(".local")) {
    return { ok: false, reason: "Localhost/internal links are not allowed." };
  }

  // Block IP literals
  if (isIpLike(host)) {
    if (isPrivateIpv4(host) || host === "::1") {
      return { ok: false, reason: "Private-network IP links are not allowed." };
    }
    return { ok: false, reason: "IP address links are not allowed." };
  }

  // No custom ports
  if (u.port) {
    return { ok: false, reason: "Links with custom ports are not allowed." };
  }

  // Block executables
  const ext = blockedExtension(u);
  if (ext) {
    return { ok: false, reason: `Links ending with ${ext} are not allowed.` };
  }

  const r = (retailer || "").trim();

  /* =========================
     AMAZON EXPLICIT ALLOW
  ========================= */
  if (r === "Amazon" && isAmazonHost(host)) {
    // Affiliate tags are allowed and preserved
    return { ok: true, normalizedUrl: u.toString(), host };
  }

  /* =========================
     OTHER RETAILERS
  ========================= */
  const allowlist = RETAILER_ALLOWLIST[r];

  if (Array.isArray(allowlist) && allowlist.length > 0) {
    const ok = allowlist.some((d) => hostMatchesAllowed(host, d));
    if (!ok) {
      return {
        ok: false,
        reason: `Link domain does not match allowed domains for retailer '${r}'.`,
      };
    }
    return { ok: true, normalizedUrl: u.toString(), host };
  }

  // "Other" strict mode
  if (GLOBAL_SHORTENER_HOSTS.has(host)) {
    return { ok: false, reason: "Shortened links are not allowed for 'Other'." };
  }

  return { ok: true, normalizedUrl: u.toString(), host };
}
