<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseOrder;
use App\Models\TeacherApplication;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    public function index()
    {
        $hasUsers = Schema::hasTable('users');
        $hasCourses = Schema::hasTable('courses');
        $hasOrders = Schema::hasTable('course_orders');
        $hasTeacherApps = Schema::hasTable('teacher_applications');

        $studentsCount = $hasUsers ? User::role('student')->count() : 0;
        $teachersCount = $hasUsers ? User::role('teacher')->count() : 0;
        $coursesCount = $hasCourses ? Course::query()->count() : 0;
        $pendingCoursesCount = $hasCourses ? Course::query()->where('status', 'pending')->count() : 0;

        $ordersCount = $hasOrders ? CourseOrder::query()->count() : 0;
        $paidOrdersCount = $hasOrders ? CourseOrder::query()->where('status', 'paid')->count() : 0;
        $pendingOrdersCount = $hasOrders ? CourseOrder::query()->where('status', 'pending')->count() : 0;
        $totalPaidAmount = $hasOrders
            ? (float) CourseOrder::query()->where('status', 'paid')->sum('amount')
            : 0.0;

        $monthlyRevenue = collect();
        if ($hasOrders) {
            $monthlyRevenue = CourseOrder::query()
                ->selectRaw("DATE_FORMAT(created_at, '%Y-%m') as ym, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total")
                ->where('created_at', '>=', now()->subMonths(5)->startOfMonth())
                ->groupBy('ym')
                ->orderBy('ym')
                ->get();
        }

        $latestOrders = $hasOrders
            ? CourseOrder::query()->with(['user', 'course'])->latest()->limit(8)->get()
            : collect();

        $latestTeacherApplications = $hasTeacherApps
            ? TeacherApplication::query()->latest()->limit(8)->get()
            : collect();

        return view('admin.index', compact(
            'studentsCount',
            'teachersCount',
            'coursesCount',
            'pendingCoursesCount',
            'ordersCount',
            'paidOrdersCount',
            'pendingOrdersCount',
            'totalPaidAmount',
            'monthlyRevenue',
            'latestOrders',
            'latestTeacherApplications'
        ));
    }
}

