{{-- resources/views/welcome.blade.php --}}
@extends('layouts.auth')

@section('content')
    {{-- Slider Start --}}
    <div class="section slider-section">

        {{-- Slider Shape --}}
        <div class="slider-shape">
            <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        </div>

        <div class="container">
            <div class="slider-content">
                <h4 class="sub-title">เริ่มต้นวันนี้ ไม่ต้องรอพรุ่งนี้</h4>
                <h2 class="main-title">เรียน <span>ภาษาญี่ปุ่น จีน เยอรมัน</span> และอีกมากมาย</h2>
                <p>ภาษาใหม่คือประตูสู่โอกาสใหม่ ทั้งการทำงาน การเรียน และการใช้ชีวิต</p>
                <a class="btn btn-primary btn-hover-dark" href="{{ url('register') }}">สมัครเรียนเลย</a>
            </div>
        </div>

        {{-- Slider Courses Box --}}
        <div class="slider-courses-box">
            <img class="shape-1 animation-left" src="{{ asset('assets/images/shape/shape-5.png') }}" alt="Shape">
            <div class="box-content">
                <div class="box-wrapper">
                    <i class="flaticon-open-book"></i>
                    <span class="count">1,235</span>
                    <p>courses</p>
                </div>
            </div>
            <img class="shape-2" src="{{ asset('assets/images/shape/shape-6.png') }}" alt="Shape">
        </div>

        {{-- Slider Rating Box --}}
        <div class="slider-rating-box">
            <div class="box-rating">
                <div class="box-wrapper">
                    <span class="count">4.8 <i class="flaticon-star"></i></span>
                    <p>Rating (86K)</p>
                </div>
            </div>
            <img class="shape animation-up" src="{{ asset('assets/images/shape/shape-7.png') }}" alt="Shape">
        </div>

        {{-- Slider Images --}}
        <div class="slider-images">
            <div class="images">
                <img src="{{ asset('assets/images/home_bg.png') }}" alt="Slider">
            </div>
        </div>

        {{-- Slider Video --}}
        <div class="slider-video">
            <img class="shape-1" src="{{ asset('assets/images/shape/shape-9.png') }}" alt="Shape">
            <div class="video-play">
                <img src="{{ asset('assets/images/shape/shape-10.png') }}" alt="Shape">
                <a href="https://www.youtube.com/watch?v=BRvyWfuxGuU" class="play video-popup"><i class="flaticon-play"></i></a>
            </div>
        </div>
    </div>
    {{-- Slider End --}}

    {{-- All Courses Start --}}
    <div class="section section-padding-02">
        <div class="container">

            {{-- All Courses Top --}}
            <div class="courses-top" id="courses-top">
                <div class="section-title shape-01">
                    <h2 class="main-title">All <span>Courses</span> of Edule</h2>
                </div>

                <div class="courses-search">
                    <form action="#">
                        <input type="text" placeholder="Search your course">
                        <button><i class="flaticon-magnifying-glass"></i></button>
                    </form>
                </div>
            </div>

            {{-- Tabs Menu --}}
            <div class="courses-tabs-menu courses-active">
                <div class="swiper-container">
                    <ul class="swiper-wrapper nav">
                        @forelse ($subjects as $subject)
                            <li class="swiper-slide">
                                <button class="{{ $loop->first ? 'active' : '' }}" data-bs-toggle="tab" data-bs-target="#tabs{{ $subject->id }}">
                                    {{ $subject->name }}
                                </button>
                            </li>
                        @empty
                            <li class="swiper-slide">
                                <button class="active" data-bs-toggle="tab" data-bs-target="#tabs-empty">คอร์สทั้งหมด</button>
                            </li>
                        @endforelse
                    </ul>
                </div>
                <div class="swiper-button-next"><i class="icofont-rounded-right"></i></div>
                <div class="swiper-button-prev"><i class="icofont-rounded-left"></i></div>
            </div>

            {{-- Tabs Content --}}
            <div class="tab-content courses-tab-content">
                @forelse ($subjects as $subject)
                    <div class="tab-pane fade {{ $loop->first ? 'show active' : '' }}" id="tabs{{ $subject->id }}">
                        <div class="courses-wrapper">
                            <div class="row">
                                @forelse ($subject->courses as $course)
                                    <div class="col-lg-4 col-md-6">
                                        <div class="single-courses">
                                            <div class="courses-images">
                                                @php
                                                    $thumbnailUrl = $course->thumbnail_path
                                                        ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->thumbnail_path)
                                                        : asset('assets/images/courses/courses-01.jpg');
                                                @endphp
                                                <a href="{{ route('courses.show', $course) }}"><img src="{{ $thumbnailUrl }}" alt="{{ $course->title }}"></a>
                                            </div>
                                            <div class="courses-content">
                                                <div class="courses-author">
                                                    <div class="author">
                                                        <div class="author-thumb">
                                                            <a href="#"><img src="{{ asset('assets/images/author/author-01.jpg') }}" alt="Author"></a>
                                                        </div>
                                                        <div class="author-name"><a class="name" href="{{ route('courses.show', $course) }}">{{ $course->teacher->name ?? 'ผู้สอน' }}</a></div>
                                                    </div>
                                                    <div class="tag"><a href="#">{{ $subject->name }}</a></div>
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
                                        <div class="alert alert-light border">ยังไม่มีคอร์สในวิชานี้</div>
                                    </div>
                                @endforelse
                            </div>
                        </div>
                    </div>
                @empty
                    <div class="tab-pane fade show active" id="tabs-empty">
                        <div class="courses-wrapper">
                            <div class="row">
                                <div class="col-12">
                                    <div class="alert alert-light border">ยังไม่มีข้อมูลวิชาหรือคอร์สที่อนุมัติ</div>
                                </div>
                            </div>
                        </div>
                    </div>
                @endforelse
            </div>

            <div class="courses-btn text-center">
                <a href="{{ url('/course') }}" class="btn btn-secondary btn-hover-primary">Other Course</a>
            </div>
        </div>
    </div>
    {{-- All Courses End --}}



    {{-- Call to Action Start --}}
    <div class="section section-padding-02">
        <div class="container">
            <div class="call-to-action-wrapper">
                <img class="cat-shape-01 animation-round" src="{{ asset('assets/images/shape/shape-12.png') }}" alt="Shape">
                <img class="cat-shape-02" src="{{ asset('assets/images/shape/shape-13.svg') }}" alt="Shape">
                <img class="cat-shape-03 animation-round" src="{{ asset('assets/images/shape/shape-12.png') }}" alt="Shape">

                <div class="row align-items-center">
                    <div class="col-md-6">
                        <div class="section-title shape-02">
                            <h5 class="sub-title">มาเป็นผู้สอนกับเรา</h5>
                            <h2 class="main-title">เผยแพร่ความรู้ สร้างแรงบันดาลใจ <span>และเติบโตไปพร้อมกัน</span></h2>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="call-to-action-btn">
                            <a class="btn btn-primary btn-hover-dark" href="{{ url('/apply-teacher') }}">
                                ลงทะเบียนเป็นผู้สอน
                            </a>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
    {{-- Call to Action End --}}

    {{-- How It Work Start --}}
    <div class="section section-padding mt-n1">
        <div class="container">
            <div class="section-title shape-03 text-center">
                <h5 class="sub-title">Over 1,235+ Course</h5>
                <h2 class="main-title">How It <span> Work?</span></h2>
            </div>

            <div class="how-it-work-wrapper">
                <div class="single-work">
                    <img class="shape-1" src="{{ asset('assets/images/shape/shape-15.png') }}" alt="Shape">
                    <div class="work-icon"><i class="flaticon-transparency"></i></div>
                    <div class="work-content">
                        <h3 class="title">เรียนได้ทุกที่ ทุกเวลา</h3>
                        <p>ไม่ต้องเสียเวลาเดินทาง แค่มีอินเทอร์เน็ตก็เริ่มเรียนภาษาได้ทันที</p>
                    </div>
                </div>

                <div class="work-arrow">
                    <img class="arrow" src="{{ asset('assets/images/shape/shape-17.png') }}" alt="Shape">
                </div>

                <div class="single-work">
                    <img class="shape-2" src="{{ asset('assets/images/shape/shape-15.png') }}" alt="Shape">
                    <div class="work-icon"><i class="flaticon-forms"></i></div>
                    <div class="work-content">
                        <h3 class="title">ทีมซัพพอร์ตดูแลใกล้ชิด</h3>
                        <p>มีผู้สอนและทีมงานคอยตอบทุกข้อสงสัย ทำให้การเรียนราบรื่นตลอดทาง</p>
                    </div>
                </div>

                <div class="work-arrow">
                    <img class="arrow" src="{{ asset('assets/images/shape/shape-17.png') }}" alt="Shape">
                </div>

                <div class="single-work">
                    <img class="shape-3" src="{{ asset('assets/images/shape/shape-16.png') }}" alt="Shape">
                    <div class="work-icon"><i class="flaticon-badge"></i></div>
                    <div class="work-content">
                        <h3 class="title">ก้าวสู่เป้าหมายได้เร็วกว่า</h3>
                        <p>หลักสูตรออกแบบมาให้เห็นผลไว ใช้ภาษาได้จริงทั้งเรียนต่อ ทำงาน และท่องเที่ยว</p>
                    </div>
                </div>
            </div>


        </div>
    </div>
    {{-- How It Work End --}}

    {{-- Download App Start --}}
    {{-- <div class="section section-padding download-section">
        <div class="app-shape-1"></div>
        <div class="app-shape-2"></div>
        <div class="app-shape-3"></div>
        <div class="app-shape-4"></div>

        <div class="container">
            <div class="download-app-wrapper mt-n6">
                <div class="section-title section-title-white">
                    <h5 class="sub-title">Ready to start?</h5>
                    <h2 class="main-title">Download our mobile app. for easy to start your course.</h2>
                </div>
                <img class="shape-1 animation-right" src="{{ asset('assets/images/shape/shape-14.png') }}" alt="Shape">
                <div class="download-app-btn">
                    <ul class="app-btn">
                        <li><a href="#"><img src="{{ asset('assets/images/google-play.png') }}" alt="Google Play"></a></li>
                        <li><a href="#"><img src="{{ asset('assets/images/app-store.png') }}" alt="App Store"></a></li>
                    </ul>
                </div>
            </div>
        </div>
    </div> --}}
    {{-- Download App End --}}

    {{-- Testimonial Start --}}
    <div class="section section-padding-02 mt-n1">
        <div class="container">
            <div class="section-title shape-03 text-center">
                <h5 class="sub-title">เสียงตอบรับจากผู้เรียน</h5>
                <h2 class="main-title">คอร์สเรียนออนไลน์ของ <span>Minna</span></h2>
            </div>

            <div class="testimonial-wrapper testimonial-active">
                <div class="swiper-container">
                    <div class="swiper-wrapper">
                        @forelse (($testimonials ?? collect()) as $item)
                            @php
                                $avatar = $item->avatar_path
                                    ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($item->avatar_path)
                                    : asset('assets/images/author/author-06.jpg');
                                $ratingWidth = max(0, min(100, ((int) $item->rating * 20)));
                            @endphp
                            <div class="single-testimonial swiper-slide">
                                <div class="testimonial-author">
                                    <div class="author-thumb">
                                        <img src="{{ $avatar }}" alt="{{ $item->name }}">
                                        <i class="icofont-quote-left"></i>
                                    </div>
                                    <span class="rating-star"><span class="rating-bar"
                                            style="width: {{ $ratingWidth }}%;"></span></span>
                                </div>
                                <div class="testimonial-content">
                                    <p>“{{ $item->content }}”</p>
                                    <h4 class="name">{{ $item->name }}</h4>
                                    <span class="designation">{{ $item->designation ?: 'ผู้เรียน' }}</span>
                                </div>
                            </div>
                        @empty
                            <div class="single-testimonial swiper-slide">
                                <div class="testimonial-author">
                                    <div class="author-thumb">
                                        <img src="{{ asset('assets/images/author/author-06.jpg') }}" alt="Author">
                                        <i class="icofont-quote-left"></i>
                                    </div>
                                    <span class="rating-star"><span class="rating-bar" style="width: 80%;"></span></span>
                                </div>
                                <div class="testimonial-content">
                                    <p>“เริ่มเพิ่มเสียงตอบรับจากผู้เรียนได้ที่หลังบ้านเมนู เสียงตอบรับ”</p>
                                    <h4 class="name">ยังไม่มีข้อมูล</h4>
                                    <span class="designation">ระบบ</span>
                                </div>
                            </div>
                        @endforelse
                    </div>
                    {{-- Pagination --}}
                    <div class="swiper-pagination"></div>
                </div>
            </div>

        </div>
    </div>
    {{-- Testimonial End --}}

    {{-- Brand Logo Start --}}
    {{-- <div class="section section-padding-02">
        <div class="container">
            <div class="brand-logo-wrapper">
                <img class="shape-1" src="{{ asset('assets/images/shape/shape-19.png') }}" alt="Shape">
                <img class="shape-2 animation-round" src="{{ asset('assets/images/shape/shape-20.png') }}" alt="Shape">

                <div class="section-title shape-03">
                    <h2 class="main-title">Best Supporter of <span> Edule.</span></h2>
                </div>

                <div class="brand-logo brand-active">
                    <div class="swiper-container">
                        <div class="swiper-wrapper">
                            <div class="single-brand swiper-slide">
                                <img src="{{ asset('assets/images/brand/brand-01.png') }}" alt="Brand">
                            </div>
                            <div class="single-brand swiper-slide">
                                <img src="{{ asset('assets/images/brand/brand-02.png') }}" alt="Brand">
                            </div>
                            <div class="single-brand swiper-slide">
                                <img src="{{ asset('assets/images/brand/brand-03.png') }}" alt="Brand">
                            </div>
                            <div class="single-brand swiper-slide">
                                <img src="{{ asset('assets/images/brand/brand-04.png') }}" alt="Brand">
                            </div>
                            <div class="single-brand swiper-slide">
                                <img src="{{ asset('assets/images/brand/brand-05.png') }}" alt="Brand">
                            </div>
                            <div class="single-brand swiper-slide">
                                <img src="{{ asset('assets/images/brand/brand-06.png') }}" alt="Brand">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div> --}}
    {{-- Brand Logo End --}}

    {{-- Blog Start --}}
    <div class="section section-padding mt-n1" id="blog-section">
        <div class="container">
            <div class="section-title shape-03 text-center">
                <h5 class="sub-title">Latest News</h5>
                <h2 class="main-title">Educational Tips & <span> Tricks</span></h2>
            </div>

            <div class="blog-wrapper">
                <div class="row">
                    @forelse (($posts ?? collect()) as $post)
                        @php
                            $coverUrl = $post->cover_path
                                ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($post->cover_path)
                                : asset('assets/images/blog/blog-01.jpg');
                        @endphp
                        <div class="col-lg-4 col-md-6">
                            <div class="single-blog">
                                <div class="blog-image">
                                    <a href="{{ route('posts.show', $post) }}"><img src="{{ $coverUrl }}" alt="{{ $post->title }}"></a>
                                </div>
                                <div class="blog-content">
                                    <div class="blog-author">
                                        <div class="author">
                                            <div class="author-thumb">
                                                <a href="{{ route('posts.show', $post) }}"><img
                                                        src="{{ asset('assets/images/author/author-01.jpg') }}" alt="Author"></a>
                                            </div>
                                            <div class="author-name"><a class="name"
                                                    href="{{ route('posts.show', $post) }}">{{ $post->author?->name ?? 'Admin' }}</a>
                                            </div>
                                        </div>
                                        <div class="tag"><a href="javascript:void(0)">บทความ</a></div>
                                    </div>

                                    <h4 class="title"><a
                                            href="{{ route('posts.show', $post) }}">{{ \Illuminate\Support\Str::limit($post->title, 75) }}</a>
                                    </h4>
                                    <div class="blog-meta">
                                        <span><i class="icofont-calendar"></i>
                                            {{ $post->published_at?->format('d/m/Y') }}</span>
                                    </div>
                                    <a href="{{ route('posts.show', $post) }}" class="btn btn-secondary btn-hover-primary">Read
                                        More</a>
                                </div>
                            </div>
                        </div>
                    @empty
                        <div class="col-12">
                            <div class="alert alert-light border">ยังไม่มีบทความ</div>
                        </div>
                    @endforelse
                </div> {{-- row --}}
            </div>
        </div>
    </div>
    {{-- Blog End --}}
@endsection
