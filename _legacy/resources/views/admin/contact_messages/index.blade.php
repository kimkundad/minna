@extends('admin.layouts.template')

@section('title')
    <title>ข้อความติดต่อ</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">ข้อความจากฟอร์มติดต่อ</h1>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card mb-6">
                        <div class="card-body py-4">
                            <form method="GET" action="{{ route('admin.contact_messages.index') }}" class="row g-3">
                                <div class="col-md-11">
                                    <label class="form-label">ค้นหา</label>
                                    <input type="text" name="q" class="form-control" value="{{ $q }}"
                                        placeholder="ชื่อ, อีเมล, หัวข้อ, ข้อความ">
                                </div>
                                <div class="col-md-1 d-flex align-items-end">
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
                                            <th style="width: 70px;">ID</th>
                                            <th>ชื่อ</th>
                                            <th>อีเมล</th>
                                            <th>หัวข้อ</th>
                                            <th>ข้อความ</th>
                                            <th style="width: 170px;">วันที่ส่ง</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($messages as $item)
                                            <tr>
                                                <td>{{ $item->id }}</td>
                                                <td>{{ $item->name }}</td>
                                                <td>{{ $item->email }}</td>
                                                <td>{{ $item->subject }}</td>
                                                <td>{{ \Illuminate\Support\Str::limit((string) $item->message, 140) }}</td>
                                                <td>{{ $item->created_at?->format('d/m/Y H:i') }}</td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="6" class="text-center text-muted">ยังไม่มีข้อความติดต่อ</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>

                            <div class="mt-4">{{ $messages->links() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

