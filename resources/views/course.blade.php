@extends('layouts.auth')

@section('content')
    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li class="active">คอร์สเรียนทั้งหมด</li>
                </ul>
                <h2 class="title">คอร์สเรียน <span>ทั้งหมด</span></h2>
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
            <div class="courses-top" id="courses-top">
                <div class="section-title shape-01">
                    <h2 class="main-title">All <span>Courses</span> of Edule</h2>
                </div>
            </div>

            
            

            <div class="courses-tabs-menu courses-active mt-4">
                <div class="swiper-container">
                    <ul class="swiper-wrapper nav">
                        <li class="swiper-slide">
                            <button class="{{ (int)($subjectId ?? 0) === 0 ? 'active' : '' }}"
                                type="button"
                                onclick="window.location.href='{{ route('course', array_filter(['q' => $q ?? null])) }}'">
                                คอร์สทั้งหมด
                            </button>
                        </li>
                        @forelse ($subjects as $subject)
                            <li class="swiper-slide">
                                <button class="{{ (int)($subjectId ?? 0) === (int)$subject->id ? 'active' : '' }}"
                                    type="button"
                                    onclick="window.location.href='{{ route('course', array_filter(['q' => $q ?? null, 'subject_id' => $subject->id])) }}'">
                                    {{ $subject->name }}
                                </button>
                            </li>
                        @empty
                            <li class="swiper-slide">
                                <button class="active" type="button">คอร์สทั้งหมด</button>
                            </li>
                        @endforelse
                    </ul>
                </div>
                <div class="swiper-button-next"><i class="icofont-rounded-right"></i></div>
                <div class="swiper-button-prev"><i class="icofont-rounded-left"></i></div>
            </div>

            <div class="courses-wrapper">
                <div class="row">
                    @forelse ($courses as $course)
                        @php
                            $thumbnailUrl = $course->thumbnail_path
                                ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->thumbnail_path)
                                : asset('assets/images/courses/courses-01.jpg');
                        @endphp
                        <div class="col-lg-4 col-md-6">
                            <div class="single-courses">
                                <div class="courses-images">
                                    <a href="{{ route('courses.show', $course) }}"><img src="{{ $thumbnailUrl }}" alt="{{ $course->title }}"></a>
                                </div>
                                <div class="courses-content">
                                    <div class="courses-author">
                                        <div class="author">
                                            <div class="author-thumb">
                                                <a href="{{ route('courses.show', $course) }}"><img src="{{ asset('assets/images/author/author-01.jpg') }}" alt="Author"></a>
                                            </div>
                                            <div class="author-name"><a class="name" href="{{ route('courses.show', $course) }}">{{ $course->teacher->name ?? 'ผู้สอน' }}</a></div>
                                        </div>
                                        <div class="tag"><a href="javascript:void(0)">{{ $course->subject->name ?? 'ทั่วไป' }}</a></div>
                                    </div>
                                    <h4 class="title"><a href="{{ route('courses.show', $course) }}">{{ \Illuminate\Support\Str::limit($course->title, 65) }}</a></h4>
                                    <div class="courses-meta">
                                        <span><i class="icofont-clock-time"></i> อัปเดต {{ $course->created_at?->format('d/m/Y') }}</span>
                                        <span><i class="icofont-read-book"></i> {{ $course->videos_count ?? 0 }} บทเรียน</span>
                                    </div>
                                    <div class="courses-price-review">
                                        <div class="courses-price">
                                            <span class="sale-parice">{{ number_format((float) $course->price, 2) }} บาท</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    @empty
                        <div class="col-12">
                            <div class="alert alert-light border">ยังไม่พบคอร์สเรียนที่เปิดใช้งาน</div>
                        </div>
                    @endforelse
                </div>
            </div>

            @if($courses instanceof \Illuminate\Pagination\LengthAwarePaginator)
                <div class="page-pagination mt-4">
                    {{ $courses->links() }}
                </div>
            @endif
        </div>
    </div>
@endsection
