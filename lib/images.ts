import sharp from "sharp";

/**
 * The stored copy of a report photo (F1): fixes phone orientation, fits it within 1600 px and
 * re-encodes as JPEG at quality 80. sharp drops EXIF metadata, including the phone's GPS tag.
 */
export async function cleanForStorage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Prepares a photo for the vision model: fixes phone orientation, fits it within 1024 px on the
 * long side and re-encodes as JPEG (which also drops EXIF, including GPS). Returns base64 with no
 * data: prefix, as Ollama expects.
 */
export async function toModelImage(input: Buffer): Promise<string> {
  const out = await sharp(input)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return out.toString("base64");
}
