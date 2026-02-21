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

class CourseController extends Controller
{
    public function index()
    {
        $courses = Course::query()
            ->with(['category', 'subject', 'teacher'])
            ->latest()
            ->paginate(15);

        return view('admin.courses.index', compact('courses'));
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
        $validated = $this->validateCourse($request);

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

        $validated['status'] = 'approved';
        $validated['approved_at'] = now();
        $validated['approved_by'] = $request->user()->id;

        $course->update($validated);
        $this->storeDocuments($request, $course);

        return redirect()->route('admin.courses.index')->with('success', 'แก้ไขคอร์สเรียบร้อยแล้ว');
    }

    private function validateCourse(Request $request): array
    {
        return $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'price' => 'required|numeric|min:0',
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
        ]);
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
