@extends('admin.layouts.template')

@section('title')
    <title>สร้างคอร์สเรียน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">สร้างคอร์สเรียน</h1>
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
                            <form method="POST" action="{{ route('admin.courses.store') }}" enctype="multipart/form-data">
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

                                <div class="mb-4">
                                    <label class="form-label">ผู้สอน</label>
                                    <select name="teacher_id" class="form-select" required>
                                        <option value="">เลือกผู้สอน</option>
                                        @foreach ($teachers as $teacher)
                                            <option value="{{ $teacher->id }}" @selected(old('teacher_id') == $teacher->id)>
                                                {{ $teacher->name }} ({{ $teacher->email }})
                                            </option>
                                        @endforeach
                                    </select>
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

                                <div class="row g-4 mb-4">
                                    <div class="col-md-6">
                                        <label class="form-label">สิทธิ์การเข้าถึงคอร์ส</label>
                                        <select name="access_type" id="access_type" class="form-select" required>
                                            <option value="lifetime" @selected(old('access_type', 'lifetime') === 'lifetime')>Lifetime access</option>
                                            <option value="time_limited" @selected(old('access_type') === 'time_limited')>Time-limited access</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6" id="duration_months_wrap" style="display:none;">
                                        <label class="form-label">ระยะเวลาเข้าถึงหลังชำระเงิน</label>
                                        <select name="access_duration_months" id="access_duration_months" class="form-select">
                                            <option value="">เลือกระยะเวลา</option>
                                            <option value="1" @selected((string) old('access_duration_months') === '1')>1 เดือน</option>
                                            <option value="2" @selected((string) old('access_duration_months') === '2')>2 เดือน</option>
                                            <option value="3" @selected((string) old('access_duration_months') === '3')>3 เดือน</option>
                                            <option value="6" @selected((string) old('access_duration_months') === '6')>6 เดือน</option>
                                            <option value="12" @selected((string) old('access_duration_months') === '12')>1 ปี</option>
                                            <option value="24" @selected((string) old('access_duration_months') === '24')>2 ปี</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">Video ตัวอย่าง (ไม่เกิน 50MB)</label>
                                    <input type="file" name="sample_video" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*">
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">เอกสารให้ดาวน์โหลด (เลือกได้มากกว่า 1 ไฟล์)</label>
                                    <input type="file" name="documents[]" class="form-control" multiple
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.jpg,.jpeg,.png,.webp,.gif,image/*">
                                </div>

                                <div class="text-end">
                                    <a href="{{ route('admin.courses.index') }}" class="btn btn-light me-2">ยกเลิก</a>
                                    <button class="btn btn-primary">บันทึกคอร์ส</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function () {
            var accessType = document.getElementById('access_type');
            var wrap = document.getElementById('duration_months_wrap');
            var duration = document.getElementById('access_duration_months');

            function toggleDuration() {
                var isTimeLimited = accessType && accessType.value === 'time_limited';
                wrap.style.display = isTimeLimited ? '' : 'none';
                if (duration) {
                    duration.required = isTimeLimited;
                    if (!isTimeLimited) duration.value = '';
                }
            }

            if (accessType) {
                accessType.addEventListener('change', toggleDuration);
                toggleDuration();
            }
        });
    </script>
@endsection
