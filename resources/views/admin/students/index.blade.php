@extends('admin.layouts.template')

@section('title')
    <title>รายชื่อนักเรียน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">รายชื่อนักเรียน</h1>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    <div class="card mb-6">
                        <div class="card-body py-4">
                            <form method="GET" action="{{ route('admin.students.index') }}" class="row g-3">
                                <div class="col-md-10">
                                    <label class="form-label">ค้นหา</label>
                                    <input
                                        type="text"
                                        name="q"
                                        class="form-control"
                                        value="{{ $q }}"
                                        placeholder="ค้นหาชื่อ, อีเมล หรือเบอร์โทร"
                                    >
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
                                                    <a href="{{ route('admin.students.edit', $student->id) }}" class="btn btn-sm btn-light-warning">แก้ไข</a>
                                                    <form
                                                        action="{{ route('admin.students.destroy', $student->id) }}"
                                                        method="POST"
                                                        class="d-inline"
                                                        onsubmit="return confirm('ต้องการลบข้อมูลนี้หรือไม่?');"
                                                    >
                                                        @csrf
                                                        @method('DELETE')
                                                        <button type="submit" class="btn btn-sm btn-light-danger">ลบ</button>
                                                    </form>
                                                </td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="4" class="text-center text-muted py-5">ไม่มีข้อมูลนักเรียน</td>
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
        </div>
    </div>
@endsection

