@extends('teacher.layouts.template')

@section('title')
    <title>รายชื่อนักเรียนที่เคยสั่งซื้อ</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">รายชื่อนักเรียนที่เคยสั่งซื้อคอร์สของฉัน</h1>
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
                                            <th>ชื่อ</th>
                                            <th>อีเมล</th>
                                            <th>จำนวนคำสั่งซื้อ</th>
                                            <th>คำสั่งซื้อล่าสุด</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($students as $student)
                                            <tr>
                                                <td>{{ $student->name }}</td>
                                                <td>{{ $student->email }}</td>
                                                <td>{{ (int) $student->orders_count }}</td>
                                                <td>{{ $student->last_order_at ? \Illuminate\Support\Carbon::parse($student->last_order_at)->format('d/m/Y H:i') : '-' }}</td>
                                            </tr>
                                        @empty
                                            <tr>
                                                <td colspan="4" class="text-center text-muted">ยังไม่มีนักเรียนที่สั่งซื้อคอร์ส</td>
                                            </tr>
                                        @endforelse
                                    </tbody>
                                </table>
                            </div>
                            <div class="mt-4">{{ $students->links() }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
