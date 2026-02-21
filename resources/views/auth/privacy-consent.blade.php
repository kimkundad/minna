@extends('layouts.auth')

@section('content')
    <style>
        .privacy-wrap {
            max-width: 980px;
            margin: 40px auto;
            background: #fff;
            border-radius: 14px;
            border: 1px solid #e5e7eb;
            padding: 28px;
        }

        .privacy-box {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            max-height: 320px;
            overflow: auto;
            padding: 18px;
            background: #f9fafb;
            white-space: pre-line;
        }
    </style>

    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li class="active">Privacy Policy</li>
                </ul>
                <h2 class="title">Privacy <span>Policy</span></h2>
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
            <div class="privacy-wrap mb-3 p-0 border-0 bg-transparent">
                <div class="alert alert-success mb-0">
                    สมัครสมาชิกสำเร็จ กรุณายอมรับนโยบายคุ้มครองข้อมูลส่วนบุคคลเพื่อเริ่มต้นใช้งาน
                </div>
            </div>

            <div class="privacy-wrap">
                <h2 class="mb-2">นโยบายคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy)</h2>
                <p class="text-muted mb-4">สำหรับการให้บริการของแพลตฟอร์ม Minna</p>

                <div class="privacy-box mb-4">
1. เราเก็บข้อมูลที่จำเป็นต่อการสมัครสมาชิกและการให้บริการการเรียนออนไลน์
2. ข้อมูลของคุณจะถูกนำไปใช้เพื่อยืนยันตัวตน ติดต่อสื่อสาร และพัฒนาบริการ
3. เราไม่เปิดเผยข้อมูลส่วนบุคคลแก่บุคคลภายนอกโดยไม่มีเหตุอันชอบด้วยกฎหมาย
4. ผู้ใช้สามารถติดต่อเพื่อขอแก้ไขข้อมูล หรือตามสิทธิที่กฎหมายกำหนดได้
5. การใช้งานระบบถือว่ารับทราบนโยบายที่ประกาศในหน้านี้
                </div>

                <form method="POST" action="{{ route('privacy.accept.submit') }}">
                    @csrf
                    <div class="form-check mb-3">
                        <input class="form-check-input" type="checkbox" id="accept_privacy" name="accept_privacy" required>
                        <label class="form-check-label" for="accept_privacy">
                            ยอมรับนโยบายการคุ้มครองข้อมูลส่วนบุคคล และอนุญาตให้ใช้งานข้อมูลตามวัตถุประสงค์การให้บริการ
                        </label>
                    </div>

                    <button type="submit" class="btn btn-success px-5">ยอมรับ</button>
                </form>
            </div>
        </div>
    </div>
@endsection
