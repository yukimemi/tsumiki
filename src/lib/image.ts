/**
 * Shrink a camera photo before it goes anywhere near the network.
 *
 * A phone camera produces 4–12 MB per shot. As proof that the stairs were
 * swept, that resolution is worth nothing and costs a child's mobile data,
 * the family's storage bill, and the time the timeline takes to load. 1600px
 * on the long edge is still more than a phone screen can show.
 *
 * Everything here is browser-native: no image library is worth 200 KB of
 * bundle for one canvas draw.
 */

/** Long edge, in pixels, after downscaling. */
export const MAX_EDGE = 1600;

/** JPEG quality. 0.82 is where artefacts stop being visible on a photo. */
export const JPEG_QUALITY = 0.82;

/** Refuse anything this large even before decoding it. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export class ImageTooLargeError extends Error {
  constructor() {
    super("しゃしんが おおきすぎます");
    this.name = "ImageTooLargeError";
  }
}

export class NotAnImageError extends Error {
  constructor() {
    super("しゃしんファイルを えらんでください");
    this.name = "NotAnImageError";
  }
}

function scaledSize(width: number, height: number): [number, number] {
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_EDGE) return [width, height];
  const ratio = MAX_EDGE / longEdge;
  return [Math.round(width * ratio), Math.round(height * ratio)];
}

/**
 * `createImageBitmap` is used rather than an `<img>` because it honours EXIF
 * orientation, which is the difference between a photo the right way up and a
 * sideways one on every Android phone.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new NotAnImageError();
  if (file.size > MAX_SOURCE_BYTES) throw new ImageTooLargeError();

  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const [width, height] = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new NotAnImageError();
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) throw new NotAnImageError();
    return blob;
  } finally {
    // The bitmap holds decoded pixels — several times the file size — until
    // it is explicitly released.
    bitmap.close();
  }
}
