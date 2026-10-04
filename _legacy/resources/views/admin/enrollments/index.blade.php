@extends('admin.layouts.template')

@section('title')
    <title>คอร์สที่ลงทะเบียน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">คอร์สที่ลงทะเบียน</h1>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card mb-6">
                        <div class="card-body py-4">
                            <form method="GET" action="{{ route('admin.enrollments.index') }}" class="row g-3">
                                <div class="col-md-8">
                                    <label class="form-label">ค้นหา</label>
                                    <input
                                        type="text"
                                        name="q"
                                        class="form-control"
                                        value="{{ $q }}"
                                        placeholder="ค้นหาเลขออเดอร์, ชื่อนักเรียน, อีเมล, ชื่อคอร์ส, ชื่อผู้สอน"
                                    >
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">สถานะ</label>
                                    <select name="status" class="form-select">
                                        <option value="">ทั้งหมด</option>
                                        @foreach ($statuses as $s)
                                            <option value="{{ $s }}" @selected($status === $s)>{{ $s }}</option>
                                        @endforeach
                                    </select>
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
                                            <th>Order</th>
                                            <th>นักเรียน</th>
                                            <th>คอร์ส</th>
                                            <th>ผู้สอน</th>
                                            <th>ราคา</th>
                                            <th>สถานะ</th>
                                            <th>วันที่ชำระ</th>
                                            <th>วันที่สร้าง</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($enrollments as $item)
                                            <tr>
                                                <td>{{ $item->order_no }}</td>
                                                <td>
                                                    <div>{{ $item->user?->name ?? '-' }}</div>
                                                    <small class="text-muted">{{ $item->user?->email }}</small>
                                                </td>
                                                <td>{{ $item->course?->title ?? '-' }}</td>
                                                <td>{{ $item->course?->teacher?->name ?? '-' }}</td>
                                                <td>{{ number_format((float) $item->amount, 2) }} {{ $item->currency }}</td>
                                                <td>
                                                    <span class="badge badge-light-{{ $item->status === 'paid' ? 'success' : ($item->status === 'failed' ? 'danger' : 'warning') }}">
                                                        {{ $item->status }}
                                                    </span>
                                                </td>
                                                <td>{{ $item->paid_at?->format('d/m/Y H:i') ?? '-' }}</td>
                                                <td>{{ $item->created_at?->format('d/m/Y H:i') ?? '-' }}</td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="8" class="text-center text-muted">ยังไม่มีข้อมูลการลงทะเบียน</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4">
                                {{ $enrollments->links() }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

