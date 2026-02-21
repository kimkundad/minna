@extends('admin.layouts.template')

@section('title')
    <title>แก้ไขคอร์สเรียน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">แก้ไขคอร์สเรียน</h1>
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
                            <form method="POST" action="{{ route('admin.courses.update', $course) }}" enctype="multipart/form-data">
                                @csrf
                                @method('PUT')

                                <div class="mb-4">
                                    <label class="form-label">ชื่อคอร์ส</label>
                                    <input type="text" name="title" class="form-control" value="{{ old('title', $course->title) }}" required>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">รายละเอียด</label>
                                    <textarea name="description" class="form-control" rows="6" required>{{ old('description', $course->description) }}</textarea>
                                </div>

                                <div class="row g-4 mb-4">
                                    <div class="col-md-6">
                                        <label class="form-label">หมวดหมู่</label>
                                        <select name="course_category_id" class="form-select" required>
                                            @foreach ($categories as $category)
                                                <option value="{{ $category->id }}" @selected(old('course_category_id', $course->course_category_id) == $category->id)>{{ $category->name }}</option>
                                            @endforeach
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">ชื่อวิชา</label>
                                        <select name="subject_id" class="form-select" required>
                                            @foreach ($subjects as $subject)
                                                <option value="{{ $subject->id }}" @selected(old('subject_id', $course->subject_id) == $subject->id)>{{ $subject->name }}</option>
                                            @endforeach
                                        </select>
                                    </div>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">ผู้สอน</label>
                                    <select name="teacher_id" class="form-select" required>
                                        <option value="">เลือกผู้สอน</option>
                                        @foreach ($teachers as $teacher)
                                            <option value="{{ $teacher->id }}" @selected(old('teacher_id', $course->teacher_id) == $teacher->id)>
                                                {{ $teacher->name }} ({{ $teacher->email }})
                                            </option>
                                        @endforeach
                                    </select>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">ราคา</label>
                                    <input type="number" name="price" class="form-control" min="0" step="0.01"
                                        value="{{ old('price', $course->price) }}" required>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">รูปคอร์ส (อัปโหลดใหม่เพื่อแทนที่)</label>
                                    <input type="file" name="thumbnail" class="form-control" accept="image/*">
                                    @if ($course->thumbnail_path)
                                        <small class="text-muted d-block mt-2">
                                            ไฟล์ปัจจุบัน:
                                            <a href="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->thumbnail_path) }}" target="_blank" rel="noopener">
                                                เปิดรูปคอร์ส
                                            </a>
                                        </small>
                                        <div class="mt-3">
                                            <img
                                                src="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->thumbnail_path) }}"
                                                alt="รูปคอร์ส"
                                                class="img-fluid rounded border"
                                                style="max-height: 240px;"
                                            >
                                        </div>
                                    @endif
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">Video ตัวอย่าง (ไม่เกิน 50MB)</label>
                                    <input type="file" name="sample_video" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*">
                                    @if ($course->sample_video_path)
                                        <small class="text-muted d-block mt-2">
                                            ไฟล์ปัจจุบัน:
                                            <a href="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->sample_video_path) }}" target="_blank" rel="noopener">
                                                เปิดวิดีโอตัวอย่าง
                                            </a>
                                        </small>
                                    @endif
                                    <small class="text-muted d-block mt-2">
                                        วิดีโอคอร์สจริง (สูงสุด 1GB และหลายไฟล์) จัดการได้ที่ปุ่ม "จัดการวิดีโอคอร์ส" ด้านล่าง
                                    </small>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">เอกสารใหม่สำหรับดาวน์โหลด (เพิ่มได้หลายไฟล์)</label>
                                    <input type="file" name="documents[]" class="form-control" multiple
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.jpg,.jpeg,.png,.webp,.gif,image/*">
                                    @if ($course->documents->isNotEmpty())
                                        <div class="mt-2">
                                            <small class="text-muted d-block mb-1">เอกสารที่มีอยู่:</small>
                                            @foreach ($course->documents as $document)
                                                <div>
                                                    <small>
                                                        <a href="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($document->file_path) }}" target="_blank" rel="noopener">
                                                            {{ $document->file_name }}
                                                        </a>
                                                    </small>
                                                </div>
                                            @endforeach
                                        </div>
                                    @endif
                                </div>

                                <div class="text-end">
                                    <a href="{{ route('admin.courses.videos.index', $course) }}" class="btn btn-info me-2">จัดการวิดีโอคอร์ส</a>
                                    <a href="{{ route('admin.courses.index') }}" class="btn btn-light me-2">ยกเลิก</a>
                                    <button class="btn btn-primary">บันทึกการแก้ไข</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
