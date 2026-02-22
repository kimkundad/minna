@extends('layouts.auth')

@section('content')
    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ route('welcome') }}">Home</a></li>
                    <li class="active">เกี่ยวกับเรา</li>
                </ul>
                <h2 class="title">เกี่ยวกับ <span>Minna</span></h2>
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

    <div class="section">
        <div class="section-padding-02 mt-n10">
            <div class="container">
                <div class="row">
                    <div class="col-lg-6">
                        <div class="about-images">
                            <div class="images">
                                <img src="{{ asset('assets/images/about.jpg') }}" alt="About">
                            </div>

                            <div class="about-years">
                                <div class="years-icon">
                                    <img src="{{ asset('assets/images/logo-icon.png') }}" alt="Logo Icon">
                                </div>
                                <p><strong>10,000+</strong> ชั่วโมงการเรียนจริงจากผู้เรียนของเรา</p>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-6">
                        <div class="about-content">
                            <h5 class="sub-title">ยินดีต้อนรับสู่ Minna</h5>
                            <h2 class="main-title">เริ่มเก่งภาษาได้จริง ด้วยคอร์สที่ออกแบบเพื่อ <span>ผลลัพธ์ที่วัดได้</span></h2>
                            <p>
                                Minna คือแพลตฟอร์มเรียนภาษาที่เน้นการใช้งานจริงในชีวิตและการทำงาน
                                คุณจะได้เรียนแบบเป็นขั้นตอน เข้าใจง่าย มีแบบฝึกหัดและตัวอย่างสถานการณ์จริง
                                เพื่อให้พูด ฟัง อ่าน เขียนได้อย่างมั่นใจในเวลาสั้นลง
                            </p>
                            <a href="{{ route('course') }}" class="btn btn-primary btn-hover-dark">เริ่มเรียนคอร์สแรก</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="section-padding-02 mt-n6">
            <div class="container">
                <div class="about-items-wrapper">
                    <div class="row">
                        <div class="col-lg-4">
                            <div class="about-item">
                                <div class="item-icon-title">
                                    <div class="item-icon">
                                        <i class="flaticon-tutor"></i>
                                    </div>
                                    <div class="item-title">
                                        <h3 class="title">ผู้สอนคุณภาพ</h3>
                                    </div>
                                </div>
                                <p>ทีมผู้สอนมีประสบการณ์จริงในการสอนภาษา พร้อมเทคนิคที่ช่วยให้เรียนเร็วและจำได้นาน</p>
                                <p>ทุกบทเรียนออกแบบให้เข้าใจง่าย แม้เริ่มจากศูนย์ก็เรียนตามได้</p>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="about-item">
                                <div class="item-icon-title">
                                    <div class="item-icon">
                                        <i class="flaticon-coding"></i>
                                    </div>
                                    <div class="item-title">
                                        <h3 class="title">เรียนได้ทุกอุปกรณ์</h3>
                                    </div>
                                </div>
                                <p>รองรับทั้งมือถือ แท็บเล็ต และคอมพิวเตอร์ เรียนได้ทุกที่ทุกเวลา ไม่พลาดทุกโอกาสฝึกภาษา</p>
                                <p>หยุดตรงไหน กลับมาเรียนต่อได้ทันที พร้อมติดตามความคืบหน้าของคุณ</p>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="about-item">
                                <div class="item-icon-title">
                                    <div class="item-icon">
                                        <i class="flaticon-increase"></i>
                                    </div>
                                    <div class="item-title">
                                        <h3 class="title">พัฒนาได้จริง</h3>
                                    </div>
                                </div>
                                <p>หลักสูตรเน้นผลลัพธ์ที่นำไปใช้ได้จริง ทั้งการเรียนต่อ การทำงาน และการสอบวัดระดับ</p>
                                <p>จากพื้นฐานสู่การสื่อสารคล่อง เราวางแผนการเรียนให้คุณไปถึงเป้าหมายได้ไวขึ้น</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="section section-padding-02 mt-n1">
        <div class="container">
            <div class="section-title shape-03 text-center">
                <h5 class="sub-title">เสียงจริงจากผู้เรียน</h5>
                <h2 class="main-title">ผลลัพธ์ที่ผู้เรียน <span>สัมผัสได้จริง</span></h2>
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

                    <div class="swiper-pagination"></div>
                </div>
            </div>
        </div>
    </div>
@endsection

