@extends('admin.layouts.template')

@section('title')
    <title>แก้ไขเสียงตอบรับ</title>
@stop

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">แก้ไขเสียงตอบรับ</h1>
                    <a href="{{ route('admin.testimonials.index') }}" class="btn btn-light">กลับไปรายการ</a>
                </div>
            </div>
            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card">
                        <div class="card-body py-8">
                            <form method="POST" action="{{ route('admin.testimonials.update', $testimonial) }}"
                                enctype="multipart/form-data">
                                @csrf
                                @method('PUT')
                                @include('admin.testimonials.partials.form', ['testimonial' => $testimonial, 'submitText' => 'บันทึกการแก้ไข'])
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

