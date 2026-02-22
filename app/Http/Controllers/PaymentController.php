<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\CourseOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function show(Course $course)
    {
        abort_unless($course->status === 'approved', 404);

        $course->load(['teacher', 'subject', 'category']);

        $latestOrder = CourseOrder::query()
            ->where('course_id', $course->id)
            ->where('user_id', auth()->id())
            ->latest()
            ->first();

        return view('payments.show', compact('course', 'latestOrder'));
    }

    public function generate(Request $request, Course $course)
    {
        abort_unless($course->status === 'approved', 404);

        if (!$this->stripeConfigured()) {
            return back()->with('error', 'ยังไม่ได้ตั้งค่า Stripe API ในไฟล์ .env');
        }

        $validated = $request->validate([
            'payment_channel' => ['required', 'in:card,promptpay'],
        ]);

        $paymentChannel = (string) $validated['payment_channel'];
        $stripeMethod = $paymentChannel === 'promptpay' ? 'promptpay' : 'card';

        $user = $request->user();

        $order = CourseOrder::create([
            'order_no' => $this->newOrderNo(),
            'user_id' => $user->id,
            'course_id' => $course->id,
            'amount' => $course->price,
            'currency' => strtoupper((string) config('services.stripe.currency', 'THB')),
            'status' => 'creating',
            'access_type' => $course->access_type ?: 'lifetime',
            'access_duration_months' => $course->access_type === 'time_limited'
                ? $course->access_duration_months
                : null,
            'access_expires_at' => null,
        ]);

        try {
            $response = Http::asForm()
                ->withToken((string) config('services.stripe.secret'))
                ->post('https://api.stripe.com/v1/checkout/sessions', [
                    'mode' => 'payment',
                    'success_url' => route('payments.stripe.success', ['order' => $order->id]) . '?session_id={CHECKOUT_SESSION_ID}',
                    'cancel_url' => route('payments.stripe.cancel', ['order' => $order->id]),
                    'customer_email' => (string) $user->email,
                    'client_reference_id' => $order->order_no,
                    'metadata[order_id]' => (string) $order->id,
                    'metadata[order_no]' => (string) $order->order_no,
                    'metadata[user_id]' => (string) $user->id,
                    'metadata[course_id]' => (string) $course->id,
                    'metadata[payment_channel]' => $paymentChannel,
                    'payment_method_types[0]' => $stripeMethod,
                    'line_items[0][quantity]' => 1,
                    'line_items[0][price_data][currency]' => strtolower((string) config('services.stripe.currency', 'THB')),
                    'line_items[0][price_data][unit_amount]' => $this->toStripeAmount((float) $course->price),
                    'line_items[0][price_data][product_data][name]' => Str::limit((string) $course->title, 120),
                    'line_items[0][price_data][product_data][description]' => Str::limit((string) $course->description, 200),
                ]);

            if ($response->failed()) {
                $order->update([
                    'status' => 'failed',
                    'res_code' => 'stripe_api_error',
                    'res_desc' => $this->shortText((string) $response->body(), 2000),
                    'provider_payload' => ['status' => $response->status(), 'body' => $response->json()],
                ]);

                return back()->with('error', 'สร้าง Stripe Checkout ไม่สำเร็จ กรุณาตรวจสอบการเปิดใช้งานช่องทางที่เลือกใน Stripe');
            }

            $data = $response->json();
            $sessionId = (string) ($data['id'] ?? '');
            $paymentUrl = $data['url'] ?? null;

            $order->update([
                'status' => $paymentUrl ? 'pending' : 'failed',
                'res_code' => $paymentUrl ? 'session_open' : 'session_error',
                'res_desc' => $paymentUrl ? null : 'Stripe session url missing',
                'payment_url' => $paymentUrl,
                'qp_id' => $this->shortText($sessionId, 191),
                'provider_payload' => $data,
            ]);

            if (empty($paymentUrl)) {
                return back()->with('error', 'สร้าง Stripe Checkout ไม่สำเร็จ');
            }

            return redirect()->away($paymentUrl);
        } catch (\Throwable $e) {
            $order->update([
                'status' => 'failed',
                'res_code' => 'exception',
                'res_desc' => $this->shortText($e->getMessage(), 2000),
            ]);

            Log::error('Stripe checkout create failed', [
                'order_id' => $order->id,
                'payment_channel' => $paymentChannel,
                'message' => $e->getMessage(),
            ]);

            return back()->with('error', 'เกิดข้อผิดพลาดระหว่างสร้างลิงก์ชำระเงิน');
        }
    }

    public function success(Request $request, CourseOrder $order)
    {
        abort_unless((int) $order->user_id === (int) $request->user()->id, 403);

        $sessionId = (string) $request->query('session_id', '');
        if ($sessionId === '') {
            return redirect()->route('courses.payment', $order->course_id)->with('error', 'ไม่พบ Stripe session');
        }

        $response = Http::withToken((string) config('services.stripe.secret'))
            ->get("https://api.stripe.com/v1/checkout/sessions/{$sessionId}");

        if ($response->failed()) {
            return redirect()->route('courses.payment', $order->course_id)->with('error', 'ตรวจสอบสถานะการชำระเงินไม่สำเร็จ');
        }

        $session = $response->json();
        $paid = (($session['payment_status'] ?? '') === 'paid');

        $paidAt = $paid ? ($order->paid_at ?? Carbon::now()) : $order->paid_at;
        $order->update([
            'status' => $paid ? 'paid' : $order->status,
            'res_code' => (string) ($session['status'] ?? $order->res_code),
            'res_desc' => $this->shortText((string) ($session['payment_status'] ?? $order->res_desc), 2000),
            'provider_payload' => $session,
            'paid_at' => $paidAt,
            'access_expires_at' => $paid
                ? $this->computeAccessExpiresAt($paidAt, (string) $order->access_type, $order->access_duration_months)
                : $order->access_expires_at,
            'qp_id' => $this->shortText((string) ($session['id'] ?? $order->qp_id), 191),
        ]);

        if ($paid) {
            return redirect()->route('student.courses')->with('success', 'ชำระเงินสำเร็จแล้ว');
        }

        return redirect()->route('courses.payment', $order->course_id)->with('error', 'ยังไม่พบสถานะชำระเงินสำเร็จ');
    }

    public function cancel(Request $request, CourseOrder $order)
    {
        abort_unless((int) $order->user_id === (int) $request->user()->id, 403);

        if (in_array($order->status, ['creating', 'pending'], true)) {
            $order->update(['status' => 'canceled']);
        }

        return redirect()->route('courses.payment', $order->course_id)->with('error', 'ยกเลิกการชำระเงินแล้ว');
    }

    public function webhook(Request $request)
    {
        $payload = (string) $request->getContent();
        $sigHeader = (string) $request->header('Stripe-Signature', '');
        $secret = (string) config('services.stripe.webhook_secret');

        if (!$this->verifyStripeSignature($payload, $sigHeader, $secret)) {
            return response()->json(['error' => 'Invalid signature'], 400);
        }

        $event = json_decode($payload, true);
        if (!is_array($event)) {
            return response()->json(['error' => 'Invalid payload'], 400);
        }

        $type = (string) ($event['type'] ?? '');
        $session = $event['data']['object'] ?? [];
        $orderId = (int) ($session['metadata']['order_id'] ?? 0);
        $orderNo = (string) ($session['metadata']['order_no'] ?? '');

        $order = CourseOrder::query()
            ->when($orderId > 0, fn ($q) => $q->whereKey($orderId))
            ->when($orderId === 0 && $orderNo !== '', fn ($q) => $q->where('order_no', $orderNo))
            ->latest()
            ->first();

        if (!$order) {
            Log::warning('Stripe webhook: order not found', ['event' => $event]);
            return response()->json(['ok' => true]);
        }

        if (in_array($type, ['checkout.session.completed', 'checkout.session.async_payment_succeeded'], true)) {
            $paidAt = $order->paid_at ?? Carbon::now();
            $order->update([
                'status' => 'paid',
                'res_code' => (string) ($session['status'] ?? $order->res_code),
                'res_desc' => $this->shortText((string) ($session['payment_status'] ?? 'paid'), 2000),
                'qp_id' => $this->shortText((string) ($session['id'] ?? $order->qp_id), 191),
                'provider_payload' => $event,
                'paid_at' => $paidAt,
                'access_expires_at' => $this->computeAccessExpiresAt(
                    $paidAt,
                    (string) $order->access_type,
                    $order->access_duration_months
                ),
            ]);
        }

        if (in_array($type, ['checkout.session.expired', 'checkout.session.async_payment_failed'], true)) {
            $order->update([
                'status' => 'failed',
                'res_code' => (string) ($session['status'] ?? $order->res_code),
                'res_desc' => $this->shortText((string) ($session['payment_status'] ?? 'failed'), 2000),
                'qp_id' => $this->shortText((string) ($session['id'] ?? $order->qp_id), 191),
                'provider_payload' => $event,
            ]);
        }

        return response()->json(['ok' => true]);
    }

    private function stripeConfigured(): bool
    {
        return !empty(config('services.stripe.secret')) && !empty(config('services.stripe.key'));
    }

    private function toStripeAmount(float $amount): int
    {
        return max(1, (int) round($amount * 100));
    }

    private function verifyStripeSignature(string $payload, string $header, string $secret): bool
    {
        if ($payload === '' || $header === '' || $secret === '') {
            return false;
        }

        $parts = [];
        foreach (explode(',', $header) as $item) {
            [$k, $v] = array_pad(explode('=', trim($item), 2), 2, null);
            if ($k && $v) {
                $parts[$k][] = $v;
            }
        }

        $timestamp = isset($parts['t'][0]) ? (int) $parts['t'][0] : 0;
        $signatures = $parts['v1'] ?? [];

        if ($timestamp <= 0 || empty($signatures)) {
            return false;
        }

        if (abs(time() - $timestamp) > 300) {
            return false;
        }

        $signedPayload = $timestamp . '.' . $payload;
        $expected = hash_hmac('sha256', $signedPayload, $secret);

        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }

        return false;
    }

    private function newOrderNo(): string
    {
        return 'CRS' . now()->format('YmdHis') . Str::upper(Str::random(5));
    }

    private function shortText(?string $value, int $max = 255): ?string
    {
        if ($value === null) {
            return null;
        }

        return mb_substr($value, 0, $max);
    }

    private function computeAccessExpiresAt(?Carbon $paidAt, string $accessType, ?int $durationMonths): ?Carbon
    {
        if ($accessType !== 'time_limited') {
            return null;
        }

        if (!$paidAt || !$durationMonths || $durationMonths <= 0) {
            return null;
        }

        return $paidAt->copy()->addMonthsNoOverflow($durationMonths);
    }
}
