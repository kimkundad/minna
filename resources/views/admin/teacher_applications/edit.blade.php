@extends('admin.layouts.template')

@section('title')
    <title>แก้ไขใบสมัครผู้สอน</title>
    <meta name="description" content="แก้ไขใบสมัครผู้สอน">
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div id="kt_app_toolbar" class="app-toolbar py-3 py-lg-6">
                <div id="kt_app_toolbar_container" class="app-container container-xxl d-flex flex-stack">
                    <div class="page-title d-flex flex-column justify-content-center flex-wrap me-3">
                        <h1 class="page-heading text-dark fw-bold fs-3 my-0">แก้ไขใบสมัครผู้สอน</h1>
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
                            <li class="breadcrumb-item text-muted">แก้ไข</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div id="kt_app_content" class="app-content flex-column-fluid">
                <div id="kt_app_content_container" class="app-container container-xxl">
                    @if ($errors->any())
                        <div class="alert alert-danger">
                            <ul class="mb-0">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    @endif

                    <div class="card mb-5">
                        <div class="card-body py-6">
                            <form method="POST" action="{{ route('admin.teacher_applications.update', $application) }}">
                                @csrf
                                @method('PUT')

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">ชื่อ-นามสกุล</label>
                                    <div class="col-md-9">
                                        <input type="text" name="name" class="form-control"
                                            value="{{ old('name', $application->name) }}" required>
                                    </div>
                                </div>

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">อีเมล</label>
                                    <div class="col-md-9">
                                        <input type="email" name="email" class="form-control"
                                            value="{{ old('email', $application->email) }}" required>
                                    </div>
                                </div>

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">โทรศัพท์</label>
                                    <div class="col-md-9">
                                        <input type="text" name="phone" class="form-control"
                                            value="{{ old('phone', $application->phone) }}" required>
                                    </div>
                                </div>

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">หัวข้อที่ต้องการสอน</label>
                                    <div class="col-md-9">
                                        <input type="text" name="subject" class="form-control"
                                            value="{{ old('subject', $application->subject) }}" required>
                                    </div>
                                </div>

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">ประสบการณ์/ผลงาน</label>
                                    <div class="col-md-9">
                                        <textarea name="experience" class="form-control" rows="5" required>{{ old('experience', $application->experience) }}</textarea>
                                    </div>
                                </div>

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">เหตุผลที่อยากร่วมงาน</label>
                                    <div class="col-md-9">
                                        <textarea name="reason" class="form-control" rows="4">{{ old('reason', $application->reason) }}</textarea>
                                    </div>
                                </div>

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">สถานะ</label>
                                    <div class="col-md-9">
                                        <select name="status" class="form-select" required>
                                            <option value="pending" @selected(old('status', $application->status) === 'pending')>รอตรวจสอบ</option>
                                            <option value="approved" @selected(old('status', $application->status) === 'approved')>อนุมัติ</option>
                                            <option value="rejected" @selected(old('status', $application->status) === 'rejected')>ไม่อนุมัติ</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="row mb-4">
                                    <label class="col-md-3 col-form-label fw-semibold">ไฟล์แนบปัจจุบัน</label>
                                    <div class="col-md-9 pt-2">
                                        @if ($application->resume_path)
                                            <a href="{{ $application->resume_path }}" target="_blank" rel="noopener">เปิดไฟล์แนบ</a>
                                        @else
                                            <span class="text-muted">ไม่มีไฟล์แนบ</span>
                                        @endif
                                    </div>
                                </div>

                                <div class="d-flex justify-content-end">
                                    <a href="{{ route('admin.teacher_applications.show', $application) }}"
                                        class="btn btn-light me-2">ยกเลิก</a>
                                    <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
