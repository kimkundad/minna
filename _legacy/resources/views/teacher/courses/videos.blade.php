@extends('teacher.layouts.template')

@section('title')
    <title>จัดการวิดีโอคอร์ส</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <div>
                        <h1 class="page-heading text-dark fw-bold fs-3 my-0">จัดการวิดีโอคอร์ส</h1>
                        <div class="text-muted">{{ $course->title }}</div>
                    </div>
                    <a href="{{ route('teacher.courses.edit', $course) }}" class="btn btn-light">กลับไปแก้ไขคอร์ส</a>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    @if (session('success'))
                        <div class="alert alert-success">{{ session('success') }}</div>
                    @endif

                    @if ($errors->any())
                        <div class="alert alert-danger">
                            <ul class="mb-0">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    @endif

                    <div class="card mb-6">
                        <div class="card-header">
                            <h3 class="card-title">เพิ่มหัวข้อการเรียน</h3>
                        </div>
                        <div class="card-body">
                            <form method="POST" action="{{ route('teacher.courses.videos.sections.store', $course) }}" class="row g-4">
                                @csrf
                                <div class="col-md-8">
                                    <label class="form-label">ชื่อหัวข้อ</label>
                                    <input type="text" name="title" class="form-control" placeholder="เช่น บทที่ 1 พื้นฐาน" required>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">ลำดับ</label>
                                    <input type="number" min="0" name="sort_order" class="form-control" value="0">
                                </div>
                                <div class="col-md-2 d-flex align-items-end">
                                    <button class="btn btn-primary w-100">เพิ่มหัวข้อ</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="card mb-6">
                        <div class="card-header">
                            <h3 class="card-title">เพิ่มวิดีโอใหม่ (สูงสุด 1GB ต่อไฟล์)</h3>
                        </div>
                        <div class="card-body">
                            <form method="POST" action="{{ route('teacher.courses.videos.store', $course) }}" enctype="multipart/form-data">
                                @csrf
                                <div class="row g-4">
                                    <div class="col-md-4">
                                        <label class="form-label">หัวข้อการเรียน</label>
                                        <select name="course_section_id" class="form-select">
                                            <option value="">ไม่ระบุหัวข้อ</option>
                                            @foreach ($course->sections as $section)
                                                <option value="{{ $section->id }}">[{{ $section->sort_order }}] {{ $section->title }}</option>
                                            @endforeach
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">ลำดับ</label>
                                        <input type="number" min="0" name="sort_order" class="form-control" value="0">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">ชื่อวิดีโอคอร์ส</label>
                                        <input type="text" name="video_title" class="form-control" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">ชื่อเนื้อหาไฟล์ video</label>
                                        <input type="text" name="content_name" class="form-control" required>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">ความยาววิดีโอ</label>
                                        <input type="text" name="duration" class="form-control" placeholder="เช่น 13:58">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">ไฟล์วิดีโอ</label>
                                        <input type="file" name="video_file" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*" required>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label">คำอธิบายวิดีโอคอร์ส</label>
                                        <textarea name="description" class="form-control" rows="3"></textarea>
                                    </div>
                                </div>
                                <div class="text-end mt-4">
                                    <button class="btn btn-primary">เพิ่มวิดีโอ</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">หัวข้อและวิดีโอทั้งหมด</h3>
                        </div>
                        <div class="card-body">
                            @forelse ($course->sections as $section)
                                <div class="border rounded p-4 mb-5">
                                    <form method="POST" action="{{ route('teacher.courses.videos.sections.update', [$course, $section]) }}" class="row g-3">
                                        @csrf
                                        @method('PUT')
                                        <div class="col-md-7">
                                            <label class="form-label">ชื่อหัวข้อ</label>
                                            <input type="text" name="title" class="form-control" value="{{ $section->title }}" required>
                                        </div>
                                        <div class="col-md-2">
                                            <label class="form-label">ลำดับ</label>
                                            <input type="number" min="0" name="sort_order" class="form-control" value="{{ $section->sort_order }}">
                                        </div>
                                        <div class="col-md-3 d-flex align-items-end justify-content-end gap-2">
                                            <button class="btn btn-light-primary" type="submit">บันทึกหัวข้อ</button>
                                    </form>
                                            <form method="POST" action="{{ route('teacher.courses.videos.sections.destroy', [$course, $section]) }}" onsubmit="return confirm('ยืนยันการลบหัวข้อนี้? วิดีโอจะยังอยู่แต่ถูกย้ายเป็นไม่ระบุหัวข้อ');">
                                                @csrf
                                                @method('DELETE')
                                                <button class="btn btn-light-danger" type="submit">ลบหัวข้อ</button>
                                            </form>
                                        </div>

                                    @forelse ($section->videos as $video)
                                        <div class="border rounded p-4 mt-4">
                                            <form method="POST" action="{{ route('teacher.courses.videos.update', [$course, $video]) }}" enctype="multipart/form-data">
                                                @csrf
                                                @method('PUT')
                                                <div class="row g-4">
                                                    <div class="col-md-4">
                                                        <label class="form-label">หัวข้อการเรียน</label>
                                                        <select name="course_section_id" class="form-select">
                                                            <option value="">ไม่ระบุหัวข้อ</option>
                                                            @foreach ($course->sections as $s)
                                                                <option value="{{ $s->id }}" @selected((int) $video->course_section_id === (int) $s->id)>
                                                                    [{{ $s->sort_order }}] {{ $s->title }}
                                                                </option>
                                                            @endforeach
                                                        </select>
                                                    </div>
                                                    <div class="col-md-2">
                                                        <label class="form-label">ลำดับ</label>
                                                        <input type="number" min="0" name="sort_order" class="form-control" value="{{ $video->sort_order }}">
                                                    </div>
                                                    <div class="col-md-6">
                                                        <label class="form-label">ชื่อวิดีโอคอร์ส</label>
                                                        <input type="text" name="video_title" class="form-control" value="{{ $video->video_title }}" required>
                                                    </div>
                                                    <div class="col-md-6">
                                                        <label class="form-label">ชื่อเนื้อหาไฟล์ video</label>
                                                        <input type="text" name="content_name" class="form-control" value="{{ $video->content_name }}" required>
                                                    </div>
                                                    <div class="col-md-3">
                                                        <label class="form-label">ความยาววิดีโอ</label>
                                                        <input type="text" name="duration" class="form-control" value="{{ $video->duration }}">
                                                    </div>
                                                    <div class="col-md-3">
                                                        <label class="form-label">ไฟล์วิดีโอ (แทนที่)</label>
                                                        <input type="file" name="video_file" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*">
                                                    </div>
                                                    <div class="col-12">
                                                        <label class="form-label">คำอธิบายวิดีโอคอร์ส</label>
                                                        <textarea name="description" class="form-control" rows="3">{{ $video->description }}</textarea>
                                                    </div>
                                                </div>
                                                <div class="d-flex justify-content-end mt-3 gap-2">
                                                    <a href="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($video->video_path) }}" target="_blank" rel="noopener" class="btn btn-light-info">เปิดวิดีโอ</a>
                                                    <button class="btn btn-light-primary" type="submit">บันทึกการแก้ไข</button>
                                                </div>
                                            </form>
                                            <div class="d-flex justify-content-end mt-2">
                                                <form method="POST" action="{{ route('teacher.courses.videos.destroy', [$course, $video]) }}" onsubmit="return confirm('ยืนยันการลบวิดีโอนี้?');">
                                                    @csrf
                                                    @method('DELETE')
                                                    <button class="btn btn-light-danger" type="submit">ลบวิดีโอ</button>
                                                </form>
                                            </div>
                                        </div>
                                    @empty
                                        <div class="text-muted mt-4">หัวข้อนี้ยังไม่มีวิดีโอ</div>
                                    @endforelse
                                </div>
                            @empty
                                <div class="text-muted mb-4">ยังไม่มีหัวข้อการเรียน</div>
                            @endforelse

                            @if ($orphanVideos->isNotEmpty())
                                <div class="border rounded p-4">
                                    <h4 class="mb-4">วิดีโอที่ยังไม่ระบุหัวข้อ</h4>
                                    @foreach ($orphanVideos as $video)
                                        <div class="border rounded p-4 mb-4">
                                            <form method="POST" action="{{ route('teacher.courses.videos.update', [$course, $video]) }}" enctype="multipart/form-data">
                                                @csrf
                                                @method('PUT')
                                                <div class="row g-4">
                                                    <div class="col-md-4">
                                                        <label class="form-label">หัวข้อการเรียน</label>
                                                        <select name="course_section_id" class="form-select">
                                                            <option value="">ไม่ระบุหัวข้อ</option>
                                                            @foreach ($course->sections as $section)
                                                                <option value="{{ $section->id }}">[{{ $section->sort_order }}] {{ $section->title }}</option>
                                                            @endforeach
                                                        </select>
                                                    </div>
                                                    <div class="col-md-2">
                                                        <label class="form-label">ลำดับ</label>
                                                        <input type="number" min="0" name="sort_order" class="form-control" value="{{ $video->sort_order }}">
                                                    </div>
                                                    <div class="col-md-6">
                                                        <label class="form-label">ชื่อวิดีโอคอร์ส</label>
                                                        <input type="text" name="video_title" class="form-control" value="{{ $video->video_title }}" required>
                                                    </div>
                                                    <div class="col-md-6">
                                                        <label class="form-label">ชื่อเนื้อหาไฟล์ video</label>
                                                        <input type="text" name="content_name" class="form-control" value="{{ $video->content_name }}" required>
                                                    </div>
                                                    <div class="col-md-3">
                                                        <label class="form-label">ความยาววิดีโอ</label>
                                                        <input type="text" name="duration" class="form-control" value="{{ $video->duration }}">
                                                    </div>
                                                    <div class="col-md-3">
                                                        <label class="form-label">ไฟล์วิดีโอ (แทนที่)</label>
                                                        <input type="file" name="video_file" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*">
                                                    </div>
                                                    <div class="col-12">
                                                        <label class="form-label">คำอธิบายวิดีโอคอร์ส</label>
                                                        <textarea name="description" class="form-control" rows="3">{{ $video->description }}</textarea>
                                                    </div>
                                                </div>
                                                <div class="d-flex justify-content-end mt-3 gap-2">
                                                    <a href="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($video->video_path) }}" target="_blank" rel="noopener" class="btn btn-light-info">เปิดวิดีโอ</a>
                                                    <button class="btn btn-light-primary" type="submit">บันทึกการแก้ไข</button>
                                                </div>
                                            </form>
                                            <div class="d-flex justify-content-end mt-2">
                                                <form method="POST" action="{{ route('teacher.courses.videos.destroy', [$course, $video]) }}" onsubmit="return confirm('ยืนยันการลบวิดีโอนี้?');">
                                                    @csrf
                                                    @method('DELETE')
                                                    <button class="btn btn-light-danger" type="submit">ลบวิดีโอ</button>
                                                </form>
                                            </div>
                                        </div>
                                    @endforeach
                                </div>
                            @endif
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
