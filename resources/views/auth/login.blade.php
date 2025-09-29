{{-- resources/views/auth/login.blade.php --}}
@extends('layouts.auth')

@section('content')
    {{-- Page Banner (จากธีม) --}}
    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li class="active">Login</li>
                </ul>
                <h2 class="title">Login <span>Form</span></h2>
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

    {{-- Register & Login Section --}}
    <div class="section section-padding">
        <div class="container">
            <div class="register-login-wrapper">
                <div class="row align-items-center">
                    <div class="col-lg-6">
                        <div class="register-login-images">
                            <div class="shape-1">
                                <img src="{{ asset('assets/images/shape/shape-26.png') }}" alt="Shape">
                            </div>
                            <div class="images">
                                <img src="{{ asset('assets/images/register-login.png') }}" alt="Register Login">
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-6">
                        <div class="register-login-form">
                            <h3 class="title">Login <span>Now</span></h3>

                            {{-- แสดงข้อความสถานะ/เออเรอร์ของ Jetstream --}}
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
                                <form method="POST" action="{{ route('login') }}">
                                    @csrf
                                    {{-- Email --}}
                                    <div class="single-form">
                                        <input
                                            type="email"
                                            name="email"
                                            value="{{ old('email') }}"
                                            placeholder="Username or Email"
                                            required
                                            autofocus
                                        >
                                    </div>

                                    {{-- Password --}}
                                    <div class="single-form">
                                        <input
                                            type="password"
                                            name="password"
                                            placeholder="Password"
                                            required
                                            autocomplete="current-password"
                                        >
                                    </div>

                                    {{-- Remember + Forgot --}}
                                    <div class="single-form d-flex justify-content-between align-items-center">
                                        <label class="d-flex align-items-center">
                                            <input type="checkbox" name="remember" class="me-2">
                                            <span>Remember me</span>
                                        </label>

                                        @if (Route::has('password.request'))
                                            <a class="text-sm" href="{{ route('password.request') }}">
                                                Forgot your password?
                                            </a>
                                        @endif
                                    </div>

                                    {{-- Submit & (Optional) Social login --}}
                                    <div class="single-form">
                                        <button class="btn btn-primary btn-hover-dark w-100" type="submit">
                                            Login
                                        </button>

                                        {{-- ถ้าคุณใช้ Socialite และตั้งค่า route ไว้แล้ว ค่อยปลดคอมเมนต์บรรทัดล่าง --}}
                                        {{-- <a class="btn btn-secondary btn-outline w-100 mt-2" href="{{ route('social.redirect', 'google') }}">Login with Google</a> --}}
                                    </div>
                                </form>
                            </div>

                            {{-- Register link --}}
                            <div class="mt-3 text-center">
                                <span>Don’t have an account?</span>
                                <a href="{{ route('register') }}">Sign Up</a>
                            </div>
                        </div>
                    </div>
                </div> {{-- row --}}
            </div>
        </div>
    </div>

    {{-- (ถ้าต้องการ) Download App Section จากธีม: สามารถคงไว้ หรือจะเอาออกในหน้า login ก็ได้ --}}
@endsection
