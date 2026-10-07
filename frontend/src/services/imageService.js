/**
 * CivicScan Image Utility Service
 * Provides robust image URL resolution, base64 conversion, and category-tailored fallbacks.
 */

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
 * - Returns valid fallback if url is empty or invalid
 */
export function resolveImageUrl(url, category = 'litter') {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return getCategoryFallback(category);
  }
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads')) {
    return `http://localhost:5000${trimmed}`;
  }
  return trimmed;
}

/**
 * Image onError handler to cleanly replace broken image URLs with verified category fallbacks
 */
export function handleImageError(e, category = 'litter') {
  const fallback = getCategoryFallback(category);
  if (e?.currentTarget && e.currentTarget.src !== fallback) {
    e.currentTarget.onerror = null; // Prevent infinite loop if fallback fails
    e.currentTarget.src = fallback;
  }
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
