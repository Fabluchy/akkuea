import {
  MAX_VERIFY_BYTES,
  normalizeDigest,
  verifyEvidenceFile,
  verifyEvidenceLink,
} from "../evidenceVerify";

/**
 * Evidence verification.
 *
 * The three outcomes are the whole point of the feature, so each is pinned
 * here: a matching document, a tampered one, and a source the browser cannot
 * read. The tampered case uses a real SHA-256 fixture rather than a random
 * string, so the test fails if the comparison itself is wrong, not only if the
 * branching is.
 */

/** SHA-256 of "August 2026 rental income: 10,000.00 USDC" (no trailing newline). */
const GENUINE_DIGEST =
  "ebba5f79322507486b753343cf38135d142f2aa99511fe3447ee39d03b705ebc";
const GENUINE_DOCUMENT = "August 2026 rental income: 10,000.00 USDC";

/** A different document, and therefore a different digest. */
const TAMPERED_DIGEST =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function responseFor(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

const originalFetch = globalThis.fetch;
const originalCrypto = globalThis.crypto;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "crypto", {
    value: originalCrypto,
    configurable: true,
    writable: true,
  });
});

/** jsdom's File lacks arrayBuffer in some versions; hashEvidenceFile needs it. */
function fileFrom(content: string, name = "evidence.txt"): File {
  const file = new File([content], name, {
    type: "text/plain",
  });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () =>
        new TextEncoder().encode(content).buffer as ArrayBuffer,
      configurable: true,
    });
  }
  return file;
}

describe("normalizeDigest", () => {
  it("lowercases and strips separators", () => {
    expect(normalizeDigest("AB:CD-ef")).toBe("abcdef");
  });
});

describe("verifyEvidenceLink", () => {
  it("reports match when the fetched document hashes to the recorded digest", async () => {
    globalThis.fetch = (async () =>
      responseFor(GENUINE_DOCUMENT)) as unknown as typeof fetch;

    const result = await verifyEvidenceLink(
      "https://evidence.example/august.txt",
      GENUINE_DIGEST,
    );

    expect(result.status).toBe("match");
  });

  it("reports mismatch for a tampered document", async () => {
    // Same link, different bytes: the document was altered after the hash was
    // recorded, which is exactly the case an operator must not approve blind.
    globalThis.fetch = (async () =>
      responseFor(
        "August 2026 rental income: 90,000.00 USDC",
      )) as unknown as typeof fetch;

    const result = await verifyEvidenceLink(
      "https://evidence.example/august.txt",
      GENUINE_DIGEST,
    );

    expect(result.status).toBe("mismatch");
    if (result.status === "mismatch") {
      expect(result.expectedHex).toBe(GENUINE_DIGEST);
      expect(result.computedHex).not.toBe(result.expectedHex);
    }
  });

  it("reports unreachable - not mismatch - when the browser blocks the read", async () => {
    // A CORS-blocked response surfaces as an opaque TypeError from fetch.
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const result = await verifyEvidenceLink(
      "https://evidence.example/august.txt",
      GENUINE_DIGEST,
    );

    expect(result.status).toBe("unreachable");
    if (result.status === "unreachable") {
      expect(result.reason).toBe("cors");
    }
  });

  it("reports unreachable for a scheme a browser cannot resolve", async () => {
    globalThis.fetch = (async () =>
      responseFor(GENUINE_DOCUMENT)) as unknown as typeof fetch;

    const result = await verifyEvidenceLink(
      "ipfs://QmEvidence/august.txt",
      GENUINE_DIGEST,
    );

    expect(result).toEqual({ status: "unreachable", reason: "unsupported" });
  });

  it("reports not-found for a 404", async () => {
    globalThis.fetch = (async () =>
      responseFor("missing", { status: 404 })) as unknown as typeof fetch;

    const result = await verifyEvidenceLink(
      "https://evidence.example/gone.txt",
      GENUINE_DIGEST,
    );

    expect(result).toEqual({ status: "unreachable", reason: "not-found" });
  });

  it("reports invalid-url for a malformed link", async () => {
    const result = await verifyEvidenceLink("not a url", GENUINE_DIGEST);
    expect(result).toEqual({ status: "unreachable", reason: "invalid-url" });
  });

  it("refuses to buffer a document larger than the cap", async () => {
    globalThis.fetch = (async () =>
      responseFor("small body", {
        headers: { "content-length": String(MAX_VERIFY_BYTES + 1) },
      })) as unknown as typeof fetch;

    const result = await verifyEvidenceLink(
      "https://evidence.example/huge.pdf",
      GENUINE_DIGEST,
    );

    expect(result).toEqual({ status: "unreachable", reason: "unsupported" });
  });

  it("treats an empty body as unreachable rather than as a hash match", async () => {
    globalThis.fetch = (async () => responseFor("")) as unknown as typeof fetch;

    const result = await verifyEvidenceLink(
      "https://evidence.example/empty.txt",
      TAMPERED_DIGEST,
    );

    expect(result).toEqual({ status: "unreachable", reason: "not-found" });
  });
});

describe("verifyEvidenceFile", () => {
  it("matches a local copy of the genuine document", async () => {
    const result = await verifyEvidenceFile(
      fileFrom(GENUINE_DOCUMENT),
      GENUINE_DIGEST,
    );
    expect(result.status).toBe("match");
  });

  it("mismatches a local copy that was altered", async () => {
    const result = await verifyEvidenceFile(
      fileFrom("August 2026 rental income: 90,000.00 USDC"),
      GENUINE_DIGEST,
    );
    expect(result.status).toBe("mismatch");
  });

  it("reports unreachable when hashing is unavailable in this context", async () => {
    // Plain HTTP has no crypto.subtle; hashing must fail loudly rather than
    // silently fall back to a weaker digest.
    Object.defineProperty(globalThis, "crypto", {
      value: { subtle: undefined },
      configurable: true,
      writable: true,
    });

    const result = await verifyEvidenceFile(
      fileFrom(GENUINE_DOCUMENT),
      GENUINE_DIGEST,
    );

    expect(result).toEqual({ status: "unreachable", reason: "unsupported" });
  });
});