@php
    $testimonial = $testimonial ?? null;
    $rating = old('rating', $testimonial->rating ?? 5);
@endphp

<div class="row g-5">
    <div class="col-lg-8">
        <div class="mb-4">
            <label class="form-label required">ชื่อผู้เรียน</label>
            <input type="text" name="name" class="form-control" value="{{ old('name', $testimonial->name ?? '') }}" required>
            @error('name')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <div class="mb-4">
            <label class="form-label">ตำแหน่ง/คำอธิบาย</label>
            <input type="text" name="designation" class="form-control"
                value="{{ old('designation', $testimonial->designation ?? '') }}" placeholder="เช่น นักศึกษามหาวิทยาลัย">
            @error('designation')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <div class="mb-4">
            <label class="form-label required">ข้อความรีวิว</label>
            <textarea name="content" rows="6" class="form-control" required>{{ old('content', $testimonial->content ?? '') }}</textarea>
            @error('content')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>
    </div>

    <div class="col-lg-4">
        <div class="mb-4">
            <label class="form-label">รูปผู้เรียน</label>
            <input type="file" name="avatar" class="form-control" accept="image/*">
            @if (! empty($testimonial?->avatar_path))
                <div class="mt-3">
                    <img src="{{ \Illuminate\Support\Facades\Storage::disk('spaces')->url($testimonial->avatar_path) }}"
                        alt="Avatar" style="width: 96px; height: 96px; object-fit: cover; border-radius: 50%;">
                </div>
            @endif
            @error('avatar')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <div class="mb-4">
            <label class="form-label required">คะแนน</label>
            <select name="rating" class="form-select" required>
                @for ($i = 5; $i >= 1; $i--)
                    <option value="{{ $i }}" @selected((int) $rating === $i)>{{ $i }}/5</option>
                @endfor
            </select>
            @error('rating')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <div class="mb-4">
            <label class="form-label required">สถานะ</label>
            <select name="status" class="form-select" required>
                <option value="published" @selected(old('status', $testimonial->status ?? 'published') === 'published')>published</option>
                <option value="draft" @selected(old('status', $testimonial->status ?? 'published') === 'draft')>draft</option>
            </select>
            @error('status')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <div class="mb-4">
            <label class="form-label">ลำดับการแสดงผล</label>
            <input type="number" name="sort_order" min="0" class="form-control"
                value="{{ old('sort_order', $testimonial->sort_order ?? 0) }}">
            @error('sort_order')
                <div class="text-danger fs-7 mt-1">{{ $message }}</div>
            @enderror
        </div>

        <button class="btn btn-primary w-100">{{ $submitText }}</button>
    </div>
</div>

