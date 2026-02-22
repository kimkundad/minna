@extends('layouts.auth')

@section('content')
    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">

        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ route('welcome') }}">Home</a></li>
                    <li class="active">บทความ</li>
                </ul>
                <h2 class="title">บทความ<span>ล่าสุด</span></h2>
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

    <div class="section section-padding mt-n1">
        <div class="container">
            <div class="blog-wrapper">
                <div class="row">
                    @forelse ($posts as $post)
                        @php
                            $coverUrl = $post->cover_path
                                ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($post->cover_path)
                                : asset('assets/images/blog/blog-01.jpg');
                        @endphp
                        <div class="col-lg-4 col-md-6">
                            <div class="single-blog">
                                <div class="blog-image">
                                    <a href="{{ route('posts.show', $post) }}"><img src="{{ $coverUrl }}" alt="{{ $post->title }}"></a>
                                </div>
                                <div class="blog-content">
                                    <div class="blog-author">
                                        <div class="author">
                                            <div class="author-thumb">
                                                <a href="{{ route('posts.show', $post) }}"><img
                                                        src="{{ asset('assets/images/author/author-01.jpg') }}" alt="Author"></a>
                                            </div>
                                            <div class="author-name"><a class="name"
                                                    href="{{ route('posts.show', $post) }}">{{ $post->author?->name ?? 'Admin' }}</a>
                                            </div>
                                        </div>
                                        <div class="tag"><a href="javascript:void(0)">บทความ</a></div>
                                    </div>

                                    <h4 class="title">
                                        <a href="{{ route('posts.show', $post) }}">
                                            {{ \Illuminate\Support\Str::limit($post->title, 75) }}
                                        </a>
                                    </h4>
                                    <div class="blog-meta">
                                        <span><i class="icofont-calendar"></i> {{ $post->published_at?->format('d/m/Y') }}</span>
                                    </div>
                                    <a href="{{ route('posts.show', $post) }}" class="btn btn-secondary btn-hover-primary">Read More</a>
                                </div>
                            </div>
                        </div>
                    @empty
                        <div class="col-12">
                            <div class="alert alert-light border">ยังไม่มีบทความ</div>
                        </div>
                    @endforelse
                </div>
            </div>

            @if ($posts->hasPages())
                <div class="page-pagination">
                    {{ $posts->links() }}
                </div>
            @endif
        </div>
    </div>
@endsection

