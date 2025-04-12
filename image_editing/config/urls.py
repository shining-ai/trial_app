from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/image-editing/', include('api.image_editing.urls')),
]
