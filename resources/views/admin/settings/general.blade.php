@extends('admin.layouts.template')

@section('title')
    <title>ตั้งค่าเว็บไซต์</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">ตั้งค่าเว็บไซต์</h1>
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
                            <h3 class="card-title">ข้อมูลติดต่อและโซเชียล</h3>
                        </div>
                        <div class="card-body">
                            <form method="POST" action="{{ route('admin.settings.general.update') }}">
                                @csrf
                                @method('PUT')
                                <div class="row g-4">
                                    <div class="col-md-6">
                                        <label class="form-label">เบอร์โทร</label>
                                        <input type="text" class="form-control" name="contact_phone"
                                            value="{{ old('contact_phone', $settings['contact_phone'] ?? '') }}"
                                            placeholder="เช่น 0958467417 หรือ (970) 262-1413">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">อีเมล</label>
                                        <input type="email" class="form-control" name="contact_email"
                                            value="{{ old('contact_email', $settings['contact_email'] ?? '') }}"
                                            placeholder="เช่น contact@example.com">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Facebook URL</label>
                                        <input type="url" class="form-control" name="facebook_url"
                                            value="{{ old('facebook_url', $settings['facebook_url'] ?? '') }}"
                                            placeholder="https://facebook.com/yourpage">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Twitter/X URL</label>
                                        <input type="url" class="form-control" name="twitter_url"
                                            value="{{ old('twitter_url', $settings['twitter_url'] ?? '') }}"
                                            placeholder="https://x.com/yourname">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Skype URL</label>
                                        <input type="url" class="form-control" name="skype_url"
                                            value="{{ old('skype_url', $settings['skype_url'] ?? '') }}"
                                            placeholder="https://join.skype.com/...">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Instagram URL</label>
                                        <input type="url" class="form-control" name="instagram_url"
                                            value="{{ old('instagram_url', $settings['instagram_url'] ?? '') }}"
                                            placeholder="https://instagram.com/yourname">
                                    </div>
                                </div>
                                <div class="text-end mt-4">
                                    <button class="btn btn-primary">บันทึกการตั้งค่า</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">รายชื่อผู้ติดตาม (Subscribe)</h3>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-row-bordered align-middle">
                                    <thead>
                                        <tr class="fw-bold text-muted">
                                            <th style="width: 80px;">#</th>
                                            <th>อีเมล</th>
                                            <th style="width: 220px;">วันที่สมัคร</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($subscribers as $subscriber)
                                            <tr>
                                                <td>{{ $subscriber->id }}</td>
                                                <td>{{ $subscriber->email }}</td>
                                                <td>{{ $subscriber->created_at?->format('d/m/Y H:i') }}</td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="3" class="text-center text-muted">ยังไม่มีข้อมูลผู้ติดตาม</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4">
                                {{ $subscribers->links() }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

