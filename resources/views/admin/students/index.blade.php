@extends('admin.layouts.template')

@section('title')
    <title>รายชื่อนักเรียน</title>
    <meta name="description" content="รายชื่อนักเรียนทั้งหมด">
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">

            <!-- Toolbar -->
            <div id="kt_app_toolbar" class="app-toolbar py-3 py-lg-6">
                <div id="kt_app_toolbar_container" class="app-container container-xxl d-flex flex-stack">
                    <div class="page-title d-flex flex-column justify-content-center flex-wrap me-3">
                        {{-- <h1 class="page-heading text-dark fw-bold fs-3 my-0">รายชื่อนักเรียน</h1>
                        <ul class="breadcrumb fw-semibold fs-7 my-0 pt-1">
                            <li class="breadcrumb-item text-muted">
                                <a href="{{ route('admin.index') }}" class="text-muted text-hover-primary">Dashboard</a>
                            </li>
                            <li class="breadcrumb-item">
                                <span class="bullet bg-gray-400 w-5px h-2px"></span>
                            </li>
                            <li class="breadcrumb-item text-muted">นักเรียน</li>
                        </ul> --}}
                    </div>
                </div>
            </div>
            <!-- End Toolbar -->

            <!-- Content -->
            <div id="kt_app_content" class="app-content flex-column-fluid">
                <div id="kt_app_content_container" class="app-container container-xxl">

                    <div class="card card-xl-stretch mb-5">
                        <div class="card-header border-0 pt-5">
                            <h3 class="card-title align-items-start flex-column">
                                <span class="card-label fw-bold fs-3 mb-1">รายชื่อนักเรียนทั้งหมด</span>
                                <span class="text-muted mt-1 fw-semibold fs-7">ทั้งหมด {{ $students->total() }} คน</span>
                            </h3>
                        </div>

                        <div class="card-body py-3">
                            <div class="table-responsive">
                                <table class="table table-row-bordered gy-5">
                                    <thead>
                                        <tr class="fw-bold fs-6 text-gray-800">
                                            <th class="ps-4 min-w-100px rounded-start">ชื่อ-นามสกุล</th>
                                            <th class="min-w-150px">อีเมล</th>
                                            <th class="min-w-125px">เบอร์ติดต่อ</th>
                                            <th class="min-w-125px text-end rounded-end">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($students as $student)
                                            <tr>
                                                <td class="ps-4">{{ $student->name }}</td>
                                                <td>{{ $student->email }}</td>
                                                <td>{{ $student->phone ?? '-' }}</td>
                                                <td class="text-end">
                                                    <!--begin::Action dropdown-->
                                                    <a href="#" class="btn btn-light btn-active-light-primary btn-sm"
                                                        data-kt-menu-trigger="click" data-kt-menu-placement="bottom-end">
                                                        Actions
                                                        <span class="svg-icon svg-icon-5 m-0">
                                                            <svg width="24" height="24" viewBox="0 0 24 24"
                                                                fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path
                                                                    d="M11.4343 12.7344L7.25 8.55005C6.83579 8.13583 6.16421 8.13584 5.75 8.55005C5.33579 8.96426 5.33579 9.63583 5.75 10.05L11.2929 15.5929C11.6834 15.9835 12.3166 15.9835 12.7071 15.5929L18.25 10.05C18.6642 9.63584 18.6642 8.96426 18.25 8.55005C17.8358 8.13584 17.1642 8.13584 16.75 8.55005L12.5657 12.7344C12.2533 13.0468 11.7467 13.0468 11.4343 12.7344Z"
                                                                    fill="currentColor"></path>
                                                            </svg>
                                                        </span>
                                                    </a>
                                                    <!--begin::Menu-->
                                                    <div class="menu menu-sub menu-sub-dropdown menu-column menu-rounded menu-gray-600 menu-state-bg-light-primary fw-semibold fs-7 w-125px py-4"
                                                        data-kt-menu="true">
                                                        <div class="menu-item px-3">
                                                            <a href="{{ route('admin.students.edit', $student->id) }}"
                                                                class="menu-link px-3">Edit</a>
                                                        </div>
                                                        <div class="menu-item px-3">
                                                            <form
                                                                action="{{ route('admin.students.destroy', $student->id) }}"
                                                                method="POST"
                                                                onsubmit="return confirm('ต้องการลบข้อมูลนี้หรือไม่?');">
                                                                @csrf
                                                                @method('DELETE')
                                                                <button type="submit"
                                                                    class="menu-link px-3 border-0 bg-transparent text-danger">Delete</button>
                                                            </form>
                                                        </div>
                                                    </div>
                                                    <!--end::Menu-->
                                                    <!--end::Action dropdown-->
                                                </td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="4" class="text-center text-muted py-5">
                                                    ไม่มีข้อมูลนักเรียน
                                                </td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>

                                <div class="mt-5">
                                    {{ $students->links() }}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            <!-- End Content -->

        </div>
    </div>
@endsection
