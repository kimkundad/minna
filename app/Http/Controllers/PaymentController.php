<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\CourseOrder;
use App\Services\TwoC2PQuickPayService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function __construct(private readonly TwoC2PQuickPayService $quickPay)
    {
    }

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

        if (!$this->quickPay->isConfigured()) {
            return back()->with('error', 'ยังไม่ได้ตั้งค่า 2C2P API ในไฟล์ .env');
        }

        $user = $request->user();

        $order = CourseOrder::create([
            'order_no' => $this->newOrderNo(),
            'user_id' => $user->id,
            'course_id' => $course->id,
            'amount' => $course->price,
            'currency' => config('services.quickpay_2c2p.currency', 'THB'),
            'status' => 'creating',
        ]);

        try {
            $returnUrl = route('payments.2c2p.return');
            $backendUrl = route('payments.2c2p.webhook');

            $response = $this->quickPay->generatePaymentLink($order, [
                'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: $user->name,
                'email' => (string) $user->email,
                'mobile' => preg_replace('/\D+/', '', (string) ($user->phone ?? $user->phone_national ?? '')),
                'description' => Str::limit((string) $course->title, 120),
            ], $returnUrl, $backendUrl);

            $data = $response['GenerateAndSendQPRes'] ?? [];
            $resCode = (string) ($data['resCode'] ?? '');
            $paymentUrl = $data['shortURL'] ?? $data['qpURL'] ?? $data['paymentURL'] ?? null;
            $qpId = $data['qpID'] ?? null;

            $order->update([
                'status' => $resCode === '0000' ? 'pending' : 'failed',
                'res_code' => $resCode ?: null,
                'res_desc' => $data['resDesc'] ?? null,
                'payment_url' => $paymentUrl,
                'qp_id' => $qpId,
                'provider_payload' => $response,
            ]);

            if ($resCode !== '0000' || empty($paymentUrl)) {
                return back()->with('error', 'สร้างลิงก์ชำระเงินไม่สำเร็จ: ' . ($data['resDesc'] ?? 'Unknown error'));
            }

            return redirect()->away($paymentUrl);
        } catch (\Throwable $e) {
            $order->update([
                'status' => 'failed',
                'res_desc' => $e->getMessage(),
            ]);

            Log::error('2C2P generate link failed', [
                'order_id' => $order->id,
                'message' => $e->getMessage(),
            ]);

            return back()->with('error', 'เกิดข้อผิดพลาดระหว่างสร้างลิงก์ชำระเงิน');
        }
    }

    public function callback(Request $request)
    {
        $orderNo = (string) ($request->input('orderIdPrefix') ?? $request->input('order_no') ?? '');
        $qpId = (string) ($request->input('qpID') ?? $request->input('qpId') ?? '');

        $order = CourseOrder::query()
            ->when($orderNo !== '', fn ($q) => $q->where('order_no', $orderNo))
            ->when($orderNo === '' && $qpId !== '', fn ($q) => $q->where('qp_id', $qpId))
            ->latest()
            ->first();

        if (!$order) {
            return redirect()->route('course')->with('error', 'ไม่พบรายการชำระเงิน');
        }

        $this->syncOrderByQuery($order, $qpId ?: (string) $order->qp_id);

        if ($order->fresh()->status === 'paid') {
            return redirect()->route('student.courses')->with('success', 'ชำระเงินสำเร็จแล้ว');
        }

        return redirect()->route('courses.payment', $order->course_id)
            ->with('error', 'ยังไม่พบสถานะชำระเงินสำเร็จ กรุณาตรวจสอบอีกครั้ง');
    }

    public function webhook(Request $request)
    {
        $payload = $this->parseWebhookPayload($request);

        $orderNo = (string) data_get($payload, 'orderIdPrefix', data_get($payload, 'order_no', ''));
        $qpId = (string) data_get($payload, 'qpID', data_get($payload, 'qpId', ''));

        $order = CourseOrder::query()
            ->when($orderNo !== '', fn ($q) => $q->where('order_no', $orderNo))
            ->when($orderNo === '' && $qpId !== '', fn ($q) => $q->where('qp_id', $qpId))
            ->latest()
            ->first();

        if ($order) {
            $this->syncOrderByQuery($order, $qpId ?: (string) $order->qp_id);
        } else {
            Log::warning('2C2P webhook: order not found', ['payload' => $payload]);
        }

        return response()->json(['ok' => true]);
    }

    private function syncOrderByQuery(CourseOrder $order, string $qpId): void
    {
        if ($qpId === '') {
            return;
        }

        try {
            $response = $this->quickPay->queryByQpId($qpId);
            $data = $response['QPQueryRes'] ?? [];
            $resCode = (string) ($data['resCode'] ?? '');
            $approvedCount = (int) ($data['currentApproved'] ?? 0);
            $isPaid = $resCode === '0000' && $approvedCount > 0;

            $order->update([
                'qp_id' => $qpId,
                'status' => $isPaid ? 'paid' : ($order->status === 'paid' ? 'paid' : 'pending'),
                'res_code' => $resCode ?: null,
                'res_desc' => $data['resDesc'] ?? $order->res_desc,
                'provider_payload' => $response,
                'paid_at' => $isPaid ? ($order->paid_at ?? Carbon::now()) : $order->paid_at,
            ]);
        } catch (\Throwable $e) {
            Log::error('2C2P query failed', [
                'order_id' => $order->id,
                'qp_id' => $qpId,
                'message' => $e->getMessage(),
            ]);
        }
    }

    private function parseWebhookPayload(Request $request): array
    {
        $json = $request->json()->all();
        if (!empty($json)) {
            return $json;
        }

        $raw = trim((string) $request->getContent());
        if ($raw === '') {
            return [];
        }

        $decodedBase64 = base64_decode($raw, true);
        if ($decodedBase64 !== false) {
            $decodedJson = json_decode($decodedBase64, true);
            if (is_array($decodedJson)) {
                return $decodedJson;
            }
        }

        $decodedJson = json_decode($raw, true);
        return is_array($decodedJson) ? $decodedJson : [];
    }

    private function newOrderNo(): string
    {
        return 'CRS' . now()->format('YmdHis') . Str::upper(Str::random(5));
    }
}
