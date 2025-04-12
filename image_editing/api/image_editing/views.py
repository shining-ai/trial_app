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

class ResizeImageView(APIView):
    # parser_classes = (MultiPartParser)
    def get(self, request):
        return Response({'message': 'GET request received'})

    def post(self, request):
        image = request.FILES.get('image')        
        if not image:
            return Response({'error': 'No image provided'}, status=400)
        resized_image = resize_image_to_base64(image)
        return Response({'resized_image': resized_image})

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


# 共通：画像リサイズ処理
def resize_image_to_base64(image_file, size=(300, 300)):
    img = Image.open(image_file)
    img = img.convert("RGB")
    img.thumbnail(size)
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')