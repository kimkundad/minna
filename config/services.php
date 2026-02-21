<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'recaptcha' => [
        'site_key' => env('RECAPTCHA_SITE_KEY'),
        'secret_key' => env('RECAPTCHA_SECRET_KEY'),
    ],

    'quickpay_2c2p' => [
        'endpoint' => env('TWOC2P_ENDPOINT', 'https://coreapi.2c2p.com/core-api/api/2.0'),
        'merchant_id' => env('TWOC2P_MERCHANT_ID'),
        'secret_key' => env('TWOC2P_SECRET_KEY'),
        'version' => env('TWOC2P_VERSION', '2.4'),
        'currency' => env('TWOC2P_CURRENCY', 'THB'),
        'payment_option' => env('TWOC2P_PAYMENT_OPTION', ''),
        'payment_channel' => env('TWOC2P_PAYMENT_CHANNEL', ''),
    ],

];
