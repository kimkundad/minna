@extends('layouts.auth')

@section('content')
    @php
        $user = auth()->user();
        $birth = $user->birthdate ? \Carbon\Carbon::parse($user->birthdate) : null;
        $birthDay = old('birth_day', $birth?->day);
        $birthMonth = old('birth_month', $birth?->month);
        $birthYear = old('birth_year', $birth ? $birth->year + 543 : null);
        $countryCode = old('phone_country_code', $user->phone_country_code ?: '+66');
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

        .single-form input,
        .single-form select {
            width: 100%;
            border: 1px solid #cfcfcf;
            border-radius: 0;
            background: #fff;
            height: 46px;
            padding: 10px 12px;
        }

        .birth-row {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            max-width: 360px;
        }

        .birth-row input {
            display: block;
            margin: 0 !important;
            position: relative;
            top: 0;
            box-sizing: border-box;
            text-align: center;
        }

        .iti {
            width: 100%;
        }

        .iti input {
            border: 1px solid #cfcfcf !important;
            border-radius: 0 !important;
            height: 46px !important;
            padding: 10px 12px 10px 92px !important;
        }

        .iti__country-list {
            z-index: 9999;
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
                    <li class="active">แก้ไขข้อมูล</li>
                </ul>
                <h2 class="title">แก้ไข<span>ข้อมูลทั่วไป</span></h2>
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
                @include('student.partials.sidebar', ['active' => 'profile'])

                <div class="student-content">
                    <h3>ข้อมูลทั่วไป</h3>
                    <p class="desc">แก้ไขข้อมูลพื้นฐาน เช่น ชื่อและรูปภาพที่คุณใช้ในระบบ</p>

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

                        <form method="POST" action="{{ route('student.profile.update') }}">
                            @csrf
                            @method('PUT')

                            <div class="single-form">
                                <label class="field-label">อีเมล</label>
                                <input type="email" name="email" value="{{ old('email', $user->email) }}" required>
                            </div>

                            <div class="single-form">
                                <label class="field-label">ชื่อจริง *</label>
                                <input type="text" name="first_name" value="{{ old('first_name', $user->first_name) }}" required>
                            </div>

                            <div class="single-form">
                                <label class="field-label">นามสกุล *</label>
                                <input type="text" name="last_name" value="{{ old('last_name', $user->last_name) }}" required>
                            </div>

                            <div class="single-form">
                                <label class="field-label">วันเกิด</label>
                                <div class="birth-row">
                                    <input type="number" name="birth_day" placeholder="วัน" value="{{ $birthDay }}">
                                    <input type="number" name="birth_month" placeholder="เดือน" value="{{ $birthMonth }}">
                                    <input type="number" name="birth_year" placeholder="ปี (พ.ศ.)" value="{{ $birthYear }}">
                                </div>
                            </div>

                            <div class="single-form">
                                <label class="field-label">หมายเลขโทรศัพท์ *</label>
                                <input type="hidden" id="phone_country_code" name="phone_country_code" value="{{ $countryCode }}">
                                <input type="tel" id="phone_national" name="phone_national" value="{{ old('phone_national', $user->phone_national) }}" required>
                            </div>

                            <button type="submit" class="save-btn">บันทึก</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <link rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.6/build/css/intlTelInput.css"
          onerror="this.onerror=null;this.href='https://unpkg.com/intl-tel-input@26.0.6/build/css/intlTelInput.css';">
    <script src="https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.6/build/js/intlTelInput.min.js"
            onerror="this.onerror=null;this.src='https://unpkg.com/intl-tel-input@26.0.6/build/js/intlTelInput.min.js';"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function () {
            const phoneInput = document.getElementById('phone_national');
            const phoneCodeInput = document.getElementById('phone_country_code');
            if (!phoneInput || !phoneCodeInput || !window.intlTelInput) return;

            const dialCode = (phoneCodeInput.value || '+66').replace('+', '');
            const initialCountryMap = {
                '66': 'th',
                '81': 'jp',
                '1': 'us',
                '44': 'gb'
            };

            const iti = window.intlTelInput(phoneInput, {
                initialCountry: initialCountryMap[dialCode] || 'th',
                separateDialCode: true,
                nationalMode: true,
                loadUtils: () => import("https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.6/build/js/utils.js")
            });

            const syncPhoneCode = function () {
                const selected = iti.getSelectedCountryData();
                phoneCodeInput.value = selected && selected.dialCode ? '+' + selected.dialCode : '+66';
            };

            phoneInput.addEventListener('countrychange', syncPhoneCode);
            syncPhoneCode();
        });
    </script>
@endsection
