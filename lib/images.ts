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

/**
 * When the photo was taken, from EXIF DateTimeOriginal, read before the stored copy drops EXIF.
 * Phones write local time without a zone; Bengaluru is UTC+5:30. Null when there is none.
 */
export async function photoTakenAt(input: Buffer): Promise<Date | null> {
  try {
    const { exif } = await sharp(input).metadata();
    if (!exif) return null;
    const { default: readExif } = await import("exif-reader");
    const tags = readExif(exif);
    const raw = tags.Photo?.DateTimeOriginal ?? tags.Image?.DateTime;
    if (raw instanceof Date) {
      // exif-reader reads the local time as if it were UTC; shift it back to IST.
      return new Date(raw.getTime() - 5.5 * 3_600_000);
    }
    return null;
  } catch {
    return null;
  }
}

async function edgeMap(input: Buffer, size: number): Promise<Float64Array> {
  const { data } = await sharp(input)
    .rotate()
    .resize(size, size, { fit: "fill" })
    .greyscale()
    .blur(1)
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Gradient magnitude: lasting structure (kerbs, walls, poles) survives a repair; the hole does not.
  const g = new Float64Array(size * size);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const gx = data[i + 1]! - data[i - 1]!;
      const gy = data[i + size]! - data[i - size]!;
      g[i] = Math.hypot(gx, gy);
    }
  }
  return g;
}

/**
 * How similar the layout of two photos is (0..1): the normalised correlation of their edge maps,
 * taking the best of small shifts so a slightly different framing still matches.
 */
export async function sceneSimilarity(a: Buffer, b: Buffer): Promise<number | null> {
  try {
    const size = 48;
    const [ea, eb] = await Promise.all([edgeMap(a, size), edgeMap(b, size)]);
    let best = -1;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        let sa = 0, sb = 0, n = 0;
        for (let y = 3; y < size - 3; y++) for (let x = 3; x < size - 3; x++) { sa += ea[y * size + x]!; sb += eb[(y + dy) * size + x + dx]!; n++; }
        const ma = sa / n, mb = sb / n;
        let num = 0, da = 0, db = 0;
        for (let y = 3; y < size - 3; y++) {
          for (let x = 3; x < size - 3; x++) {
            const va = ea[y * size + x]! - ma;
            const vb = eb[(y + dy) * size + x + dx]! - mb;
            num += va * vb;
            da += va * va;
            db += vb * vb;
          }
        }
        if (da && db) best = Math.max(best, num / Math.sqrt(da * db));
      }
    }
    return Math.max(0, Math.min(1, best));
  } catch {
    return null;
  }
}
