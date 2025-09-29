{{-- resources/views/auth/register.blade.php --}}
@extends('layouts.auth') {{-- หรือ layouts.site ถ้าคุณแยกไว้ --}}

@section('content')

<!-- Page Banner Start -->
        <div class="section page-banner">

            <img class="shape-1 animation-round" src="assets/images/shape/shape-8.png" alt="Shape">

            <img class="shape-2" src="assets/images/shape/shape-23.png" alt="Shape">

            <div class="container">
                <!-- Page Banner Start -->
                <div class="page-banner-content">
                    <ul class="breadcrumb">
                        <li><a href="#">Home</a></li>
                        <li class="active">Register</li>
                    </ul>
                    <h2 class="title">Registration <span>Form</span></h2>
                </div>
                <!-- Page Banner End -->
            </div>

            <!-- Shape Icon Box Start -->
            <div class="shape-icon-box">

                <img class="icon-shape-1 animation-left" src="assets/images/shape/shape-5.png" alt="Shape">

                <div class="box-content">
                    <div class="box-wrapper">
                        <i class="flaticon-badge"></i>
                    </div>
                </div>

                <img class="icon-shape-2" src="assets/images/shape/shape-6.png" alt="Shape">

            </div>
            <!-- Shape Icon Box End -->

            <img class="shape-3" src="assets/images/shape/shape-24.png" alt="Shape">

            <img class="shape-author" src="assets/images/author/author-11.jpg" alt="Shape">

        </div>
        <!-- Page Banner End -->

    <!-- Register & Login Start -->
    <div class="section section-padding">
        <div class="container">

            <!-- Register & Login Wrapper Start -->
            <div class="register-login-wrapper">
                <div class="row align-items-center">
                    <div class="col-lg-6">

                        <!-- Register & Login Images Start -->
                        <div class="register-login-images">
                            <div class="shape-1">
                                <img src="{{ asset('assets/images/shape/shape-26.png') }}" alt="Shape">
                            </div>

                            <div class="images">
                                <img src="{{ asset('assets/images/register-login.png') }}" alt="Register Login">
                            </div>
                        </div>
                        <!-- Register & Login Images End -->

                    </div>
                    <div class="col-lg-6">

                        <!-- Register & Login Form Start -->
                        <div class="register-login-form">
                            <h3 class="title">Registration <span>Now</span></h3>

                            {{-- แสดงข้อความ/เออเรอร์จาก Jetstream --}}
                            @if (session('status'))
                                <div class="mb-4 text-success">
                                    {{ session('status') }}
                                </div>
                            @endif
                            @if ($errors->any())
                                <div class="mb-4 text-danger">
                                    <ul class="m-0 ps-3">
                                        @foreach ($errors->all() as $error)
                                            <li>{{ $error }}</li>
                                        @endforeach
                                    </ul>
                                </div>
                            @endif

                            <div class="form-wrapper">
                                <form method="POST" action="{{ route('register') }}">
                                    @csrf

                                    <!-- Single Form Start -->
                                    <div class="single-form">
                                        <input
                                            type="text"
                                            name="name"
                                            placeholder="Name"
                                            value="{{ old('name') }}"
                                            required
                                            autofocus
                                            autocomplete="name"
                                        >
                                    </div>
                                    <!-- Single Form End -->

                                    <!-- Single Form Start -->
                                    <div class="single-form">
                                        <input
                                            type="email"
                                            name="email"
                                            placeholder="Email"
                                            value="{{ old('email') }}"
                                            required
                                            autocomplete="username"
                                        >
                                    </div>
                                    <!-- Single Form End -->

                                    <!-- Single Form Start -->
                                    <div class="single-form">
                                        <input
                                            type="password"
                                            name="password"
                                            placeholder="Password"
                                            required
                                            autocomplete="new-password"
                                        >
                                    </div>
                                    <!-- Single Form End -->

                                    <!-- Single Form Start -->
                                    <div class="single-form">
                                        <input
                                            type="password"
                                            name="password_confirmation"
                                            placeholder="Confirm Password"
                                            required
                                            autocomplete="new-password"
                                        >
                                    </div>
                                    <!-- Single Form End -->

                                    {{-- Terms & Privacy ของ Jetstream (ถ้าเปิดฟีเจอร์นี้) --}}
                                    @if (Laravel\Jetstream\Jetstream::hasTermsAndPrivacyPolicyFeature())
                                        <div class="single-form">
                                            <label class="d-flex align-items-start gap-2">
                                                <input type="checkbox" name="terms" required class="mt-1">
                                                <span>
                                                    {!! __('I agree to the :terms_of_service and :privacy_policy', [
                                                        'terms_of_service' => '<a target="_blank" href="'.route('terms.show').'" class="text-primary">'.__('Terms of Service').'</a>',
                                                        'privacy_policy'  => '<a target="_blank" href="'.route('policy.show').'" class="text-primary">'.__('Privacy Policy').'</a>',
                                                    ]) !!}
                                                </span>
                                            </label>
                                        </div>
                                    @endif

                                    <!-- Single Form Start -->
                                    <div class="single-form">
                                        <button class="btn btn-primary btn-hover-dark w-100" type="submit">
                                            Create an account
                                        </button>

                                        {{-- ถ้าติดตั้ง Socialite/ตั้ง route แล้ว ค่อยปลดคอมเมนต์ปุ่มนี้ --}}
                                        {{-- <a class="btn btn-secondary btn-outline w-100 mt-2" href="{{ route('social.redirect', 'google') }}">Sign up with Google</a> --}}
                                    </div>
                                    <!-- Single Form End -->
                                </form>

                                <div class="mt-3 text-center">
                                    <span>Already registered?</span>
                                    <a href="{{ route('login') }}">Sign In</a>
                                </div>
                            </div>
                        </div>
                        <!-- Register & Login Form End -->

                    </div>
                </div>
            </div>
            <!-- Register & Login Wrapper End -->

        </div>
    </div>
    <!-- Register & Login End -->
@endsection
