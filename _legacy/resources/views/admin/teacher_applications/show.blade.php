@extends('admin.layouts.template')

@section('title')
    <title>รายละเอียดใบสมัครผู้สอน</title>
    <meta name="description" content="รายละเอียดใบสมัครผู้สอน">
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div id="kt_app_toolbar" class="app-toolbar py-3 py-lg-6">
                <div id="kt_app_toolbar_container" class="app-container container-xxl d-flex flex-stack">
                    <div class="page-title d-flex flex-column justify-content-center flex-wrap me-3">
                        <h1 class="page-heading text-dark fw-bold fs-3 my-0">รายละเอียดใบสมัครผู้สอน</h1>
                        <ul class="breadcrumb fw-semibold fs-7 my-0 pt-1">
                            <li class="breadcrumb-item text-muted">
                                <a href="{{ route('admin.index') }}" class="text-muted text-hover-primary">Dashboard</a>
                            </li>
                            <li class="breadcrumb-item">
                                <span class="bullet bg-gray-400 w-5px h-2px"></span>
                            </li>
                            <li class="breadcrumb-item text-muted">
                                <a href="{{ route('admin.teacher_applications.index') }}" class="text-muted text-hover-primary">ใบสมัครผู้สอน</a>
                            </li>
                            <li class="breadcrumb-item">
                                <span class="bullet bg-gray-400 w-5px h-2px"></span>
                            </li>
                            <li class="breadcrumb-item text-muted">รายละเอียด</li>
                        </ul>
                    </div>
                    <div>
                        <a href="{{ route('admin.teacher_applications.edit', $application) }}" class="btn btn-warning btn-sm">แก้ไขข้อมูล</a>
                    </div>
                </div>
            </div>

            <div id="kt_app_content" class="app-content flex-column-fluid">
                <div id="kt_app_content_container" class="app-container container-xxl">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    <div class="card mb-5">
                        <div class="card-body py-6">
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">ชื่อ-นามสกุล</div>
                                <div class="col-md-9">{{ $application->name }}</div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">อีเมล</div>
                                <div class="col-md-9">{{ $application->email }}</div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">โทรศัพท์</div>
                                <div class="col-md-9">{{ $application->phone }}</div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">หัวข้อที่ต้องการสอน</div>
                                <div class="col-md-9">{{ $application->subject }}</div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">ประสบการณ์/ผลงาน</div>
                                <div class="col-md-9" style="white-space: pre-line;">{{ $application->experience }}</div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">เหตุผลที่อยากร่วมงาน</div>
                                <div class="col-md-9" style="white-space: pre-line;">{{ $application->reason ?: '-' }}</div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">ไฟล์แนบ</div>
                                <div class="col-md-9">
                                    @if ($application->resume_path)
                                        <a href="{{ $application->resume_path }}" target="_blank" rel="noopener">เปิดไฟล์แนบ</a>
                                    @else
                                        <span class="text-muted">ไม่มีไฟล์แนบ</span>
                                    @endif
                                </div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">สถานะ</div>
                                <div class="col-md-9">{{ ucfirst($application->status) }}</div>
                            </div>
                            <div class="row mb-4">
                                <div class="col-md-3 fw-semibold text-gray-700">วันที่สมัคร</div>
                                <div class="col-md-9">{{ $application->created_at?->format('d/m/Y H:i') }}</div>
                            </div>
                            <div class="row">
                                <div class="col-md-3 fw-semibold text-gray-700">อนุมัติโดย/เวลา</div>
                                <div class="col-md-9">
                                    {{ $application->approver?->name ?? '-' }}
                                    @if ($application->approved_at)
                                        ({{ $application->approved_at->format('d/m/Y H:i') }})
                                    @endif
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
