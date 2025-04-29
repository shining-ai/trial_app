from django.shortcuts import render
from rest_framework.views import APIView, Response
from django.views import generic
from django.template import loader
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser
from PIL import Image
from io import BytesIO
import base64
import requests

MAX_SIZE = 5000
MINIMUM_SIZE = 50

class ResizeImageView(APIView):
    def get(self, request):
        return Response({'message': 'Resize API GET request received'})

    def post(self, request):
        image = request.FILES.get('image')        
        if not image:
            return Response({'error': 'No image provided'}, status=400)
        # width, heightは指定したものだけが送られてくる。(もう片方は0が送られてくる想定)
        width = request.POST.get('width')
        height = request.POST.get('height')
        if not width and not height:
            return Response({'error': 'Width or height are required'}, status=400)
        resized_image = resize_image_to_base64(image, min(int(width), MAX_SIZE), min(int(height), MAX_SIZE))
        if not resized_image:
            return Response({'error': 'Failed to resize image'}, status=500)
        return Response({'resized_image': resized_image})
    
class CropImageView(APIView):
    def get(self, request):
        return Response({'message': 'crop API GET request received'})

    def post(self, request):
        image = request.FILES.get('image')
        if not image:
            return Response({'error': 'No image provided'}, status=400)
        x1 = request.POST.get('x1')
        y1 = request.POST.get('y1')
        x2 = request.POST.get('x2')
        y2 = request.POST.get('y2')
        if not x1 and not y1 and not x2 and not y2:
            return Response({'error': 'x1, y1, x2, y2 are required'}, status=400)
        cropped_image = crop_image_to_base64(image, int(x1), int(y1), int(x2), int(y2))
        if not cropped_image:
            return Response({'error': 'Failed to crop image'}, status=400)
        return Response({'cropped_image': cropped_image})


# 画像トリミング処理
def crop_image_to_base64(image_file, x1, y1, x2, y2):
    img = Image.open(image_file)
    img = img.convert("RGB")
    cropped_img = img.crop((x1, y1, x2, y2))
    buffer = BytesIO()
    cropped_img.save(buffer, format='JPEG', quality=85)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

# 共通：画像リサイズ処理
def resize_image_to_base64(image_file, width=0, height=0):
    img = Image.open(image_file)
    img = img.convert("RGB")
    if width <= 0 and height <= 0:
        ratio = 1.0
    if 0 < width:
        ratio = max(width, MINIMUM_SIZE) / img.width
    elif 0 < height:
        ratio = max(height, MINIMUM_SIZE) / img.height
    size = (int(img.width * ratio), int(img.height * ratio))
    resized_img = img.resize(size)
    buffer = BytesIO()
    resized_img.save(buffer, format='JPEG', quality=85)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


# 画像リサイズのためのフォーム(仮でDjangoのテンプレートを使用)
def resize_form_view(request):
    image = request.FILES.get('image')
    if not image:
        return render(request, 'image_editing/resize_form.html')
    
    api_url = 'http://localhost:8001/api/image-editing/resize/'
    files = {'image': image}
    response = requests.post(api_url, files=files)
    if response.status_code != 200:
        return render(request, 'image_editing/resize_form.html', {'error': 'Error: {}'.format(response.status_code)})

    context = {}
    resizeed_image = response.json().get('resized_image')
    context['resized_image'] = resizeed_image
    return render(request, 'image_editing/resize_form.html', context)

