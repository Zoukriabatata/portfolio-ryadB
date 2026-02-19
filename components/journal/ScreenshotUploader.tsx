'use client';

import { useState, useRef, useCallback } from 'react';

interface ScreenshotUploaderProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
}

export default function ScreenshotUploader({ urls, onChange, maxFiles = 5 }: ScreenshotUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large (max 5MB)');
      return null;
    }
    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed');
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/journal/upload', { method: 'POST', body: formData });
    if (!res.ok) return null;

    const data = await res.json();
    return data.url as string;
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    const remaining = maxFiles - urls.length;
    if (remaining <= 0) return;

    setUploading(true);
    const filesToUpload = Array.from(files).slice(0, remaining);
    const newUrls: string[] = [];

    for (const file of filesToUpload) {
      const url = await uploadFile(file);
      if (url) newUrls.push(url);
    }

    if (newUrls.length > 0) {
      onChange([...urls, ...newUrls]);
    }
    setUploading(false);
  }, [urls, maxFiles, onChange, uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const removeUrl = (index: number) => {
    onChange(urls.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {/* Thumbnails */}
      {urls.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {urls.map((url, i) => (
            <div key={i} className="relative group w-16 h-16">
              <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-[var(--border)]" />
              <button
                onClick={() => removeUrl(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--error)] text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {urls.length < maxFiles && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex items-center justify-center h-16 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
            dragOver ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] hover:border-[var(--text-muted)]'
          }`}
        >
          <span className="text-xs text-[var(--text-muted)]">
            {uploading ? 'Uploading...' : `Drop screenshots or click (${urls.length}/${maxFiles})`}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
