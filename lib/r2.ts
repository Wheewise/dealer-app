import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * Strips EXIF/metadata (GPS location, device info — a real privacy leak if
 * left in) and converts to WebP, in one pass: re-encoding through sharp
 * drops all metadata by default unless `.withMetadata()` is called, so no
 * separate stripping step is needed. Runs server-side only — a dealer can't
 * bypass it by skipping client-side processing.
 */
export async function uploadVehiclePhoto(
  dealerId: string,
  file: File,
): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const webp = await sharp(buffer)
    .rotate() // apply EXIF orientation before it's stripped, so the image doesn't end up sideways
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const key = `dealers/${dealerId}/vehicles/${crypto.randomUUID()}.webp`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: webp,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}
