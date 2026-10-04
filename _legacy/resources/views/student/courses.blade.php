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

        .courses-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
        }

        .course-card {
            background: #fff;
            border: 1px solid #dfdfdf;
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .course-thumb {
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            background: #f0f0f0;
        }

        .course-body {
            padding: 14px;
        }

        .course-title {
            margin: 0 0 8px;
            font-size: 18px;
            line-height: 1.35;
        }

        .course-meta {
            margin: 0 0 12px;
            color: #666;
            font-size: 14px;
            line-height: 1.7;
        }

        .course-progress {
            margin: 0 0 12px;
        }

        .course-progress-head {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #4d4d4d;
            margin-bottom: 6px;
        }

        .course-progress-track {
            width: 100%;
            height: 8px;
            border-radius: 999px;
            background: #e7ece8;
            overflow: hidden;
        }

        .course-progress-fill {
            height: 100%;
            border-radius: 999px;
            background: #1d7f4f;
        }

        .course-actions {
            display: flex;
            gap: 8px;
        }

        .course-actions a {
            display: inline-block;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 14px;
            text-decoration: none;
        }

        .btn-open {
            background: #1d7f4f;
            color: #fff;
        }

        .btn-detail {
            background: #fff;
            border: 1px solid #d7d7d7;
            color: #333;
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

            .courses-grid {
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
                    <li class="active">คอร์สเรียนของฉัน</li>
                </ul>
                <h2 class="title">คอร์สเรียน <span>ที่ซื้อแล้ว</span></h2>
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

                    @if ($courses->isEmpty())
                        <div class="empty-card">ยังไม่มีคอร์สที่ชำระเงินสำเร็จในตอนนี้</div>
                    @else
                        <div class="courses-grid">
                            @foreach ($courses as $order)
                                @php
                                    $course = $order->course;
                                    $thumb = $course?->thumbnail_path
                                        ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->thumbnail_path)
                                        : asset('assets/images/courses/courses-01.jpg');
                                @endphp
                                <div class="course-card">
                                    <img class="course-thumb" src="{{ $thumb }}" alt="{{ $course->title }}">
                                    <div class="course-body">
                                        <h4 class="course-title">{{ $course->title }}</h4>
                                        <p class="course-meta">
                                            ผู้สอน: {{ $course->teacher->name ?? '-' }}<br>
                                            วิชา: {{ $course->subject->name ?? '-' }}<br>
                                            ซื้อเมื่อ: {{ optional($order->paid_at)->format('d/m/Y H:i') ?? '-' }}<br>
                                            วันหมดอายุการเข้าถึง: {{ $order->access_expires_at ? $order->access_expires_at->format('d/m/Y H:i') : 'ตลอดชีพ' }}
                                        </p>

                                        <div class="course-progress">
                                            <div class="course-progress-head">
                                                <span>ความคืบหน้า</span>
                                                <span>{{ $order->progress_percent ?? 0 }}% ({{ $order->completed_videos ?? 0 }}/{{ $order->total_videos ?? 0 }} บท)</span>
                                            </div>
                                            <div class="course-progress-track">
                                                <div class="course-progress-fill" style="width: {{ $order->progress_percent ?? 0 }}%;"></div>
                                            </div>
                                        </div>

                                        <div class="course-actions">
                                            <a class="btn-open" href="{{ route('student.courses.learn', $course) }}">เข้าเรียน</a>
                                            <a class="btn-detail" href="{{ route('courses.show', $course) }}">ดูรายละเอียด</a>
                                        </div>
                                    </div>
                                </div>
                            @endforeach
                        </div>
                    @endif
                </div>
            </div>
        </div>
    </div>
@endsection
