@extends('layouts.auth')

@section('content')
    @php
        $sampleVideo = $course->sample_video_path
            ? \Illuminate\Support\Facades\Storage::disk('spaces')->url($course->sample_video_path)
            : null;
        $allVideos = $course->sections->flatMap(fn ($section) => $section->videos)->concat($orphanVideos);
        $lastWatchedVideo = !empty($lastWatchedVideoId) ? $allVideos->firstWhere('id', $lastWatchedVideoId) : null;
        $firstVideo = $lastWatchedVideo ?? ($course->sections->flatMap(fn ($section) => $section->videos)->first() ?? $orphanVideos->first());
        $firstVideoUrl = $firstVideo
            ? route('student.courses.videos.stream', [$course, $firstVideo])
            : $sampleVideo;
        $initialVideoTitle = $firstVideo?->video_title ?: $course->title;
        $initialVideoDescription = $firstVideo?->description ?: ($course->description ?: 'ยังไม่มีรายละเอียดวิดีโอ');
    @endphp

    <style>
        .courses-video-playlist .video-playlist .vids a.link,
        .courses-video-playlist .video-playlist .vids a.link p,
        .courses-video-playlist .video-playlist .vids a.link .total-duration {
            color: #212832 !important;
        }

        .courses-video-playlist .video-playlist .vids a.link.playing p,
        .courses-video-playlist .video-playlist .vids a.link.playing .total-duration {
            color: #309255 !important;
            font-weight: 600;
        }

        .courses-video-playlist .video-playlist .vids a.link.playing::before {
            background-color: #309255;
            border-color: #acd6bc;
        }

        .courses-video-playlist .accordion-collapse.collapse {
            visibility: visible !important;
        }

        .courses-video-playlist .accordion-collapse.collapse:not(.show) {
            display: none;
        }

        .courses-video-player .vidcontainer {
            height: auto !important;
            min-height: 340px;
        }

        .courses-video-player video {
            height: auto !important;
            max-height: 690px;
            object-fit: contain;
        }

        .courses-enroll-content {
            position: relative;
            z-index: 20;
            background: #fff;
        }

        .course-progress-summary {
            margin-top: 10px;
        }

        .course-progress-summary .meta {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: #5f5f5f;
            margin-bottom: 6px;
        }

        .course-progress-summary .track {
            width: 100%;
            height: 8px;
            border-radius: 999px;
            background: #e7ece8;
            overflow: hidden;
        }

        .course-progress-summary .fill {
            height: 100%;
            border-radius: 999px;
            background: #309255;
        }

        .video-playlist .vids a.link.done p::after {
            content: " ✓";
            color: #309255;
            font-weight: 700;
        }
    </style>

    <div class="section page-banner">
        <img class="shape-1 animation-round" src="{{ asset('assets/images/shape/shape-8.png') }}" alt="Shape">
        <img class="shape-2" src="{{ asset('assets/images/shape/shape-23.png') }}" alt="Shape">
        <div class="container">
            <div class="page-banner-content">
                <ul class="breadcrumb">
                    <li><a href="{{ url('/') }}">Home</a></li>
                    <li><a href="{{ route('student.courses') }}">คอร์สเรียนของฉัน</a></li>
                    <li class="active">เข้าเรียน</li>
                </ul>
                <h2 class="title">{{ $course->title }}</h2>
            </div>
        </div>
        <div class="shape-icon-box">
            <img class="icon-shape-1 animation-left" src="{{ asset('assets/images/shape/shape-5.png') }}" alt="Shape">
            <div class="box-content"><div class="box-wrapper"><i class="flaticon-badge"></i></div></div>
            <img class="icon-shape-2" src="{{ asset('assets/images/shape/shape-6.png') }}" alt="Shape">
        </div>
        <img class="shape-3" src="{{ asset('assets/images/shape/shape-24.png') }}" alt="Shape">
        <img class="shape-author" src="{{ asset('assets/images/author/author-11.jpg') }}" alt="Shape">
    </div>

    <div class="section">
        <div class="courses-enroll-wrapper">
            <div class="courses-video-player">
                <div class="vidcontainer">
                    @if ($firstVideoUrl)
                        <video id="myvid" controls style="width:100%;height:auto;" preload="metadata">
                            <source src="{{ $firstVideoUrl }}">
                        </video>
                    @else
                        <div class="p-4 text-center text-muted">ยังไม่มีวิดีโอในคอร์สนี้</div>
                    @endif
                </div>

                <div class="courses-enroll-content">
                    <div class="courses-enroll-title">
                        <h2 class="title" id="current-video-title">{{ $initialVideoTitle }}</h2>
                        <p><i class="icofont-eye-alt"></i> พร้อมเรียนแล้ว</p>
                        <div class="course-progress-summary">
                            <div class="meta">
                                <span>ความคืบหน้าคอร์ส</span>
                                <span id="course-progress-text">{{ $progressPercent }}% ({{ $completedVideos }}/{{ $totalVideos }} บท)</span>
                            </div>
                            <div class="track">
                                <div class="fill" id="course-progress-fill" style="width: {{ $progressPercent }}%;"></div>
                            </div>
                        </div>
                    </div>

                    <div class="courses-enroll-tab-content">
                        <div class="overview">
                            <div class="row">
                                <div class="col-lg-4">
                                    <div class="enroll-tab-title">
                                        <h3 class="title">รายละเอียดวิดีโอ</h3>
                                    </div>
                                </div>
                                <div class="col-lg-8">
                                    <div class="enroll-tab-content">
                                        <p id="current-video-description">{{ $initialVideoDescription }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="courses-video-playlist">
                <div class="playlist-title">
                    <h3 class="title">Video Playlist</h3>
                    <span>{{ $course->sections->sum(fn ($section) => $section->videos->count()) + $orphanVideos->count() }} วิดีโอ</span>
                </div>

                <!-- Video Playlist Start  -->
                <div class="video-playlist">
                    <div class="accordion" id="videoPlaylist">
                        @forelse($course->sections as $section)
                            <div class="accordion-item">
                                <button class="collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#section-{{ $section->id }}">
                                    <p>{{ $section->title }}</p>
                                    <span class="total-duration">{{ $section->videos->count() }} วิดีโอ</span>
                                </button>
                                <div id="section-{{ $section->id }}" class="accordion-collapse collapse" data-bs-parent="#videoPlaylist">
                                    <nav class="vids">
                                        @forelse($section->videos as $video)
                                            @php
                                                $videoUrl = route('student.courses.videos.stream', [$course, $video]);
                                                $videoFormat = strtolower(pathinfo((string) $video->video_path, PATHINFO_EXTENSION));
                                            @endphp
                                            <a class="link"
                                               href="{{ $videoUrl }}"
                                               data-video-id="{{ $video->id }}"
                                               data-progress-url="{{ route('student.courses.videos.progress', [$course, $video]) }}"
                                               data-video-format="{{ $videoFormat }}"
                                               data-video-title="{{ $video->video_title ?: 'วิดีโอไม่มีชื่อ' }}"
                                               data-video-description="{{ $video->description ?: 'ยังไม่มีรายละเอียดวิดีโอ' }}">
                                                <p>{{ $video->video_title ?: 'วิดีโอไม่มีชื่อ' }}</p>
                                                <span class="total-duration">{{ $video->duration ?: '-' }}</span>
                                            </a>
                                        @empty
                                            <a class="link" href="javascript:void(0)">
                                                <p>ยังไม่มีวิดีโอในหัวข้อนี้</p>
                                                <span class="total-duration">-</span>
                                            </a>
                                        @endforelse
                                    </nav>
                                </div>
                            </div>
                        @empty
                            <div class="accordion-item">
                                <button type="button" class="collapsed" style="cursor:default;">
                                    <p>ยังไม่มีหัวข้อการเรียน</p>
                                    <span class="total-duration">0 วิดีโอ</span>
                                </button>
                            </div>
                        @endforelse

                        @if($orphanVideos->isNotEmpty())
                            <div class="accordion-item">
                                <button class="collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#section-orphan">
                                    <p>วิดีโอที่ยังไม่ระบุหัวข้อ</p>
                                    <span class="total-duration">{{ $orphanVideos->count() }} วิดีโอ</span>
                                </button>
                                <div id="section-orphan" class="accordion-collapse collapse" data-bs-parent="#videoPlaylist">
                                    <nav class="vids">
                                        @foreach($orphanVideos as $video)
                                            @php
                                                $videoUrl = route('student.courses.videos.stream', [$course, $video]);
                                                $videoFormat = strtolower(pathinfo((string) $video->video_path, PATHINFO_EXTENSION));
                                            @endphp
                                            <a class="link"
                                               href="{{ $videoUrl }}"
                                               data-video-id="{{ $video->id }}"
                                               data-progress-url="{{ route('student.courses.videos.progress', [$course, $video]) }}"
                                               data-video-format="{{ $videoFormat }}"
                                               data-video-title="{{ $video->video_title ?: 'วิดีโอไม่มีชื่อ' }}"
                                               data-video-description="{{ $video->description ?: 'ยังไม่มีรายละเอียดวิดีโอ' }}">
                                                <p>{{ $video->video_title ?: 'วิดีโอไม่มีชื่อ' }}</p>
                                                <span class="total-duration">{{ $video->duration ?: '-' }}</span>
                                            </a>
                                        @endforeach
                                    </nav>
                                </div>
                            </div>
                        @endif
                    </div>
                </div>
                <!-- Video Playlist End  -->
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function () {
            const progressMap = @json($videoProgressMap ?? []);
            const completedMap = @json($completedVideoIdMap ?? []);
            const csrfToken = '{{ csrf_token() }}';
            const titleEl = document.getElementById('current-video-title');
            const descriptionEl = document.getElementById('current-video-description');
            const progressTextEl = document.getElementById('course-progress-text');
            const progressFillEl = document.getElementById('course-progress-fill');
            const videoEl = document.getElementById('myvid');
            const allLinks = Array.from(document.querySelectorAll('.video-playlist .vids a.link'));
            let currentVideoId = null;
            let currentProgressUrl = null;
            let lastSavedSecond = -1;
            let hls = null;
            const totalVideos = allLinks.filter(function (link) {
                return !!link.getAttribute('data-video-id');
            }).length;

            function parseSavedSecond(videoId) {
                if (!videoId) return 0;
                const value = progressMap[String(videoId)] ?? progressMap[videoId];
                const second = Number(value || 0);
                return Number.isFinite(second) ? Math.max(0, Math.floor(second)) : 0;
            }

            function seekToSavedPosition(videoId) {
                if (!videoEl || !videoId) return;
                const savedSecond = parseSavedSecond(videoId);
                if (savedSecond <= 0) return;

                const applySeek = function () {
                    try {
                        const duration = Number(videoEl.duration || 0);
                        videoEl.currentTime = duration > 1 ? Math.min(savedSecond, Math.max(0, duration - 1)) : savedSecond;
                    } catch (e) {
                    }
                    videoEl.removeEventListener('loadedmetadata', applySeek);
                };

                if (videoEl.readyState >= 1) {
                    applySeek();
                } else {
                    videoEl.addEventListener('loadedmetadata', applySeek);
                }
            }

            function syncCurrentInfo(link, applyResume) {
                if (!link) return;

                const videoId = link.getAttribute('data-video-id');
                currentVideoId = videoId;
                currentProgressUrl = link.getAttribute('data-progress-url');
                lastSavedSecond = -1;

                const title = link.getAttribute('data-video-title');
                const description = link.getAttribute('data-video-description');

                if (titleEl && title) {
                    titleEl.textContent = title;
                }

                if (descriptionEl) {
                    descriptionEl.textContent = description || 'ยังไม่มีรายละเอียดวิดีโอ';
                }

                if (applyResume) {
                    setTimeout(function () {
                        seekToSavedPosition(videoId);
                    }, 120);
                }
            }

            function setPlayingLink(link) {
                allLinks.forEach(function (item) { item.classList.remove('playing'); });
                if (link) {
                    link.classList.add('playing');
                }
            }

            function destroyHls() {
                if (hls) {
                    hls.destroy();
                    hls = null;
                }
            }

            function playVideo(link, autoPlay) {
                if (!videoEl || !link) return;

                const sourceUrl = link.getAttribute('href');
                const format = (link.getAttribute('data-video-format') || '').toLowerCase();
                const isHls = format === 'm3u8';

                destroyHls();

                if (isHls && window.Hls && window.Hls.isSupported()) {
                    hls = new window.Hls();
                    hls.loadSource(sourceUrl);
                    hls.attachMedia(videoEl);
                    hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
                        if (autoPlay) {
                            videoEl.play().catch(function () {});
                        }
                    });
                } else {
                    videoEl.src = sourceUrl;
                    videoEl.load();
                    if (autoPlay) {
                        videoEl.play().catch(function () {});
                    }
                }
            }

            function saveProgress(force) {
                if (!videoEl || !currentVideoId || !currentProgressUrl) return;

                const position = Math.max(0, Math.floor(Number(videoEl.currentTime || 0)));
                const duration = Math.max(0, Math.floor(Number(videoEl.duration || 0)));

                if (position <= 0) return;
                if (!force && Math.abs(position - lastSavedSecond) < 10) return;
                lastSavedSecond = position;

                const completed = duration > 0 ? (position / duration) >= 0.95 : false;
                const payload = {
                    position_seconds: position,
                    duration_seconds: duration || null,
                    completed: completed
                };

                if (completed) {
                    completedMap[String(currentVideoId)] = Number(currentVideoId);
                    const currentLink = document.querySelector('.video-playlist .vids a.link.playing');
                    if (currentLink) currentLink.classList.add('done');
                    renderCourseProgress();
                }

                fetch(currentProgressUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    keepalive: !!force,
                    body: JSON.stringify(payload)
                }).catch(function () {
                });
            }

            function renderCourseProgress() {
                const completedCount = Object.keys(completedMap || {}).length;
                const percent = totalVideos > 0 ? Math.round((completedCount / totalVideos) * 100) : 0;
                if (progressTextEl) {
                    progressTextEl.textContent = percent + '% (' + completedCount + '/' + totalVideos + ' บท)';
                }
                if (progressFillEl) {
                    progressFillEl.style.width = Math.max(0, Math.min(100, percent)) + '%';
                }
            }

            allLinks.forEach(function (link) {
                const videoId = link.getAttribute('data-video-id');
                if (videoId && completedMap[String(videoId)]) {
                    link.classList.add('done');
                }
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopImmediatePropagation();

                    setPlayingLink(this);
                    syncCurrentInfo(this, true);
                    playVideo(this, true);
                }, true);
            });

            const playingLink = document.querySelector('.video-playlist .vids a.link.playing');
            const firstLink = allLinks[0] || null;
            const initialLink = playingLink || firstLink;
            if (initialLink) {
                setPlayingLink(initialLink);
                syncCurrentInfo(initialLink, true);
                playVideo(initialLink, false);
            }

            renderCourseProgress();

            if (videoEl) {
                videoEl.addEventListener('timeupdate', function () { saveProgress(false); });
                videoEl.addEventListener('pause', function () { saveProgress(true); });
                videoEl.addEventListener('ended', function () { saveProgress(true); });
            }

            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'hidden') {
                    saveProgress(true);
                }
            });

            window.addEventListener('beforeunload', function () {
                saveProgress(true);
            });
        });
    </script>
@endsection
