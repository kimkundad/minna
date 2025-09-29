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
            {{-- Slider Content --}}
            <div class="slider-content">
                <h4 class="sub-title">Start your favourite course</h4>
                <h2 class="main-title">Now learning from anywhere, and build your <span>bright career.</span></h2>
                <p>It has survived not only five centuries but also the leap into electronic typesetting.</p>
                <a class="btn btn-primary btn-hover-dark" href="#">Start A Course</a>
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
            <div class="courses-top">
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
                        <li class="swiper-slide"><button class="active" data-bs-toggle="tab" data-bs-target="#tabs1">UI/UX Design</button></li>
                        <li class="swiper-slide"><button data-bs-toggle="tab" data-bs-target="#tabs2">Development</button></li>
                        <li class="swiper-slide"><button data-bs-toggle="tab" data-bs-target="#tabs3">Data Science</button></li>
                        <li class="swiper-slide"><button data-bs-toggle="tab" data-bs-target="#tabs4">Business</button></li>
                        <li class="swiper-slide"><button data-bs-toggle="tab" data-bs-target="#tabs5">Financial</button></li>
                        <li class="swiper-slide"><button data-bs-toggle="tab" data-bs-target="#tabs6">Marketing</button></li>
                        <li class="swiper-slide"><button data-bs-toggle="tab" data-bs-target="#tabs7">Design</button></li>
                    </ul>
                </div>
                <div class="swiper-button-next"><i class="icofont-rounded-right"></i></div>
                <div class="swiper-button-prev"><i class="icofont-rounded-left"></i></div>
            </div>

            {{-- Tabs Content (แสดงตัวอย่างแท็บแรก) --}}
            <div class="tab-content courses-tab-content">
                <div class="tab-pane fade show active" id="tabs1">
                    <div class="courses-wrapper">
                        <div class="row">
                            {{-- Card 1 --}}
                            <div class="col-lg-4 col-md-6">
                                <div class="single-courses">
                                    <div class="courses-images">
                                        <a href="#"><img src="{{ asset('assets/images/courses/courses-01.jpg') }}" alt="Courses"></a>
                                    </div>
                                    <div class="courses-content">
                                        <div class="courses-author">
                                            <div class="author">
                                                <div class="author-thumb">
                                                    <a href="#"><img src="{{ asset('assets/images/author/author-01.jpg') }}" alt="Author"></a>
                                                </div>
                                                <div class="author-name"><a class="name" href="#">Jason Williams</a></div>
                                            </div>
                                            <div class="tag"><a href="#">Science</a></div>
                                        </div>
                                        <h4 class="title"><a href="#">Data Science and Machine Learning with Python - Hands On!</a></h4>
                                        <div class="courses-meta">
                                            <span><i class="icofont-clock-time"></i> 08 hr 15 mins</span>
                                            <span><i class="icofont-read-book"></i> 29 Lectures</span>
                                        </div>
                                        <div class="courses-price-review">
                                            <div class="courses-price">
                                                <span class="sale-parice">$385.00</span>
                                                <span class="old-parice">$440.00</span>
                                            </div>
                                            <div class="courses-review">
                                                <span class="rating-count">4.9</span>
                                                <span class="rating-star"><span class="rating-bar" style="width: 80%;"></span></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {{-- Card 2 --}}
                            <div class="col-lg-4 col-md-6">
                                <div class="single-courses">
                                    <div class="courses-images">
                                        <a href="#"><img src="{{ asset('assets/images/courses/courses-02.jpg') }}" alt="Courses"></a>
                                    </div>
                                    <div class="courses-content">
                                        <div class="courses-author">
                                            <div class="author">
                                                <div class="author-thumb">
                                                    <a href="#"><img src="{{ asset('assets/images/author/author-02.jpg') }}" alt="Author"></a>
                                                </div>
                                                <div class="author-name"><a class="name" href="#">Pamela Foster</a></div>
                                            </div>
                                            <div class="tag"><a href="#">Science</a></div>
                                        </div>
                                        <h4 class="title"><a href="#">Create Amazing Color Schemes for Your UX Design Projects</a></h4>
                                        <div class="courses-meta">
                                            <span><i class="icofont-clock-time"></i> 08 hr 15 mins</span>
                                            <span><i class="icofont-read-book"></i> 29 Lectures</span>
                                        </div>
                                        <div class="courses-price-review">
                                            <div class="courses-price"><span class="sale-parice">$420.00</span></div>
                                            <div class="courses-review">
                                                <span class="rating-count">4.9</span>
                                                <span class="rating-star"><span class="rating-bar" style="width: 80%;"></span></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {{-- Card 3 --}}
                            <div class="col-lg-4 col-md-6">
                                <div class="single-courses">
                                    <div class="courses-images">
                                        <a href="#"><img src="{{ asset('assets/images/courses/courses-03.jpg') }}" alt="Courses"></a>
                                    </div>
                                    <div class="courses-content">
                                        <div class="courses-author">
                                            <div class="author">
                                                <div class="author-thumb">
                                                    <a href="#"><img src="{{ asset('assets/images/author/author-03.jpg') }}" alt="Author"></a>
                                                </div>
                                                <div class="author-name"><a class="name" href="#">Rose Simmons</a></div>
                                            </div>
                                            <div class="tag"><a href="#">Science</a></div>
                                        </div>
                                        <h4 class="title"><a href="#">Culture & Leadership: Strategies for a Successful Business</a></h4>
                                        <div class="courses-meta">
                                            <span><i class="icofont-clock-time"></i> 08 hr 15 mins</span>
                                            <span><i class="icofont-read-book"></i> 29 Lectures</span>
                                        </div>
                                        <div class="courses-price-review">
                                            <div class="courses-price">
                                                <span class="sale-parice">$295.00</span>
                                                <span class="old-parice">$340.00</span>
                                            </div>
                                            <div class="courses-review">
                                                <span class="rating-count">4.9</span>
                                                <span class="rating-star"><span class="rating-bar" style="width: 80%;"></span></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {{-- หมายเหตุ: เพิ่มการ์ดอื่น ๆ ต่อได้ตามต้องการ --}}
                        </div>
                    </div>
                </div>
            </div>

            {{-- ปุ่มดูคอร์สเพิ่มเติม --}}
            <div class="courses-btn text-center">
                <a href="#" class="btn btn-secondary btn-hover-primary">Other Course</a>
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
                            <h5 class="sub-title">Become A Instructor</h5>
                            <h2 class="main-title">You can join with Edule as <span>a instructor?</span></h2>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="call-to-action-btn">
                            <a class="btn btn-primary btn-hover-dark" href="#">Drop Information</a>
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
                        <h3 class="title">Find Your Course</h3>
                        <p>It has survived not only centurie also leap into electronic.</p>
                    </div>
                </div>

                <div class="work-arrow">
                    <img class="arrow" src="{{ asset('assets/images/shape/shape-17.png') }}" alt="Shape">
                </div>

                <div class="single-work">
                    <img class="shape-2" src="{{ asset('assets/images/shape/shape-15.png') }}" alt="Shape">
                    <div class="work-icon"><i class="flaticon-forms"></i></div>
                    <div class="work-content">
                        <h3 class="title">Book A Seat</h3>
                        <p>It has survived not only centurie also leap into electronic.</p>
                    </div>
                </div>

                <div class="work-arrow">
                    <img class="arrow" src="{{ asset('assets/images/shape/shape-17.png') }}" alt="Shape">
                </div>

                <div class="single-work">
                    <img class="shape-3" src="{{ asset('assets/images/shape/shape-16.png') }}" alt="Shape">
                    <div class="work-icon"><i class="flaticon-badge"></i></div>
                    <div class="work-content">
                        <h3 class="title">Get Certificate</h3>
                        <p>It has survived not only centurie also leap into electronic.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    {{-- How It Work End --}}

    {{-- Download App Start --}}
    <div class="section section-padding download-section">
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
    </div>
    {{-- Download App End --}}

    {{-- Testimonial Start --}}
    <div class="section section-padding-02 mt-n1">
        <div class="container">
            <div class="section-title shape-03 text-center">
                <h5 class="sub-title">Student Testimonial</h5>
                <h2 class="main-title">Feedback From <span> Student</span></h2>
            </div>

            <div class="testimonial-wrapper testimonial-active">
                <div class="swiper-container">
                    <div class="swiper-wrapper">
                        {{-- Testimonial 1 --}}
                        <div class="single-testimonial swiper-slide">
                            <div class="testimonial-author">
                                <div class="author-thumb">
                                    <img src="{{ asset('assets/images/author/author-06.jpg') }}" alt="Author">
                                    <i class="icofont-quote-left"></i>
                                </div>
                                <span class="rating-star"><span class="rating-bar" style="width: 80%;"></span></span>
                            </div>
                            <div class="testimonial-content">
                                <p>Lorem Ipsum has been the industry's standard dummy text since the 1500s...</p>
                                <h4 class="name">Sara Alexander</h4>
                                <span class="designation">Product Designer, USA</span>
                            </div>
                        </div>

                        {{-- Testimonial 2 --}}
                        <div class="single-testimonial swiper-slide">
                            <div class="testimonial-author">
                                <div class="author-thumb">
                                    <img src="{{ asset('assets/images/author/author-07.jpg') }}" alt="Author">
                                    <i class="icofont-quote-left"></i>
                                </div>
                                <span class="rating-star"><span class="rating-bar" style="width: 80%;"></span></span>
                            </div>
                            <div class="testimonial-content">
                                <p>Lorem Ipsum has been the industry's standard dummy text since the 1500s...</p>
                                <h4 class="name">Melissa Roberts</h4>
                                <span class="designation">Product Designer, USA</span>
                            </div>
                        </div>

                        {{-- Testimonial 3 --}}
                        <div class="single-testimonial swiper-slide">
                            <div class="testimonial-author">
                                <div class="author-thumb">
                                    <img src="{{ asset('assets/images/author/author-03.jpg') }}" alt="Author">
                                    <i class="icofont-quote-left"></i>
                                </div>
                                <span class="rating-star"><span class="rating-bar" style="width: 80%;"></span></span>
                            </div>
                            <div class="testimonial-content">
                                <p>Lorem Ipsum has been the industry's standard dummy text since the 1500s...</p>
                                <h4 class="name">Sara Alexander</h4>
                                <span class="designation">Product Designer, USA</span>
                            </div>
                        </div>
                    </div>
                    {{-- Pagination --}}
                    <div class="swiper-pagination"></div>
                </div>
            </div>
        </div>
    </div>
    {{-- Testimonial End --}}

    {{-- Brand Logo Start --}}
    <div class="section section-padding-02">
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
    </div>
    {{-- Brand Logo End --}}

    {{-- Blog Start --}}
    <div class="section section-padding mt-n1">
        <div class="container">
            <div class="section-title shape-03 text-center">
                <h5 class="sub-title">Latest News</h5>
                <h2 class="main-title">Educational Tips & <span> Tricks</span></h2>
            </div>

            <div class="blog-wrapper">
                <div class="row">
                    {{-- Blog 1 --}}
                    <div class="col-lg-4 col-md-6">
                        <div class="single-blog">
                            <div class="blog-image">
                                <a href="#"><img src="{{ asset('assets/images/blog/blog-01.jpg') }}" alt="Blog"></a>
                            </div>
                            <div class="blog-content">
                                <div class="blog-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="{{ asset('assets/images/author/author-01.jpg') }}" alt="Author"></a>
                                        </div>
                                        <div class="author-name"><a class="name" href="#">Jason Williams</a></div>
                                    </div>
                                    <div class="tag"><a href="#">Science</a></div>
                                </div>

                                <h4 class="title"><a href="#">Data Science and Machine Learning with Python - Hands On!</a></h4>
                                <div class="blog-meta">
                                    <span><i class="icofont-calendar"></i> 21 March, 2021</span>
                                    <span><i class="icofont-heart"></i> 2,568+</span>
                                </div>
                                <a href="#" class="btn btn-secondary btn-hover-primary">Read More</a>
                            </div>
                        </div>
                    </div>

                    {{-- Blog 2 --}}
                    <div class="col-lg-4 col-md-6">
                        <div class="single-blog">
                            <div class="blog-image">
                                <a href="#"><img src="{{ asset('assets/images/blog/blog-02.jpg') }}" alt="Blog"></a>
                            </div>
                            <div class="blog-content">
                                <div class="blog-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="{{ asset('assets/images/author/author-02.jpg') }}" alt="Author"></a>
                                        </div>
                                        <div class="author-name"><a class="name" href="#">Pamela Foster</a></div>
                                    </div>
                                    <div class="tag"><a href="#">UX Design</a></div>
                                </div>

                                <h4 class="title"><a href="#">Create Amazing Color Schemes for Your UX Design Projects</a></h4>
                                <div class="blog-meta">
                                    <span><i class="icofont-calendar"></i> 21 March, 2021</span>
                                    <span><i class="icofont-heart"></i> 2,568+</span>
                                </div>
                                <a href="#" class="btn btn-secondary btn-hover-primary">Read More</a>
                            </div>
                        </div>
                    </div>

                    {{-- Blog 3 --}}
                    <div class="col-lg-4 col-md-6">
                        <div class="single-blog">
                            <div class="blog-image">
                                <a href="#"><img src="{{ asset('assets/images/blog/blog-03.jpg') }}" alt="Blog"></a>
                            </div>
                            <div class="blog-content">
                                <div class="blog-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="{{ asset('assets/images/author/author-03.jpg') }}" alt="Author"></a>
                                        </div>
                                        <div class="author-name"><a class="name" href="#">Patricia Collins</a></div>
                                    </div>
                                    <div class="tag"><a href="#">Business</a></div>
                                </div>

                                <h4 class="title"><a href="#">Culture & Leadership: Strategies for a Successful Business</a></h4>
                                <div class="blog-meta">
                                    <span><i class="icofont-calendar"></i> 21 March, 2021</span>
                                    <span><i class="icofont-heart"></i> 2,568+</span>
                                </div>
                                <a href="#" class="btn btn-secondary btn-hover-primary">Read More</a>
                            </div>
                        </div>
                    </div>
                </div> {{-- row --}}
            </div>
        </div>
    </div>
    {{-- Blog End --}}
@endsection
