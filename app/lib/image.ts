export const MAX_AVATAR_DIMENSION = 256;
export const AVATAR_JPEG_QUALITY = 0.82;
export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024; // 8MB — sanity cap before we even try to decode it

/**
 * Resizes and compresses an image file entirely client-side, returning a
 * JPEG data URL small enough to store directly on the User row. Shared by
 * both the create-user form and the staff edit form — do not duplicate
 * this logic a third time; import it instead.
 */
export function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      reject(new Error("That image is too large — please choose one under 8MB."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const scale = Math.min(
          1,
          MAX_AVATAR_DIMENSION / Math.max(img.width, img.height),
        );
        const targetWidth = Math.round(img.width * scale);
        const targetHeight = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Couldn't process that image."));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}