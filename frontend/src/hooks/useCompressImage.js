import { useCallback } from 'react';

export default function useCompressImage() {
  return useCallback((file, maxWidth = 1200, quality = 0.8) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < 500000) { resolve(file); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else { resolve(file); }
          }, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }, []);
}
