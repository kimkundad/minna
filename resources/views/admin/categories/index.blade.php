@extends('admin.layouts.template')

@section('title')
    <title>หมวดหมู่คอร์ส</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">หมวดหมู่คอร์ส</h1>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    <div class="card mb-6">
                        <div class="card-header"><h3 class="card-title">สร้างหมวดหมู่ใหม่</h3></div>
                        <div class="card-body">
                            <form method="POST" action="{{ route('admin.categories.store') }}">
                                @csrf
                                <div class="row g-3">
                                    <div class="col-md-10">
                                        <input type="text" name="name" class="form-control" placeholder="เช่น คันจิ"
                                            value="{{ old('name') }}" required>
                                    </div>
                                    <div class="col-md-2">
                                        <button class="btn btn-primary w-100">เพิ่ม</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h3 class="card-title">รายการหมวดหมู่</h3></div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-row-bordered gy-4">
                                    <thead>
                                        <tr>
                                            <th>ชื่อหมวดหมู่</th>
                                            <th class="text-end">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($categories as $category)
                                            <tr>
                                                <td>{{ $category->name }}</td>
                                                <td class="text-end">
                                                    <a href="{{ route('admin.categories.edit', $category) }}" class="btn btn-sm btn-light-warning me-2">แก้ไข</a>
                                                    <form action="{{ route('admin.categories.destroy', $category) }}" method="POST" class="d-inline"
                                                        onsubmit="return confirm('ยืนยันการลบหมวดหมู่?');">
                                                        @csrf
                                                        @method('DELETE')
                                                        <button class="btn btn-sm btn-light-danger">ลบ</button>
                                                    </form>
                                                </td>
                                            </tr>
                                        @empty
                                            <tr><td colspan="2" class="text-center text-muted">ยังไม่มีหมวดหมู่</td></tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4">{{ $categories->links() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
