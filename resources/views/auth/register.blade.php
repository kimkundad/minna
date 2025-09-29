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

                                    <!-- Role -->
                                    <div class="single-form">
                                        <label for="role" class="form-label">{{ __('Role') }}</label>
                                        <select
                                            id="role"
                                            name="role"
                                            class="form-select"
                                            required
                                            autofocus
                                        >
                                            <option value="" disabled {{ old('role') ? '' : 'selected' }}>{{ __('Select your role') }}</option>
                                            <option value="student" {{ old('role') === 'student' ? 'selected' : '' }}>{{ __('Student') }}</option>
                                            <option value="teacher" {{ old('role') === 'teacher' ? 'selected' : '' }}>{{ __('Teacher') }}</option>
                                        </select>
                                    </div>

                                    <!-- Username -->
                                    <div class="single-form">
                                        <label for="username" class="form-label">{{ __('Username') }}</label>
                                        <input
                                            id="username"
                                            type="text"
                                            name="username"
                                            class="form-control"
                                            placeholder="{{ __('Choose a username') }}"
                                            value="{{ old('username') }}"
                                            required
                                            autocomplete="username"
                                        >
                                    </div>

                                    <!-- First Name -->
                                    <div class="single-form">
                                        <label for="first_name" class="form-label">{{ __('First name') }}</label>
                                        <input
                                            id="first_name"
                                            type="text"
                                            name="first_name"
                                            class="form-control"
                                            placeholder="{{ __('Enter your first name') }}"
                                            value="{{ old('first_name') }}"
                                            required
                                            autocomplete="given-name"
                                        >
                                    </div>

                                <!-- Last Name -->
                                    <div class="single-form">
                                        <label for="last_name" class="form-label">{{ __('Last name') }}</label>
                                        <input
                                            id="last_name"
                                            type="text"
                                            name="last_name"
                                            class="form-control"
                                            placeholder="{{ __('Enter your last name') }}"
                                            value="{{ old('last_name') }}"
                                            required
                                            autocomplete="family-name"
                                        >
                                    </div>

                                    <!-- Email -->
                                    <div class="single-form">
                                        <label for="email" class="form-label">{{ __('Email address') }}</label>
                                        <input
                                            id="email"
                                            type="email"
                                            name="email"
                                            class="form-control"
                                            placeholder="{{ __('Enter your email') }}"
                                            value="{{ old('email') }}"
                                            required
                                            autocomplete="email"
                                        >
                                    </div>

                                    <!-- Birthdate -->
                                    <div class="single-form">
                                        <label for="birthdate" class="form-label">{{ __('Birthdate (optional)') }}</label>
                                        <input
                                            id="birthdate"
                                            type="date"
                                            name="birthdate"
                                            class="form-control"
                                            value="{{ old('birthdate') }}"
                                            autocomplete="bday"
                                        >
                                    </div>

                                    <!-- Phone -->
                                    <div class="single-form">
                                        <label for="phone" class="form-label">{{ __('Phone (optional)') }}</label>
                                        <input
                                            id="phone"
                                            type="tel"
                                            name="phone"
                                            class="form-control"
                                            placeholder="{{ __('Enter your phone number') }}"
                                            value="{{ old('phone') }}"
                                            autocomplete="tel"
                                        >
                                    </div>

                                    <!-- Address -->
                                    <div class="single-form">
                                        <label for="address" class="form-label">{{ __('Address (optional)') }}</label>
                                        <input
                                            id="address"
                                            type="text"
                                            name="address"
                                            class="form-control"
                                            placeholder="{{ __('Enter your address') }}"
                                            value="{{ old('address') }}"
                                            autocomplete="street-address"
                                        >
                                    </div>

                                    <!-- Line ID -->
                                    <div class="single-form">
                                        <label for="line_id" class="form-label">{{ __('LINE ID (optional)') }}</label>
                                        <input
                                            id="line_id"
                                            type="text"
                                            name="line_id"
                                            class="form-control"
                                            placeholder="{{ __('Enter your LINE ID') }}"
                                            value="{{ old('line_id') }}"
                                            autocomplete="off"
                                        >
                                    </div>

                                    <!-- Subjects (Teacher only) -->
                                    <div class="single-form" id="subject-wrapper" style="{{ old('role') === 'teacher' ? '' : 'display: none;' }}">
                                        <label for="subject_ids" class="form-label">{{ __('Subjects you teach') }}</label>
                                        @php
                                            $selectedSubjects = old('subject_ids', []);
                                            $selectedSubjects = is_array($selectedSubjects) ? $selectedSubjects : [$selectedSubjects];
                                        @endphp
                                        <select
                                            id="subject_ids"
                                            name="subject_ids[]"
                                            class="form-select"
                                            multiple
                                        >
                                            @foreach ($subjects ?? [] as $subject)
                                                <option value="{{ $subject->id }}" {{ in_array($subject->id, $selectedSubjects) ? 'selected' : '' }}>
                                                    {{ $subject->name }}
                                                </option>
                                            @endforeach
                                        </select>
                                        <small class="form-text text-muted">{{ __('Select one or more subjects if you are registering as a teacher.') }}</small>
                                    </div>

                                    <!-- Password -->
                                    <div class="single-form">
                                        <label for="password" class="form-label">{{ __('Password') }}</label>
                                        <input
                                            id="password"
                                            type="password"
                                            name="password"
                                            class="form-control"
                                            placeholder="{{ __('Create a password') }}"
                                            required
                                            autocomplete="new-password"
                                        >
                                    </div>

                                    <!-- Confirm Password -->
                                    <div class="single-form">
                                        <label for="password_confirmation" class="form-label">{{ __('Confirm password') }}</label>
                                        <input
                                            id="password_confirmation"
                                            type="password"
                                            name="password_confirmation"
                                            class="form-control"
                                            placeholder="{{ __('Re-enter your password') }}"
                                            required
                                            autocomplete="new-password"
                                        >
                                    </div>

                                    {{-- Terms & Privacy ของ Jetstream (ถ้าเปิดฟีเจอร์นี้) --}}
                                    @if (Laravel\Jetstream\Jetstream::hasTermsAndPrivacyPolicyFeature())
                                        <div class="single-form">
                                            <label class="d-flex align-items-start gap-2">
                                                <input type="checkbox" name="terms" value="1" {{ old('terms') ? 'checked' : '' }} required class="mt-1">
                                                <span>
                                                    {!! __('I agree to the :terms_of_service and :privacy_policy', [
                                                        'terms_of_service' => '<a target="_blank" href="'.route('terms.show').'" class="text-primary">'.__('Terms of Service').'</a>',
                                                        'privacy_policy'  => '<a target="_blank" href="'.route('policy.show').'" class="text-primary">'.__('Privacy Policy').'</a>',
                                                    ]) !!}
                                                </span>
                                            </label>
                                        </div>
                                    @endif

                                    <!-- Submit -->
                                    <div class="single-form">
                                        <button class="btn btn-primary btn-hover-dark w-100" type="submit">
                                            {{ __('Create an account') }}
                                        </button>

                                        {{-- ถ้าติดตั้ง Socialite/ตั้ง route แล้ว ค่อยปลดคอมเมนต์ปุ่มนี้ --}}
                                        {{-- <a class="btn btn-secondary btn-outline w-100 mt-2" href="{{ route('social.redirect', 'google') }}">{{ __('Sign up with Google') }}</a> --}}
                                    </div>
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

@push('scripts')
    <script>
        document.addEventListener('DOMContentLoaded', function () {
            const roleSelect = document.getElementById('role');
            const subjectWrapper = document.getElementById('subject-wrapper');

            if (!roleSelect || !subjectWrapper) {
                return;
            }

            const toggleSubjects = () => {
                if (roleSelect.value === 'teacher') {
                    subjectWrapper.style.display = '';
                } else {
                    subjectWrapper.style.display = 'none';
                }
            };

            toggleSubjects();
            roleSelect.addEventListener('change', toggleSubjects);
        });
    </script>
@endpush
