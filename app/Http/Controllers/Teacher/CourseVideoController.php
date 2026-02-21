<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseVideo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CourseVideoController extends Controller
{
    public function index(Course $course)
    {
        $this->authorizeCourse($course);
        $course->load('videos');

        return view('teacher.courses.videos', compact('course'));
    }

    public function store(Request $request, Course $course)
    {
        $this->authorizeCourse($course);

        $validated = $request->validate([
            'video_title' => 'required|string|max:255',
            'content_name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'duration' => 'nullable|string|max:50',
            'video_file' => 'required|file|mimes:mp4,mov,avi,webm,mkv|max:1048576',
        ]);

        $videoPath = $request->file('video_file')->store('courses/videos', 'spaces');

        $course->videos()->create([
            'video_title' => $validated['video_title'],
            'content_name' => $validated['content_name'],
            'description' => $validated['description'] ?? null,
            'duration' => $validated['duration'] ?? null,
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
            'video_title' => 'required|string|max:255',
            'content_name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'duration' => 'nullable|string|max:50',
            'video_file' => 'nullable|file|mimes:mp4,mov,avi,webm,mkv|max:1048576',
        ]);

        if ($request->hasFile('video_file')) {
            if ($video->video_path) {
                Storage::disk('spaces')->delete($video->video_path);
            }
            $validated['video_path'] = $request->file('video_file')->store('courses/videos', 'spaces');
        }

        $video->update($validated);

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
