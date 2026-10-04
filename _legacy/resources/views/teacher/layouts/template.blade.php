<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
    @yield('title')
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    @include('admin.layouts.inc-style')
    @yield('stylesheet')
</head>
<body
    id="kt_app_body"
    data-kt-app-layout="light-sidebar"
    data-kt-app-header-fixed="true"
    data-kt-app-sidebar-enabled="true"
    data-kt-app-sidebar-fixed="true"
    data-kt-app-sidebar-hoverable="true"
    data-kt-app-sidebar-push-header="true"
    data-kt-app-sidebar-push-toolbar="true"
    data-kt-app-sidebar-push-footer="true"
    data-kt-app-toolbar-enabled="true"
    class="app-default"
>
    <div class="d-flex flex-column flex-root app-root" id="kt_app_root">
        <div class="app-page flex-column flex-column-fluid" id="kt_app_page">
            @include('teacher.layouts.inc-header')
            <div class="app-wrapper flex-column flex-row-fluid" id="kt_app_wrapper">
                @include('teacher.layouts.inc-sidebar')
                @yield('content')
            </div>
        </div>
    </div>

    @include('admin.layouts.inc-script')
    @yield('scripts')
</body>
</html>
