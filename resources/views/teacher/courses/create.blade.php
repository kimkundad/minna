@extends('teacher.layouts.template')

@section('title')
    <title>สร้างคอร์ส</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">สร้างคอร์ส</h1>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    @if ($errors->any())
                        <div class="alert alert-danger">
                            <ul class="mb-0">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    @endif

                    <div class="card">
                        <div class="card-body py-6">
                            <form method="POST" action="{{ route('teacher.courses.store') }}" enctype="multipart/form-data">
                                @csrf

                                <div class="mb-4">
                                    <label class="form-label">ชื่อคอร์ส</label>
                                    <input type="text" name="title" class="form-control" value="{{ old('title') }}" required>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">รายละเอียด</label>
                                    <textarea name="description" class="form-control" rows="6" required>{{ old('description') }}</textarea>
                                </div>

                                <div class="row g-4 mb-4">
                                    <div class="col-md-6">
                                        <label class="form-label">หมวดหมู่</label>
                                        <select name="course_category_id" class="form-select" required>
                                            <option value="">เลือกหมวดหมู่</option>
                                            @foreach ($categories as $category)
                                                <option value="{{ $category->id }}" @selected(old('course_category_id') == $category->id)>{{ $category->name }}</option>
                                            @endforeach
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">ชื่อวิชา</label>
                                        <select name="subject_id" class="form-select" required>
                                            <option value="">เลือกชื่อวิชา</option>
                                            @foreach ($subjects as $subject)
                                                <option value="{{ $subject->id }}" @selected(old('subject_id') == $subject->id)>{{ $subject->name }}</option>
                                            @endforeach
                                        </select>
                                    </div>
                                </div>

                                <div class="row g-4 mb-4">
                                    <div class="col-md-6">
                                        <label class="form-label">ราคา</label>
                                        <input type="number" name="price" class="form-control" min="0" step="0.01" value="{{ old('price', 0) }}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">รูปคอร์ส</label>
                                        <input type="file" name="thumbnail" class="form-control" accept="image/*">
                                    </div>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">วิดีโอตัวอย่าง (ไม่เกิน 50MB)</label>
                                    <input type="file" name="sample_video" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*">
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">เอกสารดาวน์โหลด (เลือกได้มากกว่า 1 ไฟล์)</label>
                                    <input type="file" name="documents[]" class="form-control" multiple
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.jpg,.jpeg,.png,.webp,.gif,image/*">
                                </div>

                                <div class="text-end">
                                    <a href="{{ route('teacher.courses.index') }}" class="btn btn-light me-2">ยกเลิก</a>
                                    <button class="btn btn-primary">บันทึกคอร์ส</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
