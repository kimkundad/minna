<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseSection;
use App\Models\CourseVideo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class CourseVideoController extends Controller
{
    public function index(Course $course)
    {
        $this->authorizeCourse($course);
        $course->load(['sections.videos', 'videos']);
        $orphanVideos = $course->videos()->whereNull('course_section_id')->get();

        return view('teacher.courses.videos', compact('course', 'orphanVideos'));
    }

    public function storeSection(Request $request, Course $course)
    {
        $this->authorizeCourse($course);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $course->sections()->create([
            'title' => $validated['title'],
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
        ]);

        return redirect()
            ->route('teacher.courses.videos.index', $course)
            ->with('success', 'เพิ่มหัวข้อการเรียนเรียบร้อยแล้ว');
    }

    public function updateSection(Request $request, Course $course, CourseSection $section)
    {
        $this->authorizeCourse($course);
        abort_if((int) $section->course_id !== (int) $course->id, 404);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $section->update([
            'title' => $validated['title'],
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
        ]);

        return redirect()
            ->route('teacher.courses.videos.index', $course)
            ->with('success', 'อัปเดตหัวข้อการเรียนเรียบร้อยแล้ว');
    }

    public function destroySection(Course $course, CourseSection $section)
    {
        $this->authorizeCourse($course);
        abort_if((int) $section->course_id !== (int) $course->id, 404);
        $section->delete();

        return redirect()
            ->route('teacher.courses.videos.index', $course)
            ->with('success', 'ลบหัวข้อการเรียนเรียบร้อยแล้ว');
    }

    public function store(Request $request, Course $course)
    {
        $this->authorizeCourse($course);

        $validated = $request->validate([
            'course_section_id' => [
                'nullable',
                Rule::exists('course_sections', 'id')->where(fn ($q) => $q->where('course_id', $course->id)),
            ],
            'video_title' => 'required|string|max:255',
            'content_name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'duration' => 'nullable|string|max:50',
            'sort_order' => 'nullable|integer|min:0',
            'video_file' => 'required|file|mimes:mp4,mov,avi,webm,mkv|max:1048576',
        ]);

        $videoPath = $request->file('video_file')->store('courses/videos', [
            'disk' => 'spaces',
            'visibility' => 'private',
        ]);

        $course->videos()->create([
            'course_section_id' => $validated['course_section_id'] ?? null,
            'video_title' => $validated['video_title'],
            'content_name' => $validated['content_name'],
            'description' => $validated['description'] ?? null,
            'duration' => $validated['duration'] ?? null,
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'video_path' => $videoPath,
        ]);

        return redirect()
            ->route('teacher.courses.videos.index', $course)
            ->with('success', 'เพิ่มวิดีโอคอร์สเรียบร้อยแล้ว');
    }

    public function update(Request $request, Course $course, CourseVideo $video)
    {
        $this->authorizeCourse($course);
        abort_if((int) $video->course_id !== (int) $course->id, 404);

        $validated = $request->validate([
            'course_section_id' => [
                'nullable',
                Rule::exists('course_sections', 'id')->where(fn ($q) => $q->where('course_id', $course->id)),
            ],
            'video_title' => 'required|string|max:255',
            'content_name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'duration' => 'nullable|string|max:50',
            'sort_order' => 'nullable|integer|min:0',
            'video_file' => 'nullable|file|mimes:mp4,mov,avi,webm,mkv|max:1048576',
        ]);

        if ($request->hasFile('video_file')) {
            if ($video->video_path) {
                Storage::disk('spaces')->delete($video->video_path);
            }
            $validated['video_path'] = $request->file('video_file')->store('courses/videos', [
                'disk' => 'spaces',
                'visibility' => 'private',
            ]);
        }

        $video->update([
            'course_section_id' => $validated['course_section_id'] ?? null,
            'video_title' => $validated['video_title'],
            'content_name' => $validated['content_name'],
            'description' => $validated['description'] ?? null,
            'duration' => $validated['duration'] ?? null,
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'video_path' => $validated['video_path'] ?? $video->video_path,
        ]);

        return redirect()
            ->route('teacher.courses.videos.index', $course)
            ->with('success', 'แก้ไขวิดีโอคอร์สเรียบร้อยแล้ว');
    }

    public function destroy(Course $course, CourseVideo $video)
    {
        $this->authorizeCourse($course);
        abort_if((int) $video->course_id !== (int) $course->id, 404);

        if ($video->video_path) {
            Storage::disk('spaces')->delete($video->video_path);
        }
        $video->delete();

        return redirect()
            ->route('teacher.courses.videos.index', $course)
            ->with('success', 'ลบวิดีโอคอร์สเรียบร้อยแล้ว');
    }

    private function authorizeCourse(Course $course): void
    {
        abort_if((int) $course->teacher_id !== (int) auth()->id(), 403);
    }
}
