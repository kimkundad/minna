{{-- resources/views/partials/scripts.blade.php --}}
{{-- Modernizer & jQuery --}}
<script src="{{ asset('assets/js/vendor/modernizr-3.11.2.min.js') }}"></script>
<script src="{{ asset('assets/js/vendor/jquery-3.5.1.min.js') }}"></script>

{{-- รวม Plugins --}}
<script src="{{ asset('assets/js/plugins.min.js') }}"></script>

{{-- Main JS --}}
<script src="{{ asset('assets/js/main.js') }}"></script>

<!-- SweetAlert2 -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

@stack('scripts')
