# 画像編集Webアプリ

## 概要
画像をアップロードしてWebアプリ上で編集することができます。
* 画像のサイズ変更

## 使用技術
* フロントエンド
    * React
* バックエンド(API)
    * Django
    * Django REST Framework
    * Pillow


## 検証環境構築手順
### サービスの起動
```
docker compose up -d
```

以下のURLでアプリにアクセスすることができます。
* フロントエンド
http://localhost:3000/edit

* バックエンド
http://localhost:8001/api/image-editing/resize/


## 本番環境
* backend
    * Renderにデプロイしています。
* frontend
    * Vercelにデプロイしてあります。

