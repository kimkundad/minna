@php
    $phone = $siteSettings['contact_phone'] ?? '(970) 262-1413';
    $phoneHref = preg_replace('/\D+/', '', $phone);
    $email = $siteSettings['contact_email'] ?? 'address@gmail.com';
@endphp

<div class="header-section">
    <div class="header-top d-none d-lg-block">
        <div class="container">
            <div class="header-top-wrapper">
                <div class="header-top-left">
                    <p>All course 28% off for <a href="#">Liberian people's.</a></p>
                </div>
                <div class="header-top-medal">
                    <div class="top-info">
                        <p><i class="flaticon-phone-call"></i> <a href="tel:{{ $phoneHref }}">{{ $phone }}</a></p>
                        <p><i class="flaticon-email"></i> <a href="mailto:{{ $email }}">{{ $email }}</a></p>
                    </div>
                </div>
                <div class="header-top-right">
                    <ul class="social">
                        <li><a href="{{ $siteSettings['facebook_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-facebook"></i></a></li>
                        <li><a href="{{ $siteSettings['twitter_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-twitter"></i></a></li>
                        <li><a href="{{ $siteSettings['skype_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-skype"></i></a></li>
                        <li><a href="{{ $siteSettings['instagram_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-instagram"></i></a></li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <div class="header-main">
        <div class="container">
            <div class="header-main-wrapper">
                <div class="header-logo">
                    <a href="{{ url('/') }}"><img src="{{ asset('assets/images/logo.png') }}" alt="Logo"></a>
                </div>

                <div class="header-menu d-none d-lg-block">
                    <ul class="nav-menu">
                        <li><a href="{{ url('/') }}">หน้าแรก</a></li>
                        <li><a href="{{ url('/course') }}">คอร์สออนไลน์</a></li>
                        <li><a href="#">บทความ</a></li>
                        <li><a href="{{ url('/apply-teacher') }}">สมัครเป็นผู้สอน</a></li>
                    </ul>
                </div>

                <div class="header-sign-in-up d-none d-lg-block">
                    <ul>
                        @auth('web')
                            <li><a class="sign-in" href="{{ route('dashboard') }}">Dashboard</a></li>
                        @else
                            <li><a class="sign-in" href="{{ route('login') }}">เข้าสู่ระบบ</a></li>
                            @if (Route::has('register'))
                                <li><a class="sign-up" href="{{ route('register') }}">สมัครสมาชิก</a></li>
                            @endif
                        @endauth
                    </ul>
                </div>

                <div class="header-toggle d-lg-none">
                    <a class="menu-toggle" href="javascript:void(0)">
                        <span></span><span></span><span></span>
                    </a>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="mobile-menu">
    <a class="menu-close" href="javascript:void(0)">
        <i class="icofont-close-line"></i>
    </a>

    <div class="mobile-top">
        <p><i class="flaticon-phone-call"></i> <a href="tel:{{ $phoneHref }}">{{ $phone }}</a></p>
        <p><i class="flaticon-email"></i> <a href="mailto:{{ $email }}">{{ $email }}</a></p>
    </div>

    <div class="mobile-sign-in-up">
        <ul>
            @auth('web')
                <li><a class="sign-in" href="{{ route('dashboard') }}">Dashboard</a></li>
            @else
                <li><a class="sign-in" href="{{ route('login') }}">เข้าสู่ระบบ</a></li>
                @if (Route::has('register'))
                    <li><a class="sign-up" href="{{ route('register') }}">สมัครสมาชิก</a></li>
                @endif
            @endauth
        </ul>
    </div>

    <div class="mobile-menu-items">
        <ul class="nav-menu">
            <li><a href="{{ url('/') }}">หน้าแรก</a></li>
            <li><a href="{{ url('/course') }}">คอร์สออนไลน์</a></li>
            <li><a href="#">บทความ</a></li>
            <li><a href="{{ url('/apply-teacher') }}">สมัครเป็นผู้สอน</a></li>
        </ul>
    </div>

    <div class="mobile-social">
        <ul class="social">
            <li><a href="{{ $siteSettings['facebook_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-facebook"></i></a></li>
            <li><a href="{{ $siteSettings['twitter_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-twitter"></i></a></li>
            <li><a href="{{ $siteSettings['skype_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-skype"></i></a></li>
            <li><a href="{{ $siteSettings['instagram_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-instagram"></i></a></li>
        </ul>
    </div>
</div>

