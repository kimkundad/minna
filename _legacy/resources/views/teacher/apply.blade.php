@php($title = 'สมัครเป็นผู้สอนกับเรา')
@extends('layouts.auth')

@section('content')

    <style>
        .register-login-form {
            max-width: 500px;
            margin: 0 auto;
        }

        .mt-50 {
            margin-top: 50px;
        }
    </style>

    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li class="active">ลงทะเบียน</li>
                </ul>
                <h2 class="title">ลงทะเบียน <span>สมัครสอน</span></h2>
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
            <div class="register-login-wrapper">
                <div class="row justify-content-center align-items-center mt-50">
                    <div class="col-lg-6">
                        <div class="register-login-form shadow p-4 rounded bg-white">
                            <h3 class="title text-center mb-4">
                                สมัครเป็นผู้สอนกับเรา <span class="text-primary">Minnanonihongo</span>
                            </h3>
                            <p class="text-center mb-4">
                                เพียงกรอกข้อมูลด้านล่าง ใช้เวลาประมาณ 3-5 นาที แล้วทีมงานจะติดต่อกลับ
                            </p>

                            @if (session('status'))
                                <div class="mb-4 text-success">{{ session('status') }}</div>
                            @endif

                            @if ($errors->any())
                                <div class="mb-4 text-danger">
                                    <ul class="m-0 ps-3">
                                        @foreach ($errors->all() as $error)
                                            <li>{{ $error }}</li>
                                        @endforeach
                                    </ul>
                                </div>
                            @endif

                            <form method="POST" action="{{ route('teacher.apply') }}" enctype="multipart/form-data">
                                @csrf

                                <div class="single-form mb-3">
                                    <label class="form-label">ชื่อ - นามสกุล <span class="text-danger">*</span></label>
                                    <input
                                        type="text"
                                        name="name"
                                        class="form-control"
                                        placeholder="กรอกชื่อ - นามสกุล"
                                        value="{{ old('name') }}"
                                        required
                                    >
                                </div>

                                <div class="single-form mb-3">
                                    <label class="form-label">โทรศัพท์ <span class="text-danger">*</span></label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        class="form-control"
                                        placeholder="เช่น 0812345678"
                                        value="{{ old('phone') }}"
                                        required
                                    >
                                </div>

                                <div class="single-form mb-3">
                                    <label class="form-label">อีเมล <span class="text-danger">*</span></label>
                                    <input
                                        type="email"
                                        name="email"
                                        class="form-control"
                                        placeholder="กรอกอีเมลของคุณ"
                                        value="{{ old('email') }}"
                                        required
                                    >
                                </div>

                                <div class="single-form mb-3">
                                    <label class="form-label">หัวข้อ/สิ่งที่อยากเป็นผู้สอน <span class="text-danger">*</span></label>
                                    <input
                                        type="text"
                                        name="subject"
                                        class="form-control"
                                        placeholder="เช่น พัฒนาเว็บไซต์, AI, Excel ฯลฯ"
                                        value="{{ old('subject') }}"
                                        required
                                    >
                                </div>

                                <div class="single-form mb-3">
                                    <label class="form-label">
                                        ประวัติการทำงาน รายละเอียดผลงาน หรือหน้าที่ในปัจจุบัน
                                        <span class="text-danger">*</span>
                                    </label>
                                    <textarea
                                        name="experience"
                                        class="form-control"
                                        rows="3"
                                        placeholder="กรอกรายละเอียด..."
                                        required
                                    >{{ old('experience') }}</textarea>
                                </div>

                                <div class="single-form mb-3">
                                    <label class="form-label">
                                        แนบไฟล์ Resume หรือรูปภาพ/วิดีโอผลงาน
                                        (PDF, DOC, DOCX, JPG, JPEG, PNG, WEBP, MP4, MOV, AVI, WEBM, MKV)
                                    </label>
                                    <input
                                        type="file"
                                        name="resume"
                                        class="form-control"
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.mp4,.mov,.avi,.webm,.mkv,video/*"
                                    >
                                    <small class="text-muted d-block mt-2">
                                        รองรับไฟล์ขนาดไม่เกิน 50MB
                                    </small>
                                    @if (old('resume'))
                                        <small class="text-muted">ไฟล์เดิม: {{ old('resume') }}</small>
                                    @endif
                                </div>

                                <div class="single-form mb-3">
                                    <label class="form-label">เหตุผลที่อยากร่วมงานกับเรา (หากมี)</label>
                                    <textarea
                                        name="reason"
                                        class="form-control"
                                        rows="3"
                                        placeholder="บอกเหตุผลสั้นๆ..."
                                    >{{ old('reason') }}</textarea>
                                </div>

                                <div class="single-form mb-3">
                                    <label class="form-label">วันและเวลาที่สะดวกให้ทีมงานติดต่อกลับ</label>
                                    <input
                                        type="text"
                                        name="contact_time"
                                        class="form-control"
                                        placeholder="เช่น ทุกวันหลัง 18.00 น."
                                        value="{{ old('contact_time') }}"
                                    >
                                </div>

                                <div class="form-check mb-4">
                                    <input
                                        type="checkbox"
                                        class="form-check-input"
                                        name="agreement"
                                        {{ old('agreement') ? 'checked' : '' }}
                                        required
                                    >
                                    <label class="form-check-label">
                                        ข้าพเจ้ายินยอมให้ทีมงาน Minnanonihongo เก็บและใช้ข้อมูลส่วนบุคคล
                                        เพื่อการติดต่อกลับตามวัตถุประสงค์
                                    </label>
                                </div>

                                <div class="single-form">
                                    <button type="submit" class="btn btn-primary w-100">ส่งข้อมูล</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    @if (session('success'))
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกข้อมูลสำเร็จ!',
                    text: '{{ session('success') }}',
                    timer: 3000,
                    showConfirmButton: false
                });
            });
        </script>
    @endif

@endsection
