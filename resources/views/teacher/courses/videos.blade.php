@extends('teacher.layouts.template')

@section('title')
    <title>จัดการวิดีโอคอร์ส</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">จัดการวิดีโอคอร์ส</h1>
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
                        <div class="card-body py-6">
                            <h4 class="mb-4">เพิ่มวิดีโอใหม่</h4>
                            <form method="POST" action="{{ route('teacher.courses.videos.store', $course) }}" enctype="multipart/form-data">
                                @csrf
                                <div class="row g-4">
                                    <div class="col-md-6">
                                        <label class="form-label">ชื่อวิดีโอคอร์ส</label>
                                        <input type="text" name="video_title" class="form-control" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">ชื่อเนื้อหาไฟล์ video</label>
                                        <input type="text" name="content_name" class="form-control" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">ความยาววิดีโอ</label>
                                        <input type="text" name="duration" class="form-control" placeholder="เช่น 13:58">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">ไฟล์วิดีโอ (ไม่เกิน 1GB)</label>
                                        <input type="file" name="video_file" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*" required>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label">คำอธิบายวิดีโอคอร์ส</label>
                                        <textarea name="description" class="form-control" rows="4"></textarea>
                                    </div>
                                </div>
                                <div class="text-end mt-4">
                                    <button class="btn btn-primary">เพิ่มวิดีโอ</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-body py-6">
                            <h4 class="mb-4">รายการวิดีโอ</h4>
                            @forelse ($course->videos as $video)
                                <div class="border rounded p-4 mb-4">
                                    <form method="POST" action="{{ route('teacher.courses.videos.update', [$course, $video]) }}" enctype="multipart/form-data">
                                        @csrf
                                        @method('PUT')
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">ชื่อวิดีโอคอร์ส</label>
                                                <input type="text" name="video_title" class="form-control" value="{{ $video->video_title }}" required>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">ชื่อเนื้อหาไฟล์ video</label>
                                                <input type="text" name="content_name" class="form-control" value="{{ $video->content_name }}" required>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">ความยาววิดีโอ</label>
                                                <input type="text" name="duration" class="form-control" value="{{ $video->duration }}">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">แทนที่ไฟล์วิดีโอ</label>
                                                <input type="file" name="video_file" class="form-control" accept=".mp4,.mov,.avi,.webm,.mkv,video/*">
                                            </div>
                                            <div class="col-12">
                                                <label class="form-label">คำอธิบายวิดีโอคอร์ส</label>
                                                <textarea name="description" class="form-control" rows="3">{{ $video->description }}</textarea>
                                            </div>
                                        </div>
                                        <div class="d-flex justify-content-end gap-2 mt-4">
                                            <a href="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($video->video_path) }}" target="_blank" rel="noopener" class="btn btn-light-primary">เปิดไฟล์</a>
                                            <button class="btn btn-primary">บันทึก</button>
                                        </div>
                                    </form>
                                    <form method="POST" action="{{ route('teacher.courses.videos.destroy', [$course, $video]) }}" class="text-end mt-2" onsubmit="return confirm('ยืนยันการลบวิดีโอนี้?')">
                                        @csrf
                                        @method('DELETE')
                                        <button class="btn btn-light-danger">ลบวิดีโอ</button>
                                    </form>
                                </div>
                            @empty
                                <p class="text-muted mb-0">ยังไม่มีวิดีโอในคอร์สนี้</p>
                            @endforelse
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
