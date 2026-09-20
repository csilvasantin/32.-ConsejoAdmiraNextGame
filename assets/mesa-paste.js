/*
 * Mesa Consejo — pegar / soltar imagen en el composer (FLT-100707).
 * PNG, JPEG, WebP, GIF. Máx. 6 MB de origen; se reescala a 1400 px JPEG 0.85.
 */
export const MESA_PASTE = {
  maxBytes: 6 * 1024 * 1024,
  maxEdge: 1400,
  jpegQuality: 0.85,
  mime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
};

export function acceptImageFile(file) {
  if (!file) return { ok: false, error: 'sin archivo' };
  const type = String(file.type || '').toLowerCase();
  const okType = MESA_PASTE.mime.includes(type) || type === 'image/jpg';
  if (!okType) return { ok: false, error: 'formato: PNG, JPG, WebP o GIF' };
  if (Number(file.size) > MESA_PASTE.maxBytes) return { ok: false, error: 'máx. 6 MB' };
  return { ok: true, type: type === 'image/jpg' ? 'image/jpeg' : type };
}

export function fileFromClipboard(clipboardData) {
  const items = (clipboardData && clipboardData.items) || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it && it.type && it.type.indexOf('image/') === 0) {
      const f = it.getAsFile && it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

if (typeof window !== 'undefined') {
  window.MesaPaste = { MESA_PASTE, acceptImageFile, fileFromClipboard };
}
