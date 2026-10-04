@extends('admin.layouts.template')

@section('title')
    <title>แก้ไขบทความ</title>
@stop

@section('stylesheet')
    <style>
        .ProseMirror {
            min-height: 360px;
            outline: none;
            line-height: 1.8;
        }

        .ProseMirror p {
            margin-bottom: 0.8rem;
        }

        .ProseMirror h2 {
            margin: 1rem 0 0.75rem;
            font-size: 1.35rem;
            font-weight: 700;
        }

        .ProseMirror img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 10px 0;
        }

        .ProseMirror ul,
        .ProseMirror ol {
            padding-left: 1.25rem;
        }
    </style>
@endsection

@section('content')
    <div class="app-main flex-column flex-row-fluid" id="kt_app_main">
        <div class="d-flex flex-column flex-column-fluid">
            <div class="app-toolbar py-3 py-lg-6">
                <div class="app-container container-xxl d-flex flex-stack">
                    <h1 class="page-heading text-dark fw-bold fs-3 my-0">แก้ไขบทความ</h1>
                    <a href="{{ route('admin.posts.index') }}" class="btn btn-light">กลับไปหน้ารายการ</a>
                </div>
            </div>

            <div class="app-content flex-column-fluid">
                <div class="app-container container-xxl">
                    <div class="card">
                        <div class="card-body py-8">
                            <form method="POST" action="{{ route('admin.posts.update', $post) }}" enctype="multipart/form-data"
                                id="post-form">
                                @csrf
                                @method('PUT')
                                @include('admin.posts._form', ['submitText' => 'บันทึกการแก้ไข'])
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

@section('scripts')
    @include('admin.posts._tiptap-script')
@endsection

