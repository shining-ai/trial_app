# react
FROM node:18

# 作業ディレクトリを /app に設定
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .
RUN yarn build

CMD ["yarn", "start"]
# CMD ["yarn", "dev"]
