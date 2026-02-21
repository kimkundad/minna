<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StudentController extends Controller
{
    public function index()
    {
        $teacherId = auth()->id();

        $students = User::query()
            ->select(
                'users.id',
                'users.name',
                'users.email',
                DB::raw('COUNT(DISTINCT course_orders.id) as orders_count'),
                DB::raw("MAX(course_orders.created_at) as last_order_at")
            )
            ->join('course_orders', 'course_orders.user_id', '=', 'users.id')
            ->join('courses', 'courses.id', '=', 'course_orders.course_id')
            ->where('courses.teacher_id', $teacherId)
            ->groupBy('users.id', 'users.name', 'users.email')
            ->orderByDesc('last_order_at')
            ->paginate(20);

        return view('teacher.students.index', compact('students'));
    }
}
