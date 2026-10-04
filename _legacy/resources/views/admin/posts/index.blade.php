@extends('admin.layouts.template')

@section('title')
    <title>บทความ</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">บทความ</h1>
                    <a href="{{ route('admin.posts.create') }}" class="btn btn-primary">สร้างบทความ</a>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    <div class="card mb-6">
                        <div class="card-body py-4">
                            <form method="GET" action="{{ route('admin.posts.index') }}" class="row g-3">
                                <div class="col-md-8">
                                    <label class="form-label">ค้นหา</label>
                                    <input type="text" name="q" class="form-control" value="{{ $q ?? '' }}"
                                        placeholder="ค้นหาชื่อบทความหรือคำอธิบายย่อ">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">สถานะ</label>
                                    <select name="status" class="form-select">
                                        <option value="">ทั้งหมด</option>
                                        <option value="draft" @selected(($status ?? '') === 'draft')>draft</option>
                                        <option value="published" @selected(($status ?? '') === 'published')>published</option>
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
                                            <th>หัวข้อ</th>
                                            <th>ผู้เขียน</th>
                                            <th>สถานะ</th>
                                            <th>เผยแพร่</th>
                                            <th>อัปเดตล่าสุด</th>
                                            <th class="text-end">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($posts as $post)
                                            <tr>
                                                <td>
                                                    <div class="fw-bold">{{ $post->title }}</div>
                                                    <div class="text-muted fs-7">{{ $post->slug }}</div>
                                                </td>
                                                <td>{{ $post->author?->name ?? '-' }}</td>
                                                <td>
                                                    <span class="badge badge-light-{{ $post->status === 'published' ? 'success' : 'warning' }}">
                                                        {{ $post->status }}
                                                    </span>
                                                </td>
                                                <td>{{ $post->published_at?->format('d/m/Y H:i') ?? '-' }}</td>
                                                <td>{{ $post->updated_at?->format('d/m/Y H:i') }}</td>
                                                <td class="text-end">
                                                    <a href="{{ route('admin.posts.edit', $post) }}"
                                                        class="btn btn-sm btn-light-warning">แก้ไข</a>
                                                </td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="6" class="text-center text-muted">ยังไม่มีบทความ</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4">{{ $posts->links() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

