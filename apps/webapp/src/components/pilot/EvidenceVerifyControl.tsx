"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import {
  verifyEvidenceFile,
  verifyEvidenceLink,
  type EvidenceVerificationResult,
} from "@/services/pilot/evidenceVerify";
import { shortenHash } from "./format";

/**
 * "Verify this evidence" action.
 *
 * Re-fetches the linked document, re-computes its SHA-256 in the browser, and
 * compares against the digest recorded on chain. Three honest outcomes:
 * match, mismatch, or unreachable.
 *
 * `unreachable` is deliberately distinct from `mismatch`. A CORS-blocked source
 * proves nothing about the document's integrity, and reporting it as a mismatch
 * would be a false accusation. Instead the user is offered the local-file path:
 * download the document, then hash the copy they hold.
 */

export interface EvidenceVerifyControlProps {
  /** Link the ally recorded alongside the hash. */
  evidenceLink?: string;
  /** Hex SHA-256 digest written on chain. */
  expectedHex: string;
}

export function EvidenceVerifyControl({
  evidenceLink,
  expectedHex,
}: EvidenceVerifyControlProps) {
  const t = useTranslations("Pilot");
  const [result, setResult] = useState<EvidenceVerificationResult | null>(null);
  const [pending, setPending] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function verifyLink() {
    if (!evidenceLink) return;
    setPending(true);
    try {
      setResult(await verifyEvidenceLink(evidenceLink, expectedHex));
    } finally {
      setPending(false);
    }
  }

  async function verifyLocalFile(file: File) {
    setPending(true);
    try {
      setResult(await verifyEvidenceFile(file, expectedHex));
    } finally {
      setPending(false);
    }
  }

  const tone =
    result?.status === "match"
      ? "text-emerald-400"
      : result?.status === "mismatch"
        ? "text-red-400"
        : "text-amber-300";

  const Icon =
    result?.status === "match"
      ? ShieldCheck
      : result?.status === "mismatch"
        ? ShieldX
        : WifiOff;

  return (
    <div className="mt-2" data-testid="evidence-verify-control">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !evidenceLink}
        isLoading={pending}
        onClick={() => void verifyLink()}
      >
        {t("verify.action")}
      </Button>

      {result && (
        <div
          role="status"
          aria-live="polite"
          data-testid={`verify-result-${result.status}`}
          className={`mt-2 flex items-start gap-1.5 text-xs ${tone}`}
        >
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            {result.status === "match" && (
              <p>{t("verify.match")}</p>
            )}
            {result.status === "mismatch" && (
              <>
                <p>{t("verify.mismatch")}</p>
                <p className="break-all opacity-80">
                  {t("verify.expected", {
                    hash: shortenHash(result.expectedHex),
                  })}
                  {" / "}
                  {t("verify.computed", {
                    hash: shortenHash(result.computedHex),
                  })}
                </p>
              </>
            )}
            {result.status === "unreachable" && (
              <>
                <p>
                  {t(`verify.unreachable.${result.reason}`)}
                </p>
                <p className="opacity-80">{t("verify.unreachableHint")}</p>
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    isLoading={pending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("verify.useLocalFile")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Always mounted so the local-file path is reachable after an
          unreachable result without remounting the control. */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        aria-label={t("verify.localFileLabel")}
        data-testid="verify-local-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void verifyLocalFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}