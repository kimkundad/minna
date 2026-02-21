@extends('admin.layouts.template')

@section('title')
    <title>รายชื่อผู้สอน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">รายชื่อผู้สอน</h1>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card mb-6">
                        <div class="card-body py-4">
                            <form method="GET" action="{{ route('admin.teachers.index') }}" class="row g-3">
                                <div class="col-md-10">
                                    <label class="form-label">ค้นหา</label>
                                    <input type="text" name="q" class="form-control" value="{{ $q ?? '' }}"
                                        placeholder="ค้นหาชื่อ, อีเมล, โทรศัพท์, หัวข้อที่ต้องการสอน">
                                </div>
                                <div class="col-md-2 d-flex align-items-end">
                                    <button class="btn btn-primary w-100">ค้นหา</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="card card-xl-stretch mb-5">
                        <div class="card-header border-0 pt-5">
                            <h3 class="card-title align-items-start flex-column">
                                <span class="card-label fw-bold fs-3 mb-1">ผู้สอนที่อนุมัติแล้ว</span>
                                <span class="text-muted mt-1 fw-semibold fs-7">ทั้งหมด {{ $applications->total() }} รายการ</span>
                            </h3>
                        </div>

                        <div class="card-body py-3">
                            <div class="table-responsive">
                                <table class="table table-row-bordered gy-5">
                                    <thead>
                                        <tr class="fw-bold fs-6 text-gray-800">
                                            <th class="ps-4 min-w-150px rounded-start">ชื่อ-นามสกุล</th>
                                            <th class="min-w-170px">อีเมล</th>
                                            <th class="min-w-120px">โทรศัพท์</th>
                                            <th class="min-w-150px">หัวข้อที่ต้องการสอน</th>
                                            <th class="min-w-120px">ไฟล์แนบ</th>
                                            <th class="min-w-140px">วันที่อนุมัติ</th>
                                            <th class="min-w-180px text-end rounded-end">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($applications as $application)
                                            <tr>
                                                <td class="ps-4">{{ $application->name }}</td>
                                                <td>{{ $application->email }}</td>
                                                <td>{{ $application->phone }}</td>
                                                <td>{{ $application->subject }}</td>
                                                <td>
                                                    @if ($application->resume_path)
                                                        <a href="{{ $application->resume_path }}" target="_blank" rel="noopener">เปิดไฟล์</a>
                                                    @else
                                                        <span class="text-muted">ไม่มี</span>
                                                    @endif
                                                </td>
                                                <td>{{ $application->approved_at?->format('d/m/Y H:i') ?? '-' }}</td>
                                                <td class="text-end">
                                                    <a href="{{ route('admin.teacher_applications.show', $application) }}" class="btn btn-sm btn-light-primary me-2">ดูข้อมูล</a>
                                                    <a href="{{ route('admin.teacher_applications.edit', $application) }}" class="btn btn-sm btn-light-warning">แก้ไข</a>
                                                </td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="7" class="text-center text-muted py-5">ยังไม่มีผู้สอนที่อนุมัติ</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>

                                <div class="mt-5">
                                    {{ $applications->links() }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

