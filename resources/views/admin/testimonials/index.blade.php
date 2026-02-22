@extends('admin.layouts.template')

@section('title')
    <title>เสียงตอบรับจากผู้เรียน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">เสียงตอบรับจากผู้เรียน</h1>
                    <a href="{{ route('admin.testimonials.create') }}" class="btn btn-primary">สร้างรายการใหม่</a>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    <div class="card mb-6">
                        <div class="card-body py-4">
                            <form method="GET" action="{{ route('admin.testimonials.index') }}" class="row g-3">
                                <div class="col-md-8">
                                    <label class="form-label">ค้นหา</label>
                                    <input type="text" name="q" class="form-control" value="{{ $q ?? '' }}"
                                        placeholder="ค้นหาชื่อ ตำแหน่ง หรือข้อความ">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">สถานะ</label>
                                    <select name="status" class="form-select">
                                        <option value="">ทั้งหมด</option>
                                        <option value="published" @selected(($status ?? '') === 'published')>published</option>
                                        <option value="draft" @selected(($status ?? '') === 'draft')>draft</option>
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
                                            <th>ผู้เรียน</th>
                                            <th>ข้อความ</th>
                                            <th>คะแนน</th>
                                            <th>สถานะ</th>
                                            <th>ลำดับ</th>
                                            <th class="text-end">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($testimonials as $item)
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center gap-3">
                                                        <div>
                                                            @php
                                                                $avatar = $item->avatar_path
                                                                    ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($item->avatar_path)
                                                                    : asset('assets/images/author/author-01.jpg');
                                                            @endphp
                                                            <img src="{{ $avatar }}" alt="avatar" width="48" height="48"
                                                                style="object-fit: cover; border-radius: 50%;">
                                                        </div>
                                                        <div>
                                                            <div class="fw-bold">{{ $item->name }}</div>
                                                            <div class="text-muted fs-7">{{ $item->designation ?: '-' }}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>{{ \Illuminate\Support\Str::limit($item->content, 120) }}</td>
                                                <td>{{ $item->rating }}/5</td>
                                                <td>
                                                    <span class="badge badge-light-{{ $item->status === 'published' ? 'success' : 'warning' }}">
                                                        {{ $item->status }}
                                                    </span>
                                                </td>
                                                <td>{{ $item->sort_order }}</td>
                                                <td class="text-end">
                                                    <a href="{{ route('admin.testimonials.edit', $item) }}"
                                                        class="btn btn-sm btn-light-warning">แก้ไข</a>
                                                </td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="6" class="text-center text-muted">ยังไม่มีข้อมูลเสียงตอบรับ</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>

                            <div class="mt-4">{{ $testimonials->links() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

