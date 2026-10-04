@extends('admin.layouts.template')

@section('title')
    <title>แก้ไขหมวดหมู่คอร์ส</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">แก้ไขหมวดหมู่คอร์ส</h1>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card">
                        <div class="card-body py-6">
                            <form method="POST" action="{{ route('admin.categories.update', $category) }}">
                                @csrf
                                @method('PUT')
                                <div class="mb-4">
                                    <label class="form-label">ชื่อหมวดหมู่</label>
                                    <input type="text" name="name" class="form-control"
                                        value="{{ old('name', $category->name) }}" required>
                                </div>
                                <div class="text-end">
                                    <a href="{{ route('admin.categories.index') }}" class="btn btn-light me-2">ยกเลิก</a>
                                    <button class="btn btn-primary">บันทึก</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
