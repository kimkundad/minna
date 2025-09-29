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
                        <li><a href="{{ url('/') }}">Home</a></li>
                        <li>
                            <a href="#">All Course</a>
                            <ul class="sub-menu">
                                <li><a href="#">Courses</a></li>
                                <li><a href="#">Courses Details</a></li>
                            </ul>
                        </li>
                        <li>
                            <a href="#">Pages</a>
                            <ul class="sub-menu">
                                <li><a href="#">About</a></li>
                                <li><a href="{{ route('register') }}">Register</a></li>
                                <li><a href="{{ route('login') }}">Login</a></li>
                                <li><a href="#">FAQ</a></li>
                            </ul>
                        </li>
                        <li><a href="#">Blog</a></li>
                        <li><a href="#">Contact</a></li>
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
                        <li><a class="sign-in" href="{{ route('login') }}">Sign In</a></li>
                        @if (Route::has('register'))
                            <li><a class="sign-up" href="{{ route('register') }}">Sign Up</a></li>
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
