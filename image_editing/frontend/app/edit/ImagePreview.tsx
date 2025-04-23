'use client';

import Image from 'next/image';

export default function ImagePreview({ previewUrl }: { previewUrl: string }) {
  if (!previewUrl) return null;

  return (
    <div
      style={{
        width: '600px',
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
        <Image
          src={previewUrl}
          alt="preview"
          width={600}
          height={400}
          style={{
            objectFit: 'contain', // 画像が枠内に収まるように縮小
            maxWidth: '100%',     // 枠に収める制限
            maxHeight: '100%',    // 枠に収める制限
            width: 'auto',        // 画像の元の幅を維持
            height: 'auto',       // 画像の元の高さを維持
          }}
        />
      </div>
    </div>
  );
}
