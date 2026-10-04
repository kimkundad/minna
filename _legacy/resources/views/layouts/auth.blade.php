{{-- resources/views/layouts/auth.blade.php --}}
<!DOCTYPE html>
<html lang="en">
<head>
    @include('partials.head', ['title' => $title ?? 'Login'])
</head>
<body>
<div class="main-wrapper">

    {{-- Header --}}
    @include('partials.header')

    {{-- Overlay (จากธีม ถ้าจำเป็น) --}}
    <div class="overlay"></div>

    {{-- เนื้อหาหน้าหลัก --}}
    @yield('content')

    {{-- Footer --}}
    @include('partials.footer')
</div>

@include('partials.scripts')
</body>
</html>
