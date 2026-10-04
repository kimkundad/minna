@extends('teacher.layouts.template')

@section('title')
    <title>คำสั่งซื้อคอร์สของฉัน</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">คำสั่งซื้อคอร์สของฉัน</h1>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card">
                        <div class="card-body py-3">
                            <div class="table-responsive">
                                <table class="table table-row-bordered gy-4">
                                    <thead>
                                        <tr>
                                            <th>เลขที่คำสั่งซื้อ</th>
                                            <th>นักเรียน</th>
                                            <th>คอร์ส</th>
                                            <th>ยอดเงิน</th>
                                            <th>สถานะ</th>
                                            <th>วันที่สร้าง</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($orders as $order)
                                            <tr>
                                                <td>{{ $order->order_no }}</td>
                                                <td>
                                                    <div>{{ $order->user?->name ?? '-' }}</div>
                                                    <small class="text-muted">{{ $order->user?->email }}</small>
                                                </td>
                                                <td>{{ $order->course?->title ?? '-' }}</td>
                                                <td>{{ number_format((float) $order->amount, 2) }} {{ $order->currency }}</td>
                                                <td>
                                                    <span class="badge badge-light-{{ $order->status === 'paid' ? 'success' : ($order->status === 'failed' ? 'danger' : 'warning') }}">
                                                        {{ $order->status }}
                                                    </span>
                                                </td>
                                                <td>{{ optional($order->created_at)->format('d/m/Y H:i') }}</td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="6" class="text-center text-muted">ยังไม่มีคำสั่งซื้อ</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4">{{ $orders->links() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
