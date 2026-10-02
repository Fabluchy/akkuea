/**
 * Browser-side evidence verification.
 *
 * The chain stores only a SHA-256 digest plus a link the ally controls, so
 * "auditable" is only a real claim if someone can re-fetch the document, hash
 * it, and compare. That is what this does, entirely in the browser: the
 * document bytes are read here, never sent to the API, which is what keeps the
 * pilot's promise that Akkuea stores no evidence files.
 *
 * Three outcomes, all of them honest:
 * - `match`: the re-computed digest equals the digest on chain.
 * - `mismatch`: the document fetched fine but hashes differently - the evidence
 *   was altered, or the link now points somewhere else.
 * - `unreachable`: the bytes could not be read at all (CORS, offline, 404, an
 *   `ipfs://` scheme no gateway is mounted for). This is explicitly NOT a
 *   mismatch: the user is told they can download the file and verify it
 *   locally instead.
 */

import { hashEvidenceFile } from "./evidenceHash";

/** Why a document could not be read at all. */
export type UnreachableReason =
  | "cors"
  | "network"
  | "not-found"
  | "unsupported"
  | "invalid-url";

/** Result of a verification attempt. */
export type EvidenceVerificationResult =
  | {
      status: "match";
      /** Hex digest the browser computed. */
      computedHex: string;
      /** The digest recorded on chain. */
      expectedHex: string;
    }
  | {
      status: "mismatch";
      computedHex: string;
      expectedHex: string;
    }
  | {
      status: "unreachable";
      /** Why the document could not be read, for display. */
      reason: UnreachableReason;
    };

/**
 * Largest document the browser will fetch to verify.
 *
 * Matches the upload cap: a document too large to have been submitted should not
 * be pulled over the network to be checked.
 */
export const MAX_VERIFY_BYTES = 25 * 1024 * 1024;

/** Normalizes a stored digest for comparison: lowercase, no separators. */
export function normalizeDigest(hex: string): string {
  return hex.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
}

/**
 * Classifies a fetch failure so the message can tell a blocked cross-origin
 * read apart from a genuinely missing document.
 *
 * A CORS-blocked response is surfaced by `fetch` as an opaque `TypeError`,
 * indistinguishable from a DNS or offline failure. It is reported as `cors`
 * because that is the overwhelmingly common cause for a reachable-but-blocked
 * evidence host, and either way the user's next step is the local file.
 */
function classifyFailure(error: unknown): UnreachableReason {
  if (error instanceof TypeError) {
    return "cors";
  }
  return "network";
}

async function digestOfBytes(bytes: ArrayBuffer): Promise<string> {
  const view = new Uint8Array(bytes);
  // hashEvidenceFile takes a File; wrap the buffer so both paths share one
  // hashing implementation (and one set of size/secure-context rules).
  const file = new File([view], "evidence", {
    type: "application/octet-stream",
  });
  return (await hashEvidenceFile(file)).hex;
}

/**
 * Fetches the linked document and compares its SHA-256 against `expectedHex`.
 *
 * Never throws: every failure mode is reported as `unreachable`, because an
 * exception here would leave the investor with no way to tell "not verified"
 * from "not checked".
 */
export async function verifyEvidenceLink(
  link: string,
  expectedHex: string,
): Promise<EvidenceVerificationResult> {
  const expected = normalizeDigest(expectedHex);

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { status: "unreachable", reason: "invalid-url" };
  }

  // Reject a non-HTTP scheme before any network read: a browser has no handler
  // for `ipfs://` or `ar://`, so this would always fail, and failing here keeps
  // the reason honest instead of reporting a generic network error.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { status: "unreachable", reason: "unsupported" };
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (error) {
    return { status: "unreachable", reason: classifyFailure(error) };
  }

  if (response.status === 404) {
    return { status: "unreachable", reason: "not-found" };
  }
  if (!response.ok) {
    return { status: "unreachable", reason: "network" };
  }

  // Check the declared length first so an oversized body is never buffered.
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_VERIFY_BYTES) {
    return { status: "unreachable", reason: "unsupported" };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    return { status: "unreachable", reason: classifyFailure(error) };
  }

  if (bytes.byteLength === 0) {
    return { status: "unreachable", reason: "not-found" };
  }
  if (bytes.byteLength > MAX_VERIFY_BYTES) {
    return { status: "unreachable", reason: "unsupported" };
  }

  const computed = await digestOfBytes(bytes);
  return computed === expected
    ? { status: "match", computedHex: computed, expectedHex: expected }
    : { status: "mismatch", computedHex: computed, expectedHex: expected };
}

/**
 * Verifies a document the user downloaded and picked locally.
 *
 * The escape hatch for a CORS-blocked or offline source: the bytes are already
 * on the user's machine, so hashing them settles the same question without any
 * network read.
 */
export async function verifyEvidenceFile(
  file: File,
  expectedHex: string,
): Promise<EvidenceVerificationResult> {
  const expected = normalizeDigest(expectedHex);
  try {
    const { hex } = await hashEvidenceFile(file);
    return hex === expected
      ? { status: "match", computedHex: hex, expectedHex: expected }
      : { status: "mismatch", computedHex: hex, expectedHex: expected };
  } catch {
    // Includes the oversized-file and insecure-context cases: the document
    // could not be hashed here, which is unreachable rather than a mismatch.
    return { status: "unreachable", reason: "unsupported" };
  }
}