from django.urls import path
from .views import ResizeImageView, resize_form_view
from .views import CropImageView


urlpatterns = [
    path('resize/', ResizeImageView.as_view()),
    path('crop/', CropImageView.as_view()),
    path('resize-form/', resize_form_view, name='resize_form'),
]