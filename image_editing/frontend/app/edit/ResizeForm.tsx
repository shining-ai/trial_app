'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useResizeImage } from './hooks/useResizeImage';
import ImagePreview from './ImagePreview';

export default function ResizeForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [width, setWidth] = useState<number>(300);
  const [height, setHeight] = useState<number>(300);

  const { resizeImage, error } = useResizeImage();

  const updateSizeFromImageUrl = (url: string) => {
    const img = new Image();
    img.onload = () => {
      setWidth(img.width);
      setHeight(img.height);
    };
    img.src = url;
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const imageUrl = URL.createObjectURL(file);
      setPreviewUrl(imageUrl);

      // 画像のwidth/heightを取得して初期値に設定
      updateSizeFromImageUrl(imageUrl);
    }
  };

  const handleResize = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageFile) return;
    const result = await resizeImage(imageFile, width, height);
    if (!result) return;
    setPreviewUrl(result);
    updateSizeFromImageUrl(result);
  };



  return (
    <form onSubmit={handleResize}>
      <input type="file" accept="image/*" onChange={handleImageChange} /><br /><br />
      <ImagePreview previewUrl={previewUrl} />
      <div>
        <label>Width:
          <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} onBlur={handleResize} />
        </label>
        <label>Height:
          <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} onBlur={handleResize} />
        </label>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}
