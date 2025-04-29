import axios from 'axios';

export function useCropImage() {
    const cropImage = async (
        imageFile: File,
        width: number,
        height: number,
        crop: { unit: string; x: number; y: number; width: number; height: number }
    ) => {
        if (!imageFile) return null;
        let x1 = crop.x;
        let y1 = crop.y;
        let x2 = crop.x + crop.width;
        let y2 = crop.y + crop.height;
        if (width > 400 || height > 400) {
            let maxWidth = 400 * (width / height);
            let maxHeight = 400;
            if (width >= height) {
                maxWidth = 400;
                maxHeight = 400 * (height / width);
            }

            x1 = crop.x * width / maxWidth;
            y1 = crop.y * height / maxHeight;
            x2 = (crop.x + crop.width) * width / maxWidth;
            y2 = (crop.y + crop.height) * height / maxHeight;
        }
        x1 = Math.round(x1);
        y1 = Math.round(y1);
        x2 = Math.round(x2);
        y2 = Math.round(y2);
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('x1', String(x1));
        formData.append('y1', String(y1));
        formData.append('x2', String(x2));
        formData.append('y2', String(y2));
        // const response = await axios.post('http://192.168.1.17:8001/api/image-editing/crop/', formData, {
        const response = await axios.post('https://edit-image-c5ys.onrender.com/api/image-editing/crop/', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        if (response.status === 200) {
            const imageUrl_base64 = response.data.cropped_image;
            const imageUrl = `data:image/jpeg;base64,${imageUrl_base64}`;
            return imageUrl;
        }
        else {
            return null;
        }
    };
    return { cropImage };
}
