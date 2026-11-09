// Dish photos are resized in the browser before upload: 600 px on the long
// side, WebP, so a guest's menu stays light on mobile data.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function resizeToWebp(file: Blob, max = 600, quality = 0.82): Promise<Blob> {
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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/webp", quality),
  );
}
