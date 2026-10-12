/**
 * CivicScan Image Utility Service
 * Provides robust image URL resolution, base64 conversion, and category-tailored fallbacks.
 */

// Photos are served by the backend; follow VITE_API_URL like services/api.js does
const API_ORIGIN = ((import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

export const CATEGORY_FALLBACK_IMAGES = {
  litter: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=800&q=80',
  pothole: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
  crack_longitudinal: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80',
  crack_transverse: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80',
  crack_alligator: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80',
  crack_structural: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
  manhole_damaged: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
  manhole_missing: 'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=800&q=80',
  illegal_dumping: 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?auto=format&fit=crop&w=800&q=80',
  default: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=800&q=80',
};

/**
 * Returns a high quality fallback civic image based on defect category
 */
export function getCategoryFallback(category) {
  if (!category) return CATEGORY_FALLBACK_IMAGES.default;
  const key = String(category).toLowerCase().replace(/[\s-]/g, '_');
  return CATEGORY_FALLBACK_IMAGES[key] || CATEGORY_FALLBACK_IMAGES.default;
}

/**
 * Resolves an image URL safely:
 * - Prepends backend server host if it is a relative /uploads path
 * - Returns clean URL without swapping user photos for stock photos
 */
export function resolveImageUrl(url, category = 'litter') {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return '';
  }
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads')) {
    return `${API_ORIGIN}${trimmed}`;
  }
  return trimmed;
}

/**
 * Image onError handler: Logs load issue without silently replacing user uploads with fake stock photos
 */
export function handleImageError(e, category = 'litter') {
  console.warn('[imageService] Image failed to render:', e?.currentTarget?.src);
}

/**
 * Safely converts a File or Blob into a base64 Data URL
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}
