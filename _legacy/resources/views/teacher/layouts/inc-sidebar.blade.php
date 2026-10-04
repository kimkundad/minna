<div id="kt_app_sidebar" class="app-sidebar flex-column" data-kt-drawer="true" data-kt-drawer-name="app-sidebar"
    data-kt-drawer-activate="{default: true, lg: false}" data-kt-drawer-overlay="true" data-kt-drawer-width="225px"
    data-kt-drawer-direction="start" data-kt-drawer-toggle="#kt_app_sidebar_mobile_toggle">
    <div class="app-sidebar-logo px-6" id="kt_app_sidebar_logo">
        <a target="_blank" href="{{ url('/') }}">
            <img src="{{ asset('assets/images/logo.png') }}" alt="Logo" class="h-35px app-sidebar-logo-default" />
            <img src="{{ asset('assets/images/logo.png') }}" alt="Logo" class="h-35px app-sidebar-logo-minimize" />
        </a>
    </div>

    <div class="app-sidebar-menu overflow-hidden flex-column-fluid">
        <div id="kt_app_sidebar_menu_wrapper" class="app-sidebar-wrapper hover-scroll-overlay-y my-5"
            data-kt-scroll="true" data-kt-scroll-activate="true" data-kt-scroll-height="auto"
            data-kt-scroll-dependencies="#kt_app_sidebar_logo, #kt_app_sidebar_footer"
            data-kt-scroll-wrappers="#kt_app_sidebar_menu" data-kt-scroll-offset="5px" data-kt-scroll-save-state="true">
            <div class="menu menu-column menu-rounded menu-sub-indention px-3" id="#kt_app_sidebar_menu"
                data-kt-menu="true" data-kt-menu-expand="false">

                <div class="menu-item">
                    <a class="menu-link {{ request()->routeIs('teacher.index') ? 'active' : '' }}" href="{{ route('teacher.index') }}">
                        <span class="menu-icon"><i class="fas fa-home"></i></span>
                        <span class="menu-title">Dashboard</span>
                    </a>
                </div>

                <div class="menu-item">
                    <a class="menu-link {{ request()->routeIs('teacher.courses.*') ? 'active' : '' }}" href="{{ route('teacher.courses.index') }}">
                        <span class="menu-icon"><i class="fas fa-book"></i></span>
                        <span class="menu-title">จัดการคอร์สเรียน</span>
                    </a>
                </div>

                <div class="menu-item">
                    <a class="menu-link {{ request()->routeIs('teacher.orders.*') ? 'active' : '' }}" href="{{ route('teacher.orders.index') }}">
                        <span class="menu-icon"><i class="fas fa-shopping-cart"></i></span>
                        <span class="menu-title">คำสั่งซื้อ</span>
                    </a>
                </div>

                <div class="menu-item">
                    <a class="menu-link {{ request()->routeIs('teacher.students.*') ? 'active' : '' }}" href="{{ route('teacher.students.index') }}">
                        <span class="menu-icon"><i class="fas fa-users"></i></span>
                        <span class="menu-title">รายชื่อนักเรียน</span>
                    </a>
                </div>

                <div class="menu-item">
                    <a class="menu-link {{ request()->routeIs('teacher.settings.*') ? 'active' : '' }}" href="{{ route('teacher.settings.edit') }}">
                        <span class="menu-icon"><i class="fas fa-cog"></i></span>
                        <span class="menu-title">ตั้งค่า</span>
                    </a>
                </div>
            </div>
        </div>
    </div>
</div>
