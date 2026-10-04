@extends('admin.layouts.template')

@section('title')
    <title>สร้างเสียงตอบรับ</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">สร้างเสียงตอบรับ</h1>
                    <a href="{{ route('admin.testimonials.index') }}" class="btn btn-light">กลับไปรายการ</a>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card">
                        <div class="card-body py-8">
                            <form method="POST" action="{{ route('admin.testimonials.store') }}" enctype="multipart/form-data">
                                @csrf
                                @include('admin.testimonials.partials.form', ['testimonial' => null, 'submitText' => 'บันทึก'])
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

