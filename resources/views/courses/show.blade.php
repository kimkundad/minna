@extends('layouts.auth')

@section('content')
    @php
        $thumbnailUrl = $course->thumbnail_path
            ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->thumbnail_path)
            : asset('assets/images/courses/courses-01.jpg');
        $sampleVideoUrl = $course->sample_video_path
            ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->sample_video_path)
            : null;
        $teacherName = $course->teacher->name ?? 'ผู้สอน';
        $videosCount = $course->videos->count();
    @endphp

   
    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">
        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ route('welcome') }}">Home</a></li>
                    <li><a href="{{ route('course') }}">คอร์สเรียน</a></li>
                    <li class="active">รายละเอียดคอร์ส</li>
                </ul>
                <h2 class="title">{{ \Illuminate\Support\Str::limit($course->title, 40) }}</h2>
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
                <div class="row gx-10">
                    <div class="col-lg-8">

                        <!-- Courses Details Start -->
                        <div class="courses-details">

                            <div class="courses-details-images">
                                <img src="{{ $thumbnailUrl }}" alt="{{ $course->title }}">
                                <span class="tags">{{ $course->category->name ?? 'Course' }}</span>

                                @if ($sampleVideoUrl)
                                    <div class="courses-play">
                                        <img src="{{ url('assets/images/courses/circle-shape.png') }}" alt="Play">
                                        <a class="play video-popup" href="{{ $sampleVideoUrl }}"><i class="icofont-ui-play"></i></a>
                                    </div>
                                @endif
                            </div>

                            <h2 class="title">{{ $course->title }}</h2>

                            <div class="courses-details-admin">
                                <div class="admin-author">
                                    <div class="author-thumb">
                                        <img src="{{ url('assets/images/author/author-01.jpg') }}" alt="{{ $teacherName }}">
                                    </div>
                                    <div class="author-content">
                                        <a class="name" href="#">{{ $teacherName }}</a>
                                        <span class="Enroll">{{ $videosCount }} lectures</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Courses Details Tab Start -->
                            <div class="courses-details-tab">
                                <div class="details-tab-menu">
                                    <ul class="nav justify-content-center">
                                        <li><button class="active" data-bs-toggle="tab" data-bs-target="#description">Description</button></li>
                                        <li><button data-bs-toggle="tab" data-bs-target="#course-content">Course Content</button></li>
                                        <li><button data-bs-toggle="tab" data-bs-target="#documents">Documents</button></li>
                                    </ul>
                                </div>

                                <div class="details-tab-content">
                                    <div class="tab-content">
                                        <div class="tab-pane fade show active" id="description">
                                            <div class="tab-description">
                                                <div class="description-wrapper">
                                                    <h3 class="tab-title">Description:</h3>
                                                    <p>{!! nl2br(e($course->description ?: '-')) !!}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="tab-pane fade" id="course-content">
                                            <div class="tab-description">
                                                @if ($course->videos->count())
                                                    <div class="description-wrapper">
                                                        <h3 class="tab-title">Course Content:</h3>
                                                        <div class="course-content-box">
                                                            <div class="course-content-heading">{{ $course->title }}</div>
                                                            <ul class="lesson-list">
                                                                @foreach ($course->videos as $index => $video)
                                                                    <li>
                                                                        <span class="lesson-title">
                                                                            <i class="icofont-ui-play"></i>
                                                                            {{ $index + 1 }}. {{ $video->video_title ?: $video->content_name }}
                                                                        </span>
                                                                        <span class="lesson-duration">{{ $video->duration ?: '-' }}</span>
                                                                    </li>
                                                                @endforeach
                                                            </ul>
                                                        </div>
                                                    </div>
                                                @else
                                                    <div class="description-wrapper">
                                                        <p>-</p>
                                                    </div>
                                                @endif
                                            </div>
                                        </div>

                                        <div class="tab-pane fade" id="documents">
                                            <div class="tab-description">
                                                @if ($course->documents->count())
                                                    <div class="description-wrapper">
                                                        <h3 class="tab-title">Documents:</h3>
                                                        <div class="documents-box">
                                                            <ul class="document-list">
                                                                @foreach ($course->documents as $index => $document)
                                                                    <li>
                                                                        <a href="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($document->file_path) }}" target="_blank" rel="noopener">
                                                                            <span class="document-title">
                                                                                <i class="icofont-file-alt"></i>
                                                                                {{ $index + 1 }}. {{ $document->file_name }}
                                                                            </span>
                                                                            <span class="document-action">Download</span>
                                                                        </a>
                                                                    </li>
                                                                @endforeach
                                                            </ul>
                                                        </div>
                                                    </div>
                                                @else
                                                    <div class="description-wrapper">
                                                        <p>-</p>
                                                    </div>
                                                @endif
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <!-- Details Tab Content End -->
                            </div>
                            <!-- Courses Details Tab End -->

                        </div>
                        <!-- Courses Details End -->

                    </div>
                    <div class="col-lg-4">
                        <!-- Courses Details Sidebar Start -->
                        <div class="sidebar">

                            <!-- Sidebar Widget Information Start -->
                            <div class="sidebar-widget widget-information">
                                <div class="info-price">
                                    <span class="price">{{ number_format((float) $course->price, 2) }} THB</span>
                                </div>
                                <div class="info-list">
                                    <ul>
                                        <li><i class="icofont-man-in-glasses"></i> <strong>Instructor</strong> <span>{{ $teacherName }}</span></li>
                                        <li><i class="icofont-ui-video-play"></i> <strong>Lectures</strong> <span>{{ $videosCount }}</span></li>
                                        <li><i class="icofont-bars"></i> <strong>Category</strong> <span>{{ $course->category->name ?? '-' }}</span></li>
                                        <li><i class="icofont-book-alt"></i> <strong>Subject</strong> <span>{{ $course->subject->name ?? '-' }}</span></li>
                                        <li><i class="icofont-ui-calendar"></i> <strong>Updated</strong> <span>{{ optional($course->updated_at)->format('d/m/Y') }}</span></li>
                                    </ul>
                                </div>
                                <div class="info-btn">
                                    <a href="{{ route('courses.payment', $course) }}" class="btn btn-primary btn-hover-dark">ชำระเงินเพื่อเริ่มเรียน</a>
                                </div>
                            </div>
                            <!-- Sidebar Widget Information End -->

                            <!-- Sidebar Widget Share Start -->
                            <div class="sidebar-widget">
                                <h4 class="widget-title">Share Course:</h4>

                                <ul class="social">
                                    <li><a href="#"><i class="flaticon-facebook"></i></a></li>
                                    <li><a href="#"><i class="flaticon-linkedin"></i></a></li>
                                    <li><a href="#"><i class="flaticon-twitter"></i></a></li>
                                    <li><a href="#"><i class="flaticon-instagram"></i></a></li>
                                </ul>
                            </div>
                            <!-- Sidebar Widget Share End -->

                        </div>
                        <!-- Courses Details Sidebar End -->
                    </div>
                </div>
            </div>
        </div>
@endsection

@push('styles')
    <style>
        .course-content-box {
            border: 1px solid #d8d8d8;
            border-radius: 0;
        }

        .course-content-heading {
            background: #f7f7f7;
            color: #212832;
            font-weight: 600;
            padding: 12px 16px;
            border-bottom: 1px solid #ececec;
        }

        .lesson-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }

        .lesson-list li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 16px;
            border-top: 1px solid #ececec;
        }

        .lesson-title {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #212832;
        }

        .lesson-title i {
            color: #8e8e8e;
            font-size: 13px;
        }

        .lesson-duration {
            color: #5f5f5f;
            min-width: 50px;
            text-align: right;
        }

        .documents-box {
            border: 1px solid #d8d8d8;
        }

        .document-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }

        .document-list li + li {
            border-top: 1px solid #ececec;
        }

        .document-list a {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 16px;
            color: #212832;
        }

        .document-title {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .document-title i {
            color: #8e8e8e;
            font-size: 14px;
        }

        .document-action {
            color: #309255;
            font-weight: 500;
            white-space: nowrap;
        }
    </style>
@endpush

