'use client';

import { useState } from 'react';
import Image from 'next/image';

interface ScreenshotGalleryProps {
  urls: string[];
}

export default function ScreenshotGallery({ urls }: ScreenshotGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (urls.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className="relative rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--primary)] transition-colors group"
          >
            <Image src={url} alt={`Screenshot ${i + 1}`} width={200} height={96} className="w-full h-24 object-cover" unoptimized />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fadeIn"
          style={{ zIndex: 'var(--z-modal, 400)' }}
          onClick={() => setLightboxIndex(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={urls[lightboxIndex]}
              alt=""
              width={1200}
              height={800}
              className="max-w-full max-h-[85vh] rounded-lg"
              unoptimized
            />
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              ×
            </button>
            {urls.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                {urls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxIndex(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === lightboxIndex ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
