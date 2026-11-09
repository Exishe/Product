// Dish photos are resized in the browser before upload: 600 px on the long
// side, WebP, so a guest's menu stays light on mobile data.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function resizeToWebp(file: Blob, max = 600, quality = 0.82): Promise<Blob> {
  return resizeImage(file, max, "image/webp", quality);
}

// Paper-menu photos for the AI import: big enough to read small print.
export function resizeMenuPhoto(file: Blob): Promise<Blob> {
  return resizeImage(file, 2000, "image/jpeg", 0.85);
}

async function resizeImage(file: Blob, max: number, type: string, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), type, quality),
  );
}
