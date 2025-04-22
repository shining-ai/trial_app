export default function ImagePreview({ previewUrl }: { previewUrl: string }) {
    if (!previewUrl) return null;
    return (
        <div
            style={{
                width: '600px',
                height: '400px',
                backgroundColor: 'Gray',
                display: 'flex',
                overflow: 'hidden',
            }}
        >
            <img
                src={previewUrl}
                alt="preview"
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    margin: 'auto',
                }}
            />
        </div>
    );
}
