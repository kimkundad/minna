<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\CourseDocument;
use App\Models\Subject;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class CourseController extends Controller
{
    public function index()
    {
        $courses = Course::query()
            ->with(['category', 'subject'])
            ->where('teacher_id', auth()->id())
            ->latest()
            ->paginate(15);

        return view('teacher.courses.index', compact('courses'));
    }

    public function create()
    {
        return view('teacher.courses.create', [
            'categories' => CourseCategory::query()->orderBy('name')->get(),
            'subjects' => Subject::query()->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateCourse($request);
        $user = $request->user();

        $validated['teacher_id'] = $user->id;
        $validated['created_by'] = $user->id;
        $validated['status'] = 'pending';
        $validated['approved_by'] = null;
        $validated['approved_at'] = null;

        if ($request->hasFile('thumbnail')) {
            $validated['thumbnail_path'] = $request->file('thumbnail')->store('courses/thumbnails', 'spaces');
        }

        if ($request->hasFile('sample_video')) {
            $validated['sample_video_path'] = $request->file('sample_video')->store('courses/sample_videos', 'spaces');
        }

        $course = Course::create($validated);
        $this->storeDocuments($request, $course);

        return redirect()->route('teacher.courses.index')->with('success', 'สร้างคอร์สเรียบร้อยแล้ว รอแอดมินตรวจสอบ');
    }

    public function edit(Course $course)
    {
        $this->authorizeCourse($course);
        $course->load('documents');

        return view('teacher.courses.edit', [
            'course' => $course,
            'categories' => CourseCategory::query()->orderBy('name')->get(),
            'subjects' => Subject::query()->orderBy('name')->get(),
        ]);
    }

    public function update(Request $request, Course $course)
    {
        $this->authorizeCourse($course);
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

        $validated['status'] = 'pending';
        $validated['approved_by'] = null;
        $validated['approved_at'] = null;

        $course->update($validated);
        $this->storeDocuments($request, $course);

        return redirect()->route('teacher.courses.index')->with('success', 'แก้ไขคอร์สเรียบร้อยแล้ว รอแอดมินตรวจสอบ');
    }

    private function authorizeCourse(Course $course): void
    {
        abort_if((int) $course->teacher_id !== (int) auth()->id(), 403);
    }

    private function validateCourse(Request $request): array
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'price' => 'required|numeric|min:0',
            'access_type' => 'required|in:lifetime,time_limited',
            'access_duration_months' => 'nullable|integer|in:1,2,3,6,12,24',
            'course_category_id' => 'required|exists:course_categories,id',
            'subject_id' => 'required|exists:subjects,id',
            'thumbnail' => 'nullable|image|max:5120',
            'sample_video' => 'nullable|file|mimes:mp4,mov,avi,webm,mkv|max:51200',
            'documents' => 'nullable|array',
            'documents.*' => 'file|mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,zip,rar,jpg,jpeg,png,webp,gif|max:20480',
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
