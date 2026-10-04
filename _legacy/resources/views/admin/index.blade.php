@extends('admin.layouts.template')

@section('title')
    <title>Admin Dashboard</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <div class="page-title d-flex flex-column justify-content-center">
                        <h1 class="page-heading text-dark fw-bold fs-3 my-0">ภาพรวมระบบแอดมิน</h1>
                        <div class="text-muted fs-7">อัปเดตล่าสุด: {{ now()->format('d/m/Y H:i') }}</div>
                    </div>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="row g-5 g-xl-8 mb-5">
                        <div class="col-xl-3 col-md-6">
                            <div class="card card-xl-stretch">
                                <div class="card-body">
                                    <div class="text-gray-600 fw-semibold fs-7">นักเรียนทั้งหมด</div>
                                    <div class="fs-2hx fw-bold text-dark">{{ number_format($studentsCount) }}</div>
                                    <div class="mt-2"><a href="{{ route('admin.students.index') }}" class="btn btn-sm btn-light-primary">ดูรายชื่อ</a></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-xl-3 col-md-6">
                            <div class="card card-xl-stretch">
                                <div class="card-body">
                                    <div class="text-gray-600 fw-semibold fs-7">ผู้สอนทั้งหมด</div>
                                    <div class="fs-2hx fw-bold text-dark">{{ number_format($teachersCount) }}</div>
                                    <div class="mt-2"><a href="{{ route('admin.teachers.index') }}" class="btn btn-sm btn-light-primary">ดูรายชื่อ</a></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-xl-3 col-md-6">
                            <div class="card card-xl-stretch">
                                <div class="card-body">
                                    <div class="text-gray-600 fw-semibold fs-7">คอร์สทั้งหมด</div>
                                    <div class="fs-2hx fw-bold text-dark">{{ number_format($coursesCount) }}</div>
                                    <div class="text-warning fw-semibold fs-7 mt-1">รอตรวจสอบ {{ number_format($pendingCoursesCount) }} คอร์ส</div>
                                    <div class="mt-2"><a href="{{ route('admin.courses.index') }}" class="btn btn-sm btn-light-primary">จัดการคอร์ส</a></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-xl-3 col-md-6">
                            <div class="card card-xl-stretch">
                                <div class="card-body">
                                    <div class="text-gray-600 fw-semibold fs-7">ยอดขายชำระแล้ว</div>
                                    <div class="fs-2hx fw-bold text-success">{{ number_format($totalPaidAmount, 2) }}</div>
                                    <div class="text-gray-600 fw-semibold fs-7 mt-1">Paid {{ number_format($paidOrdersCount) }} | Pending {{ number_format($pendingOrdersCount) }}</div>
                                    <div class="mt-2"><a href="{{ route('admin.orders.index') }}" class="btn btn-sm btn-light-primary">ดูคำสั่งซื้อ</a></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row g-5 g-xl-8 mb-5">
                        <div class="col-xl-8">
                            <div class="card card-xl-stretch">
                                <div class="card-header border-0">
                                    <h3 class="card-title fw-bold text-dark">รายได้ 6 เดือนล่าสุด</h3>
                                </div>
                                <div class="card-body pt-0">
                                    <div class="table-responsive">
                                        <table class="table table-row-bordered align-middle">
                                            <thead>
                                                <tr class="fw-bold text-muted">
                                                    <th>เดือน</th>
                                                    <th class="text-end">รายได้ (Paid)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @forelse ($monthlyRevenue as $row)
                                                    <tr>
                                                        <td>{{ $row->ym }}</td>
                                                        <td class="text-end">{{ number_format((float) $row->total, 2) }}</td>
                                                    </tr>
                                                @empty
                                                    <tr>
                                                        <td colspan="2" class="text-center text-muted">ยังไม่มีข้อมูลรายได้</td>
                                                    </tr>
                                                @endforelse
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-xl-4">
                            <div class="card card-xl-stretch">
                                <div class="card-header border-0">
                                    <h3 class="card-title fw-bold text-dark">สรุปคำสั่งซื้อ</h3>
                                </div>
                                <div class="card-body pt-0">
                                    <div class="d-flex justify-content-between mb-3">
                                        <span class="text-gray-600">ทั้งหมด</span>
                                        <span class="fw-bold">{{ number_format($ordersCount) }}</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-3">
                                        <span class="text-gray-600">ชำระแล้ว</span>
                                        <span class="fw-bold text-success">{{ number_format($paidOrdersCount) }}</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-3">
                                        <span class="text-gray-600">รอชำระ</span>
                                        <span class="fw-bold text-warning">{{ number_format($pendingOrdersCount) }}</span>
                                    </div>
                                    <a href="{{ route('admin.orders.index') }}" class="btn btn-light-primary w-100 mt-2">ไปหน้าคำสั่งซื้อ</a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row g-5 g-xl-8">
                        <div class="col-xl-8">
                            <div class="card card-xl-stretch">
                                <div class="card-header border-0">
                                    <h3 class="card-title fw-bold text-dark">คำสั่งซื้อล่าสุด</h3>
                                </div>
                                <div class="card-body pt-0">
                                    <div class="table-responsive">
                                        <table class="table table-row-bordered align-middle">
                                            <thead>
                                                <tr class="fw-bold text-muted">
                                                    <th>Order</th>
                                                    <th>นักเรียน</th>
                                                    <th>คอร์ส</th>
                                                    <th>สถานะ</th>
                                                    <th class="text-end">ยอดเงิน</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @forelse ($latestOrders as $item)
                                                    <tr>
                                                        <td>{{ $item->order_no }}</td>
                                                        <td>{{ $item->user?->name ?? '-' }}</td>
                                                        <td>{{ $item->course?->title ?? '-' }}</td>
                                                        <td>
                                                            <span class="badge badge-light-{{ $item->status === 'paid' ? 'success' : ($item->status === 'failed' ? 'danger' : 'warning') }}">
                                                                {{ $item->status }}
                                                            </span>
                                                        </td>
                                                        <td class="text-end">{{ number_format((float) $item->amount, 2) }} {{ $item->currency }}</td>
                                                    </tr>
                                                @empty
                                                    <tr>
                                                        <td colspan="5" class="text-center text-muted">ยังไม่มีคำสั่งซื้อ</td>
                                                    </tr>
                                                @endforelse
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="col-xl-4">
                            <div class="card card-xl-stretch">
                                <div class="card-header border-0">
                                    <h3 class="card-title fw-bold text-dark">ใบสมัครผู้สอนล่าสุด</h3>
                                </div>
                                <div class="card-body pt-0">
                                    @forelse ($latestTeacherApplications as $app)
                                        <div class="d-flex align-items-center justify-content-between py-3 border-bottom">
                                            <div>
                                                <div class="fw-bold">{{ $app->name }}</div>
                                                <div class="text-muted fs-7">{{ $app->email }}</div>
                                            </div>
                                            <span class="badge badge-light-{{ $app->status === 'approved' ? 'success' : ($app->status === 'rejected' ? 'danger' : 'warning') }}">
                                                {{ $app->status }}
                                            </span>
                                        </div>
                                    @empty
                                        <div class="text-muted">ยังไม่มีใบสมัครผู้สอน</div>
                                    @endforelse
                                    <a href="{{ route('admin.teacher_applications.index') }}" class="btn btn-light-primary w-100 mt-4">ไปหน้าใบสมัครผู้สอน</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

