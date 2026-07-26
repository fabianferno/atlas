"use client";

/**
 * Hand someone the mini app you are looking at.
 *
 * Every app already has a URL — `/a/<name>` is the same runtime the drawer
 * mounts, just full width — but nothing in the drawer ever showed it. So the
 * only way to pass an app along was to close it, find the card again, and know
 * that the route existed. This is that URL, one press away, next to the close
 * button where the other window chrome lives.
 */

import { useCallback } from "react";
import { ExternalLink, Share2 } from "lucide-react";
import {
  CopyButton,
  CopyField,
  HeaderPopover,
  useCanNativeShare,
  useOrigin,
} from "@/components/board/header-popover";

export function ShareButton({ name }: { name: string | null }): React.JSX.Element {
  const origin = useOrigin();
  const canNativeShare = useCanNativeShare();
  const url = name && origin ? `${origin}/a/${encodeURIComponent(name)}` : "";

  const share = useCallback(
    async (close: () => void) => {
      if (!url) return;
      try {
        await navigator.share({ title: name ?? "Mini app", url });
        close();
      } catch {
        // Includes the user simply cancelling the sheet. Nothing to report.
      }
    },
    [url, name],
  );

  return (
    <HeaderPopover
      icon={<Share2 className="h-4 w-4" aria-hidden />}
      label="Share"
      title="Share this mini app"
      disabled={!url}
    >
      {(close) => (
        <>
          <p className="mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
            Link to this mini app
          </p>

          <div className="mt-2">
            <CopyField value={url} label="Mini app URL" />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <CopyButton value={url} label="Copy link" className="flex-1" />

            {canNativeShare ? (
              <button
                type="button"
                onClick={() => share(close)}
                className="btn press flex items-center justify-center gap-1.5 px-2 py-1.5 text-[0.6875rem]"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden />
                Share
              </button>
            ) : null}

            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn press flex items-center justify-center gap-1.5 px-2 py-1.5 text-[0.6875rem]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open
            </a>
          </div>
        </>
      )}
    </HeaderPopover>
  );
}
