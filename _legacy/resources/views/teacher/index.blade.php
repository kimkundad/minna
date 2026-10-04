@extends('teacher.layouts.template')

@section('title')
    <title>Teacher Dashboard</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">Dashboard ผู้สอน</h1>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="row g-5 g-xl-8">
                        <div class="col-xl-3">
                            <div class="card card-xl-stretch mb-xl-8">
                                <div class="card-body">
                                    <div class="text-gray-900 fw-bold fs-2">{{ $courseCount }}</div>
                                    <div class="text-muted fw-semibold">คอร์สทั้งหมดของฉัน</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-xl-3">
                            <div class="card card-xl-stretch mb-xl-8">
                                <div class="card-body">
                                    <div class="text-warning fw-bold fs-2">{{ $pendingCourseCount }}</div>
                                    <div class="text-muted fw-semibold">คอร์สรอตรวจสอบ</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-xl-3">
                            <div class="card card-xl-stretch mb-xl-8">
                                <div class="card-body">
                                    <div class="text-primary fw-bold fs-2">{{ $orderCount }}</div>
                                    <div class="text-muted fw-semibold">คำสั่งซื้อทั้งหมด</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-xl-3">
                            <div class="card card-xl-stretch mb-xl-8">
                                <div class="card-body">
                                    <div class="text-success fw-bold fs-2">{{ $paidOrderCount }}</div>
                                    <div class="text-muted fw-semibold">คำสั่งซื้อชำระแล้ว</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-body">
                            <p class="mb-0">
                                ใช้เมนูด้านซ้ายเพื่อจัดการคอร์สของคุณ ดูคำสั่งซื้อ และจัดการข้อมูลโปรไฟล์
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
