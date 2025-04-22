'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useResizeImage } from './hooks/useResizeImage';
import ImagePreview from './ImagePreview';

export default function ResizeForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);

  const { resizeImage, error } = useResizeImage();

  // 画像のサイズを取得してフォームに設定する
  const updateSizeFromImageUrl = (url: string) => {
    const img = new Image();
    img.onload = () => {
      setWidth(img.width);
      setHeight(img.height);
    };
    img.src = url;
  };

  // 画像の選択をする
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const imageUrl = URL.createObjectURL(file);
      setPreviewUrl(imageUrl);
      updateSizeFromImageUrl(imageUrl);
    }
  };

  // 画像のリサイズをする
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
