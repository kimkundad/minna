@php
    $phone = $siteSettings['contact_phone'] ?? '(970) 262-1413';
    $phoneHref = preg_replace('/\D+/', '', $phone);
    $email = $siteSettings['contact_email'] ?? 'address@gmail.com';
@endphp

<div class="section footer-section">
    <div class="footer-widget-section">
        <img class="shape-1 animation-down" src="{{ url('assets/images/shape/shape-21.png') }}" alt="Shape">

        <div class="container">
            <div class="row">
                <div class="col-lg-3 col-md-6 order-md-1 order-lg-1">
                    <div class="footer-widget">
                        <div class="widget-logo">
                            <a href="{{ url('/') }}"><img src="{{ url('assets/images/logo.png') }}" alt="Logo"></a>
                        </div>

                        <div class="widget-address">
                            <h4 class="footer-widget-title">แพลตฟอร์มการเรียนออนไลน์</h4>
                            <p>สำหรับทักษะแห่งอนาคต</p>
                        </div>

                        <ul class="widget-info">
                            <li><p><i class="flaticon-email"></i> <a href="mailto:{{ $email }}">{{ $email }}</a></p></li>
                            <li><p><i class="flaticon-phone-call"></i> <a href="tel:{{ $phoneHref }}">{{ $phone }}</a></p></li>
                        </ul>

                        <ul class="widget-social">
                            <li><a href="{{ $siteSettings['facebook_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-facebook"></i></a></li>
                            <li><a href="{{ $siteSettings['twitter_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-twitter"></i></a></li>
                            <li><a href="{{ $siteSettings['skype_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-skype"></i></a></li>
                            <li><a href="{{ $siteSettings['instagram_url'] ?? '#' }}" target="_blank" rel="noopener"><i class="flaticon-instagram"></i></a></li>
                        </ul>
                    </div>
                </div>

                <div class="col-lg-6 order-md-3 order-lg-2">
                    <div class="footer-widget-link">
                        <div class="footer-widget">
                            <h4 class="footer-widget-title">บริการทั้งหมด</h4>
                            <ul class="widget-link">
                                <li><a href="{{ url('/course') }}">คอร์สออนไลน์</a></li>
                                <li><a href="{{ route('posts.index') }}">บทความ</a></li>
                                <li><a href="{{ route('about') }}">เกี่ยวกับเรา</a></li>
                                <li><a href="{{ route('contact') }}">ติดต่อเรา</a></li>
                            </ul>
                        </div>

                        <div class="footer-widget">
                            <h4 class="footer-widget-title">ร่วมงานกับเรา</h4>
                            <ul class="widget-link">
                                <li><a href="{{ route('teacher.apply') }}">สมัครเป็นผู้สอน</a></li>
                                <li><a href="#">คำถามที่พบบ่อย</a></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="col-lg-3 col-md-6 order-md-2 order-lg-3">
                    <div class="footer-widget">
                        <h4 class="footer-widget-title">Subscribe</h4>
                        <div class="widget-subscribe">
                            <p>สมัครรับข่าวสารคอร์สใหม่ โปรโมชั่น และบทความภาษา ส่งตรงถึงอีเมลของคุณ</p>

                            @if (session('subscribe_success'))
                                <div class="alert alert-success py-2 px-3 mb-3">{{ session('subscribe_success') }}</div>
                            @endif

                            @error('email')
                                <div class="alert alert-danger py-2 px-3 mb-3">{{ $message }}</div>
                            @enderror

                            <div class="widget-form">
                                <form action="{{ route('subscribe.store') }}" method="POST">
                                    @csrf
                                    <input type="email" name="email" value="{{ old('email') }}" placeholder="กรอกอีเมลของคุณ" required>
                                    <button class="btn btn-primary btn-hover-dark" type="submit">ติดตามเลย</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <img class="shape-2 animation-left" src="{{ url('assets/images/shape/shape-22.png') }}" alt="Shape">
    </div>

    <div class="footer-copyright">
        <div class="container">
            <div class="copyright-wrapper">
                <div class="copyright-link">
                    <a href="{{ route('privacy.policy') }}">นโยบายคุ้มครองข้อมูลส่วนบุคคล</a>
                </div>
                <div class="copyright-text">
                    <p>&copy; 2026 <span>Edule</span> Made with <i class="icofont-heart-alt"></i> by <a href="#">Kim</a></p>
                </div>
            </div>
        </div>
    </div>
</div>

<a href="#" class="back-to-top">
    <i class="icofont-simple-up"></i>
</a>
