// Découpe la zone sélectionnée (react-easy-crop) d'une image source et la renvoie comme File -
// utilisé avant l'upload Cloudinary pour que l'admin contrôle le cadrage exact, au lieu de
// subir le recadrage automatique (object-fit: cover) appliqué côté site public.
export function chargerImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function decouperImage(imageSrc, cropPixels, fileName = "photo.jpg", mimeType = "image/jpeg") {
  const image = await chargerImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, cropPixels.width, cropPixels.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error("Échec du recadrage")); return; }
      resolve(new File([blob], fileName, { type: mimeType }));
    }, mimeType, 0.92);
  });
}
