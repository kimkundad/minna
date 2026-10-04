@extends('admin.layouts.template')

@section('title')
    <title>จัดการคอร์สเรียน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">จัดการคอร์สเรียน</h1>
                    <a href="{{ route('admin.courses.create') }}" class="btn btn-primary">สร้างคอร์ส</a>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    <div class="card mb-6">
                        <div class="card-body py-4">
                            <form method="GET" action="{{ route('admin.courses.index') }}" class="row g-3">
                                <div class="col-md-7">
                                    <label class="form-label">ค้นหา</label>
                                    <input type="text" name="q" class="form-control" value="{{ $q ?? '' }}"
                                        placeholder="ค้นหาชื่อคอร์ส, หมวดหมู่, วิชา, ผู้สอน">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">สถานะ</label>
                                    <select name="status" class="form-select">
                                        <option value="">ทั้งหมด</option>
                                        <option value="approved" @selected(($status ?? '') === 'approved')>approved</option>
                                        <option value="pending" @selected(($status ?? '') === 'pending')>pending</option>
                                        <option value="rejected" @selected(($status ?? '') === 'rejected')>rejected</option>
                                    </select>
                                </div>
                                <div class="col-md-2 d-flex align-items-end">
                                    <button class="btn btn-primary w-100">ค้นหา</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-body py-3">
                            <div class="table-responsive">
                                <table class="table table-row-bordered gy-4">
                                    <thead>
                                        <tr>
                                            <th>ชื่อคอร์ส</th>
                                            <th>หมวดหมู่</th>
                                            <th>วิชา</th>
                                            <th>ผู้สอน</th>
                                            <th>ราคา</th>
                                            <th>สถานะ</th>
                                            <th class="text-end">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($courses as $course)
                                            <tr>
                                                <td>{{ $course->title }}</td>
                                                <td>{{ $course->category?->name }}</td>
                                                <td>{{ $course->subject?->name }}</td>
                                                <td>{{ $course->teacher?->name ?? '-' }}</td>
                                                <td>{{ number_format((float) $course->price, 2) }}</td>
                                                <td>
                                                    <span class="badge badge-light-{{ $course->status === 'approved' ? 'success' : ($course->status === 'rejected' ? 'danger' : 'warning') }}">
                                                        {{ $course->status }}
                                                    </span>
                                                </td>
                                                <td class="text-end">
                                                    <a href="{{ route('admin.courses.edit', $course) }}" class="btn btn-sm btn-light-warning">แก้ไข</a>
                                                </td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="7" class="text-center text-muted">ยังไม่มีคอร์ส</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4">{{ $courses->links() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

