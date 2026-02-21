@php($title = 'คอร์สเรียนทั้งหมด')
@extends('layouts.auth')

@section('content')
    {{-- ✅ ใส่ style เฉพาะหน้านี้ --}}
    <style>
        .register-login-form {
            max-width: 500px;
            margin: 0 auto;
        }

        .mt-50 {
            margin-top: 50px;
        }
    </style>


    {{-- Page Banner (จากธีม) --}}
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

    <!-- Courses Start -->
    <div class="section section-padding">
        <div class="container">

            <!-- Courses Category Wrapper Start  -->
            <div class="courses-category-wrapper">
                <div class="courses-search search-2">
                    <input type="text" placeholder="Search here">
                    <button><i class="icofont-search"></i></button>
                </div>

                <ul class="category-menu">
                    <li><a class="active" href="#">All Courses</a></li>
                    <li><a href="#">Collections</a></li>
                    <li><a href="#">Wishlist</a></li>
                    <li><a href="#">Archived</a></li>
                </ul>
            </div>
            <!-- Courses Category Wrapper End  -->

            <!-- Courses Wrapper Start  -->
            <div class="courses-wrapper-02">
                <div class="row">
                    <div class="col-lg-4 col-md-6">
                        <!-- Single Courses Start -->
                        <div class="single-courses">
                            <div class="courses-images">
                                <a href="courses-details.html"><img src="assets/images/courses/courses-01.jpg"
                                        alt="Courses"></a>

                                <div class="courses-option dropdown">
                                    <button class="option-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </button>
                                    <ul class="dropdown-menu">
                                        <li><a href="#"><i class="icofont-share-alt"></i> Share</a></li>
                                        <li><a href="#"><i class="icofont-plus"></i> Create Collection</a></li>
                                        <li><a href="#"><i class="icofont-star"></i> Favorite</a></li>
                                        <li><a href="#"><i class="icofont-archive"></i> Archive</a></li>
                                    </ul>
                                </div>
                            </div>
                            <div class="courses-content">
                                <div class="courses-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="assets/images/author/author-01.jpg"
                                                    alt="Author"></a>
                                        </div>
                                        <div class="author-name">
                                            <a class="name" href="#">Jason Williams</a>
                                            <a class="name-2" href="#">Ohula Malsh</a>
                                        </div>
                                    </div>
                                </div>

                                <h4 class="title"><a href="courses-details.html">Data Science and Machine Learning with
                                        Python - Hands On!</a></h4>

                                <div class="courses-rating">
                                    <p>38% Complete</p>

                                    <div class="rating-progress-bar">
                                        <div class="rating-line" style="width: 38%;"></div>
                                    </div>

                                    <div class="rating-meta">
                                        <span class="rating-star">
                                            <span class="rating-bar" style="width: 80%;"></span>
                                        </span>
                                        <p>Your rating</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Single Courses End -->
                    </div>
                    <div class="col-lg-4 col-md-6">
                        <!-- Single Courses Start -->
                        <div class="single-courses">
                            <div class="courses-images">
                                <a href="courses-details.html"><img src="assets/images/courses/courses-02.jpg"
                                        alt="Courses"></a>

                                <div class="courses-option dropdown">
                                    <button class="option-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </button>
                                    <ul class="dropdown-menu">
                                        <li><a href="#"><i class="icofont-share-alt"></i> Share</a></li>
                                        <li><a href="#"><i class="icofont-plus"></i> Create Collection</a></li>
                                        <li><a href="#"><i class="icofont-star"></i> Favorite</a></li>
                                        <li><a href="#"><i class="icofont-archive"></i> Archive</a></li>
                                    </ul>
                                </div>
                            </div>
                            <div class="courses-content">
                                <div class="courses-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="assets/images/author/author-02.jpg"
                                                    alt="Author"></a>
                                        </div>
                                        <div class="author-name">
                                            <a class="name" href="#">Pamela Foster </a>
                                            <a class="name-2" href="#">Ohula Malsh</a>
                                        </div>
                                    </div>
                                </div>

                                <h4 class="title"><a href="courses-details.html">Create Amazing Color Schemes for Your UX
                                        Design Projects</a></h4>

                                <div class="courses-rating">
                                    <p>80% Complete</p>

                                    <div class="rating-progress-bar">
                                        <div class="rating-line" style="width: 80%;"></div>
                                    </div>

                                    <div class="rating-meta">
                                        <span class="rating-star">
                                            <span class="rating-bar" style="width: 0%;"></span>
                                        </span>
                                        <p><a href="#">Leave a rating</a></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Single Courses End -->
                    </div>
                    <div class="col-lg-4 col-md-6">
                        <!-- Single Courses Start -->
                        <div class="single-courses">
                            <div class="courses-images">
                                <a href="courses-details.html"><img src="assets/images/courses/courses-03.jpg"
                                        alt="Courses"></a>

                                <div class="courses-option dropdown">
                                    <button class="option-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </button>
                                    <ul class="dropdown-menu">
                                        <li><a href="#"><i class="icofont-share-alt"></i> Share</a></li>
                                        <li><a href="#"><i class="icofont-plus"></i> Create Collection</a></li>
                                        <li><a href="#"><i class="icofont-star"></i> Favorite</a></li>
                                        <li><a href="#"><i class="icofont-archive"></i> Archive</a></li>
                                    </ul>
                                </div>
                            </div>
                            <div class="courses-content">
                                <div class="courses-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="assets/images/author/author-03.jpg"
                                                    alt="Author"></a>
                                        </div>
                                        <div class="author-name">
                                            <a class="name" href="#">Rose Simmons</a>
                                            <a class="name-2" href="#">Ohula Malsh</a>
                                        </div>
                                    </div>
                                </div>

                                <h4 class="title"><a href="courses-details.html">Culture & Leadership: Strategies for a
                                        Successful Business</a></h4>

                                <div class="courses-rating">
                                    <p>15% Complete</p>

                                    <div class="rating-progress-bar">
                                        <div class="rating-line" style="width: 15%;"></div>
                                    </div>

                                    <div class="rating-meta">
                                        <span class="rating-star">
                                            <span class="rating-bar" style="width: 80%;"></span>
                                        </span>
                                        <p>Your rating</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Single Courses End -->
                    </div>
                    <div class="col-lg-4 col-md-6">
                        <!-- Single Courses Start -->
                        <div class="single-courses">
                            <div class="courses-images">
                                <a href="courses-details.html"><img src="assets/images/courses/courses-04.jpg"
                                        alt="Courses"></a>

                                <div class="courses-option dropdown">
                                    <button class="option-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </button>
                                    <ul class="dropdown-menu">
                                        <li><a href="#"><i class="icofont-share-alt"></i> Share</a></li>
                                        <li><a href="#"><i class="icofont-plus"></i> Create Collection</a></li>
                                        <li><a href="#"><i class="icofont-star"></i> Favorite</a></li>
                                        <li><a href="#"><i class="icofont-archive"></i> Archive</a></li>
                                    </ul>
                                </div>
                            </div>
                            <div class="courses-content">
                                <div class="courses-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="assets/images/author/author-04.jpg"
                                                    alt="Author"></a>
                                        </div>
                                        <div class="author-name">
                                            <a class="name" href="#">Jason Williams</a>
                                            <a class="name-2" href="#">Ohula Malsh</a>
                                        </div>
                                    </div>
                                </div>

                                <h4 class="title"><a href="courses-details.html">Finance Series: Learn to Budget and
                                        Calculate your Net Worth.</a></h4>

                                <div class="courses-rating">
                                    <p>45% Complete</p>

                                    <div class="rating-progress-bar">
                                        <div class="rating-line" style="width: 45%;"></div>
                                    </div>

                                    <div class="rating-meta">
                                        <span class="rating-star">
                                            <span class="rating-bar" style="width: 80%;"></span>
                                        </span>
                                        <p>Your rating</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Single Courses End -->
                    </div>
                    <div class="col-lg-4 col-md-6">
                        <!-- Single Courses Start -->
                        <div class="single-courses">
                            <div class="courses-images">
                                <a href="courses-details.html"><img src="assets/images/courses/courses-05.jpg"
                                        alt="Courses"></a>

                                <div class="courses-option dropdown">
                                    <button class="option-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </button>
                                    <ul class="dropdown-menu">
                                        <li><a href="#"><i class="icofont-share-alt"></i> Share</a></li>
                                        <li><a href="#"><i class="icofont-plus"></i> Create Collection</a></li>
                                        <li><a href="#"><i class="icofont-star"></i> Favorite</a></li>
                                        <li><a href="#"><i class="icofont-archive"></i> Archive</a></li>
                                    </ul>
                                </div>
                            </div>
                            <div class="courses-content">
                                <div class="courses-author">
                                    <div class="author">
                                        <div class="author-thumb">
                                            <a href="#"><img src="assets/images/author/author-05.jpg"
                                                    alt="Author"></a>
                                        </div>
                                        <div class="author-name">
                                            <a class="name" href="#">Pamela Foster</a>
                                            <a class="name-2" href="#">Ohula Malsh</a>
                                        </div>
                                    </div>
                                </div>

                                <h4 class="title"><a href="courses-details.html">Build Brand Into Marketing: Tackling the
                                        New Marketing Landscape</a></h4>

                                <div class="courses-rating">
                                    <p>38% Complete</p>

                                    <div class="rating-progress-bar">
                                        <div class="rating-line" style="width: 38%;"></div>
                                    </div>

                                    <div class="rating-meta">
                                        <span class="rating-star">
                                            <span class="rating-bar" style="width: 80%;"></span>
                                        </span>
                                        <p>Your rating</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Single Courses End -->
                    </div>
                </div>
            </div>
            <!-- Courses Wrapper End  -->


            <!-- Page Pagination End -->
                <div class="page-pagination">
                    <ul class="pagination justify-content-center">
                        <li><a href="#"><i class="icofont-rounded-left"></i></a></li>
                        <li><a class="active" href="#">1</a></li>
                        <li><a href="#">2</a></li>
                        <li><a href="#">3</a></li>
                        <li><a href="#"><i class="icofont-rounded-right"></i></a></li>
                    </ul>
                </div>
                <!-- Page Pagination End -->

        </div>
    </div>
    <!-- Courses End -->

    {{-- (ถ้าต้องการ) Download App Section จากธีม: สามารถคงไว้ หรือจะเอาออกในหน้า login ก็ได้ --}}

    @if (session('success'))
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกข้อมูลสำเร็จ!',
                    text: '{{ session('success') }}',
                    timer: 3000,
                    showConfirmButton: false
                });
            });
        </script>
    @endif
@endsection
