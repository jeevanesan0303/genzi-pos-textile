import sharp from "sharp";
import { mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const productPhotoDirectory = fileURLToPath(
  new URL("../uploads/products/", import.meta.url)
);

await mkdir(productPhotoDirectory, { recursive: true });

const MAX_BYTES = 1.5 * 1024 * 1024;

function badPhoto(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export async function saveProductPhoto(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw badPhoto("Choose a valid product photo.");
  }

  const match =
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      dataUrl
    );

  if (!match) {
    throw badPhoto("Only JPEG, PNG and WebP photos are allowed.");
  }

  const input = Buffer.from(match[2], "base64");

  if (!input.length || input.length > MAX_BYTES) {
    throw badPhoto("Product photo must be no larger than 1.5 MiB.");
  }

  let output;

  try {
    const metadata = await sharp(input, {
      limitInputPixels: 25_000_000
    }).metadata();

    if (
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages || 1) > 1
    ) {
      throw new Error("Unsupported image");
    }

    output = await sharp(input, {
      limitInputPixels: 25_000_000
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw badPhoto(
      "Photo could not be processed. Choose a valid, non-animated image."
    );
  }

  const filename = `${randomUUID()}.webp`;

  const { writeFile } = await import("node:fs/promises");

  await writeFile(
    path.join(productPhotoDirectory, filename),
    output,
    { flag: "wx" }
  );

  return filename;
}

export async function removeProductPhoto(filename) {
  if (
    !filename ||
    !/^[a-f0-9-]{36}\.webp$/.test(filename)
  ) {
    return;
  }

  try {
    await unlink(path.join(productPhotoDirectory, filename));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Photo cleanup failed:", error.code);
    }
  }
}