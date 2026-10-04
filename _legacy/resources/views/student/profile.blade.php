@extends('layouts.auth')

@section('content')
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
            margin: 8px 0 20px;
        }

        .profile-card {
            background: #fff;
            border: 1px solid #dfdfdf;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 18px;
        }

        .profile-card h4 {
            font-size: 24px;
            margin-bottom: 6px;
        }

        .profile-card .sub {
            color: #8a8a8a;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .profile-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }

        .profile-user {
            display: flex;
            align-items: center;
            gap: 14px;
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

        .profile-user h5 {
            margin: 0;
            font-size: 30px;
            line-height: 1.1;
        }

        .profile-user p {
            margin: 4px 0 0;
            color: #808080;
            font-size: 14px;
        }

        .edit-btn {
            display: inline-block;
            border: 1px solid #1d7f4f;
            color: #1d7f4f;
            background: #fff;
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
        }

        .official-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 13px;
            color: #1d7f4f;
            background: #ebf8ef;
            border: 1px solid #c9ead6;
        }

        .official-note {
            font-size: 13px;
            color: #7f7f7f;
            line-height: 1.8;
            margin-bottom: 16px;
        }

        .official-grid {
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 10px 20px;
            font-size: 14px;
        }

        .official-grid .label {
            color: #6f6f6f;
        }

        .official-grid .value {
            color: #1f2937;
            font-weight: 600;
        }

        @media (max-width: 991px) {
            .student-dashboard-inner {
                grid-template-columns: 1fr;
                padding: 16px;
            }

            .student-content h3 {
                font-size: 26px;
            }

            .profile-user h5 {
                font-size: 24px;
            }

            .official-grid {
                grid-template-columns: 1fr;
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
                    <li class="active">คอร์สเรียน</li>
                </ul>
                <h2 class="title">ดูคอร์สเรียนใหม่ <span>ทั้งหมด</span></h2>
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

    @php
        $user = auth()->user();
        $fullName = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));
        $displayName = $fullName !== '' ? $fullName : ($user->name ?? '-');
        $birthdate = $user->birthdate ? \Carbon\Carbon::parse($user->birthdate) : null;
        $birthdateDisplay = $birthdate ? $birthdate->format('d/m/') . ($birthdate->year + 543) : '-';
        $phoneDisplay = trim(($user->phone_country_code ?? '') . ' ' . ($user->phone_national ?? $user->phone ?? ''));
    @endphp

    <div class="student-dashboard-wrap">
        <div class="container">
            <div class="student-dashboard-inner">
                @include('student.partials.sidebar', ['active' => 'profile'])

                <div class="student-content">
                    <h3>โปรไฟล์ของฉัน</h3>
                    @if (session('status'))
                        <div class="alert alert-success">{{ session('status') }}</div>
                    @endif

                    <div class="profile-card">
                        <h4>ข้อมูลพื้นฐาน</h4>
                        <p class="sub">ข้อมูลทั่วไปในการตั้งค่ารหัสผ่านของผู้ใช้งาน</p>

                        <div class="profile-head">
                            <div class="profile-user">
                                <div class="avatar"><i class="icofont-user"></i></div>
                                <div>
                                    <h5>{{ $displayName }}</h5>
                                    <p>{{ $user->email }}</p>
                                </div>
                            </div>
                            <a href="{{ route('student.profile.edit') }}" class="edit-btn">แก้ไขและตั้งค่าบัญชีผู้ใช้</a>
                        </div>
                    </div>

                    <div class="profile-card">
                        <div class="official-top">
                            <h4 class="mb-0">Official Profile</h4>
                            <span class="status-badge"><i class="icofont-check-circled"></i> ยืนยันข้อมูลแล้ว</span>
                        </div>

                        <p class="official-note">
                            ข้อมูลการออกเอกสารที่เกี่ยวข้อง ชื่อที่แสดงผลและการติดต่อจากทางแพลตฟอร์ม หากต้องการแก้ไขรายละเอียด
                            กรุณาติดต่อทีมงาน
                        </p>

                        <div class="official-grid">
                            <div class="label">ชื่อ-นามสกุล</div>
                            <div class="value">{{ $displayName }}</div>

                            <div class="label">อีเมล</div>
                            <div class="value">{{ $user->email }}</div>

                            <div class="label">วันเกิด (พุทธศักราช)</div>
                            <div class="value">{{ $birthdateDisplay }}</div>

                            <div class="label">หมายเลขโทรศัพท์มือถือ</div>
                            <div class="value">{{ $phoneDisplay !== '' ? $phoneDisplay : '-' }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
