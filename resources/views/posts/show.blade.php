@extends('layouts.auth')

@section('content')
    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li class="active">บทความ</li>
                </ul>
                <h2 class="title">อ่าน<span>บทความ</span></h2>
            </div>
        </div>

        <div class="shape-icon-box">
            <img class="icon-shape-1 animation-left" src="{{ asset('assets/images/shape/shape-5.png') }}" alt="Shape">
            <div class="box-content">
                <div class="box-wrapper">
                    <i class="flaticon-open-book"></i>
                </div>
            </div>
            <img class="icon-shape-2" src="{{ asset('assets/images/shape/shape-6.png') }}" alt="Shape">
        </div>

        <img class="shape-3" src="{{ asset('assets/images/shape/shape-24.png') }}" alt="Shape">
        <img class="shape-author" src="{{ asset('assets/images/author/author-11.jpg') }}" alt="Shape">
    </div>

    <div class="section section-padding">
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-lg-10">
                    <div class="single-blog">
                        @if ($post->cover_path)
                            <div class="blog-image mb-4">
                                <img src="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($post->cover_path) }}"
                                    alt="{{ $post->title }}">
                            </div>
                        @endif

                        <div class="blog-content p-0">
                            <h2 class="title mb-3">{{ $post->title }}</h2>
                            <div class="blog-meta mb-4">
                                <span><i class="icofont-calendar"></i> {{ $post->published_at?->format('d/m/Y H:i') }}</span>
                                <span><i class="icofont-user-alt-7"></i> {{ $post->author?->name ?? 'Admin' }}</span>
                            </div>
                            <div class="entry-content">
                                {!! $post->content_html !!}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

