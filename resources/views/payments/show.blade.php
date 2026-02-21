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
                <h2 class="title">Payment</h2>
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
                                {{-- <div><span>รหัสส่วนลด</span><span><input type="text" placeholder="กรอกรหัสส่วนลด" disabled></span></div> --}}
                                <div class="total"><span>ราคาสุทธิ (รวม VAT)</span><span>{{ number_format((float) $course->price, 2) }} บาท</span></div>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-6">
                        <div class="payment-card">
                            <h3 class="payment-title">เลือกช่องทางชำระเงิน</h3>
                            <div class="pay-method active">
                                <div class="pay-method-content">
                                    <div class="pay-method-name">QR Code พร้อมเพย์</div>
                                    <div class="promptpay-badge">PromptPay</div>
                                </div>
                                <i class="icofont-rounded-right"></i>
                            </div>

                            <div class="qr-area">
                                <div class="qr-placeholder">
                                    <i class="icofont-qr-code"></i>
                                    <p>QR พร้อมเพย์ (ตัวอย่าง)</p>
                                </div>
                                <form method="POST" action="{{ route('courses.payment.generate', $course) }}">
                                    @csrf
                                    <button type="submit" class="btn btn-primary btn-hover-dark w-100 mt-3">
                                        ยืนยันการชำระเงิน
                                    </button>
                                </form>
                            </div>
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

        .order-summary input {
            border: 1px solid #d8d8d8;
            border-radius: 4px;
            font-size: 14px;
            padding: 2px 8px;
            width: 160px;
            background: #fafafa;
        }

        .order-summary .total {
            border-top: 1px solid #ececec;
            padding-top: 12px;
            margin-top: 4px;
            color: #309255;
            font-weight: 700;
            font-size: 20px;
        }

        .pay-method {
            border: 1px solid #ececec;
            border-radius: 8px;
            padding: 18px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .pay-method.active {
            border-color: #309255;
            box-shadow: 0 0 0 2px rgba(48, 146, 85, 0.08);
        }

        .pay-method-name {
            font-size: 32px;
            font-weight: 600;
            line-height: 1.2;
        }

        .promptpay-badge {
            display: inline-block;
            margin-top: 6px;
            background: #f1f5ff;
            color: #2048aa;
            border: 1px solid #d9e2ff;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 14px;
            font-weight: 600;
        }

        .pay-method i {
            font-size: 22px;
            color: #309255;
        }

        .qr-area {
            border: 1px dashed #d8d8d8;
            border-radius: 8px;
            padding: 16px;
            background: #fcfcfc;
        }

        .qr-placeholder {
            background: #fff;
            border: 1px solid #ececec;
            border-radius: 8px;
            min-height: 230px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #4f4f4f;
        }

        .qr-placeholder i {
            font-size: 68px;
            color: #309255;
            margin-bottom: 10px;
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
                font-size: 24px;
            }
        }
    </style>
@endpush
