'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useResizeImage } from './hooks/useResizeImage';
import { useCropImage } from './hooks/useCropImage';
import ImagePreview, { ImagePreviewHandle } from './ImagePreview';


export default function ResizeForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [fileSize, setFileSize] = useState<number>(0);

  const { resizeImage, error } = useResizeImage();
  const { cropImage } = useCropImage();



  const cropRef = React.useRef<ImagePreviewHandle>(null);  // refを作成


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
      const reader = new FileReader();
      reader.readAsDataURL(file); // ★ base64に変換
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPreviewUrl(reader.result); // ★ base64の文字列をセット
        }
      };
      updateSizeFromImageUrl(imageUrl);
      setFileSize(file.size);
    }
  };

  const base64ToFile = (base64: string) => {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
      const byteArray = new Uint8Array(Math.min(1024, byteCharacters.length - offset));
      for (let i = 0; i < byteArray.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(offset + i);
      }
      byteArrays.push(byteArray);
    }
    // Uint8ArrayのバイトデータからBlobを作成
    const blob = new Blob(byteArrays, { type: 'image/jpeg' });

    // BlobからFileオブジェクトを作成
    const file = new File([blob], '    resized_image.jpg', { type: 'image/jpeg' });
    return file;
  }

  // バイトをKB, MBに変換する関数
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} バイト`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // 画像のリサイズをする
  const handleResize = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageFile) return;
    const result = await resizeImage(imageFile, width, height);
    if (!result) return;
    setPreviewUrl(result);
    updateSizeFromImageUrl(result);
    const resizedFile = base64ToFile(result.split(',')[1]);
    setFileSize(resizedFile.size);
  };

  // widthを基準に画像をリサイズする
  const handleWidthChange = async (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (!imageFile) return;
    const result = await resizeImage(imageFile, width, 0);
    if (!result) return;
    setPreviewUrl(result);
    updateSizeFromImageUrl(result);
    const resizedFile = base64ToFile(result.split(',')[1]);
    setFileSize(resizedFile.size);
  };

  // heightを基準に画像をリサイズする
  const handleHeightChange = async (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (!imageFile) return;
    const result = await resizeImage(imageFile, 0, height);
    if (!result) return;
    setPreviewUrl(result);
    updateSizeFromImageUrl(result);
    const resizedFile = base64ToFile(result.split(',')[1]);
    setFileSize(resizedFile.size);
  };



  // ダウンロードボタンの処理
  const downloadClick = async () => {
    if (!previewUrl) {
      alert('画像を選択してください。');
      return;
    }
    if (cropRef.current) {
      // cropの座標を取得
      const crop = cropRef.current.getCrop();
      if (!crop.width || !crop.height) return;

      const a = document.createElement('a');
      if (crop.unit === '%') {
        a.href = previewUrl
      }
      else {
        const previewedFile = base64ToFile(previewUrl.split(',')[1]);
        const cropedImage = await cropImage(previewedFile, width, height, crop);
        if (!cropedImage) return alert('画像のダウンロードに失敗しました。');
        a.href = cropedImage;
      }
      a.download = 'resized_image.jpg';
      a.click();
    }
  };




  return (
    <form onSubmit={handleResize}>
      <input type="file" accept="image/*" onChange={handleImageChange} /><br /><br />
      <ImagePreview ref={cropRef} previewUrl={previewUrl} />
      <div>
        <label>Width:
          <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} onBlur={handleWidthChange} />
        </label>
        <label>Height:
          <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} onBlur={handleHeightChange} />
        </label>
      </div>
      <div>
        <p>ファイルサイズ: {formatFileSize(fileSize)}</p>
      </div>
      <button type="button" onClick={downloadClick}>画像をダウンロード</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}
