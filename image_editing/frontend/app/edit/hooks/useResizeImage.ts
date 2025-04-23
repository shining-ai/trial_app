// hooks/useResizeImage.ts
import axios from 'axios';
import { useState } from 'react';

export function useResizeImage() {
    // const [resizedImage, setResizedImage] = useState('');
    const [error, setError] = useState('');

    const resizeImage = async (
        imageFile: File,
        width: number,
        height: number
    ) => {
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('width', String(width));
        formData.append('height', String(height));
        // const response = await axios.post('http://192.168.1.17:8001/api/image-editing/resize/', formData, {
        const response = await axios.post('https://edit-image-c5ys.onrender.com/api/image-editing/resize/', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        if (response.status === 200) {
            const imageUrl_base64 = response.data.resized_image;
            const imageUrl = `data:image/jpeg;base64,${imageUrl_base64}`;

            setError('');
            return imageUrl;
        } else {
            setError('画像のリサイズに失敗しました。');
            return null;
        }
    };
    return { resizeImage, error };
}




//         formData.append('image', imageFile);
//         formData.append('width', String(width));
//         formData.append('height', String(height));

//         try {
//             const res = await fetch('http://localhost:8001/api/resize_image/resize/', {
//                 method: 'POST',
//                 body: formData,
//             });

//             if (!res.ok) throw new Error(`エラー: ${res.status}`);

//             const data = await res.json();
//             setResizedImage(`data:image/png;base64,${data.resized_image}`);
//             setError('');
//         } catch (err: any) {
//             setError(err.message || '通信エラー');
//         }
//     };

//     return { resizedImage, error, resizeImage };
// }
