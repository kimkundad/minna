@php
    $post = $post ?? null;
    $contentValue = old('content_html', $post->content_html ?? '');
    $excerptValue = old('excerpt', $post->excerpt ?? '');
    $statusValue = old('status', $post->status ?? 'draft');
    $publishedAtValue = old('published_at', isset($post) && $post->published_at ? $post->published_at->format('Y-m-d\TH:i') : '');
@endphp

<div class="row g-5">
    <div class="col-lg-8">
        <div class="mb-4">
            <label class="form-label required">หัวข้อบทความ</label>
            <input type="text" name="title" class="form-control" value="{{ old('title', $post->title ?? '') }}" required>
            @error('title')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <div class="mb-4">
            <label class="form-label">คำอธิบายย่อ</label>
            <textarea name="excerpt" rows="3" class="form-control" maxlength="500">{{ $excerptValue }}</textarea>
            @error('excerpt')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <div class="mb-4">
            <label class="form-label required">เนื้อหา</label>
            <div class="card border">
                <div class="card-header py-3 d-flex align-items-center gap-2 flex-wrap" id="editor-toolbar">
                    <button type="button" class="btn btn-sm btn-light" data-action="bold"><b>B</b></button>
                    <button type="button" class="btn btn-sm btn-light" data-action="italic"><i>I</i></button>
                    <button type="button" class="btn btn-sm btn-light" data-action="strike"><s>S</s></button>
                    <button type="button" class="btn btn-sm btn-light" data-action="h2">H2</button>
                    <button type="button" class="btn btn-sm btn-light" data-action="bulletList">List</button>
                    <button type="button" class="btn btn-sm btn-light" data-action="orderedList">1.</button>
                    <button type="button" class="btn btn-sm btn-light" data-action="blockquote">Quote</button>
                    <button type="button" class="btn btn-sm btn-light" id="upload-image-btn">รูปภาพ</button>
                    <input type="file" id="editor-image-input" accept="image/*" hidden>
                </div>
                <div class="card-body p-0">
                    <div id="tiptap-editor" style="min-height: 360px; padding: 16px;"></div>
                </div>
            </div>
            <textarea name="content_html" id="content_html" hidden>{{ $contentValue }}</textarea>
            @error('content_html')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>
    </div>

    <div class="col-lg-4">
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">ตั้งค่า</h3>
            </div>
            <div class="card-body">
                <div class="mb-4">
                    <label class="form-label">รูปปกบทความ</label>
                    <input type="file" name="cover_image" class="form-control" accept="image/*">
                    @if (! empty($post?->cover_path))
                        <div class="mt-3">
                            <img src="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($post->cover_path) }}"
                                alt="Cover" style="max-width: 100%; border-radius: 10px;">
                        </div>
                    @endif
                    @error('cover_image')
                        <div class="text-danger fs-7 mt-1">{{ $message }}</div>
                    @enderror
                </div>

                <div class="mb-4">
                    <label class="form-label required">สถานะ</label>
                    <select name="status" id="status-select" class="form-select" required>
                        <option value="draft" @selected($statusValue === 'draft')>draft</option>
                        <option value="published" @selected($statusValue === 'published')>published</option>
                    </select>
                    @error('status')
                        <div class="text-danger fs-7 mt-1">{{ $message }}</div>
                    @enderror
                </div>

                <div class="mb-4" id="published-at-wrapper">
                    <label class="form-label">วันที่เผยแพร่</label>
                    <input type="datetime-local" name="published_at" class="form-control" value="{{ $publishedAtValue }}">
                    @error('published_at')
                        <div class="text-danger fs-7 mt-1">{{ $message }}</div>
                    @enderror
                </div>

                <button type="submit" class="btn btn-primary w-100">{{ $submitText }}</button>
            </div>
        </div>
    </div>
</div>
