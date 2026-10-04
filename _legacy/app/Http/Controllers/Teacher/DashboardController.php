<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseOrder;

class DashboardController extends Controller
{
    public function index()
    {
        $teacherId = auth()->id();

        $courseCount = Course::where('teacher_id', $teacherId)->count();
        $pendingCourseCount = Course::where('teacher_id', $teacherId)->where('status', 'pending')->count();
        $orderCount = CourseOrder::whereHas('course', fn ($q) => $q->where('teacher_id', $teacherId))->count();
        $paidOrderCount = CourseOrder::whereHas('course', fn ($q) => $q->where('teacher_id', $teacherId))
            ->where('status', 'paid')
            ->count();

        return view('teacher.index', compact(
            'courseCount',
            'pendingCourseCount',
            'orderCount',
            'paidOrderCount'
        ));
    }
}
