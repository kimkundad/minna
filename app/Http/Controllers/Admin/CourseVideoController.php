<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseVideo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CourseVideoController extends Controller
{
    public function index(Course $course)
    {
        $course->load('videos');

        return view('admin.courses.videos', compact('course'));
    }

    public function store(Request $request, Course $course)
    {
        $validated = $request->validate([
            'video_title' => 'required|string|max:255',
            'content_name' => 'required|string|max:255',
            'duration' => 'required|string|max:50',
            'description' => 'nullable|string',
            'video_file' => 'required|file|mimes:mp4,mov,avi,webm,mkv|max:1048576',
        ]);

        $videoPath = $request->file('video_file')->store('courses/videos', 'spaces');

        $course->videos()->create([
            'video_title' => $validated['video_title'],
            'content_name' => $validated['content_name'],
            'duration' => $validated['duration'],
            'description' => $validated['description'] ?? null,
            'video_path' => $videoPath,
        ]);

        return redirect()
            ->route('admin.courses.videos.index', $course)
            ->with('success', 'เพิ่มวิดีโอคอร์สเรียบร้อยแล้ว');
    }

    public function update(Request $request, Course $course, CourseVideo $video)
    {
        if ($video->course_id !== $course->id) {
            abort(404);
        }

        $validated = $request->validate([
            'video_title' => 'required|string|max:255',
            'content_name' => 'required|string|max:255',
            'duration' => 'required|string|max:50',
            'description' => 'nullable|string',
            'video_file' => 'nullable|file|mimes:mp4,mov,avi,webm,mkv|max:1048576',
        ]);

        if ($request->hasFile('video_file')) {
            Storage::disk('spaces')->delete($video->video_path);
            $validated['video_path'] = $request->file('video_file')->store('courses/videos', 'spaces');
        }

        $video->update($validated);

        return redirect()
            ->route('admin.courses.videos.index', $course)
            ->with('success', 'แก้ไขวิดีโอคอร์สเรียบร้อยแล้ว');
    }

    public function destroy(Course $course, CourseVideo $video)
    {
        if ($video->course_id !== $course->id) {
            abort(404);
        }

        Storage::disk('spaces')->delete($video->video_path);
        $video->delete();

        return redirect()
            ->route('admin.courses.videos.index', $course)
            ->with('success', 'ลบวิดีโอคอร์สเรียบร้อยแล้ว');
    }
}
