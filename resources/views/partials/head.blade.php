{{-- resources/views/partials/head.blade.php --}}
<meta charset="utf-8">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>{{ $title ?? 'Login' }}</title>
<meta name="robots" content="noindex, follow" />
<meta name="description" content="">
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">

<link rel="shortcut icon" type="image/x-icon" href="{{ asset('assets/images/favicon.ico') }}">

{{-- Google Fonts --}}
<!-- Google Fonts: Prompt -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">

{{-- Icon Fonts --}}
<link rel="stylesheet" href="{{ asset('assets/css/plugins/icofont.min.css') }}">
<link rel="stylesheet" href="{{ asset('assets/css/plugins/flaticon.css') }}">
<link rel="stylesheet" href="{{ asset('assets/css/plugins/font-awesome.min.css') }}">

{{-- Plugins CSS --}}
<link rel="stylesheet" href="{{ asset('assets/css/plugins/animate.min.css') }}">
<link rel="stylesheet" href="{{ asset('assets/css/plugins/swiper-bundle.min.css') }}">
<link rel="stylesheet" href="{{ asset('assets/css/plugins/magnific-popup.css') }}">
<link rel="stylesheet" href="{{ asset('assets/css/plugins/nice-select.css') }}">
<link rel="stylesheet" href="{{ asset('assets/css/plugins/apexcharts.css') }}">
<link rel="stylesheet" href="{{ asset('assets/css/plugins/jqvmap.min.css') }}">

{{-- Main Theme CSS --}}
<link rel="stylesheet" href="{{ asset('assets/css/style.css') }}">

<style>
body {
    font-family: 'Prompt', sans-serif;
}
h1, h2, h3, h4, h5, h6 {
    font-family: 'Prompt', sans-serif;
}
.btn{
    font-family: 'Prompt', sans-serif;
}
.single-work .work-content .title {
    font-size: 22px;
}
</style>

@stack('styles')
