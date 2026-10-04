@extends('layouts.auth')

@section('content')
    @php
        $thumbnailUrl = $course->thumbnail_path
            ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->thumbnail_path)
            : asset('assets/images/courses/courses-01.jpg');
        $teacherName = $course->teacher->name ?? '-';
    @endphp

    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">
        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ route('welcome') }}">Home</a></li>
                    <li><a href="{{ route('courses.show', $course) }}">Course</a></li>
                    <li class="active">Payment</li>
                </ul>
                <h2 class="title">Stripe Checkout</h2>
            </div>
        </div>
        <div class="shape-icon-box">
            <img class="icon-shape-1 animation-left" src="{{ asset('assets/images/shape/shape-5.png') }}" alt="Shape">
            <div class="box-content"><div class="box-wrapper"><i class="flaticon-badge"></i></div></div>
            <img class="icon-shape-2" src="{{ asset('assets/images/shape/shape-6.png') }}" alt="Shape">
        </div>
        <img class="shape-3" src="{{ asset('assets/images/shape/shape-24.png') }}" alt="Shape">
        <img class="shape-author" src="{{ asset('assets/images/author/author-11.jpg') }}" alt="Shape">
    </div>

    <div class="section section-padding mt-n10">
        <div class="container">
            <div class="payment-wrap">
                @if (session('error'))
                    <div class="alert alert-danger mb-4">{{ session('error') }}</div>
                @endif

                @if (session('success'))
                    <div class="alert alert-success mb-4">{{ session('success') }}</div>
                @endif

                @if ($latestOrder)
                    <div class="alert alert-info mb-4">
                        ออเดอร์ล่าสุด: {{ $latestOrder->order_no }} | สถานะ: <strong>{{ $latestOrder->status }}</strong>
                    </div>
                @endif

                <div class="row g-4">
                    <div class="col-lg-6">
                        <div class="payment-card">
                            <h3 class="payment-title">สรุปการสั่งซื้อ</h3>
                            <div class="order-item">
                                <img src="{{ $thumbnailUrl }}" alt="{{ $course->title }}">
                                <div class="order-item-body">
                                    <h4>{{ $course->title }}</h4>
                                    <p>ผู้สอน: {{ $teacherName }}</p>
                                </div>
                            </div>

                            <div class="order-summary">
                                <div><span>รายการสั่งซื้อ</span><span>{{ $course->title }}</span></div>
                                <div><span>ประเภท</span><span>คอร์สออนไลน์</span></div>
                                <div><span>ราคา</span><span>{{ number_format((float) $course->price, 2) }} บาท</span></div>
                                <div class="total"><span>ราคาสุทธิ (รวม VAT)</span><span>{{ number_format((float) $course->price, 2) }} บาท</span></div>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-6">
                        <div class="payment-card">
                            <h3 class="payment-title">เลือกช่องทางชำระเงิน</h3>

                            <div class="pay-option">
                                <form method="POST" action="{{ route('courses.payment.generate', $course) }}">
                                    @csrf
                                    <input type="hidden" name="payment_channel" value="card">
                                    <button type="submit" class="pay-method pay-method-button">
                                        <div class="pay-method-content">
                                            <div class="pay-method-name">ชำระผ่านบัตรเครดิต</div>
                                            <div class="stripe-badge">VISA / Mastercard / JCB</div>
                                        </div>
                                        <i class="icofont-rounded-right"></i>
                                    </button>
                                </form>
                            </div>

                            <div class="pay-option">
                                <form method="POST" action="{{ route('courses.payment.generate', $course) }}">
                                    @csrf
                                    <input type="hidden" name="payment_channel" value="promptpay">
                                    <button type="submit" class="pay-method pay-method-button">
                                        <div class="pay-method-content">
                                            <div class="pay-method-name">QR Payment พร้อมเพย์</div>
                                            <div class="stripe-badge">PromptPay QR</div>
                                        </div>
                                        <i class="icofont-rounded-right"></i>
                                    </button>
                                </form>
                            </div>

                            <p class="text-muted small mt-3 mb-0">
                                หากช่องทางใดไม่ขึ้นในหน้า Stripe แปลว่ายังไม่ได้เปิดใช้งานช่องทางนั้นในบัญชี Stripe
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

@push('styles')
    <style>
        .payment-wrap {
            background: #f8f8f8;
            border: 1px solid #ebebeb;
            border-radius: 12px;
            padding: 24px;
        }

        .payment-card {
            background: #fff;
            border: 1px solid #e7e7e7;
            border-radius: 10px;
            padding: 24px;
            height: 100%;
        }

        .payment-title {
            font-size: 26px;
            margin-bottom: 18px;
        }

        .order-item {
            display: flex;
            gap: 16px;
            padding: 14px;
            border: 1px solid #ececec;
            border-radius: 8px;
            margin-bottom: 18px;
        }

        .order-item img {
            width: 170px;
            height: 96px;
            object-fit: cover;
            border-radius: 4px;
        }

        .order-item-body h4 {
            margin: 0 0 6px;
            font-size: 20px;
        }

        .order-summary > div {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 12px;
            color: #212832;
        }

        .order-summary .total {
            border-top: 1px solid #ececec;
            padding-top: 12px;
            margin-top: 4px;
            color: #309255;
            font-weight: 700;
            font-size: 20px;
        }

        .pay-option + .pay-option {
            margin-top: 16px;
        }

        .pay-method {
            border: 1px solid #ececec;
            border-radius: 8px;
            padding: 16px 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .pay-method-button {
            width: 100%;
            text-align: left;
            background: #fff;
            color: inherit;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .pay-method-button:hover {
            border-color: #309255;
            box-shadow: 0 0 0 2px rgba(48, 146, 85, 0.08);
        }

        .pay-method-name {
            font-size: 24px;
            font-weight: 600;
            line-height: 1.2;
        }

        .stripe-badge {
            display: inline-block;
            margin-top: 6px;
            background: #edf3ff;
            color: #2343b5;
            border: 1px solid #d9e2ff;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 13px;
            font-weight: 600;
        }

        .pay-method i {
            font-size: 22px;
            color: #309255;
        }

        @media (max-width: 767px) {
            .payment-wrap {
                padding: 14px;
            }

            .payment-card {
                padding: 16px;
            }

            .payment-title {
                font-size: 22px;
            }

            .pay-method-name {
                font-size: 20px;
            }
        }
    </style>
@endpush
