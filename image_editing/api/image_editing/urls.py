from django.urls import path
from .views import ResizeImageView, resize_form_view


urlpatterns = [
    path('resize/', ResizeImageView.as_view()),
    path('resize-form/', resize_form_view, name='resize_form'),
]