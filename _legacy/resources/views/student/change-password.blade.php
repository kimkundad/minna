@extends('layouts.auth')

@section('content')
    @php
        $user = auth()->user();
    @endphp

    <style>
        .student-dashboard-wrap {
            padding: 60px 0 90px;
            background: #f5f5f5;
        }

        .student-dashboard-inner {
            margin: 0 auto;
            background: #ececec;
            border-radius: 8px;
            padding: 24px;
            display: grid;
            grid-template-columns: 240px 1fr;
            gap: 24px;
        }

        .student-side-nav {
            background: #fff;
            border: 1px solid #e6e6e6;
            border-radius: 8px;
            padding: 14px;
            height: fit-content;
        }

        .student-side-nav h4 {
            font-size: 13px;
            font-weight: 600;
            margin: 0 0 10px;
            color: #7b7b7b;
        }

        .student-side-nav .side-link {
            width: 100%;
            border: 0;
            background: transparent;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 7px;
            color: #555;
            text-decoration: none;
            margin-bottom: 4px;
            font-size: 14px;
            transition: .2s ease;
            text-align: left;
        }

        .student-side-nav .side-link:hover,
        .student-side-nav .side-link.active {
            background: #e5f2ea;
            color: #1d7f4f;
        }

        .student-side-nav .side-link-btn {
            cursor: pointer;
        }

        .student-content h3 {
            font-size: 32px;
            margin: 8px 0 4px;
            color: #065f46;
        }

        .student-content .desc {
            color: #7f7f7f;
            margin-bottom: 20px;
        }

        .profile-card {
            background: #fff;
            border: 1px solid #d9d9d9;
            border-radius: 12px;
            padding: 24px;
        }

        .profile-head {
            display: flex;
            align-items: center;
            gap: 16px;
            padding-bottom: 18px;
            border-bottom: 1px solid #e8e8e8;
            margin-bottom: 18px;
        }

        .avatar {
            width: 74px;
            height: 74px;
            border-radius: 50%;
            border: 1px solid #d7d7d7;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1d7f4f;
            font-size: 24px;
        }

        .profile-head h4 {
            margin: 0;
            font-size: 32px;
            color: #065f46;
        }

        .profile-head p {
            margin: 4px 0 0;
            color: #7f7f7f;
        }

        .field-label {
            display: block;
            margin-bottom: 6px;
            color: #065f46;
            font-weight: 600;
        }

        .single-form {
            margin-bottom: 14px;
        }

        .single-form input {
            width: 100%;
            max-width: 460px;
            border: 1px solid #cfcfcf;
            border-radius: 0;
            background: #fff;
            height: 46px;
            padding: 10px 12px;
        }

        .password-note {
            margin: 10px 0 14px;
            color: #4b5563;
        }

        .password-note ul {
            margin: 8px 0 0;
            padding-left: 18px;
        }

        .save-btn {
            display: inline-block;
            min-width: 180px;
            border: 0;
            background: #046c3d;
            color: #fff;
            font-weight: 600;
            height: 48px;
            border-radius: 6px;
            margin-top: 12px;
        }

        @media (max-width: 991px) {
            .student-dashboard-inner {
                grid-template-columns: 1fr;
                padding: 16px;
            }

            .student-content h3 {
                font-size: 26px;
            }

            .profile-head h4 {
                font-size: 24px;
            }
        }
    </style>

    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">
        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li><a href="{{ route('student.index') }}">โปรไฟล์ของฉัน</a></li>
                    <li class="active">เปลี่ยนรหัสผ่าน</li>
                </ul>
                <h2 class="title">เปลี่ยน<span>รหัสผ่าน</span></h2>
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

    <div class="student-dashboard-wrap">
        <div class="container">
            <div class="student-dashboard-inner">
                @include('student.partials.sidebar', ['active' => 'password'])

                <div class="student-content">
                    <h3>เปลี่ยนรหัสผ่าน</h3>
                    <p class="desc">เปลี่ยนรหัสผ่านสำหรับเข้าสู่ระบบ</p>

                    @if (session('status'))
                        <div class="alert alert-success">{{ session('status') }}</div>
                    @endif

                    @if ($errors->any())
                        <div class="alert alert-danger">
                            <ul class="mb-0">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    @endif

                    <div class="profile-card">
                        <div class="profile-head">
                            <div class="avatar"><i class="icofont-user"></i></div>
                            <div>
                                <h4>{{ trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: ($user->name ?? '-') }}</h4>
                                <p>{{ $user->email }}</p>
                            </div>
                        </div>

                        <form method="POST" action="{{ route('student.password.update') }}">
                            @csrf
                            @method('PUT')

                            <div class="single-form">
                                <label class="field-label">รหัสผ่านเก่า</label>
                                <input type="password" name="current_password" required>
                            </div>

                            <div class="single-form">
                                <label class="field-label">รหัสผ่านใหม่</label>
                                <input type="password" name="password" required>
                            </div>

                            <div class="password-note">
                                รหัสผ่านจะต้องประกอบด้วย
                                <ul>
                                    <li>ตัวอักษรภาษาอังกฤษ</li>
                                    <li>ตัวเลขอารบิก</li>
                                    <li>ความยาวอย่างน้อย 8 ตัว</li>
                                </ul>
                            </div>

                            <div class="single-form">
                                <label class="field-label">ยืนยันรหัสผ่านใหม่</label>
                                <input type="password" name="password_confirmation" required>
                            </div>

                            <button type="submit" class="save-btn">เปลี่ยนรหัสผ่าน</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
