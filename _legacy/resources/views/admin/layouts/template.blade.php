<!DOCTYPE html>
<!--
Author: Keenthemes
Product Name: Metronic | Bootstrap HTML, VueJS, React, Angular, Asp.Net Core, Rails, Spring, Blazor, Django, Flask & Laravel Admin Dashboard Theme
Purchase: https://1.envato.market/EA4JP
Website: http://www.keenthemes.com
Contact: support@keenthemes.com
Follow: www.twitter.com/keenthemes
Dribbble: www.dribbble.com/keenthemes
Like: www.facebook.com/keenthemes
License: For each use you must have a valid license purchased only from above link in order to legally use the theme for your project.
-->
<html lang="{{ app()->getLocale() }}">
	<!--begin::Head-->
	<head>

		@yield('title')
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />

		@include('admin.layouts.inc-style')
    	@yield('stylesheet')

	</head>
	<!--end::Head-->
	<!--begin::Body-->
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
		<!--begin::Theme mode setup on page load-->
		<div class="d-flex flex-column flex-root app-root" id="kt_app_root">
			<div class="app-page flex-column flex-column-fluid" id="kt_app_page">

				@include('admin.layouts.inc-header')

				<div class="app-wrapper flex-column flex-row-fluid" id="kt_app_wrapper">

					@include('admin.layouts.inc-slidebar')

					@yield('content')

				</div>
			</div>
		</div>



		@include('admin.layouts.inc-script')
    @yield('scripts')



	</body>
</html>
