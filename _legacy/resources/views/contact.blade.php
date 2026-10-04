@extends('layouts.auth')

@section('content')
    @php
        $phone = $siteSettings['contact_phone'] ?? '(970) 262-1413';
        $phoneHref = preg_replace('/\D+/', '', $phone);
        $email = $siteSettings['contact_email'] ?? 'address@gmail.com';
    @endphp

    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ route('welcome') }}">Home</a></li>
                    <li class="active">ติดต่อเรา</li>
                </ul>
                <h2 class="title">Contact <span>Us</span></h2>
            </div>
        </div>

        <div class="shape-icon-box">
            <img class="icon-shape-1 animation-left" src="{{ asset('assets/images/shape/shape-5.png') }}" alt="Shape">
            <div class="box-content">
                <div class="box-wrapper">
                    <i class="flaticon-badge"></i>
                </div>
            </div>
            <img class="icon-shape-2" src="{{ asset('assets/images/shape/shape-6.png') }}" alt="Shape">
        </div>

        <img class="shape-3" src="{{ asset('assets/images/shape/shape-24.png') }}" alt="Shape">
        <img class="shape-author" src="{{ asset('assets/images/author/author-11.jpg') }}" alt="Shape">
    </div>

    <div class="section section-padding">
        <div class="container">
            <div class="contact-wrapper">
                <div class="row align-items-center">
                    <div class="col-lg-6">
                        <div class="contact-info">
                            <img class="shape animation-round" src="{{ asset('assets/images/shape/shape-12.png') }}" alt="Shape">

                            <div class="single-contact-info">
                                <div class="info-icon">
                                    <i class="flaticon-phone-call"></i>
                                </div>
                                <div class="info-content">
                                    <h6 class="title">Phone No.</h6>
                                    <p><a href="tel:{{ $phoneHref }}">{{ $phone }}</a></p>
                                </div>
                            </div>

                            <div class="single-contact-info">
                                <div class="info-icon">
                                    <i class="flaticon-email"></i>
                                </div>
                                <div class="info-content">
                                    <h6 class="title">Email Address.</h6>
                                    <p><a href="mailto:{{ $email }}">{{ $email }}</a></p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-6">
                        <div class="contact-form">
                            <h3 class="title">ปรึกษาคอร์สที่เหมาะกับคุณ <span>ฟรี</span></h3>

                            @if (session('contact_success'))
                                <div class="alert alert-success py-2 px-3 mb-3">{{ session('contact_success') }}</div>
                            @endif

                            @if ($errors->any())
                                <div class="alert alert-danger py-2 px-3 mb-3">
                                    กรุณาตรวจสอบข้อมูลอีกครั้ง
                                </div>
                            @endif

                            <div class="form-wrapper">
                                <form action="{{ route('contact.submit') }}" method="POST">
                                    @csrf

                                    <div class="single-form">
                                        <input type="text" name="name" value="{{ old('name') }}" placeholder="ชื่อของคุณ" required>
                                    </div>

                                    <div class="single-form">
                                        <input type="email" name="email" value="{{ old('email') }}" placeholder="อีเมล" required>
                                    </div>

                                    <div class="single-form">
                                        <input type="text" name="subject" value="{{ old('subject') }}"
                                            placeholder="หัวข้อที่ต้องการสอบถาม" required>
                                    </div>

                                    <div class="single-form">
                                        <textarea name="message" placeholder="ข้อความ">{{ old('message') }}</textarea>
                                    </div>

                                    <div class="single-form">
                                        <label class="mb-2 d-block">คำถามยืนยัน:
                                            {{ $captchaQuestion ?? session('contact_captcha_question') }} = ?</label>
                                        <input type="number" name="captcha_answer" value="{{ old('captcha_answer') }}"
                                            placeholder="ใส่คำตอบเพื่อยืนยันว่าไม่ใช่บอท" required>
                                        @error('captcha_answer')
                                            <div class="text-danger mt-1">{{ $message }}</div>
                                        @enderror
                                    </div>

                                    <div class="single-form">
                                        <button class="btn btn-primary btn-hover-dark w-100">
                                            ส่งข้อความ <i class="flaticon-right"></i>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
