from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import shutil
import os
import ffmpeg

app = FastAPI()

UPLOAD_DIR = "uploads"
THUMBNAIL_DIR = "thumbnails"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

# 静的ファイルの配信設定
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/thumbnails", StaticFiles(directory=THUMBNAIL_DIR), name="thumbnails")

def generate_thumbnail(video_path: str, thumbnail_path: str):
    """Pythonのffmpegライブラリを使ってサムネイルを生成"""
    try:
        (
            ffmpeg
            .input(video_path, ss=300)  # 300秒目のフレームを取得
            .output(thumbnail_path, vframes=1)
            .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
        )
    except ffmpeg.Error as e:
        print("FFmpeg エラー:", e.stderr.decode())

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    thumbnail_filename = os.path.splitext(file.filename)[0] + ".jpg"  # .mp4を削除して.jpgを付与
    thumbnail_path = os.path.join(THUMBNAIL_DIR, thumbnail_filename)

    # 動画を保存
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # サムネイルを生成
    generate_thumbnail(file_path, thumbnail_path)

    return {
        "filename": file.filename,
        "url": f"/videos/{file.filename}",
        "thumbnail": f"/thumbnails/{thumbnail_filename}"
    }

@app.get("/videos")
async def list_videos():
    files = [
        {
            "filename": f,
            "url": f"/videos/{f}",
            "thumbnail": f"/thumbnails/{os.path.splitext(f)[0]}.jpg",
            "created_at": os.path.getctime(os.path.join(UPLOAD_DIR, f))
        }
        for f in os.listdir(UPLOAD_DIR)
    ]
    
    # アップロード順にソート（新しい順）
    files.sort(key=lambda x: x["created_at"], reverse=True)

    return JSONResponse(content=files)

@app.get("/videos/{filename}")
async def get_video(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="video/mp4")
    return JSONResponse(content={"error": "File not found"}, status_code=404)
