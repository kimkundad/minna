<?php

namespace App\Services;

use App\Models\CourseOrder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class TwoC2PQuickPayService
{
    public function isConfigured(): bool
    {
        return (bool) config('services.quickpay_2c2p.merchant_id')
            && (bool) config('services.quickpay_2c2p.secret_key')
            && (bool) config('services.quickpay_2c2p.endpoint');
    }

    public function generatePaymentLink(CourseOrder $order, array $buyer, string $returnUrl, string $backendUrl): array
    {
        $merchantId = (string) config('services.quickpay_2c2p.merchant_id');
        $secretKey = (string) config('services.quickpay_2c2p.secret_key');
        $version = (string) config('services.quickpay_2c2p.version', '2.4');
        $currency = (string) config('services.quickpay_2c2p.currency', 'THB');
        $paymentOption = (string) config('services.quickpay_2c2p.payment_option', '');
        $paymentChannel = (string) config('services.quickpay_2c2p.payment_channel', '');

        $payload = [
            'GenerateAndSendQPReq' => [
                'version' => $version,
                'timeStamp' => date('YmdHis'),
                'merchantID' => $merchantId,
                'orderIdPrefix' => $order->order_no,
                'description' => Arr::get($buyer, 'description', 'Course Payment'),
                'amount' => number_format((float) $order->amount, 2, '.', ''),
                'currencyCode' => $currency,
                'paymentOption' => $paymentOption,
                'paymentChannel' => $paymentChannel,
                'userDefined1' => (string) $order->id,
                'userDefined2' => (string) $order->course_id,
                'userDefined3' => (string) $order->user_id,
                'userDefined4' => '',
                'userDefined5' => '',
                'resultUrl1' => $returnUrl,
                'resultUrl2' => $backendUrl,
                'request3DS' => '',
                'expiryDateTime' => '',
                'statementDescriptor' => '',
                'appId' => '',
                'buyerName' => Arr::get($buyer, 'name', ''),
                'buyerEmail' => Arr::get($buyer, 'email', ''),
                'buyerMobile' => Arr::get($buyer, 'mobile', ''),
            ],
        ];

        $hashBase = $payload['GenerateAndSendQPReq']['version']
            . $payload['GenerateAndSendQPReq']['timeStamp']
            . $payload['GenerateAndSendQPReq']['merchantID']
            . $payload['GenerateAndSendQPReq']['orderIdPrefix']
            . $payload['GenerateAndSendQPReq']['description']
            . $payload['GenerateAndSendQPReq']['amount']
            . $payload['GenerateAndSendQPReq']['currencyCode']
            . $payload['GenerateAndSendQPReq']['paymentOption']
            . $payload['GenerateAndSendQPReq']['paymentChannel']
            . $payload['GenerateAndSendQPReq']['userDefined1']
            . $payload['GenerateAndSendQPReq']['userDefined2']
            . $payload['GenerateAndSendQPReq']['userDefined3']
            . $payload['GenerateAndSendQPReq']['userDefined4']
            . $payload['GenerateAndSendQPReq']['userDefined5']
            . $payload['GenerateAndSendQPReq']['resultUrl1']
            . $payload['GenerateAndSendQPReq']['resultUrl2']
            . $payload['GenerateAndSendQPReq']['request3DS']
            . $payload['GenerateAndSendQPReq']['expiryDateTime']
            . $payload['GenerateAndSendQPReq']['statementDescriptor']
            . $payload['GenerateAndSendQPReq']['appId']
            . $payload['GenerateAndSendQPReq']['buyerName']
            . $payload['GenerateAndSendQPReq']['buyerEmail']
            . $payload['GenerateAndSendQPReq']['buyerMobile'];

        $payload['GenerateAndSendQPReq']['hashValue'] = hash_hmac('sha1', $hashBase, $secretKey);

        return $this->postBase64Payload($payload);
    }

    public function queryByQpId(string $qpId): array
    {
        $merchantId = (string) config('services.quickpay_2c2p.merchant_id');
        $secretKey = (string) config('services.quickpay_2c2p.secret_key');
        $version = (string) config('services.quickpay_2c2p.version', '2.4');

        $payload = [
            'QPQueryReq' => [
                'version' => $version,
                'timeStamp' => date('YmdHis'),
                'merchantID' => $merchantId,
                'qpID' => $qpId,
            ],
        ];

        $hashBase = $payload['QPQueryReq']['version']
            . $payload['QPQueryReq']['timeStamp']
            . $payload['QPQueryReq']['merchantID']
            . $payload['QPQueryReq']['qpID'];

        $payload['QPQueryReq']['hashValue'] = hash_hmac('sha1', $hashBase, $secretKey);

        return $this->postBase64Payload($payload);
    }

    private function postBase64Payload(array $payload): array
    {
        $endpoint = (string) config('services.quickpay_2c2p.endpoint');
        $encoded = base64_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));

        $response = Http::withBody($encoded, 'text/plain')
            ->accept('application/json')
            ->timeout(25)
            ->post($endpoint);

        if (!$response->successful()) {
            throw new RuntimeException('2C2P request failed with HTTP ' . $response->status());
        }

        $raw = trim((string) $response->body());
        $decoded = base64_decode($raw, true);

        if ($decoded === false) {
            $json = $response->json();
            if (!is_array($json)) {
                throw new RuntimeException('Invalid 2C2P response format');
            }

            return $json;
        }

        $data = json_decode($decoded, true);
        if (!is_array($data)) {
            throw new RuntimeException('Invalid decoded 2C2P response');
        }

        return $data;
    }
}
