@extends('teacher.layouts.template')

@section('title')
    <title>ตั้งค่าข้อมูลผู้สอน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">ตั้งค่าข้อมูลผู้สอน</h1>
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

                    <div class="card">
                        <div class="card-body py-6">
                            <form method="POST" action="{{ route('teacher.settings.update') }}" enctype="multipart/form-data">
                                @csrf
                                @method('PUT')

                                <div class="row g-4 mb-4">
                                    <div class="col-md-3 text-center">
                                        <img src="{{ $teacher->profile_photo_url }}" alt="{{ $teacher->name }}"
                                            class="rounded-circle border" style="width: 140px; height: 140px; object-fit: cover;">
                                        <div class="mt-3">
                                            <input type="file" name="profile_photo" class="form-control" accept="image/*">
                                        </div>
                                    </div>
                                    <div class="col-md-9">
                                        <div class="mb-3">
                                            <label class="form-label">ชื่อที่แสดง</label>
                                            <input type="text" name="name" class="form-control" value="{{ old('name', $teacher->name) }}" required>
                                        </div>
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">ชื่อจริง</label>
                                                <input type="text" name="first_name" class="form-control" value="{{ old('first_name', $teacher->first_name) }}">
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">นามสกุล</label>
                                                <input type="text" name="last_name" class="form-control" value="{{ old('last_name', $teacher->last_name) }}">
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="row g-4 mb-4">
                                    <div class="col-md-6">
                                        <label class="form-label">อีเมล (แก้ไขไม่ได้)</label>
                                        <input type="email" class="form-control" value="{{ $teacher->email }}" disabled>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">เบอร์โทร (แก้ไขไม่ได้)</label>
                                        <input type="text" class="form-control" value="{{ $teacher->phone ?? $teacher->phone_national }}" disabled>
                                    </div>
                                </div>

                                <div class="row g-4 mb-4">
                                    <div class="col-md-4">
                                        <label class="form-label">วันเกิด</label>
                                        <input type="date" name="birthdate" class="form-control" value="{{ old('birthdate', optional($teacher->birthdate)->format('Y-m-d')) }}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">เพศ</label>
                                        <select name="gender" class="form-select">
                                            <option value="">ไม่ระบุ</option>
                                            <option value="female" @selected(old('gender', $teacher->gender) === 'female')>หญิง</option>
                                            <option value="male" @selected(old('gender', $teacher->gender) === 'male')>ชาย</option>
                                            <option value="other" @selected(old('gender', $teacher->gender) === 'other')>อื่น ๆ</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Line ID</label>
                                        <input type="text" name="line_id" class="form-control" value="{{ old('line_id', $teacher->line_id) }}">
                                    </div>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label">ที่อยู่</label>
                                    <input type="text" name="address" class="form-control" value="{{ old('address', $teacher->address) }}">
                                </div>

                                <div class="text-end">
                                    <button type="submit" class="btn btn-primary">บันทึกข้อมูล</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
