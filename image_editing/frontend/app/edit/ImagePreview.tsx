'use client';

import Image from 'next/image';

import { useState, useImperativeHandle, forwardRef } from 'react';
import ReactCrop, { Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export interface ImagePreviewHandle {
  getCrop: () => Crop;
}


const ImagePreview = forwardRef<ImagePreviewHandle, { previewUrl: string }>(({ previewUrl }, ref) => {
  const [crop, setCrop] = useState<Crop>({
    unit: '%',  // %単位で設定
    width: 100,  // 幅（%）
    height: 100, // 高さ（%）
    x: 0,      // x座標（%）
    y: 0       // y座標（%）
  });

  useImperativeHandle(ref, () => ({
    getCrop: () => crop,
  }));

  if (!previewUrl) return null;

  return (
    <div
      style={{
        width: '400px',
        height: '400px',
        backgroundColor: 'gray',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ReactCrop
          crop={crop}
          onChange={(newCrop) => setCrop(newCrop)}
        >
          <Image
            src={previewUrl}
            alt="preview"
            width={400}
            height={400}
            style={{
              objectFit: 'contain', // 画像が枠内に収まるように縮小
              maxWidth: '400px',       // 枠に収める制限
              maxHeight: '400px',      // 枠に収める制限
              width: 'auto',        // 画像の元の幅を維持
              height: 'auto',       // 画像の元の高さを維持
            }}
          />
        </ReactCrop>
      </div>
    </div >
  );
});

export default ImagePreview;
ImagePreview.displayName = 'ImagePreview';