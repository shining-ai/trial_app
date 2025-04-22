'use client'


import axios from 'axios'
import { useState } from 'react'


export default function imageUpload() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [resizedImage, setResizedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) {
            alert('ファイルを選択してください');
            return;
        }

        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            const response = await axios.post('http://192.168.1.17:8001/api/image-editing/resize/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const imageUrl = response.data.resized_image;
            setResizedImage(imageUrl);
            setError(null);
        } catch (err: any) {
            setError('画像のアップロードに失敗しました。');
            setResizedImage(null);
            console.error(err);
        }
    };

    return (
        <div>
            <h2>画像をリサイズする</h2>
            <form onSubmit={handleSubmit}>
                <input type="file" accept='image/*' onChange={handleFileChange} />
                <button type="submit">画像をアップロード</button>
            </form>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            {resizedImage && (
                <div>
                    <h3>リサイズされた画像:</h3>
                    {/* <img src={resizedImage} alt="Resized" /> */}
                    <img src={`data:image/jpeg;base64,${resizedImage}`} />
                </div>
            )}
        </div>
    );
}