FROM php:8.2-fpm-alpine

RUN apk add --no-cache \
    bash git curl unzip \
    icu-dev oniguruma-dev libzip-dev \
    freetype-dev libpng-dev libjpeg-turbo-dev \
    mysql-client

RUN apk add --no-cache $PHPIZE_DEPS \
  && docker-php-ext-configure gd --with-freetype --with-jpeg \
  && docker-php-ext-install pdo_mysql intl mbstring zip gd opcache \
  && pecl install redis \
  && docker-php-ext-enable redis \
  && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www
COPY ./php.ini /usr/local/etc/php/conf.d/99-custom.ini

RUN addgroup -g 1000 www && adduser -G www -g www -s /bin/sh -D -u 1000 www
USER www

EXPOSE 9000
