@extends('layouts.auth')

@section('content')
    <style>
        .student-register-wrap {
            max-width: 520px;
            margin: 0 auto;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 28px;
        }

        .student-register-wrap .title {
            color: #065f46;
            font-size: 38px;
            line-height: 1.1;
            margin-bottom: 6px;
            font-weight: 700;
        }

        .student-register-wrap .subtitle {
            color: #4b5563;
            margin-bottom: 22px;
        }

        .student-register-wrap .field-label {
            font-weight: 600;
            margin-bottom: 8px;
            color: #1f2937;
            display: block;
        }

        .student-register-wrap .single-form {
            margin-bottom: 16px;
        }

        .iti {
            width: 100%;
        }

        .iti__country-list {
            z-index: 1055;
            max-width: 320px;
        }

        .phone-fallback {
            display: none;
        }

        .phone-fallback.is-active {
            display: block;
        }
    </style>

    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">
        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li class="active">Register</li>
                </ul>
                <h2 class="title">Registration <span>Form</span></h2>
            </div>
        </div>
        <div class="shape-icon-box">
            <img class="icon-shape-1 animation-left" src="{{ asset('assets/images/shape/shape-5.png') }}" alt="Shape">
            <div class="box-content"><div class="box-wrapper"><i class="flaticon-badge"></i></div></div>
            <img class="icon-shape-2" src="{{ asset('assets/images/shape/shape-6.png') }}" alt="Shape">
        </div>
        <img class="shape-3" src="{{ asset('assets/images/shape/shape-24.png') }}" alt="Shape">
        <img class="shape-author" src="{{ asset('assets/images/author/author-11.jpg') }}" alt="Shape">
    </div>

    <div class="section section-padding">
        <div class="container">
            <div class="student-register-wrap">
                <h1 class="title">สมัครบัญชีผู้ใช้ด้วยอีเมล</h1>
                <p class="subtitle">กรุณากรอกข้อมูลให้ครบถ้วน</p>

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
                    <form method="POST" action="{{ route('register') }}" id="register-form">
                        @csrf

                        <div class="single-form">
                            <label class="field-label">อีเมล</label>
                            <input type="email" name="email" value="{{ old('email') }}" placeholder="example@domain.com" required>
                        </div>

                        <div class="single-form">
                            <label class="field-label">ยืนยันอีเมล</label>
                            <input type="email" name="email_confirmation" value="{{ old('email_confirmation') }}" placeholder="example@domain.com" required>
                        </div>

                        <div class="row g-3">
                            <div class="col-md-6">
                                <div class="single-form">
                                    <label class="field-label">ชื่อจริง</label>
                                    <input type="text" name="first_name" value="{{ old('first_name') }}" required>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="single-form">
                                    <label class="field-label">นามสกุล</label>
                                    <input type="text" name="last_name" value="{{ old('last_name') }}" required>
                                </div>
                            </div>
                        </div>

                        <div class="single-form">
                            <label class="field-label">วันเกิด วัน/เดือน/ปี(พ.ศ.)</label>
                            <input type="hidden" id="birthdate" name="birthdate" value="{{ old('birthdate') }}">
                            <input type="text" id="birthdate_display" name="birthdate_display" value="{{ old('birthdate_display') }}" placeholder="วัน/เดือน/ปี(พ.ศ.)" autocomplete="off" required>
                        </div>

                        <div class="single-form">
                            <label class="field-label">หมายเลขโทรศัพท์</label>
                            <input type="hidden" id="phone_code" name="phone_code" value="{{ old('phone_code', '+66') }}">
                            <select id="phone_code_fallback" class="phone-fallback">
                                <option value="+66">ไทย (+66)</option>
                                <option value="+81">ญี่ปุ่น (+81)</option>
                                <option value="+1">สหรัฐอเมริกา (+1)</option>
                                <option value="+44">สหราชอาณาจักร (+44)</option>
                                <option value="+61">ออสเตรเลีย (+61)</option>
                                <option value="+65">สิงคโปร์ (+65)</option>
                                <option value="+60">มาเลเซีย (+60)</option>
                                <option value="+62">อินโดนีเซีย (+62)</option>
                                <option value="+63">ฟิลิปปินส์ (+63)</option>
                                <option value="+84">เวียดนาม (+84)</option>
                            </select>
                            <input type="text" id="phone" name="phone" value="{{ old('phone') }}" placeholder="หมายเลขโทรศัพท์" required>
                        </div>

                        <div class="single-form">
                            <label class="field-label">รหัสผ่าน</label>
                            <input type="password" name="password" required autocomplete="new-password">
                        </div>

                        <div class="single-form">
                            <label class="field-label">ยืนยันรหัสผ่าน</label>
                            <input type="password" name="password_confirmation" required autocomplete="new-password">
                        </div>

                        @php $recaptchaSiteKey = config('services.recaptcha.site_key'); @endphp
                        @if (!empty($recaptchaSiteKey))
                            <div class="single-form"><div class="g-recaptcha" data-sitekey="{{ $recaptchaSiteKey }}"></div></div>
                        @endif

                        @if (Laravel\Jetstream\Jetstream::hasTermsAndPrivacyPolicyFeature())
                            <div class="single-form">
                                <label class="d-flex align-items-start">
                                    <input type="checkbox" id="terms" name="terms" class="me-2 mt-1" required>
                                    <span>
                                        {!! __('ฉันยอมรับ :terms_of_service และ :privacy_policy', [
                                            'terms_of_service' => '<a target="_blank" href="'.route('terms.show').'">เงื่อนไขการใช้งาน</a>',
                                            'privacy_policy' => '<a target="_blank" href="'.route('privacy.policy').'">นโยบายความเป็นส่วนตัว</a>',
                                        ]) !!}
                                    </span>
                                </label>
                            </div>
                        @endif

                        <div class="single-form">
                            <button class="btn btn-primary btn-hover-dark w-100" type="submit">สมัครบัญชีผู้ใช้</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    @if (!empty($recaptchaSiteKey))
        <script src="https://www.google.com/recaptcha/api.js" async defer></script>
    @endif

    <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.6/build/css/intlTelInput.css"
        onerror="this.onerror=null;this.href='https://unpkg.com/intl-tel-input@26.0.6/build/css/intlTelInput.css';">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <script
        src="https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.6/build/js/intlTelInput.min.js"
        onerror="this.onerror=null;this.src='https://unpkg.com/intl-tel-input@26.0.6/build/js/intlTelInput.min.js';"></script>
    <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
    <script src="https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/th.js"></script>

    <script>
        document.addEventListener('DOMContentLoaded', function () {
            const phoneInput = document.getElementById('phone');
            const phoneCodeInput = document.getElementById('phone_code');
            const phoneCodeFallback = document.getElementById('phone_code_fallback');

            if (phoneCodeFallback && phoneCodeInput) {
                phoneCodeFallback.value = phoneCodeInput.value || '+66';
                phoneCodeFallback.addEventListener('change', function () {
                    phoneCodeInput.value = phoneCodeFallback.value || '+66';
                });
            }

            let phonePluginReady = false;
            if (phoneInput && phoneCodeInput && window.intlTelInput) {
                const iti = window.intlTelInput(phoneInput, {
                    initialCountry: 'th',
                    separateDialCode: true,
                    loadUtils: () => import("https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.6/build/js/utils.js"),
                });

                const syncPhoneCode = function () {
                    const selected = iti.getSelectedCountryData();
                    phoneCodeInput.value = selected && selected.dialCode ? '+' + selected.dialCode : '+66';
                    if (phoneCodeFallback) phoneCodeFallback.value = phoneCodeInput.value;
                };

                phoneInput.addEventListener('countrychange', syncPhoneCode);
                syncPhoneCode();
                phonePluginReady = true;
                if (phoneCodeFallback) phoneCodeFallback.classList.remove('is-active');
            }

            if (!phonePluginReady && phoneCodeFallback) {
                phoneCodeFallback.classList.add('is-active');
            }

            const birthdateInput = document.getElementById('birthdate');
            const birthdateDisplay = document.getElementById('birthdate_display');
            if (!birthdateInput || !birthdateDisplay) return;

            const formatThaiDate = function (date) {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const yearBuddhist = date.getFullYear() + 543;
                return day + '/' + month + '/' + yearBuddhist;
            };

            const parseThaiDate = function (value) {
                const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (!match) return null;
                const day = parseInt(match[1], 10);
                const month = parseInt(match[2], 10);
                const yearBuddhist = parseInt(match[3], 10);
                const yearGregorian = yearBuddhist > 2400 ? yearBuddhist - 543 : yearBuddhist;
                const date = new Date(yearGregorian, month - 1, day);
                if (date.getFullYear() !== yearGregorian || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
                return date;
            };

            const setBirthdateHiddenValue = function (date) {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                birthdateInput.value = y + '-' + m + '-' + d;
            };

            const syncBuddhistYearInput = function (instance) {
                if (!instance || !instance.currentYearElement) return;
                instance.currentYearElement.value = String(instance.currentYear + 543);
            };

            const bindBuddhistYearInput = function (instance) {
                if (!instance || !instance.currentYearElement || instance.currentYearElement.dataset.beBound === '1') return;
                const yearInput = instance.currentYearElement;
                yearInput.dataset.beBound = '1';
                const applyYearInput = function () {
                    const raw = parseInt(yearInput.value, 10);
                    if (Number.isNaN(raw)) {
                        syncBuddhistYearInput(instance);
                        return;
                    }
                    let gregorianYear = raw > 2400 ? raw - 543 : raw;
                    const currentYear = new Date().getFullYear();
                    if (gregorianYear < 1900) gregorianYear = 1900;
                    if (gregorianYear > currentYear) gregorianYear = currentYear;
                    instance.changeYear(gregorianYear);
                    syncBuddhistYearInput(instance);
                };
                yearInput.addEventListener('change', applyYearInput);
                yearInput.addEventListener('blur', applyYearInput);
            };

            if (window.flatpickr) {
                window.flatpickr(birthdateDisplay, {
                    locale: 'th',
                    dateFormat: 'd/m/Y',
                    monthSelectorType: 'dropdown',
                    disableMobile: true,
                    defaultDate: birthdateInput.value ? birthdateInput.value : null,
                    minDate: '1900-01-01',
                    maxDate: 'today',
                    parseDate: function (dateStr) {
                        const parsed = parseThaiDate(dateStr);
                        if (parsed) return parsed;
                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                            const nativeDate = new Date(dateStr + 'T00:00:00');
                            if (!Number.isNaN(nativeDate.getTime())) return nativeDate;
                        }
                        return null;
                    },
                    formatDate: function (dateObj) {
                        return formatThaiDate(dateObj);
                    },
                    onReady: function (selectedDates, dateStr, instance) {
                        bindBuddhistYearInput(instance);
                        syncBuddhistYearInput(instance);
                        if (selectedDates.length === 0) {
                            instance.jumpToDate('2000-01-01');
                            syncBuddhistYearInput(instance);
                            return;
                        }
                        setBirthdateHiddenValue(selectedDates[0]);
                    },
                    onChange: function (selectedDates) {
                        if (selectedDates.length > 0) setBirthdateHiddenValue(selectedDates[0]);
                    },
                    onMonthChange: function (selectedDates, dateStr, instance) {
                        syncBuddhistYearInput(instance);
                    },
                    onYearChange: function (selectedDates, dateStr, instance) {
                        syncBuddhistYearInput(instance);
                    },
                });
            } else {
                birthdateDisplay.type = 'date';
                birthdateDisplay.placeholder = '';
                birthdateDisplay.value = birthdateInput.value || '';
                birthdateDisplay.addEventListener('change', function () {
                    birthdateInput.value = birthdateDisplay.value;
                });
            }
        });
    </script>
@endsection
