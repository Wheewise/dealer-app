type CompressOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
};

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<Blob> {
  const { maxWidth = 1920, maxHeight = 1920, quality = 0.8 } = opts;

  // Skip compression for small files (< 200KB) and non-image files
  if (file.size < 200 * 1024 && file.type === "image/webp") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  // Downscale if exceeds max dimensions
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        bitmap.close();
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      "image/webp",
      quality,
    );
  });
}

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
