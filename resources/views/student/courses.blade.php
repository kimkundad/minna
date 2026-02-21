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

        .empty-card {
            background: #fff;
            border: 1px solid #dfdfdf;
            border-radius: 12px;
            padding: 28px;
            color: #757575;
            font-size: 16px;
        }

        @media (max-width: 991px) {
            .student-dashboard-inner {
                grid-template-columns: 1fr;
                padding: 16px;
            }

            .student-content h3 {
                font-size: 26px;
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

    <div class="student-dashboard-wrap">
        <div class="container">
            <div class="student-dashboard-inner">
                @include('student.partials.sidebar', ['active' => 'courses'])

                <div class="student-content">
                    <h3>คอร์สเรียนของฉัน</h3>
                    <div class="empty-card">ยังไม่มีคอร์สที่ลงทะเบียนในตอนนี้</div>
                </div>
            </div>
        </div>
    </div>
@endsection
