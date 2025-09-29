{{-- resources/views/partials/header.blade.php --}}
<div class="header-section">
    {{-- Header Top --}}
    <div class="header-top d-none d-lg-block">
        <div class="container">
            <div class="header-top-wrapper">
                <div class="header-top-left">
                    <p>All course 28% off for <a href="#">Liberian people’s.</a></p>
                </div>
                <div class="header-top-medal">
                    <div class="top-info">
                        <p><i class="flaticon-phone-call"></i> <a href="tel:9702621413">(970) 262-1413</a></p>
                        <p><i class="flaticon-email"></i> <a href="mailto:address@gmail.com">address@gmail.com</a></p>
                    </div>
                </div>
                <div class="header-top-right">
                    <ul class="social">
                        <li><a href="#"><i class="flaticon-facebook"></i></a></li>
                        <li><a href="#"><i class="flaticon-twitter"></i></a></li>
                        <li><a href="#"><i class="flaticon-skype"></i></a></li>
                        <li><a href="#"><i class="flaticon-instagram"></i></a></li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    {{-- Header Main --}}
    <div class="header-main">
        <div class="container">
            <div class="header-main-wrapper">
                <div class="header-logo">
                    <a href="{{ url('/') }}"><img src="{{ asset('assets/images/logo.png') }}" alt="Logo"></a>
                </div>

                <div class="header-menu d-none d-lg-block">
                    <ul class="nav-menu">
                        <li><a href="{{ url('/') }}">หน้าแรก</a></li>
                        <li><a href="#">คอร์สออนไลน์</a></li>
                        <li><a href="#">บทความ</a></li>
                        <li><a href="#">สมัครเป็นผู้สอน</a></li>
                    </ul>
                </div>

                <div class="header-sign-in-up d-none d-lg-block">
                    <ul>
                        @auth('web')
                        <li class="has-submenu">

                            <ul class="sub-menu">
                            <li><a href="{{ route('dashboard') }}">Dashboard</a></li>
                            </ul>
                        </li>
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

{{-- Mobile Menu (ถ้าต้องการใช้ ไล่แก้ path asset เช่นกัน) --}}

<!-- Mobile Menu Start -->
        <div class="mobile-menu">

            <!-- Menu Close Start -->
            <a class="menu-close" href="javascript:void(0)">
                <i class="icofont-close-line"></i>
            </a>
            <!-- Menu Close End -->

            <!-- Mobile Top Medal Start -->
            <div class="mobile-top">
                <p><i class="flaticon-phone-call"></i> <a href="tel:9702621413">(970) 262-1413</a></p>
                <p><i class="flaticon-email"></i> <a href="mailto:address@gmail.com">address@gmail.com</a></p>
            </div>
            <!-- Mobile Top Medal End -->

            <!-- Mobile Sing In & Up Start -->
            <div class="mobile-sign-in-up">
                <ul>
                    <li><a class="sign-in" href="login.html">เข้าสู่ระบบ</a></li>
                    <li><a class="sign-up" href="register.html">สมัครสมาชิก</a></li>
                </ul>
            </div>
            <!-- Mobile Sing In & Up End -->

            <!-- Mobile Menu Start -->
            <div class="mobile-menu-items">
                <ul class="nav-menu">
                    <li><a href="{{ url('/') }}">หน้าแรก</a></li>
                        <li><a href="#">คอร์สออนไลน์</a></li>
                        <li><a href="#">บทความ</a></li>
                        <li><a href="#">สมัครเป็นผู้สอน</a></li>
                </ul>

            </div>
            <!-- Mobile Menu End -->

            <!-- Mobile Menu End -->
            <div class="mobile-social">
                <ul class="social">
                    <li><a href="#"><i class="flaticon-facebook"></i></a></li>
                    <li><a href="#"><i class="flaticon-twitter"></i></a></li>
                    <li><a href="#"><i class="flaticon-skype"></i></a></li>
                    <li><a href="#"><i class="flaticon-instagram"></i></a></li>
                </ul>
            </div>
            <!-- Mobile Menu End -->

        </div>
        <!-- Mobile Menu End -->
