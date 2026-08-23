import type { JSX } from "react";

import { usePhotoUrl } from "../data/photos";

/**
 * The proof photo for one completion.
 *
 * Renders nothing until the URL resolves rather than reserving a grey box:
 * on the timeline most entries have no photo, and a placeholder for every one
 * of them would be more noise than the photos are worth.
 */
export function EntryPhoto(props: {
  path: string | null | undefined;
  alt: string;
  /** Timeline thumbnail vs the full-width view inside a sheet. */
  size?: "thumb" | "full";
}): JSX.Element | null {
  const url = usePhotoUrl(props.path);
  const size = props.size ?? "thumb";
  if (!url) return null;

  if (size === "thumb") {
    return (
      <img
        src={url}
        alt={props.alt}
        loading="lazy"
        decoding="async"
        className="h-14 w-14 flex-none rounded-card border border-rule object-cover"
      />
    );
  }

  return (
    <img
      src={url}
      alt={props.alt}
      loading="lazy"
      decoding="async"
      className="max-h-80 w-full rounded-card border border-rule object-contain"
    />
  );
}
