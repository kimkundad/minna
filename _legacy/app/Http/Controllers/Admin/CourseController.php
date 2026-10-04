<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\CourseDocument;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class CourseController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $status = trim((string) $request->query('status', ''));

        $courses = Course::query()
            ->with(['category', 'subject', 'teacher'])
            ->when($q !== '', function ($query) use ($q) {
                $query->where(function ($sub) use ($q) {
                    $sub->where('title', 'like', "%{$q}%")
                        ->orWhereHas('category', fn ($c) => $c->where('name', 'like', "%{$q}%"))
                        ->orWhereHas('subject', fn ($s) => $s->where('name', 'like', "%{$q}%"))
                        ->orWhereHas('teacher', fn ($t) => $t->where('name', 'like', "%{$q}%"));
                });
            })
            ->when($status !== '', fn ($query) => $query->where('status', $status))
            ->latest()
            ->paginate(15)
            ->withQueryString();

        return view('admin.courses.index', compact('courses', 'q', 'status'));
    }

    public function create()
    {
        return view('admin.courses.create', [
            'categories' => CourseCategory::query()->orderBy('name')->get(),
            'subjects' => Subject::query()->orderBy('name')->get(),
            'teachers' => User::role('teacher')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateCourse($request);

        $validated['created_by'] = $request->user()->id;
        $validated['status'] = 'approved';
        $validated['approved_at'] = now();
        $validated['approved_by'] = $request->user()->id;

        if ($request->hasFile('thumbnail')) {
            $validated['thumbnail_path'] = $request->file('thumbnail')->store('courses/thumbnails', 'spaces');
        }

        if ($request->hasFile('sample_video')) {
            $validated['sample_video_path'] = $request->file('sample_video')->store('courses/sample_videos', 'spaces');
        }

        $course = Course::create($validated);

        $this->storeDocuments($request, $course);

        return redirect()->route('admin.courses.index')->with('success', 'สร้างคอร์สเรียบร้อยแล้ว');
    }

    public function edit(Course $course)
    {
        $course->load('documents');

        return view('admin.courses.edit', [
            'course' => $course,
            'categories' => CourseCategory::query()->orderBy('name')->get(),
            'subjects' => Subject::query()->orderBy('name')->get(),
            'teachers' => User::role('teacher')->orderBy('name')->get(),
        ]);
    }

    public function update(Request $request, Course $course)
    {
        $validated = $this->validateCourse($request, true);

        if ($request->hasFile('thumbnail')) {
            if ($course->thumbnail_path) {
                Storage::disk('spaces')->delete($course->thumbnail_path);
            }
            $validated['thumbnail_path'] = $request->file('thumbnail')->store('courses/thumbnails', 'spaces');
        }

        if ($request->hasFile('sample_video')) {
            if ($course->sample_video_path) {
                Storage::disk('spaces')->delete($course->sample_video_path);
            }
            $validated['sample_video_path'] = $request->file('sample_video')->store('courses/sample_videos', 'spaces');
        }

        if (($validated['status'] ?? null) === 'approved') {
            $validated['approved_at'] = now();
            $validated['approved_by'] = $request->user()->id;
        } else {
            $validated['approved_at'] = null;
            $validated['approved_by'] = null;
        }

        $course->update($validated);
        $this->storeDocuments($request, $course);

        return redirect()->route('admin.courses.index')->with('success', 'แก้ไขคอร์สเรียบร้อยแล้ว');
    }

    private function validateCourse(Request $request, bool $allowStatus = false): array
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'price' => 'required|numeric|min:0',
            'access_type' => 'required|in:lifetime,time_limited',
            'access_duration_months' => 'nullable|integer|in:1,2,3,6,12,24',
            'course_category_id' => 'required|exists:course_categories,id',
            'subject_id' => 'required|exists:subjects,id',
            'teacher_id' => [
                'required',
                'integer',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! User::role('teacher')->whereKey($value)->exists()) {
                        $fail('กรุณาเลือกผู้สอนที่ถูกต้อง');
                    }
                },
            ],
            'thumbnail' => 'nullable|image|max:5120',
            'sample_video' => 'nullable|file|mimes:mp4,mov,avi,webm,mkv|max:51200',
            'documents' => 'nullable|array',
            'documents.*' => 'file|mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,zip,rar,jpg,jpeg,png,webp,gif|max:20480',
            'status' => ($allowStatus ? 'required' : 'nullable') . '|in:pending,approved,rejected',
        ]);

        if (($validated['access_type'] ?? 'lifetime') === 'lifetime') {
            $validated['access_duration_months'] = null;
        }

        if (($validated['access_type'] ?? null) === 'time_limited' && empty($validated['access_duration_months'])) {
            throw ValidationException::withMessages([
                'access_duration_months' => 'กรุณาเลือกระยะเวลาสิทธิ์การเข้าถึง',
            ]);
        }

        return $validated;
    }

    private function storeDocuments(Request $request, Course $course): void
    {
        if (! $request->hasFile('documents')) {
            return;
        }

        foreach ($request->file('documents') as $file) {
            $path = $file->store('courses/documents', 'spaces');
            CourseDocument::create([
                'course_id' => $course->id,
                'file_name' => $file->getClientOriginalName(),
                'file_path' => $path,
            ]);
        }
    }
}
