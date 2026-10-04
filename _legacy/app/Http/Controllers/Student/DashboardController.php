<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseVideo;
use App\Models\CourseVideoProgress;
use App\Models\CourseOrder;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DashboardController extends Controller
{
    public function profile()
    {
        return view('student.profile');
    }

    public function courses()
    {
        $orders = CourseOrder::query()
            ->with(['course.teacher', 'course.category', 'course.subject'])
            ->where('user_id', auth()->id())
            ->where('status', 'paid')
            ->where(function ($query) {
                $query->whereNull('access_expires_at')
                    ->orWhere('access_expires_at', '>=', now());
            })
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->get();

        $courses = $orders
            ->filter(fn ($order) => $order->course !== null)
            ->unique('course_id')
            ->values();

        $courseIds = $courses->pluck('course_id')->all();
        $totalVideosByCourse = CourseVideo::query()
            ->selectRaw('course_id, COUNT(*) as total_videos')
            ->whereIn('course_id', $courseIds ?: [0])
            ->groupBy('course_id')
            ->pluck('total_videos', 'course_id');

        $completedVideosByCourse = CourseVideoProgress::query()
            ->selectRaw('course_id, COUNT(DISTINCT course_video_id) as completed_videos')
            ->where('user_id', auth()->id())
            ->whereIn('course_id', $courseIds ?: [0])
            ->whereNotNull('completed_at')
            ->groupBy('course_id')
            ->pluck('completed_videos', 'course_id');

        $courses->transform(function ($order) use ($totalVideosByCourse, $completedVideosByCourse) {
            $courseId = (int) $order->course_id;
            $totalVideos = (int) ($totalVideosByCourse[$courseId] ?? 0);
            $completedVideos = (int) ($completedVideosByCourse[$courseId] ?? 0);
            $progressPercent = $totalVideos > 0
                ? (int) round(($completedVideos / $totalVideos) * 100)
                : 0;

            $order->setAttribute('total_videos', $totalVideos);
            $order->setAttribute('completed_videos', $completedVideos);
            $order->setAttribute('progress_percent', max(0, min(100, $progressPercent)));

            return $order;
        });

        return view('student.courses', compact('courses'));
    }

    public function learn(Course $course, Request $request)
    {
        abort_unless($this->hasPaidOrder($request->user()->id, $course->id), 403);

        $course->load(['teacher', 'subject', 'category', 'sections.videos', 'videos']);
        $orphanVideos = $course->videos()->whereNull('course_section_id')->orderBy('sort_order')->orderBy('id')->get();
        $progressCollection = CourseVideoProgress::query()
            ->where('user_id', $request->user()->id)
            ->where('course_id', $course->id)
            ->get(['course_video_id', 'last_position_seconds', 'last_watched_at', 'completed_at']);

        $videoProgressMap = $progressCollection->pluck('last_position_seconds', 'course_video_id');
        $completedVideoIdMap = $progressCollection
            ->filter(fn ($progress) => $progress->completed_at !== null)
            ->pluck('course_video_id', 'course_video_id');
        $lastWatchedVideoId = optional(
            $progressCollection->sortByDesc('last_watched_at')->first()
        )->course_video_id;

        $totalVideos = (int) ($course->sections->sum(fn ($section) => $section->videos->count()) + $orphanVideos->count());
        $completedVideos = (int) $progressCollection
            ->filter(fn ($progress) => $progress->completed_at !== null)
            ->pluck('course_video_id')
            ->unique()
            ->count();
        $progressPercent = $totalVideos > 0
            ? (int) round(($completedVideos / $totalVideos) * 100)
            : 0;

        return view('student.learn-course', compact(
            'course',
            'orphanVideos',
            'videoProgressMap',
            'completedVideoIdMap',
            'lastWatchedVideoId',
            'totalVideos',
            'completedVideos',
            'progressPercent'
        ));
    }

    public function saveVideoProgress(Course $course, CourseVideo $video, Request $request)
    {
        abort_unless($video->course_id === $course->id, 404);
        abort_unless($this->hasPaidOrder($request->user()->id, $course->id), 403);

        $validated = $request->validate([
            'position_seconds' => ['required', 'numeric', 'min:0'],
            'duration_seconds' => ['nullable', 'numeric', 'min:1'],
            'completed' => ['nullable', 'boolean'],
        ]);

        $positionSeconds = (int) floor((float) $validated['position_seconds']);
        $durationSeconds = isset($validated['duration_seconds']) ? (int) floor((float) $validated['duration_seconds']) : null;
        $isCompleted = (bool) ($validated['completed'] ?? false);

        CourseVideoProgress::query()->updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'course_id' => $course->id,
                'course_video_id' => $video->id,
            ],
            [
                'last_position_seconds' => $positionSeconds,
                'duration_seconds' => $durationSeconds,
                'last_watched_at' => Carbon::now(),
                'completed_at' => $isCompleted ? Carbon::now() : null,
            ]
        );

        return response()->json(['ok' => true]);
    }

    public function streamVideo(Course $course, CourseVideo $video, Request $request)
    {
        abort_unless($video->course_id === $course->id, 404);
        abort_unless($this->hasPaidOrder($request->user()->id, $course->id), 403);
        abort_unless(!empty($video->video_path), 404);

        $ttlMinutes = max(1, (int) env('VIDEO_SIGNED_URL_TTL_MINUTES', 5));
        $temporaryUrl = Storage::disk('spaces')->temporaryUrl(
            $video->video_path,
            now()->addMinutes($ttlMinutes)
        );

        return redirect()->away($temporaryUrl);
    }

    public function editProfile()
    {
        return view('student.edit-profile');
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $request->merge([
            'phone_national' => preg_replace('/\D+/', '', (string) $request->input('phone_national')),
        ]);

        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'phone_country_code' => ['required', 'string', 'max:8'],
            'phone_national' => ['required', 'digits_between:8,15'],
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'birth_day' => ['nullable', 'integer', 'between:1,31'],
            'birth_month' => ['nullable', 'integer', 'between:1,12'],
            'birth_year' => ['nullable', 'integer', 'between:2400,2600'],
        ]);

        $birthdate = null;
        if ($request->filled('birth_day') || $request->filled('birth_month') || $request->filled('birth_year')) {
            if (!($request->filled('birth_day') && $request->filled('birth_month') && $request->filled('birth_year'))) {
                throw ValidationException::withMessages([
                    'birth_day' => 'à¸à¸£à¸¸à¸“à¸²à¸à¸£à¸­à¸à¸§à¸±à¸™à¹€à¸à¸´à¸”à¹ƒà¸«à¹‰à¸„à¸£à¸š à¸§à¸±à¸™/à¹€à¸”à¸·à¸­à¸™/à¸›à¸µ',
                ]);
            }

            $gregorianYear = (int) $validated['birth_year'] - 543;
            $formatted = sprintf('%04d-%02d-%02d', $gregorianYear, (int) $validated['birth_month'], (int) $validated['birth_day']);
            $isValidDate = checkdate((int) $validated['birth_month'], (int) $validated['birth_day'], $gregorianYear);

            if (!$isValidDate) {
                throw ValidationException::withMessages([
                    'birth_day' => 'à¸§à¸±à¸™à¹€à¸à¸´à¸”à¹„à¸¡à¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡',
                ]);
            }

            $birthdate = $formatted;
        }

        $fullName = trim($validated['first_name'] . ' ' . $validated['last_name']);

        $payload = [
            'email' => $validated['email'],
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'name' => $fullName,
            'birthdate' => $birthdate,
            'phone_country_code' => $validated['phone_country_code'],
            'phone_national' => $validated['phone_national'],
            'phone' => $validated['phone_country_code'] . $validated['phone_national'],
        ];

        if (Schema::hasColumn('users', 'gender')) {
            $payload['gender'] = $validated['gender'] ?? null;
        }

        $user->forceFill($payload)->save();

        return redirect()->route('student.index')->with('status', 'à¸šà¸±à¸™à¸—à¸¶à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢à¹à¸¥à¹‰à¸§');
    }

    public function editPassword()
    {
        return view('student.change-password');
    }

    public function updatePassword(Request $request)
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed', 'regex:/[a-zA-Z]/', 'regex:/[0-9]/'],
        ], [
            'password.regex' => 'à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™à¸•à¹‰à¸­à¸‡à¸¡à¸µà¸—à¸±à¹‰à¸‡à¸•à¸±à¸§à¸­à¸±à¸à¸©à¸£à¹à¸¥à¸°à¸•à¸±à¸§à¹€à¸¥à¸‚',
        ]);

        $user = $request->user();

        if (!Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™à¹€à¸à¹ˆà¸²à¹„à¸¡à¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡',
            ]);
        }

        $user->update([
            'password' => Hash::make($validated['password']),
        ]);

        return redirect()->route('student.password.edit')->with('status', 'à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸£à¸«à¸±à¸ªà¸œà¹ˆà¸²à¸™à¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢à¹à¸¥à¹‰à¸§');
    }

    private function hasPaidOrder(int $userId, int $courseId): bool
    {
        return CourseOrder::query()
            ->where('user_id', $userId)
            ->where('course_id', $courseId)
            ->where('status', 'paid')
            ->where(function ($query) {
                $query->whereNull('access_expires_at')
                    ->orWhere('access_expires_at', '>=', now());
            })
            ->exists();
    }
}
