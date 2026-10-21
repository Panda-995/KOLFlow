export const MAX_ASSET_IMAGES = 9;
export const MAX_ASSET_IMAGE_LENGTH = 8 * 1024 * 1024;
// Leave room for JSON metadata under the existing 10 MB request limit.
export const MAX_ASSET_IMAGES_LENGTH = 9 * 1024 * 1024;

export const getAssetImages = (asset: { images?: unknown; image?: string | null }): string[] => {
  if (Array.isArray(asset.images)) return asset.images as string[];
  if (typeof asset.images === 'string') {
    try {
      const parsed: unknown = JSON.parse(asset.images);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch { /* Legacy single image below. */ }
  }
  return asset.image ? [asset.image] : [];
};

export const validateAssetImages = (images: unknown): string[] => {
  if (!Array.isArray(images) || images.length > MAX_ASSET_IMAGES) throw new Error('最多添加9张产品图片');
  if (images.some(image => typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image) || image.length > MAX_ASSET_IMAGE_LENGTH)) {
    throw new Error('图片格式无效或体积过大');
  }
  if (images.reduce((size, image: string) => size + image.length, 0) > MAX_ASSET_IMAGES_LENGTH) throw new Error('产品图片总大小不能超过9MB');
  return images;
};
